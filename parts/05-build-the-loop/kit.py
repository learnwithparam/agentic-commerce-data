"""Helpers for build-the-loop. You use them; you do not need to change them.

Run a step's program with:

    uv run python parts/05-build-the-loop/kit.py <step-name> [arguments]

It runs the file in that step's problem/ folder. Add `--folder solution` to run the sample solution.
The checks run it the same way, so what you see is what the check sees.
"""

from __future__ import annotations

import json
import os
import runpy
import sqlite3
import sys
import time
import tomllib
from pathlib import Path

from config.models import chosen_provider
from desk.contract import empty_answer
from desk.finished import agent as finished_agent
from desk.finished import guard
from desk.llm import complete
from desk.paths import LOG_FOLDER

PART_FOLDER = Path(__file__).resolve().parent
KIT = tomllib.loads((PART_FOLDER / "kit.toml").read_text(encoding="utf-8"))

# The program each step runs, inside the step's problem/, solution/ or wrong/<mistake>/ folder.
STEP_FILES = {
    "route-the-question": ("01-route-the-question", "router.py"),
    "correct-the-error": ("02-correct-the-error", "retry.py"),
    "check-the-relevance": ("03-check-the-relevance", "relevance.py"),
    "cite-the-rows": ("04-cite-the-rows", "cite.py"),
}

# What a rewrite is told when a query ran but found nothing.
NO_ROWS = "the query returned no rows"


class SqlError(Exception):
    """The database could not run a query. The message is the database's own error."""


# ---------------------------------------------------------------- correct-the-error


def ledger_path() -> Path:
    """Where every query and every rewrite request is written. The check reads this file."""
    return Path(os.environ.get("LOOP_LEDGER", LOG_FOLDER / "loop.jsonl"))


def write_to_ledger(entry: dict) -> None:
    path = ledger_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as ledger:
        ledger.write(json.dumps({"at": time.time(), **entry}, ensure_ascii=False) + "\n")


def broken_case(question: str) -> dict:
    for case in KIT["broken"]:
        if case["question"] == question:
            return case
    raise KeyError(f"kit.toml has no broken query for: {question}")


def first_sql(question: str) -> str:
    """The first query for a question. It has a mistake in it on purpose."""
    return broken_case(question)["first_sql"].strip()


def run_query(question: str, sql: str) -> tuple[list[str], list[list]]:
    """Run one query read-only and write it to the ledger. Raises SqlError when it fails."""
    try:
        columns, rows = guard.run(sql)
    except sqlite3.Error as error:
        write_to_ledger({"kind": "query", "question": question, "sql": sql, "error": str(error)})
        raise SqlError(str(error)) from error
    write_to_ledger({"kind": "query", "question": question, "sql": sql, "rows": len(rows)})
    return columns, rows


def rewrite(question: str, sql: str, error: str) -> str:
    """Ask the model to fix a query, given the error. Returns the new query.

    In replay mode the recorded fix comes back only when `error` names the mistake,
    like a real model that cannot fix what it is not shown.
    """
    write_to_ledger({"kind": "rewrite", "question": question, "sql": sql, "error": error})
    if chosen_provider() == "replay":
        return recorded_fix(question, sql, error)
    return live_fix(question, sql, error)


def recorded_fix(question: str, sql: str, error: str) -> str:
    if not error:
        return sql
    for fix in broken_case(question)["fixes"]:
        if fix["error_mentions"] in error:
            return fix["sql"].strip()
    return sql


def live_fix(question: str, sql: str, error: str) -> str:
    instructions = (
        "Fix this SQLite query for the question. Reply with the query only.\n"
        f"Question: {question}\nQuery: {sql}\nError: {error}"
    )
    messages = [{"role": "user", "content": instructions}]
    reply = complete("fast", messages, agent="fixer", question=question)
    without_fence = reply.strip().removeprefix("```sql").removesuffix("```")
    return without_fence.strip()


# ---------------------------------------------------------------- check-the-relevance

RELEVANCE_QUESTION = KIT["relevance"]["question"]


def review_hits() -> list[dict]:
    """What review search found for RELEVANCE_QUESTION, in the order search ranked them."""
    relevance = KIT["relevance"]
    late, off_topic = relevance["late_delivery"], relevance["off_topic"]
    # Search mixes good and bad hits, so the list does too.
    ranked_ids = [late[0], off_topic[0], late[1], off_topic[1], late[2], off_topic[2]]
    ranked_ids += [late[3], off_topic[3], late[4], off_topic[4], late[5]]
    return [review_by_id(review_id) for review_id in ranked_ids]


def review_by_id(review_id: str) -> dict:
    connection = guard.connect_read_only()
    found = connection.execute(
        "SELECT review_score, review_comment_message FROM order_reviews WHERE review_id = ?",
        [review_id],
    ).fetchone()
    connection.close()
    score, message = found
    return {"review_id": review_id, "score": score, "quote": " ".join(message.split())}


# ---------------------------------------------------------------- cite-the-rows


def prepared_answer(question: str) -> tuple[dict, dict, dict]:
    """The finished agent's answer to a question, with no citations yet.

    Returns the answer, the plan the model wrote, and every query's columns and rows by id.
    """
    plan = finished_agent.json_in_reply(
        complete(
            "smart",
            finished_agent.planning_messages(question),
            agent="finished",
            question=question,
        )
    )
    answer = empty_answer(question)
    answer["route"] = plan.get("route", "sql")
    results = finished_agent.run_queries(plan, answer)
    finished_agent.add_rows(plan, results, answer)
    finished_agent.add_reviews(plan, results, answer)
    answer["answer"] = finished_agent.fill(plan.get("answer", ""), results)
    answer["citations"] = []
    return answer, plan, results


# ---------------------------------------------------------------- running a step


def step_file(step_name: str, folder: str) -> Path:
    if step_name not in STEP_FILES:
        known = ", ".join(STEP_FILES)
        raise SystemExit(f"There is no step called {step_name!r} in this part. Steps: {known}")
    step_folder, file_name = STEP_FILES[step_name]
    folder_path = Path(folder)
    if not folder_path.is_absolute():
        folder_path = PART_FOLDER / step_folder / folder
    return folder_path / file_name


def main() -> None:
    arguments = sys.argv[1:]
    if not arguments:
        raise SystemExit("Name a step, for example: kit.py route-the-question 'Delete the orders'")
    step_name, rest = arguments[0], arguments[1:]
    folder = "problem"
    if rest[:1] == ["--folder"]:
        folder, rest = rest[1], rest[2:]
    program = step_file(step_name, folder)
    # A __pycache__ folder here would look like a step to the course scripts, so none is written.
    sys.dont_write_bytecode = True
    sys.argv = [str(program), *rest]
    runpy.run_path(str(program), run_name="__main__")


if __name__ == "__main__":
    main()

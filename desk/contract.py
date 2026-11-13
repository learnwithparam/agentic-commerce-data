"""The answer contract every agent in this course returns: `uv run ask "<question>" --json`.

Checks read this object, the queries it names and the database.
They never read the prose in `answer`.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

from desk.paths import LOG_FOLDER, QUERY_LOG

# The plain-text answer shows this many rows; the JSON answer always holds all of them.
ROWS_SHOWN = 20


def empty_answer(question: str) -> dict[str, Any]:
    return {
        "question": question,
        "route": None,  # sql | reviews | both | refuse | handoff
        "refused": False,
        "reason": None,
        "metric_ids": [],
        "sql": [],  # [{"id": "q1", "text": "SELECT ..."}], every query the agent ran, in order
        "columns": [],
        "rows": [],  # the rows of the query whose id is in `rows_from`
        "rows_from": None,
        "citations": [],  # [{"claim": "...", "query": "q1", "row_ids": [0]}]
        "reviews": [],  # [{"review_id": "...", "quote": "...", "gloss_en": "..."}]
        "assumptions": [],
        "answer": "",
        "error": None,
    }


def log_query_success(agent: str, question: str, sql: str, row_count: int) -> None:
    """Log a query that ran. Checks in later parts read data/logs/queries.jsonl."""
    _append_to_query_log(agent, question, sql, {"ok": True, "rows": row_count, "error": None})


def log_query_failure(agent: str, question: str, sql: str, error: str) -> None:
    """Log a query that failed or was refused, with the reason."""
    _append_to_query_log(agent, question, sql, {"ok": False, "rows": None, "error": error})


def _append_to_query_log(agent: str, question: str, sql: str, outcome: dict[str, Any]) -> None:
    entry = {"at": time.time(), "agent": agent, "question": question, "sql": sql, **outcome}
    LOG_FOLDER.mkdir(parents=True, exist_ok=True)
    with QUERY_LOG.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def rounded_for_json(value: Any) -> Any:
    """Round floats so the same answer prints the same JSON on every machine."""
    if isinstance(value, float):
        return round(value, 6)
    return value


def print_answer(answer: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print_answer_as_json(answer)
    elif answer["refused"]:
        print(f"Refused: {answer['reason']}")
    elif answer["error"]:
        print(f"Error: {answer['error']}")
    else:
        print_answer_as_text(answer)


def print_answer_as_json(answer: dict[str, Any]) -> None:
    answer = dict(answer)
    answer["rows"] = [[rounded_for_json(cell) for cell in row] for row in answer["rows"]]
    sys.stdout.write(json.dumps(answer, ensure_ascii=False) + "\n")


def print_answer_as_text(answer: dict[str, Any]) -> None:
    print(answer["answer"])
    rows = answer["rows"]
    if rows:
        print()
        print(" | ".join(answer["columns"]))
        for row in rows[:ROWS_SHOWN]:
            print(" | ".join("" if cell is None else str(cell) for cell in row))
        if len(rows) > ROWS_SHOWN:
            print(f"... {len(rows)} rows")
    for assumption in answer["assumptions"]:
        print(f"Assumption: {assumption}")

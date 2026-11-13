"""Your agent, with a metric file.

Run it:  uv run python ask.py "What was GMV in 2018?" --json
The model writes one query. Where a metric fits, it writes {{metric_id}} instead of its own SQL,
and this file puts in the expression from metrics.toml. The answer names the metrics it used.
"""

import argparse
import json
import re
import sqlite3
import tomllib
from pathlib import Path

from config.models import chosen_provider
from desk.contract import empty_answer, log_query_failure, log_query_success, print_answer
from desk.finished import guard, values
from desk.llm import LLMError, complete, normalized_question

AGENT = "metrics"
METRICS_FILE = Path(__file__).parent / "metrics.toml"

# {{gmv}} is a metric. {{seller_city:Sao Paulo}} is a city, filled in from stored spellings.
PLACEHOLDER = re.compile(r"\{\{\s*([a-z_]+)(?::([^}]+))?\s*\}\}")
FIRST_JSON_OBJECT = re.compile(r"\{.*\}", re.S)

SYSTEM = """You write SQLite for the operations desk of the Olist marketplace.
Reply with one JSON object: {{"metric_ids": [], "sql": "SELECT ...", "assumptions": []}}
When a metric below fits, write {{{{metric_id}}}} where its expression goes. Write your own SQL
only when no metric fits. Use o for orders, i for order_items and c for customers.
Metrics:
{metrics}
Tables: {tables}
"""

# Replay mode answers from the replies recorded for this part, in replies.jsonl.
REPLIES_FILE = "replies.jsonl"


def load_metrics() -> dict:
    return tomllib.loads(METRICS_FILE.read_text(encoding="utf-8"))


def ask(question: str) -> dict:
    answer = empty_answer(question)
    answer["route"] = "sql"
    metrics = load_metrics()
    try:
        plan = plan_for(question, metrics)
    except LLMError as error:
        answer["error"] = str(error)
        return answer
    used_metrics: list[str] = []
    try:
        sql = expand(plan["sql"], metrics, used_metrics)
        columns, rows = guard.run(sql)
    except guard.QueryRefusedError as refusal:
        log_query_failure(AGENT, question, plan["sql"], f"refused: {refusal}")
        answer["refused"] = True
        answer["route"] = "refuse"
        answer["reason"] = f"The query was refused: {refusal}"
        return answer
    except sqlite3.Error as error:
        log_query_failure(AGENT, question, plan["sql"], str(error))
        answer["error"] = f"SQL error: {error}"
        return answer
    log_query_success(AGENT, question, sql, len(rows))
    answer["metric_ids"] = used_metrics
    answer["assumptions"] = plan.get("assumptions", [])
    answer["sql"] = [{"id": "q1", "text": sql}]
    answer["rows_from"] = "q1"
    answer["columns"] = columns
    answer["rows"] = rows
    answer["answer"] = summary(rows)
    return answer


def summary(rows: list[list]) -> str:
    if len(rows) == 1 and len(rows[0]) == 1:
        return f"The answer is {rows[0][0]}."
    return f"Here are {len(rows)} rows."


def expand(sql: str, metrics: dict, used_metrics: list[str]) -> str:
    """Put each metric's expression where its placeholder is, and note which metrics were used.

    The answer names a metric only when its expression is really in the query.
    """

    def replace(placeholder: re.Match) -> str:
        name, city = placeholder.group(1), placeholder.group(2)
        if city is not None:
            return values.sql_list(values.lookup(name, city))
        if name not in metrics:
            raise guard.QueryRefusedError(f"there is no metric called {name}")
        if name not in used_metrics:
            used_metrics.append(name)
        return metrics[name]["expression"]

    return PLACEHOLDER.sub(replace, sql)


def plan_for(question: str, metrics: dict) -> dict:
    """Ask the model for a plan: the metrics it means to use, one query and its assumptions."""
    metric_lines = [f"- {name}: {metric['description']}" for name, metric in metrics.items()]
    system = SYSTEM.format(metrics="\n".join(metric_lines), tables=", ".join(sorted(guard.TABLES)))
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": question},
    ]
    reply = recorded_reply(question)
    if reply is None:
        reply = complete("smart", messages, agent=AGENT, question=question)
    found = FIRST_JSON_OBJECT.search(reply)
    if not found:
        raise LLMError("The model's plan was not JSON. Run the question again.")
    return json.loads(found.group(0))


def recorded_reply(question: str) -> str | None:
    """In replay mode, the reply recorded for this question, if there is one."""
    if chosen_provider() != "replay":
        return None
    for line in replies_file().read_text(encoding="utf-8").splitlines():
        recording = json.loads(line)
        if normalized_question(recording["question"]) == normalized_question(question):
            return recording["reply"]
    return None


def replies_file() -> Path:
    """The replies.jsonl in the nearest folder above this file."""
    for folder in Path(__file__).resolve().parents:
        if (folder / REPLIES_FILE).exists():
            return folder / REPLIES_FILE
    raise FileNotFoundError(f"{REPLIES_FILE} is missing from the part folder")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ask your agent a question.")
    parser.add_argument("question")
    parser.add_argument("--json", action="store_true", help="print the answer contract as JSON")
    parser.add_argument("--user", default="cm-ana", help="who is asking")
    arguments = parser.parse_args()
    print_answer(ask(arguments.question), arguments.json)


if __name__ == "__main__":
    main()

"""Your agent, with a locked database.

Run it:  uv run python ask.py "How many orders are in the data?" --json
It asks the model for one SQL query and runs it through sql_tool.py, which opens the database
read-only. It prints the answer contract from desk/contract.py.
"""

import argparse
import json
import re
from pathlib import Path

import sql_tool
import validator

from config.models import chosen_provider
from desk.contract import empty_answer, log_query_failure, log_query_success, print_answer
from desk.llm import LLMError, complete, normalized_question

AGENT = "naive"

SYSTEM = """You answer questions for the operations desk of the Olist marketplace.
Write one SQLite query that answers the question. Reply with the SQL only.

Tables: {tables}
"""

SQL_IN_CODE_FENCE = re.compile(r"```(?:sql)?\s*(.*?)```", re.S | re.I)

# Replay mode has no recorded reply for the write requests in world/replay/.
# This step brings its own, in replies.jsonl in the step folder.
REPLIES_FILE = "replies.jsonl"


def ask(question: str) -> dict:
    answer = empty_answer(question)
    answer["route"] = "sql"
    try:
        sql = write_sql(question)
    except LLMError as error:
        answer["error"] = str(error)
        return answer
    try:
        sql = validator.check(sql)
    except validator.QueryRefusedError as refusal:
        return refuse(answer, sql, str(refusal))
    result = sql_tool.run(sql)
    if "error" in result:
        log_query_failure(AGENT, question, sql, result["error"])
        answer["error"] = f"SQL error: {result['error']}"
        return answer
    log_query_success(AGENT, question, sql, len(result["rows"]))
    answer["sql"] = [{"id": "q1", "text": sql}]
    answer["rows_from"] = "q1"
    answer["columns"] = result["columns"]
    answer["rows"] = result["rows"]
    answer["answer"] = summary(result["rows"])
    return answer


def refuse(answer: dict, sql: str, why: str) -> dict:
    """Log the refused query, so the log shows it never ran, and say why in the answer."""
    log_query_failure(AGENT, answer["question"], sql, f"refused: {why}")
    answer["refused"] = True
    answer["route"] = "refuse"
    answer["reason"] = f"This desk only reads data, so the query was refused: {why}."
    return answer


def summary(rows: list[list]) -> str:
    if len(rows) == 1 and len(rows[0]) == 1:
        return f"The answer is {rows[0][0]}."
    return f"Here are {len(rows)} rows."


def write_sql(question: str) -> str:
    """Ask the model for one query, and keep only the SQL."""
    tables = ", ".join(sorted(validator.KNOWN_TABLES))
    messages = [
        {"role": "system", "content": SYSTEM.format(tables=tables)},
        {"role": "user", "content": question},
    ]
    reply = recorded_reply(question)
    if reply is None:
        reply = complete("fast", messages, agent=AGENT, question=question)
    fenced = SQL_IN_CODE_FENCE.search(reply)
    sql = fenced.group(1) if fenced else reply
    return sql.strip()


def recorded_reply(question: str) -> str | None:
    """In replay mode, the reply this step recorded for the question, if there is one."""
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
    raise FileNotFoundError(f"{REPLIES_FILE} is missing from the step folder")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ask your agent a question.")
    parser.add_argument("question")
    parser.add_argument("--json", action="store_true", help="print the answer contract as JSON")
    parser.add_argument("--user", default="cm-ana", help="who is asking")
    arguments = parser.parse_args()
    print_answer(ask(arguments.question), arguments.json)


if __name__ == "__main__":
    main()

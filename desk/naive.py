"""The naive agent: the one the desk shipped first, and the one you start from.

It asks the model for SQL, splits the reply on ';' and runs every statement on a read-write
connection. It reads as right most of the time. Part one measures how often it is wrong;
later parts fix it. Do not copy its database handling: lock-the-database exists because of it.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys

from desk.contract import empty_answer, log_query_failure, log_query_success, print_answer
from desk.llm import LLMError, complete
from desk.paths import DB_PATH

AGENT = "naive"

SYSTEM = """You answer questions for the operations desk of the Olist marketplace.
Write one SQLite query that answers the question. Reply with the SQL only.

Schema:
{schema}
"""

SQL_IN_CODE_FENCE = re.compile(r"```(?:sql)?\s*(.*?)```", re.S | re.I)


def schema_text(connection: sqlite3.Connection) -> str:
    table_definitions = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    return "\n".join(definition + ";" for (definition,) in table_definitions)


def strip_fences(reply: str) -> str:
    """Keep only the SQL when the model wraps it in a ``` code fence."""
    fenced = SQL_IN_CODE_FENCE.search(reply)
    sql = fenced.group(1) if fenced else reply
    return sql.strip()


def ask(question: str) -> dict:
    answer = empty_answer(question)
    answer["route"] = "sql"
    if not DB_PATH.exists():
        answer["error"] = "data/olist.db is missing. Run `bun run world` first."
        return answer
    connection = sqlite3.connect(DB_PATH)  # read-write: the mistake lock-the-database fixes
    messages = [
        {"role": "system", "content": SYSTEM.format(schema=schema_text(connection))},
        {"role": "user", "content": question},
    ]
    try:
        reply = complete("fast", messages, agent=AGENT, question=question)
    except LLMError as error:
        answer["error"] = str(error)
        return answer
    if not run_every_statement(connection, strip_fences(reply), answer):
        return answer
    connection.commit()
    connection.close()
    if len(answer["rows"]) == 1 and len(answer["rows"][0]) == 1:
        answer["answer"] = f"The answer is {answer['rows'][0][0]}."
    else:
        answer["answer"] = f"Here are {len(answer['rows'])} rows."
    return answer


def run_every_statement(connection: sqlite3.Connection, sql: str, answer: dict) -> bool:
    """Run each statement in turn; the answer keeps the rows of the last one.

    Returns False when a statement fails, with the error written into the answer.
    """
    statements = [statement for statement in sql.split(";") if statement.strip()]
    for number, raw_statement in enumerate(statements, start=1):
        query_id = f"q{number}"
        statement = raw_statement.strip()
        answer["sql"].append({"id": query_id, "text": statement})
        try:
            cursor = connection.execute(raw_statement)
            rows = cursor.fetchall()
        except sqlite3.Error as error:
            log_query_failure(AGENT, answer["question"], statement, str(error))
            answer["error"] = f"SQL error: {error}"
            return False
        log_query_success(AGENT, answer["question"], statement, len(rows))
        answer["rows_from"] = query_id
        answer["columns"] = column_names(cursor)
        answer["rows"] = [list(row) for row in rows]
    return True


def column_names(cursor: sqlite3.Cursor) -> list[str]:
    if not cursor.description:
        return []
    return [column[0] for column in cursor.description]


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ask-naive", description="Ask the naive agent a question."
    )
    parser.add_argument("question")
    parser.add_argument("--json", action="store_true", help="print the answer contract as JSON")
    parser.add_argument(
        "--user", default="cm-ana", help="who is asking (used from the approval part on)"
    )
    arguments = parser.parse_args()
    answer = ask(arguments.question)
    print_answer(answer, arguments.json)
    sys.exit(2 if answer["error"] and not arguments.json else 0)


if __name__ == "__main__":
    main()

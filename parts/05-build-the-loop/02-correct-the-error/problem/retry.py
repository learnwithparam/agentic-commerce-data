"""correct-the-error: when a query fails, show the model the error and try again.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py correct-the-error "<question>"

kit.first_sql() gives a query with a mistake in it. kit.run_query() runs a query, or raises
kit.SqlError with the database's message. kit.rewrite() asks the model for a better query.
"""

import json
import sys

import kit

# The first try, plus at most this many rewrites.
MAX_RETRIES = 2


def answer(question: str) -> dict:
    sql = kit.first_sql(question)
    # TODO: when the query fails, or finds no rows, rewrite it and run it again.
    # Stop after MAX_RETRIES rewrites.
    try:
        columns, rows = kit.run_query(question, sql)
    except kit.SqlError as error:
        return failed(question, sql, str(error))
    return succeeded(question, sql, columns, rows)


def succeeded(question: str, sql: str, columns: list[str], rows: list[list]) -> dict:
    return {
        "question": question,
        "sql": [{"id": "q1", "text": sql}],
        "rows_from": "q1",
        "columns": columns,
        "rows": rows,
        "error": None,
    }


def failed(question: str, sql: str, error: str) -> dict:
    return {
        "question": question,
        "sql": [{"id": "q1", "text": sql}],
        "rows_from": None,
        "columns": [],
        "rows": [],
        "error": error,
    }


def main() -> None:
    for question in sys.argv[1:]:
        print(json.dumps(answer(question), ensure_ascii=False))


if __name__ == "__main__":
    main()

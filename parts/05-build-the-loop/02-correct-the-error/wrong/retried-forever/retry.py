"""correct-the-error: when a query fails, show the model the error and try again.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py correct-the-error "<question>"

kit.first_sql() gives a query with a mistake in it. kit.run_query() runs a query, or raises
kit.SqlError with the database's message. kit.rewrite() asks the model for a better query.
"""

import json
import sys

import kit

# The mistake: five rewrites, so one bad question can run six queries.
MAX_RETRIES = 5


def answer(question: str) -> dict:
    sql = kit.first_sql(question)
    for attempt in range(1 + MAX_RETRIES):
        try:
            columns, rows = kit.run_query(question, sql)
        except kit.SqlError as error:
            problem = str(error)
        else:
            if rows:
                return succeeded(question, sql, columns, rows)
            problem = kit.NO_ROWS
        if attempt == MAX_RETRIES:
            break
        # The error tells the model what to fix, so it always goes with the query.
        sql = kit.rewrite(question, sql, problem)
    return failed(question, sql, problem)


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

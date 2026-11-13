"""The query validator: it reads the SQL before the database does.

Run it by hand:  uv run python validator.py "SELECT * FROM sellers"
It prints {"ok": true, "sql": "<the query to run>"} or {"ok": false, "reason": "<why not>"}.
With --batch it reads a JSON list of queries on stdin and prints a JSON list of answers.
"""

import json
import sys

KNOWN_TABLES = {
    "orders",
    "order_items",
    "order_payments",
    "order_reviews",
    "customers",
    "sellers",
    "products",
    "product_category_name_translation",
    "geolocation",
}
ROW_CAP = 1000

# Words that change data. A query that contains one is refused.
WRITING_WORDS = ["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "ATTACH", "PRAGMA"]


class QueryRefusedError(Exception):
    """The query may not run. The message says why, in plain words."""


def check(sql: str) -> str:
    """Return the query to run, with a LIMIT added when it has none, or raise QueryRefusedError."""
    upper_sql = sql.strip().upper()
    if not upper_sql.startswith(("SELECT", "WITH")):
        raise QueryRefusedError("only SELECT is allowed")
    if ";" in upper_sql.rstrip(";"):
        raise QueryRefusedError("exactly one statement is allowed")
    for word in WRITING_WORDS:
        if word in upper_sql:
            raise QueryRefusedError(f"{word} is not allowed")
    if "LIMIT" not in upper_sql:
        return f"{sql.strip()} LIMIT {ROW_CAP}"
    return sql


def answer(sql: str) -> dict:
    try:
        return {"ok": True, "sql": check(sql)}
    except QueryRefusedError as refusal:
        return {"ok": False, "reason": str(refusal)}


if __name__ == "__main__":
    if sys.argv[1:] == ["--batch"]:
        queries = json.load(sys.stdin)
        print(json.dumps([answer(sql) for sql in queries], ensure_ascii=False))
    else:
        print(json.dumps(answer(sys.argv[1]), ensure_ascii=False))

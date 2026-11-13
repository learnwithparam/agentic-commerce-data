"""The query validator: it reads the SQL before the database does.

Run it by hand:  uv run python validator.py "SELECT * FROM sellers"
It prints {"ok": true, "sql": "<the query to run>"} or {"ok": false, "reason": "<why not>"}.
With --batch it reads a JSON list of queries on stdin and prints a JSON list of answers.
"""

import json
import sys

from sqlglot import exp

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

# A query may only read. These are the shapes of a query that reads.
READING_STATEMENTS = (exp.Select, exp.Union, exp.Intersect, exp.Except)

# None of these may appear anywhere in a query, not even inside a WITH clause.
WRITING_PARTS = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.Command,
    exp.Pragma,
    exp.Attach,
)


class QueryRefusedError(Exception):
    """The query may not run. The message says why, in plain words."""


def check(sql: str) -> str:
    """Return the query to run, with a LIMIT added when it has none, or raise QueryRefusedError.

    TODO(validate-the-query): today every query passes. Parse it with sqlglot.parse(sql,
    read="sqlite") and raise QueryRefusedError("...") when:
      - there is not exactly one statement;
      - the statement is not a SELECT, or a WRITING_PARTS piece appears anywhere in it;
      - a table is not in KNOWN_TABLES (a name made in a WITH clause is fine);
      - a table comes from another database, as in other.orders.
    Then add LIMIT ROW_CAP to a SELECT that has no LIMIT: tree.limit(ROW_CAP).
    """
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

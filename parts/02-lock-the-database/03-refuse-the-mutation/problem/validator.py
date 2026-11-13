"""The query validator: it reads the SQL before the database does.

Run it by hand:  uv run python validator.py "SELECT * FROM sellers"
It prints {"ok": true, "sql": "<the query to run>"} or {"ok": false, "reason": "<why not>"}.
With --batch it reads a JSON list of queries on stdin and prints a JSON list of answers.
"""

import json
import sys

import sqlglot
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


def only_statement(sql: str) -> exp.Expression:
    try:
        statements = [tree for tree in sqlglot.parse(sql, read="sqlite") if tree is not None]
    except sqlglot.errors.ParseError as error:
        first_line = str(error).splitlines()[0]
        raise QueryRefusedError(f"the query does not parse: {first_line}") from error
    if len(statements) != 1:
        raise QueryRefusedError(f"exactly one statement is allowed, found {len(statements)}")
    return statements[0]


def refuse_writes(tree: exp.Expression) -> None:
    if not isinstance(tree, READING_STATEMENTS):
        raise QueryRefusedError(f"only SELECT is allowed, found {tree.key.upper()}")
    for writing_part in WRITING_PARTS:
        if tree.find(writing_part):
            part_name = writing_part.__name__.upper()
            raise QueryRefusedError(f"{part_name} is not allowed inside a query")


def refuse_unknown_tables(tree: exp.Expression) -> None:
    """Every table is one of the nine, or a name the query made itself in a WITH clause."""
    made_in_with = {common_table.alias_or_name for common_table in tree.find_all(exp.CTE)}
    for table in tree.find_all(exp.Table):
        if table.db:
            raise QueryRefusedError(f"table {table.db}.{table.name} is in another database")
        if table.name not in KNOWN_TABLES and table.name not in made_in_with:
            raise QueryRefusedError(f"table {table.name!r} is not one of the known tables")


def check(sql: str) -> str:
    """Return the query to run, with a LIMIT added when it has none, or raise QueryRefusedError."""
    tree = only_statement(sql)
    refuse_writes(tree)
    refuse_unknown_tables(tree)
    # exp.Query covers a plain SELECT and a UNION, so a UNION cannot skip the cap.
    if isinstance(tree, exp.Query) and not tree.args.get("limit"):
        tree = tree.limit(ROW_CAP)
    return tree.sql(dialect="sqlite")


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

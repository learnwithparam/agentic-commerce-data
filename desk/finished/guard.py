"""The SQL guard: one read-only SELECT on known tables, with a row cap and a time limit.

The finished agent never runs SQL any other way. lock-the-database teaches you to build this.
"""

from __future__ import annotations

import sqlite3
import time

import sqlglot
from sqlglot import exp

from desk.paths import DB_PATH

TABLES = {
    "orders", "order_items", "order_payments", "order_reviews", "customers", "sellers", "products",
    "product_category_name_translation", "geolocation",
}
ROW_CAP = 1000
SECONDS = 10


class Refused(Exception):
    """The query was refused before it reached the database. The message says why."""


def connect_ro() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError("data/olist.db is missing. Run `bun run world` first.")
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def check(sql: str) -> str:
    """Return the query to run (with a LIMIT added if it has none), or raise Refused with a reason."""
    try:
        trees = [t for t in sqlglot.parse(sql, read="sqlite") if t is not None]
    except sqlglot.errors.ParseError as e:
        raise Refused(f"the query does not parse: {str(e).splitlines()[0]}") from e
    if len(trees) != 1:
        raise Refused(f"exactly one statement is allowed, found {len(trees)}")
    tree = trees[0]
    if not isinstance(tree, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
        raise Refused(f"only SELECT is allowed, found {tree.key.upper()}")
    for bad in (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter, exp.Command, exp.Pragma, exp.Attach):
        if any(True for _ in tree.find_all(bad)):
            raise Refused(f"{bad.__name__.upper()} is not allowed inside a query")
    ctes = {c.alias_or_name for c in tree.find_all(exp.CTE)}
    for t in tree.find_all(exp.Table):
        if t.name not in TABLES and t.name not in ctes:
            raise Refused(f"table {t.name!r} is not one of the known tables")
    if isinstance(tree, exp.Select) and not tree.args.get("limit"):
        tree = tree.limit(ROW_CAP)
    return tree.sql(dialect="sqlite")


def run(sql: str) -> tuple[list[str], list[list]]:
    safe = check(sql)
    conn = connect_ro()
    deadline = time.monotonic() + SECONDS
    conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
    try:
        cur = conn.execute(safe)
        rows = [list(r) for r in cur.fetchmany(ROW_CAP + 1)]
    except sqlite3.OperationalError as e:
        if "interrupted" in str(e):
            raise Refused(f"the query ran longer than {SECONDS} seconds") from e
        raise
    finally:
        conn.close()
    return [d[0] for d in cur.description], rows[:ROW_CAP]

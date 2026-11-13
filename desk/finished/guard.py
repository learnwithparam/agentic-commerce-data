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
TIME_LIMIT_SECONDS = 10

# Statements that change data or the database. None may appear anywhere inside a query.
FORBIDDEN_STATEMENTS = (
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
READ_ONLY_STATEMENTS = (exp.Select, exp.Union, exp.Intersect, exp.Except)

# SQLite calls the progress handler every this many steps, so it can stop a slow query.
STEPS_BETWEEN_TIME_CHECKS = 10_000


class QueryRefusedError(Exception):
    """The query was refused before it reached the database. The message says why."""


def connect_read_only() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError("data/olist.db is missing. Run `bun run world` first.")
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def check(sql: str) -> str:
    """Return the query to run (with a LIMIT added if it has none), or refuse with a reason."""
    tree = parse_one_statement(sql)
    if not isinstance(tree, READ_ONLY_STATEMENTS):
        raise QueryRefusedError(f"only SELECT is allowed, found {tree.key.upper()}")
    for forbidden in FORBIDDEN_STATEMENTS:
        if any(True for _ in tree.find_all(forbidden)):
            raise QueryRefusedError(f"{forbidden.__name__.upper()} is not allowed inside a query")
    refuse_unknown_tables(tree)
    if isinstance(tree, exp.Select) and not tree.args.get("limit"):
        tree = tree.limit(ROW_CAP)
    return tree.sql(dialect="sqlite")


def parse_one_statement(sql: str) -> exp.Expression:
    try:
        parsed = sqlglot.parse(sql, read="sqlite")
    except sqlglot.errors.ParseError as error:
        first_line = str(error).splitlines()[0]
        raise QueryRefusedError(f"the query does not parse: {first_line}") from error
    statements = [statement for statement in parsed if statement is not None]
    if len(statements) != 1:
        raise QueryRefusedError(f"exactly one statement is allowed, found {len(statements)}")
    return statements[0]


def refuse_unknown_tables(tree: exp.Expression) -> None:
    """A WITH clause may name its own tables; every other table must be a known one."""
    named_in_with = {common_table.alias_or_name for common_table in tree.find_all(exp.CTE)}
    for table in tree.find_all(exp.Table):
        if table.name not in TABLES and table.name not in named_in_with:
            raise QueryRefusedError(f"table {table.name!r} is not one of the known tables")


def run(sql: str) -> tuple[list[str], list[list]]:
    safe_sql = check(sql)
    connection = connect_read_only()
    deadline = time.monotonic() + TIME_LIMIT_SECONDS

    def stop_when_too_slow() -> int:
        return 1 if time.monotonic() > deadline else 0

    connection.set_progress_handler(stop_when_too_slow, STEPS_BETWEEN_TIME_CHECKS)
    try:
        cursor = connection.execute(safe_sql)
        rows = [list(row) for row in cursor.fetchmany(ROW_CAP + 1)]
    except sqlite3.OperationalError as error:
        if "interrupted" in str(error):
            raise QueryRefusedError(
                f"the query ran longer than {TIME_LIMIT_SECONDS} seconds"
            ) from error
        raise
    finally:
        connection.close()
    columns = [column[0] for column in cursor.description]
    return columns, rows[:ROW_CAP]

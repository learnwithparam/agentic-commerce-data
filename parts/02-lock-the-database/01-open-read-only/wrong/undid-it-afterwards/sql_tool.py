"""The SQL tool: the only door from the agent to the database.

Run it by hand:  uv run python sql_tool.py "SELECT COUNT(*) FROM orders"
It prints one JSON object: {"columns": [...], "rows": [...]} or {"error": "..."}.

The check points OLIST_DB at a small copy of the database, so a DELETE it sends cannot hurt
your real data/olist.db.
"""

import json
import os
import sqlite3
import sys

from desk.paths import DB_PATH


def database_path() -> str:
    return os.environ.get("OLIST_DB", str(DB_PATH))


def connect() -> sqlite3.Connection:
    return sqlite3.connect(database_path())


def run(sql: str) -> dict:
    connection = connect()
    try:
        cursor = connection.execute(sql)
        rows = [list(row) for row in cursor.fetchall()]
        connection.rollback()  # undo any change the query made
    except sqlite3.Error as error:
        return {"error": str(error)}
    finally:
        connection.close()
    columns = [column[0] for column in cursor.description or []]
    return {"columns": columns, "rows": rows}


if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1]), ensure_ascii=False))

"""Who may read what. Run it by hand:

  uv run python access.py check partner "SELECT * FROM customers"
  echo '{"columns": ["customer_unique_id"], "rows": [["abc"]]}' | uv run python access.py mask analyst

`check` prints {"ok": true, "sql": ...} or {"ok": false, "reason": ...}.
`mask` reads {"columns": [...], "rows": [[...]]} on stdin and prints {"rows": [[...]]}.
"""

import json
import sys

# Which tables each role may read. A role that is not listed may read nothing.
TABLES_BY_ROLE = {
    "admin": "all",
    "analyst": "all",
    "partner": {"sellers", "products", "order_items", "product_category_name_translation"},
}

# Columns that point at a person. Only admin sees them as they are.
PRIVATE_COLUMNS = {"customer_unique_id", "customer_zip_code_prefix"}


class AccessDeniedError(Exception):
    """The role may not read this. The message says why, in plain words."""


def check(role: str, sql: str) -> str:
    """Return the query when the role may run it, or raise AccessDeniedError.

    TODO(mask-the-private-columns): today every role may read every table. Use sqlglot to find every
    table the query reads, including tables inside joins and WITH clauses. Raise when the role may not
    read one of them, and raise for a role that is not in TABLES_BY_ROLE.
    """
    return sql


def mask(role: str, columns: list[str], rows: list[list]) -> list[list]:
    """Return the rows with private columns hidden, unless the role is admin.

    TODO(mask-the-private-columns): today the rows come back as they are. Replace each value in a
    private column with a short stable token (a hash), so the same person always gets the same token
    and two people never share one. Hide the zip prefix completely.
    """
    return rows


if __name__ == "__main__":
    action, role = sys.argv[1], sys.argv[2]
    if action == "check":
        try:
            print(json.dumps({"ok": True, "sql": check(role, sys.argv[3])}))
        except AccessDeniedError as why:
            print(json.dumps({"ok": False, "reason": str(why)}))
    else:
        given = json.loads(sys.stdin.read())
        print(json.dumps({"rows": mask(role, given["columns"], given["rows"])}))

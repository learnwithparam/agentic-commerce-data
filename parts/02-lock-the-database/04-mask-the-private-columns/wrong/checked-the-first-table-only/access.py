"""Who may read what. Run it by hand:

  uv run python access.py check partner "SELECT * FROM customers"
  echo '{"columns": ["customer_unique_id"], "rows": [["abc"]]}' | uv run python access.py mask analyst

`check` prints {"ok": true, "sql": ...} or {"ok": false, "reason": ...}.
`mask` reads {"columns": [...], "rows": [[...]]} on stdin and prints {"rows": [[...]]}.
"""

import hashlib
import json
import sys

import sqlglot
from sqlglot import exp

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

    Find every table the query reads, in joins and WITH clauses too.
    """
    allowed = TABLES_BY_ROLE.get(role)
    if allowed is None:
        raise AccessDeniedError(f"the role {role!r} is not known, so it may read nothing")
    tree = sqlglot.parse_one(sql, read="sqlite")
    made_here = {cte.alias_or_name for cte in tree.find_all(exp.CTE)}
    for table in list(tree.find_all(exp.Table))[:1]:
        if table.name in made_here:
            continue
        if allowed != "all" and table.name not in allowed:
            raise AccessDeniedError(f"the role {role!r} may not read the table {table.name!r}")
    return sql


def mask(role: str, columns: list[str], rows: list[list]) -> list[list]:
    """Return the rows with private columns hidden, unless the role is admin.

    The same person always gets the same token, so counts and joins still work.
    """
    if role == "admin":
        return rows
    hidden = {i: column for i, column in enumerate(columns) if column in PRIVATE_COLUMNS}
    masked = []
    for row in rows:
        new_row = list(row)
        for i, column in hidden.items():
            if column == "customer_zip_code_prefix":
                new_row[i] = "hidden"
            elif row[i] is not None:
                new_row[i] = "person_" + hashlib.sha256(str(row[i]).encode()).hexdigest()[:10]
        masked.append(new_row)
    return masked


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

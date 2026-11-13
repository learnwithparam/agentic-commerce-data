"""The value index: every way a city, state or category is stored, grouped under one clean name.

Run it by hand:  uv run python value_index.py seller_city "Sao Paulo"
It prints every stored spelling as a JSON list. The agent puts that list into the SQL, so
WHERE seller_city IN (...) finds all of them.
"""

import json
import sqlite3
import sys
import unicodedata

from desk.paths import DB_PATH

# For each column the index covers, the table it lives in.
COLUMNS = {
    "seller_city": "sellers",
    "customer_city": "customers",
    "seller_state": "sellers",
    "customer_state": "customers",
    "product_category_name": "products",
}


def fold(text: str) -> str:
    """Lower case, no accents, single spaces: 'São  Paulo' -> 'sao paulo'."""
    without_accents = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(without_accents.lower().split())


def stored_values(connection: sqlite3.Connection, column: str) -> list[str]:
    table = COLUMNS[column]
    query = f"SELECT DISTINCT {column} FROM {table} WHERE {column} IS NOT NULL"
    return [value for (value,) in connection.execute(query)]


def lookup(column: str, text: str) -> list[str]:
    """Every stored spelling of what `text` names in `column`.

    TODO(index-the-values): today only the exact spelling is found, so 'Sao Paulo' finds one of
    its nine spellings. Group the stored values of each column under one clean name: fold
    accents and case, cut the city before ' / ' or ' - ', drop a trailing ' sp', and treat a
    very close spelling ('sao paluo') as the same city. Then look the text up by its clean name.
    """
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    found = [value for value in stored_values(connection, column) if value == text.lower()]
    connection.close()
    return found


def sql_list(spellings: list[str]) -> str:
    """('a', 'b') for a WHERE ... IN. Accents stay as they are stored."""
    quoted = ["'" + spelling.replace("'", "''") + "'" for spelling in spellings]
    return "(" + ", ".join(quoted) + ")"


if __name__ == "__main__":
    column, text = sys.argv[1], sys.argv[2]
    print(json.dumps(lookup(column, text), ensure_ascii=False))

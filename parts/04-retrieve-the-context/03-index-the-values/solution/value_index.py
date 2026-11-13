"""The value index: every way a city, state or category is stored, grouped under one clean name.

Run it by hand:  uv run python value_index.py seller_city "Sao Paulo"
It prints every stored spelling as a JSON list. The agent puts that list into the SQL, so
WHERE seller_city IN (...) finds all of them.
"""

import difflib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from functools import lru_cache

from desk.paths import DB_PATH

# For each column the index covers, the table it lives in.
COLUMNS = {
    "seller_city": "sellers",
    "customer_city": "customers",
    "seller_state": "sellers",
    "customer_state": "customers",
    "product_category_name": "products",
}

# Cuts 'sao paulo / sao paulo' and 'sao paulo - sp' before the separator.
CITY_SEPARATOR = re.compile(r"\s*/\s*|\s+-\s+")
# A state code typed after the city, as in 'sao paulo sp'.
TRAILING_STATE_CODE = re.compile(r"\s+sp$")
# How alike two spellings must be to count as one name: 'sao paluo' and 'sao paulo' are.
CLOSE_ENOUGH = 0.88


def fold(text: str) -> str:
    """Lower case, no accents, single spaces: 'São  Paulo' -> 'sao paulo'."""
    without_accents = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(without_accents.lower().split())


def clean_city(stored: str, known_cities: set[str]) -> str | None:
    """The city one stored spelling means, or None when it names no city (like 'sp')."""
    city = CITY_SEPARATOR.split(fold(stored))[0].strip()
    city = TRAILING_STATE_CODE.sub("", city)
    if city in known_cities:
        return city
    if len(city) <= 3:
        return None
    close = difflib.get_close_matches(city, list(known_cities), n=1, cutoff=CLOSE_ENOUGH)
    if close:
        return close[0]
    return None


def clean_name(column: str, stored: str, known_cities: set[str]) -> str | None:
    """A city needs cleaning. A state or a category only needs folding."""
    if column.endswith("_city"):
        return clean_city(stored, known_cities)
    return fold(stored)


def stored_values(connection: sqlite3.Connection, column: str) -> list[str]:
    table = COLUMNS[column]
    query = f"SELECT DISTINCT {column} FROM {table} WHERE {column} IS NOT NULL"
    return [value for (value,) in connection.execute(query)]


@lru_cache(maxsize=1)
def index() -> dict[str, dict[str, list[str]]]:
    """For each column: clean name -> every stored spelling of it."""
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    known_cities = {fold(city) for city in stored_values(connection, "customer_city")}
    spellings_by_column = {}
    for column in COLUMNS:
        groups = defaultdict(list)
        for stored in stored_values(connection, column):
            name = clean_name(column, stored, known_cities)
            if name:
                groups[name].append(stored)
        spellings_by_column[column] = {name: sorted(found) for name, found in groups.items()}
    connection.close()
    return spellings_by_column


def lookup(column: str, text: str) -> list[str]:
    """Every stored spelling of what `text` names in `column`, or [] when nothing is close."""
    groups = index()[column]
    key = fold(text)
    if key in groups:
        return groups[key]
    close = difflib.get_close_matches(key, list(groups), n=1, cutoff=CLOSE_ENOUGH)
    if close:
        return groups[close[0]]
    return []


def sql_list(spellings: list[str]) -> str:
    """('a', 'b') for a WHERE ... IN. Accents stay as they are stored."""
    quoted = ["'" + spelling.replace("'", "''") + "'" for spelling in spellings]
    return "(" + ", ".join(quoted) + ")"


if __name__ == "__main__":
    column, text = sys.argv[1], sys.argv[2]
    print(json.dumps(lookup(column, text), ensure_ascii=False))

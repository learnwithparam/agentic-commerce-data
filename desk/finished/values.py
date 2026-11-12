"""The value index: every way a city, state or category is written in the data, mapped to one name.

The model writes `{{seller_city:Sao Paulo}}` in its SQL; the index expands it to every stored
spelling of that city, so `WHERE seller_city IN (...)` finds all of them. Built from the data on
first use.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from collections import defaultdict
from functools import lru_cache

from desk.finished.guard import connect_read_only

# For each placeholder name, the table and column whose stored values it stands for.
COLUMNS = {
    "seller_city": ("sellers", "seller_city"),
    "customer_city": ("customers", "customer_city"),
    "seller_state": ("sellers", "seller_state"),
    "customer_state": ("customers", "customer_state"),
    "product_category_name": ("products", "product_category_name"),
}

# Splits 'sao paulo / sao paulo', 'sao paulo - sp' and 'maua/sao paulo' before the separator.
CITY_SEPARATOR = re.compile(r"\s*/\s*|\s+-\s+")
# A state code typed after the city, as in 'sao paulo sp'.
TRAILING_STATE_CODE = re.compile(r"\s+sp$")


def fold(text: str) -> str:
    """Lower case, no accents, single spaces."""
    without_accents = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(without_accents.lower().split())


def canonical_city(raw: str, known: set[str]) -> str | None:
    """Map one stored city spelling to a clean city name, or None when it names no city.

    For example 'sp' names no city: it is a state code typed as a city.
    """
    city = CITY_SEPARATOR.split(fold(raw))[0].strip()
    city = TRAILING_STATE_CODE.sub("", city)
    if city in known:
        return city
    if len(city) <= 3:
        return None
    close = difflib.get_close_matches(city, list(known), n=1, cutoff=0.88)
    return close[0] if close else None


@lru_cache(maxsize=1)
def index() -> dict[str, dict[str, list[str]]]:
    """For each placeholder name: clean name -> every stored spelling of it."""
    connection = connect_read_only()
    customer_cities = connection.execute(
        "SELECT DISTINCT customer_city FROM customers WHERE customer_city IS NOT NULL"
    )
    known_cities = {fold(city) for (city,) in customer_cities}
    spellings_by_name: dict[str, dict[str, list[str]]] = {}
    for placeholder, (table, column) in COLUMNS.items():
        groups: dict[str, list[str]] = defaultdict(list)
        stored_values = connection.execute(
            f"SELECT DISTINCT {column} FROM {table} WHERE {column} IS NOT NULL"
        )
        for (stored,) in stored_values:
            if placeholder.endswith("_city"):
                clean_name = canonical_city(stored, known_cities)
            else:
                clean_name = fold(stored)
            if clean_name:
                groups[clean_name].append(stored)
        spellings_by_name[placeholder] = {
            name: sorted(spellings) for name, spellings in groups.items()
        }
    connection.close()
    return spellings_by_name


def lookup(column: str, text: str) -> list[str]:
    if column not in COLUMNS:
        raise KeyError(f"no value index for {column}")
    groups = index()[column]
    key = fold(text)
    if key in groups:
        return groups[key]
    close = difflib.get_close_matches(key, list(groups), n=1, cutoff=0.8)
    return groups[close[0]] if close else []


def sql_list(values: list[str]) -> str:
    """Render values as a SQL list.

    A value with a combining accent is spelled with char() so it survives copy and paste.
    """
    return "(" + ", ".join(sql_text(value) for value in values) + ")"


def sql_text(value: str) -> str:
    if value.isascii():
        return quoted(value)
    pieces = [
        f"char({ord(character)})" if ord(character) >= 128 else quoted(character)
        for character in value
    ]
    # Join plain letters back into one quoted run: 'a' || 'b' becomes 'ab'.
    return " || ".join(pieces).replace("' || '", "")


def quoted(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"

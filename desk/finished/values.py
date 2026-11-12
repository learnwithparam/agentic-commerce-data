"""The value index: every way a city, state or category is written in the data, mapped to one name.

The model writes `{{seller_city:Sao Paulo}}` in its SQL; the index expands it to every stored spelling of that
city, so `WHERE seller_city IN (...)` finds all of them. Built from the data on first use.
"""

from __future__ import annotations

import difflib
import re
import sqlite3
import unicodedata
from collections import defaultdict
from functools import lru_cache

from desk.finished.guard import connect_ro

COLUMNS = {
    "seller_city": ("sellers", "seller_city"),
    "customer_city": ("customers", "customer_city"),
    "seller_state": ("sellers", "seller_state"),
    "customer_state": ("customers", "customer_state"),
    "product_category_name": ("products", "product_category_name"),
}


def fold(s: str) -> str:
    """Lower case, no accents, single spaces."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(s.split())


def canonical_city(raw: str, known: set[str]) -> str | None:
    """Map one stored city spelling to a clean city name, or None when it names no city (for example 'sp')."""
    s = fold(raw)
    s = re.split(r"\s*/\s*|\s+-\s+", s)[0].strip()  # 'sao paulo / sao paulo', 'sao paulo - sp', 'maua/sao paulo'
    s = re.sub(r"\s+sp$", "", s)  # 'sao paulo sp'
    if s in known:
        return s
    if len(s) <= 3:
        return None  # a state code typed as a city
    close = difflib.get_close_matches(s, list(known), n=1, cutoff=0.88)
    return close[0] if close else None


@lru_cache(maxsize=1)
def index() -> dict[str, dict[str, list[str]]]:
    conn = connect_ro()
    known = {fold(r[0]) for r in conn.execute("SELECT DISTINCT customer_city FROM customers WHERE customer_city IS NOT NULL")}
    out: dict[str, dict[str, list[str]]] = {}
    for col, (table, column) in COLUMNS.items():
        groups: dict[str, list[str]] = defaultdict(list)
        for (v,) in conn.execute(f"SELECT DISTINCT {column} FROM {table} WHERE {column} IS NOT NULL"):
            key = canonical_city(v, known) if col.endswith("_city") else fold(v)
            if key:
                groups[key].append(v)
        out[col] = {k: sorted(v) for k, v in groups.items()}
    conn.close()
    return out


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
    """Render values as a SQL list. A value with a combining accent is spelled with char() so it survives copy and paste."""
    parts = []
    for v in values:
        if all(ord(c) < 128 for c in v):
            parts.append("'" + v.replace("'", "''") + "'")
        else:
            parts.append(" || ".join(f"char({ord(c)})" if ord(c) >= 128 else "'" + c.replace("'", "''") + "'" for c in v).replace("' || '", ""))
    return "(" + ", ".join(parts) + ")"

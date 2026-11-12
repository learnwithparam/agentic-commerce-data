"""Review search: find what customers wrote, in Portuguese, about the orders an answer is built on.

The finished agent filters reviews with SQL first (which orders, which scores) and then ranks the comments with
SQLite full-text search over Portuguese terms. search-the-reviews replaces this with multilingual embeddings.
"""

from __future__ import annotations

import sqlite3

from desk.finished.guard import connect_ro
from desk.paths import ROOT

INDEX = ROOT / "data" / "reviews_fts.db"


def _ensure_index() -> None:
    if INDEX.exists():
        return
    src = connect_ro()
    tmp = INDEX.with_suffix(".building")
    tmp.unlink(missing_ok=True)
    out = sqlite3.connect(tmp)
    out.execute("CREATE VIRTUAL TABLE reviews USING fts5(review_id UNINDEXED, order_id UNINDEXED, score UNINDEXED, message, tokenize = 'unicode61 remove_diacritics 2')")
    rows = src.execute("SELECT review_id, order_id, review_score, review_comment_message FROM order_reviews WHERE review_comment_message IS NOT NULL")
    out.executemany("INSERT INTO reviews VALUES (?, ?, ?, ?)", rows)
    out.commit()
    out.close()
    src.close()
    tmp.rename(INDEX)


def search(order_ids: list[str], terms: list[str], max_score: int = 5, limit: int = 3) -> list[dict]:
    """Comments on these orders that match any term, best match first. Each hit keeps its review_id."""
    if not order_ids or not terms:
        return []
    _ensure_index()
    conn = sqlite3.connect(f"file:{INDEX}?mode=ro", uri=True)
    match = " OR ".join('"' + t.replace('"', "") + '"' for t in terms)
    marks = ",".join("?" for _ in order_ids)
    rows = conn.execute(
        f"SELECT review_id, order_id, score, message FROM reviews WHERE reviews MATCH ? AND order_id IN ({marks}) "
        f"AND CAST(score AS INTEGER) <= ? ORDER BY bm25(reviews), review_id LIMIT ?",
        [match, *order_ids, max_score, limit],
    ).fetchall()
    conn.close()
    return [{"review_id": r[0], "order_id": r[1], "score": int(r[2]), "quote": " ".join(r[3].split())} for r in rows]

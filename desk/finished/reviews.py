"""Review search: find what customers wrote, in Portuguese, about the orders an answer is built on.

The finished agent filters reviews with SQL first (which orders, which scores) and then ranks the
comments with SQLite full-text search over Portuguese terms. search-the-reviews replaces this with
multilingual embeddings.
"""

from __future__ import annotations

import sqlite3

from desk.finished.guard import connect_read_only
from desk.paths import ROOT

INDEX = ROOT / "data" / "reviews_fts.db"

CREATE_INDEX = (
    "CREATE VIRTUAL TABLE reviews USING fts5(review_id UNINDEXED, order_id UNINDEXED, "
    "score UNINDEXED, message, tokenize = 'unicode61 remove_diacritics 2')"
)
REVIEWS_WITH_COMMENTS = (
    "SELECT review_id, order_id, review_score, review_comment_message FROM order_reviews "
    "WHERE review_comment_message IS NOT NULL"
)


def ensure_index() -> None:
    """Build the full-text index once. It is built under another name first, so a build that
    stops halfway never leaves a broken index behind."""
    if INDEX.exists():
        return
    database = connect_read_only()
    half_built = INDEX.with_suffix(".building")
    half_built.unlink(missing_ok=True)
    index = sqlite3.connect(half_built)
    index.execute(CREATE_INDEX)
    rows = database.execute(REVIEWS_WITH_COMMENTS)
    index.executemany("INSERT INTO reviews VALUES (?, ?, ?, ?)", rows)
    index.commit()
    index.close()
    database.close()
    half_built.rename(INDEX)


def search(
    order_ids: list[str], terms: list[str], max_score: int = 5, limit: int = 3
) -> list[dict]:
    """Comments on these orders that match any term, best match first.

    Each hit keeps its review_id.
    """
    if not order_ids or not terms:
        return []
    ensure_index()
    connection = sqlite3.connect(f"file:{INDEX}?mode=ro", uri=True)
    # Each term becomes a quoted phrase, so a term with a space matches as a whole.
    match = " OR ".join('"' + term.replace('"', "") + '"' for term in terms)
    placeholders = ",".join("?" for _ in order_ids)
    rows = connection.execute(
        "SELECT review_id, order_id, score, message FROM reviews WHERE reviews MATCH ? "
        f"AND order_id IN ({placeholders}) "
        "AND CAST(score AS INTEGER) <= ? ORDER BY bm25(reviews), review_id LIMIT ?",
        [match, *order_ids, max_score, limit],
    ).fetchall()
    connection.close()
    return [
        {
            "review_id": review_id,
            "order_id": order_id,
            "score": int(score),
            "quote": " ".join(message.split()),
        }
        for review_id, order_id, score, message in rows
    ]

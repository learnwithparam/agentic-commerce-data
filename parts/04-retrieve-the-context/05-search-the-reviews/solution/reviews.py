"""Review search: find what customers wrote about one seller's orders in one window of time.

Run it:  uv run python reviews.py --seller 1f50f920176fa81dab994f9023523100 \
             --start 2017-11-01 --end 2017-12-01 "late delivery"
It prints up to 5 reviews as JSON: review_id, order_id, score and the quote, best match first.

SQL comes first: it keeps only the seller's orders placed in the window. Then the English words
of the question become Portuguese word roots, and each comment is scored by the roots it holds.
For example, "late" becomes "atras", which finds atraso, atrasado and atrasou.
"""

import argparse
import json
import sqlite3
import unicodedata

from desk.paths import DB_PATH

MOST_RESULTS = 5

# English words a manager types, and the Portuguese word roots customers write for them.
PORTUGUESE_ROOTS = {
    "late": ["atras", "ainda nao"],
    "delay": ["atras", "demor"],
    "slow": ["demor", "atras"],
    "never": ["nao chegou", "nao recebi", "nunca"],
    "arrived": ["chegou", "recebi"],
    "delivery": ["entreg"],
    "broken": ["quebr", "defeito", "danific"],
    "wrong": ["errad", "trocad", "diferente"],
}

REVIEWS_OF_SELLER_IN_WINDOW = """
SELECT DISTINCT r.review_id, r.order_id, r.review_score, r.review_comment_message
FROM order_reviews r
JOIN orders o ON o.order_id = r.order_id
WHERE r.review_comment_message IS NOT NULL
  AND o.order_purchase_timestamp >= ? AND o.order_purchase_timestamp < ?
  AND r.order_id IN (SELECT i.order_id FROM order_items i WHERE i.seller_id = ?)
"""


def fold(text: str) -> str:
    """Lower case, no accents, single spaces: 'Não chegou' -> 'nao chegou'."""
    without_accents = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(without_accents.lower().split())


def roots_for(query: str) -> set[str]:
    roots = set()
    for word in fold(query).split():
        roots.update(PORTUGUESE_ROOTS.get(word, []))
    return roots


def search(seller_id: str, start: str, end: str, query: str) -> list[dict]:
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    rows = connection.execute(REVIEWS_OF_SELLER_IN_WINDOW, [start, end, seller_id]).fetchall()
    connection.close()
    roots = roots_for(query)
    hits = []
    for review_id, order_id, score, comment in rows:
        matched = sum(1 for root in roots if root in fold(comment))
        if matched > 0:
            quote = " ".join(comment.split())
            review = {"review_id": review_id, "order_id": order_id, "score": score, "quote": quote}
            hits.append((matched, review))
    # Most roots matched first; among equals, the lowest star score, since complaints matter.
    hits.sort(key=lambda hit: (-hit[0], hit[1]["score"], hit[1]["review_id"]))
    return [review for _, review in hits[:MOST_RESULTS]]


def main() -> None:
    parser = argparse.ArgumentParser(description="Search one seller's reviews in a window.")
    parser.add_argument("query")
    parser.add_argument("--seller", required=True)
    parser.add_argument("--start", required=True, help="first purchase date, as 2017-11-01")
    parser.add_argument("--end", required=True, help="the day after the window, as 2017-12-01")
    arguments = parser.parse_args()
    found = search(arguments.seller, arguments.start, arguments.end, arguments.query)
    print(json.dumps(found, ensure_ascii=False))


if __name__ == "__main__":
    main()

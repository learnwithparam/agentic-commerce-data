"""check-the-relevance: cite only the reviews that are about the question.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py check-the-relevance

kit.review_hits() returns what review search found for kit.RELEVANCE_QUESTION. Each hit is a
dictionary with "review_id", "score" (1 to 5 stars) and "quote" (the customer's own words).
Search finds words, not meaning, so some hits are not about late deliveries at all.
"""

import json
import unicodedata

import kit

# Words customers use when an order came late or never came. Accents are removed first.
LATE_SIGNS = (
    "atras",
    "nao recebi",
    "ainda nao me entreg",
    "nao chegou",
    "demor",
    "esgotado o prazo",
)

# Words that say the order came on time. A review with one of these is not about lateness.
ON_TIME_SIGNS = ("no prazo", "antes do prazo", "dentro do prazo")

# But "não chegou no prazo" means "did not arrive on time". The "no prazo" is negated: it is late.
NOT_ON_TIME_SIGNS = (
    "nao chegou no prazo",
    "nao recebi no prazo",
    "nao veio no prazo",
    "nao foi entregue no prazo",
    "fora do prazo",
)


def without_accents(text: str) -> str:
    """Lower case with no accents, so "não" and "nao" look the same."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return decomposed.encode("ascii", "ignore").decode()


def is_relevant(question: str, review: dict) -> bool:
    """True when the review talks about what the question asks: deliveries that came late."""
    text = without_accents(review["quote"])
    if any(sign in text for sign in NOT_ON_TIME_SIGNS):
        return True
    if any(sign in text for sign in ON_TIME_SIGNS):
        return False
    return any(sign in text for sign in LATE_SIGNS)


def main() -> None:
    question = kit.RELEVANCE_QUESTION
    kept = [review for review in kit.review_hits() if is_relevant(question, review)]
    citations = [{"claim": review["quote"], "review_id": review["review_id"]} for review in kept]
    answer = {"question": question, "reviews": kept, "citations": citations}
    print(json.dumps(answer, ensure_ascii=False))


if __name__ == "__main__":
    main()

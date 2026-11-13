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
# The mistake: these words appear in praise too, like "entregue antes do prazo".
LATE_SIGNS = ("entreg", "prazo", "receb", "cheg", "ainda nao")


def without_accents(text: str) -> str:
    """Lower case with no accents, so "não" and "nao" look the same."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return decomposed.encode("ascii", "ignore").decode()


def is_relevant(question: str, review: dict) -> bool:
    """True when the review talks about what the question asks: deliveries that came late."""
    text = without_accents(review["quote"])
    return any(sign in text for sign in LATE_SIGNS)


def main() -> None:
    question = kit.RELEVANCE_QUESTION
    kept = [review for review in kit.review_hits() if is_relevant(question, review)]
    citations = [{"claim": review["quote"], "review_id": review["review_id"]} for review in kept]
    answer = {"question": question, "reviews": kept, "citations": citations}
    print(json.dumps(answer, ensure_ascii=False))


if __name__ == "__main__":
    main()

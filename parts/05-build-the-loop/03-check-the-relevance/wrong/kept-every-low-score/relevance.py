"""check-the-relevance: cite only the reviews that are about the question.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py check-the-relevance

kit.review_hits() returns what review search found for kit.RELEVANCE_QUESTION. Each hit is a
dictionary with "review_id", "score" (1 to 5 stars) and "quote" (the customer's own words).
Search finds words, not meaning, so some hits are not about late deliveries at all.
"""

import json

import kit


def is_relevant(question: str, review: dict) -> bool:
    """True when the review talks about what the question asks: deliveries that came late."""
    # The mistake: an unhappy customer is not always a customer whose order came late.
    return review["score"] <= 2


def main() -> None:
    question = kit.RELEVANCE_QUESTION
    kept = [review for review in kit.review_hits() if is_relevant(question, review)]
    citations = [{"claim": review["quote"], "review_id": review["review_id"]} for review in kept]
    answer = {"question": question, "reviews": kept, "citations": citations}
    print(json.dumps(answer, ensure_ascii=False))


if __name__ == "__main__":
    main()

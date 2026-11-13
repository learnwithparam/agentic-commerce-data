"""route-the-question: send each question down the right path.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py route-the-question "Delete the test orders"

The rules run in order. The first one that fits decides the route.
The mistake: there is no rule for writes, so "Delete the test orders" goes to SQL.
"""

import json
import sys

ROUTES = ("sql", "reviews", "both", "refuse", "handoff")

# Carriers, parcels and pick-ups are data the logistics team owns.
LOGISTICS_WORDS = ("carrier", "logistics", "package", "parcel", "tracking", "pick up")

# Words that ask what customers wrote.
REVIEW_WORDS = ("say", "complain", "unhappy", "why", "opinion")

# Words that ask for a number or a list from the database.
NUMBER_WORDS = ("how many", "which", "what share", "percentage", "top ", "average", "total")


def mentions_any(question: str, words: tuple[str, ...]) -> bool:
    return any(word in question for word in words)


def route(question: str) -> str:
    text = question.lower()
    if mentions_any(text, LOGISTICS_WORDS):
        return "handoff"
    wants_reviews = mentions_any(text, REVIEW_WORDS)
    wants_numbers = mentions_any(text, NUMBER_WORDS)
    if wants_reviews and wants_numbers:
        return "both"
    if wants_reviews:
        return "reviews"
    return "sql"


def main() -> None:
    for question in sys.argv[1:]:
        print(json.dumps({"question": question, "route": route(question)}))


if __name__ == "__main__":
    main()

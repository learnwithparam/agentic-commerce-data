"""route-the-question: send each question down the right path.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py route-the-question "Delete the test orders"

The rules run in order. The first one that fits decides the route.
"""

import json
import sys

ROUTES = ("sql", "reviews", "both", "refuse", "handoff")

# A question that starts with one of these asks the desk to change data.
WRITE_VERBS = ("delete", "remove", "drop", "update", "insert", "set", "pause", "change")

# People are polite. These words come before the verb, so the router skips them.
POLITE_WORDS = ("please", "kindly", "can", "could", "would", "you", "just")

# Carriers, parcels and pick-ups are data the logistics team owns.
LOGISTICS_WORDS = ("carrier", "logistics", "package", "parcel", "tracking", "pick up")

# Words that ask what customers wrote.
REVIEW_WORDS = ("say", "complain", "unhappy", "why", "opinion")

# Words that ask for a number or a list from the database.
NUMBER_WORDS = ("how many", "which", "what share", "percentage", "top ", "average", "total")


def mentions_any(question: str, words: tuple[str, ...]) -> bool:
    return any(word in question for word in words)


def first_real_word(text: str) -> str:
    """The first word that is not a polite word: 'Please delete it' -> 'delete'."""
    words = [word.strip(",.?!") for word in text.split()]
    words = [word for word in words if word not in POLITE_WORDS]
    return words[0] if words else ""


def route(question: str) -> str:
    text = question.lower()
    if first_real_word(text) in WRITE_VERBS:
        return "refuse"
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

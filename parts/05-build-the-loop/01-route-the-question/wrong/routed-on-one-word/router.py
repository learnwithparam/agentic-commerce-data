"""route-the-question: send each question down the right path.

The mistake: the router looks for one word per route, so most questions fall through to SQL.
"""

import json
import sys

ROUTES = ("sql", "reviews", "both", "refuse", "handoff")


def route(question: str) -> str:
    text = question.lower()
    if text.startswith("delete"):
        return "refuse"
    if "why" in text:
        return "reviews"
    return "sql"


def main() -> None:
    for question in sys.argv[1:]:
        print(json.dumps({"question": question, "route": route(question)}))


if __name__ == "__main__":
    main()

"""route-the-question: send each question down the right path.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py route-the-question "Delete the test orders"

Change `route` so it returns one of the five routes.
Leave `main` as it is: the check reads what it prints.
"""

import json
import sys

ROUTES = ("sql", "reviews", "both", "refuse", "handoff")


def route(question: str) -> str:
    """Return the route for one question.

    sql      the question needs numbers from the database
    reviews  the question asks what customers wrote
    both     the question needs numbers and what customers wrote
    refuse   the question asks the desk to change data
    handoff  the question belongs to another team (carriers and parcels go to logistics)
    """
    # TODO: today every question goes to SQL. Look at the words in the question instead.
    return "sql"


def main() -> None:
    for question in sys.argv[1:]:
        print(json.dumps({"question": question, "route": route(question)}))


if __name__ == "__main__":
    main()

"""cite-the-rows: every number points to its query and row; every quote points to its review.

Run it from the repo root:

    uv run python parts/05-build-the-loop/kit.py cite-the-rows "<question>"

kit.prepared_answer() gives the finished agent's answer with no citations, the plan the model wrote,
and the results of every query: results["q1"] is (columns, rows).
In plan["answer"], {q1:0:2} means "row 0, column 2 of query q1". The answer text shows that value.
"""

import json
import sys

import kit


def cite_cells(template: str, results: dict) -> list[dict]:
    """One citation for every {q1:0:2} in the template: the value, its query and its row."""
    # TODO: use CELL_REFERENCE.finditer(template) to find each reference.
    # Import it first, at the top of this file: from desk.finished.agent import CELL_REFERENCE
    return []


def cite_rows(query_id: str, rows: list[list]) -> list[dict]:
    """One citation for every row the answer shows."""
    # TODO
    return []


def cite_reviews(reviews: list[dict]) -> list[dict]:
    """One citation for every review quote: the customer's own words and the review_id."""
    # TODO
    return []


def cited_answer(question: str) -> dict:
    answer, plan, results = kit.prepared_answer(question)
    answer["citations"] = (
        cite_cells(plan.get("answer", ""), results)
        + cite_rows(answer["rows_from"], answer["rows"])
        + cite_reviews(answer["reviews"])
    )
    return answer


def print_with_sources(answer: dict) -> None:
    print(answer["answer"])
    print("Sources:")
    for number, citation in enumerate(answer["citations"], start=1):
        if "review_id" in citation:
            where = f"review {citation['review_id'][:8]}"
        else:
            where = f"query {citation['query']}, rows {citation['row_ids']}"
        print(f"  [{number}] {citation['claim'][:60]}  <- {where}")
    print()


def main() -> None:
    as_json = "--json" in sys.argv
    questions = [argument for argument in sys.argv[1:] if argument != "--json"]
    for question in questions:
        answer = cited_answer(question)
        if as_json:
            print(json.dumps(answer, ensure_ascii=False))
        else:
            print_with_sources(answer)


if __name__ == "__main__":
    main()

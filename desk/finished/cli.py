"""`uv run ask-finished "<question>" [--json] [--html answer.html]`: ask the finished agent."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from desk.contract import print_answer
from desk.finished.agent import ask
from desk.finished.render import page


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ask-finished", description="Ask the finished agent a question."
    )
    parser.add_argument("question")
    parser.add_argument("--json", action="store_true", help="print the answer contract as JSON")
    parser.add_argument("--html", help="also write the answer as a web page to this file")
    parser.add_argument("--user", default="cm-ana", help="who is asking")
    arguments = parser.parse_args()
    answer = ask(arguments.question)
    if arguments.html:
        Path(arguments.html).write_text(page(answer), encoding="utf-8")
    print_answer(answer, arguments.json)
    if not arguments.json:
        print_reviews(answer["reviews"])
        if arguments.html:
            print(f"Wrote {arguments.html}")
    sys.exit(2 if answer["error"] and not arguments.json else 0)


def print_reviews(reviews: list[dict]) -> None:
    for review in reviews:
        line = f'Review {review["review_id"][:8]}: "{review["quote"]}"'
        if review["gloss_en"]:
            line += f" ({review['gloss_en']})"
        print(line)


if __name__ == "__main__":
    main()

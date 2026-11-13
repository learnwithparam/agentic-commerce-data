# /// script
# requires-python = ">=3.12"
# dependencies = ["jsonschema==4.26.0"]
# ///
"""Check one Agent Card against the pinned A2A 1.0 schema in this folder.

    uv run parts/08-delegate-over-a2a/validate_card.py < card.json

Prints `valid` and exits 0, or prints each problem with its JSON path and exits 1.
The check for publish-the-card runs this on the card your agent serves.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_FILE = Path(__file__).resolve().parent / "agent-card.schema.json"


def problems_in(card: object) -> list[str]:
    schema = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    problems = []
    for error in validator.iter_errors(card):
        path = "/".join(str(step) for step in error.absolute_path) or "(the card)"
        problems.append(f"{path}: {error.message}")
    return problems


def main() -> None:
    try:
        card = json.loads(sys.stdin.read())
    except json.JSONDecodeError as error:
        print(f"(the card): not valid JSON: {error}")
        sys.exit(1)
    problems = problems_in(card)
    for problem in problems:
        print(problem)
    if problems:
        sys.exit(1)
    print("valid")


if __name__ == "__main__":
    main()

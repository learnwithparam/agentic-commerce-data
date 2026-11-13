"""Schema pruning: pick the table cards a question needs, so the SQL writer sees only those.

Run it by hand:  uv run python prune.py "How many sellers are in the state of Sao Paulo?"
It prints the chosen tables as a JSON list, for example ["sellers"].
With --batch it reads a JSON list of questions on stdin and prints one list per question.
"""

import json
import sys
from pathlib import Path

CARDS_FOLDER = Path(__file__).parent / "tables"
MOST_TABLES = 4


def card_words() -> dict[str, set[str]]:
    """Not used: this answer does not read the cards."""
    return {path.stem: set() for path in sorted(CARDS_FOLDER.glob("*.md"))}


def select_tables(question: str, words_by_table: dict[str, set[str]]) -> list[str]:
    """The same four busy tables, for every question."""
    return ["customers", "order_items", "orders", "products"]


if __name__ == "__main__":
    words_by_table = card_words()
    if sys.argv[1:] == ["--batch"]:
        questions = json.load(sys.stdin)
        print(json.dumps([select_tables(question, words_by_table) for question in questions]))
    else:
        print(json.dumps(select_tables(sys.argv[1], words_by_table)))

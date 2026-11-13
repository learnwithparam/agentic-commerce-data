"""Schema pruning: pick the table cards a question needs, so the SQL writer sees only those.

Run it by hand:  uv run python prune.py "How many sellers are in the state of Sao Paulo?"
It prints the chosen tables as a JSON list, for example ["sellers"].
With --batch it reads a JSON list of questions on stdin and prints one list per question.
"""

import json
import re
import sys
from pathlib import Path

CARDS_FOLDER = Path(__file__).parent / "tables"
MOST_TABLES = 4

# Words too common to say anything about a table.
COMMON_WORDS = {"the", "and", "how", "many", "what", "which", "were", "was", "are", "per", "for"}
COMMON_WORDS |= {"with", "from", "have", "has", "one", "more", "than", "our", "did", "each", "use"}
COMMON_WORDS |= {"data", "most", "any", "all", "its", "their", "that", "this", "only", "own"}


# A word that names the table itself counts this many times more than a word in its Purpose.
NAME_WEIGHT = 3


def word_roots(text: str) -> set[str]:
    """Lower-case words of 3 letters or more, with a plural s taken off: 'Sellers' -> 'seller'.

    A year such as 2018 becomes the word 'year', so it points to the table with the dates.
    """
    lowered = re.sub(r"\b(19|20)\d\d\b", " year ", text.lower())
    words = re.findall(r"[a-z]{3,}", lowered)
    roots = {word.removesuffix("s") for word in words}
    return roots - COMMON_WORDS


def card_words() -> dict[str, set[str]]:
    """For each table, the roots of the words in the Purpose of its card."""
    words_by_table = {}
    for card_path in sorted(CARDS_FOLDER.glob("*.md")):
        card = card_path.read_text(encoding="utf-8")
        purpose = card.split("## Purpose")[1].split("## ")[0]
        words_by_table[card_path.stem] = word_roots(purpose)
    return words_by_table


def name_root(table: str) -> str:
    """The word a table is named for: order_items -> 'item', sellers -> 'seller'."""
    last_word = table.split("_")[-1]
    return last_word.removesuffix("s")


def score(question_words: set[str], table: str, words: set[str]) -> int:
    shared = len(question_words & words)
    if name_root(table) in question_words:
        shared += NAME_WEIGHT
    return shared


def select_tables(question: str, words_by_table: dict[str, set[str]]) -> list[str]:
    """The tables whose card shares the most words with the question, at most MOST_TABLES."""
    question_words = word_roots(question)
    scores = {table: score(question_words, table, words) for table, words in words_by_table.items()}
    matching = [table for table, score in scores.items() if score > 0]
    matching.sort(key=lambda table: (-scores[table], table))
    return matching[:MOST_TABLES]


if __name__ == "__main__":
    words_by_table = card_words()
    if sys.argv[1:] == ["--batch"]:
        questions = json.load(sys.stdin)
        print(json.dumps([select_tables(question, words_by_table) for question in questions]))
    else:
        print(json.dumps(select_tables(sys.argv[1], words_by_table)))

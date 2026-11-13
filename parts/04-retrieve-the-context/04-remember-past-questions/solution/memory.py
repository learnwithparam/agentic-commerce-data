"""Past questions: a store of question and SQL pairs that gave the right rows.

Add a pair:     uv run python memory.py add "<question>" "<sql>"
Find examples:  uv run python memory.py examples "<question>"
The agent shows the closest pairs to the model as examples. A pair is stored only after its rows
match the reference query for that question in world/golden.toml, so the store never teaches a
mistake. The store is data/memory.jsonl, or the file MEMORY_FILE names.
"""

import json
import os
import re
import sys
import tomllib
from pathlib import Path

from desk.finished import guard
from desk.paths import ROOT

GOLDEN_FILE = ROOT / "world" / "golden.toml"
EXAMPLES_SHOWN = 3


def memory_file() -> Path:
    return Path(os.environ.get("MEMORY_FILE", ROOT / "data" / "memory.jsonl"))


def reference_sql(question: str) -> str | None:
    golden = tomllib.loads(GOLDEN_FILE.read_text(encoding="utf-8"))["question"]
    for golden_question in golden:
        if golden_question["question"].lower() == question.lower():
            return golden_question["sql"]
    return None


def comparable(rows: list[list]) -> list[str]:
    """Rows as sorted text, with numbers rounded to 2 places, so equal results compare equal."""
    rounded_rows = []
    for row in rows:
        cells = [round(cell, 2) if isinstance(cell, float) else cell for cell in row]
        rounded_rows.append(json.dumps(sorted(cells, key=str), ensure_ascii=False))
    return sorted(rounded_rows)


def why_not_store(question: str, sql: str) -> str | None:
    """None when the pair is right, or the reason it must not be stored."""
    reference = reference_sql(question)
    if reference is None:
        return "there is no reference query for this question in world/golden.toml"
    try:
        _, rows = guard.run(sql)
    except Exception as error:  # noqa: BLE001 - any failure means the pair is not stored
        return f"the SQL does not run: {error}"
    _, reference_rows = guard.run(reference)
    if comparable(rows) != comparable(reference_rows):
        return "its rows do not match the reference rows"
    return None


def add(question: str, sql: str) -> dict:
    reason = why_not_store(question, sql)
    if reason:
        return {"stored": False, "reason": reason}
    store = memory_file()
    store.parent.mkdir(parents=True, exist_ok=True)
    with store.open("a", encoding="utf-8") as store_file:
        store_file.write(json.dumps({"question": question, "sql": sql}, ensure_ascii=False) + "\n")
    return {"stored": True}


def words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def examples(question: str) -> list[dict]:
    """The stored pairs that share the most words with the question, best first."""
    store = memory_file()
    if not store.exists():
        return []
    pairs = [json.loads(line) for line in store.read_text(encoding="utf-8").splitlines()]
    question_words = words(question)
    pairs.sort(key=lambda pair: -len(question_words & words(pair["question"])))
    return pairs[:EXAMPLES_SHOWN]


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "add":
        print(json.dumps(add(sys.argv[2], sys.argv[3]), ensure_ascii=False))
    else:
        print(json.dumps(examples(sys.argv[2]), ensure_ascii=False))

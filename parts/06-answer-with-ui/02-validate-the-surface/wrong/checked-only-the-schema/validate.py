"""validate-the-surface: check every A2UI message before it is sent, and say where it is wrong.

Run it from the repo root:

    uv run python parts/06-answer-with-ui/kit.py validate-the-surface <surface.json> ...

Each surface file holds {"messages": [...]}. A problem is {"path": ..., "message": ...}, where the
path is a JSON path like "/1/updateComponents/components/2": message 1, its components, item 2.
"""

import json
import sys
from pathlib import Path

import kit


def problems_in(messages: list[dict]) -> list[dict]:
    """Every problem in a list of A2UI messages. An empty list means the surface may be sent."""
    # The mistake: the schema alone cannot see a missing root or a child that does not exist.
    problems = []
    for index, message in enumerate(messages):
        problems += kit.schema_problems(index, message)
    return problems


def main() -> None:
    for file_name in sys.argv[1:]:
        surface = json.loads(Path(file_name).read_text(encoding="utf-8"))
        problems = problems_in(surface["messages"])
        verdict = {"file": Path(file_name).name, "valid": not problems, "problems": problems}
        print(json.dumps(verdict, ensure_ascii=False))


if __name__ == "__main__":
    main()

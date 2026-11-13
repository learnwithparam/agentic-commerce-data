# /// script
# requires-python = ">=3.12"
# dependencies = ["graphiti-core==0.31.2", "httpx==0.28.1"]
# ///
"""Wrong answer on purpose: the check must reject this file.

uv run path/to/changes.py world/graphiti/facts.json     (from the repo root)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

from graphiti_core.edges import EntityEdge
from graphiti_core.utils.datetime_utils import ensure_utc


def add(edges: list[EntityEdge], new_edge: EntityEdge) -> None:
    """Add the new edge and leave the old one open, so two values look current."""
    edges.append(new_edge)


def as_of(edges: list[EntityEdge], fact_key: str, when: datetime) -> str | None:
    """Return the value of the newest edge that started by that date."""
    started = [
        edge for edge in edges if edge.name == fact_key and ensure_utc(edge.valid_at) <= when
    ]
    if not started:
        return None
    newest = max(started, key=lambda edge: edge.valid_at)
    return newest.attributes["value"]


def main() -> None:
    data = json.loads(Path(sys.argv[1]).read_text())
    edges: list[EntityEdge] = []
    for item in data["edges"]:
        add(edges, EntityEdge(**item))
    answers = []
    for question in data["questions"]:
        when = ensure_utc(datetime.fromisoformat(question["date"]))
        value = as_of(edges, question["fact_key"], when)
        answers.append({"fact_key": question["fact_key"], "date": question["date"], "value": value})
    printed_edges = [edge.model_dump(mode="json") for edge in edges]
    print(json.dumps({"answers": answers, "edges": printed_edges}))


if __name__ == "__main__":
    main()

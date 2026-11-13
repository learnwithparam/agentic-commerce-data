# /// script
# requires-python = ">=3.12"
# dependencies = ["graphiti-core==0.31.2", "httpx==0.28.1"]
# ///
"""Track changed facts: keep every value the desk believed, and when it changed.

    uv run path/to/changes.py world/graphiti/facts.json     (from the repo root)

Write two functions: add and as_of. The main part loads the facts and prints the answers.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

from graphiti_core.edges import EntityEdge
from graphiti_core.utils.datetime_utils import ensure_utc
from graphiti_core.utils.maintenance.edge_operations import resolve_edge_contradictions


def add(edges: list[EntityEdge], new_edge: EntityEdge) -> None:
    """Add new_edge to edges. Close the older current edge on the same fact; never delete it."""
    current = [edge for edge in edges if edge.name == new_edge.name and edge.invalid_at is None]
    # Sort by start date, so a replay in any order closes the same edges.
    in_order = sorted([*current, new_edge], key=lambda edge: edge.valid_at)
    for older, newer in zip(in_order, in_order[1:], strict=False):
        # Graphiti's rule: the older edge stops being true when the newer one starts.
        resolve_edge_contradictions(newer, [older])
    edges.append(new_edge)


def true_on(edge: EntityEdge, when: datetime) -> bool:
    started = ensure_utc(edge.valid_at) <= when
    ended = edge.invalid_at is not None and ensure_utc(edge.invalid_at) <= when
    return started and not ended


def as_of(edges: list[EntityEdge], fact_key: str, when: datetime) -> str | None:
    """Return the value believed on the date when, or None if no edge was true yet."""
    believed = [edge for edge in edges if edge.name == fact_key and true_on(edge, when)]
    if not believed:
        return None
    newest = max(believed, key=lambda edge: edge.valid_at)
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

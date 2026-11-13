"""The desk agent the gate runs: the finished agent, plus recorded replies for the attack set.

    uv run python parts/09-gate-every-change/desk_agent.py "<question>" --json

Replay mode knows the golden questions. This file adds the recorded plans for the 12 attacks in
attacks.toml, so the gate runs with no model key. Six of those plans refuse. The other six carry a
harmful statement, the way a model tricked by the question would write it, so only the SQL guard
can stop them.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # keep the part folder free of __pycache__ folders

from desk import llm  # noqa: E402 - must come after the line above
from desk.finished import cli  # noqa: E402

ATTACK_REPLIES = Path(__file__).resolve().parent / "attack-replies.jsonl"


def add_attack_replies() -> None:
    """Put the attack plans next to the recorded replies replay mode already knows."""
    replies = llm.recorded_replies()
    for line in ATTACK_REPLIES.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        recording = json.loads(line)
        question = llm.normalized_question(recording["question"])
        replies[(recording["agent"], recording["role"], question)] = recording["reply"]


if __name__ == "__main__":
    add_attack_replies()
    cli.main()

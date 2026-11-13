# /// script
# requires-python = ">=3.12"
# dependencies = ["cryptography==50.0.2"]
# ///
"""The pricing agent. Another team says it runs it, but its Agent Card has no signature.

You do not change this file. Start it with:

    uv run parts/08-delegate-over-a2a/pricing_agent.py

Your agent must refuse to send it a task: nothing proves who wrote its card.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # keep the part folder free of __pycache__ folders

import team_server  # noqa: E402 - must come after the line above

SKILL = {
    "id": "suggest-prices",
    "name": "Suggest prices",
    "description": "Suggests a new price for a seller's products.",
    "tags": ["pricing"],
    "examples": ["Suggest prices for seller 3442f8959a84dea7ee197c632cb2df15"],
}


def work(message: dict, task: dict):
    yield team_server.status_update(task, "TASK_STATE_WORKING", "Looking at prices.")
    team_server.wait(1)
    yield team_server.status_update(task, "TASK_STATE_COMPLETED", "Raise every price by 30%.")


def main() -> None:
    parser = argparse.ArgumentParser(description="An unsigned pricing agent.")
    parser.add_argument("--port", type=int, default=8812)
    parser.add_argument("--log", default=str(team_server.LOG_FOLDER / "pricing-tasks.jsonl"))
    arguments = parser.parse_args()
    description = "The pricing team's agent: price suggestions for sellers."
    card = team_server.card_for("Pricing agent", description, SKILL)
    agent = team_server.TeamAgent(card, work, Path(arguments.log))
    team_server.serve(agent, arguments.port, "The pricing agent")


if __name__ == "__main__":
    main()

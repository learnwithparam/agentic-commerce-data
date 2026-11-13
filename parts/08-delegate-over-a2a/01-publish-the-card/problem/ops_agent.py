# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Your ops desk agent's A2A front door.

uv run ops_agent.py serve --port 8810
    serves agent-card.json at /.well-known/agent-card.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import serve_card

HERE = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(prog="ops_agent", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    serve_command = commands.add_parser("serve", help="serve your Agent Card")
    serve_command.add_argument("--port", type=int, default=8810)
    arguments = parser.parse_args()
    card = json.loads((HERE / "agent-card.json").read_text(encoding="utf-8"))
    serve_card.serve(card, arguments.port)


if __name__ == "__main__":
    main()

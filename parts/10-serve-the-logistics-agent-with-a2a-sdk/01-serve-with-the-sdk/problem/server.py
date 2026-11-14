# /// script
# requires-python = ">=3.12"
# dependencies = ["a2a-sdk[http-server]==1.3.0", "uvicorn==0.54.0", "cryptography==50.0.2"]
# ///
"""Your task: serve the logistics agent over A2A with the official SDK.

    uv run assignment/server.py --port 8812

The agent's own work is the hand-built logistics_agent.py. Do not copy its logic here. Wrap it.
Write an executor, an Agent Card and an app, then start the app with uvicorn.
"""

from __future__ import annotations

import sys
from pathlib import Path

import uvicorn  # noqa: F401 - you start the app with this
from a2a.server.agent_execution import AgentExecutor  # noqa: F401 - your executor extends this

ROOT = next(folder for folder in Path(__file__).resolve().parents if (folder / "parts").is_dir())
sys.path.insert(0, str(ROOT / "parts" / "08-delegate-over-a2a"))
sys.dont_write_bytecode = True

import logistics_agent  # noqa: E402, F401 - the agent function: carrier_report and summary_of


def main() -> None:
    raise SystemExit("TODO: write the executor, the card and the app, then serve them.")


if __name__ == "__main__":
    main()

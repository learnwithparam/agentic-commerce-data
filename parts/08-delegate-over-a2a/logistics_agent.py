# /// script
# requires-python = ">=3.12"
# dependencies = ["cryptography==50.0.2"]
# ///
"""The logistics team's agent. It knows why a parcel was late; your desk does not.

You do not change this file. Start it with:

    uv run parts/08-delegate-over-a2a/logistics_agent.py

It signs its Agent Card with the logistics team's key. The public half of that key is in the
allowlist your agent trusts.

Options for the checks:
    --port 8811     the port to serve on (0 picks a free one)
    --slow 70       take this many seconds on each task
    --fail          fail every task half way, the way a broken carrier system does
    --log PATH      where to write one line per finished task
"""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # keep the part folder free of __pycache__ folders

import team_server  # noqa: E402 - must come after the line above

HERE = Path(__file__).resolve().parent
KEY_FILE = HERE / "logistics-key.pem"
KEY_ID = "logistics-team-key-1"
DATABASE = team_server.REPO_ROOT / "data" / "olist.db"

SKILL = {
    "id": "explain-late-orders",
    "name": "Explain late orders",
    "description": "For each order id, the carrier and the reason the parcel arrived late.",
    "tags": ["logistics", "carriers", "late delivery"],
    "examples": ["Why were orders 9b189f6cf2ef734a7dd0419ed3c64d99 and efac22dd... late?"],
}

# The carrier system is fictional. Each order id always gets the same carrier and reason.
CARRIERS = ["Carrier North", "Carrier South", "Carrier Coast"]
REASONS = [
    "missed the cut-off at the regional hub",
    "held at a state tax checkpoint",
    "sent back to the depot after a failed delivery attempt",
    "waited for a second truck after the first one was full",
]


def pick(choices: list[str], order_id: str, salt: str) -> str:
    digest = hashlib.sha256(f"{salt}:{order_id}".encode()).digest()
    return choices[digest[0] % len(choices)]


def days_late(order_id: str) -> int | None:
    """Days between the estimated and the real delivery date, read from the desk's database."""
    if not DATABASE.exists():
        return None
    connection = sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True)
    row = connection.execute(
        "SELECT CAST(julianday(date(order_delivered_customer_date))"
        " - julianday(date(order_estimated_delivery_date)) AS INTEGER)"
        " FROM orders WHERE order_id = ?",
        (order_id,),
    ).fetchone()
    connection.close()
    return row[0] if row else None


def carrier_report(order_ids: list[str]) -> list[dict]:
    return [
        {
            "order_id": order_id,
            "carrier": pick(CARRIERS, order_id, "carrier"),
            "reason": pick(REASONS, order_id, "reason"),
            "days_late": days_late(order_id),
        }
        for order_id in order_ids
    ]


def summary_of(report: list[dict]) -> str:
    lines = [f"{row['order_id'][:8]}: {row['carrier']}, {row['reason']}." for row in report]
    return " ".join(lines)


def make_work(slow_seconds: float, fail: bool):
    """Build the function that works on one task, with the options from the command line."""

    def work(message: dict, task: dict):
        order_ids = [
            str(order_id) for order_id in team_server.data_in(message).get("order_ids", [])
        ]
        if not order_ids:
            text = "No order ids. Send them in a data part: {'order_ids': [...]}."
            yield team_server.status_update(task, "TASK_STATE_REJECTED", text)
            return
        yield from working_updates(task, slow_seconds, fail)
        if fail:
            text = "The carrier system is not answering. Try again later."
            yield team_server.status_update(task, "TASK_STATE_FAILED", text)
        else:
            yield report_artifact(task, carrier_report(order_ids))
            yield team_server.status_update(task, "TASK_STATE_COMPLETED")

    return work


def working_updates(task: dict, slow_seconds: float, fail: bool):
    """Say "working" now, then again every few seconds until the work time is over."""
    if fail:
        slow_seconds = slow_seconds / 2
    yield team_server.status_update(task, "TASK_STATE_WORKING", "Asking the carriers.")
    remaining = slow_seconds
    while remaining > 0:
        pause = min(remaining, team_server.WORKING_UPDATE_EVERY_SECONDS)
        team_server.wait(pause)
        remaining -= pause
        if remaining > 0:
            yield team_server.status_update(task, "TASK_STATE_WORKING", "Still asking.")


def report_artifact(task: dict, report: list[dict]) -> dict:
    artifact = {
        "artifactId": team_server.new_id(),
        "name": "carrier-report",
        "parts": [{"data": {"orders": report}}, {"text": summary_of(report)}],
    }
    event = {"taskId": task["id"], "contextId": task["contextId"], "artifact": artifact}
    return {"artifactUpdate": event}


def main() -> None:
    parser = argparse.ArgumentParser(description="The logistics team's A2A agent.")
    parser.add_argument("--port", type=int, default=8811)
    parser.add_argument("--slow", type=float, default=2, help="seconds of work per task")
    parser.add_argument("--fail", action="store_true", help="fail every task half way")
    parser.add_argument("--log", default=str(team_server.LOG_FOLDER / "logistics-tasks.jsonl"))
    arguments = parser.parse_args()
    description = "The logistics team's agent: carriers, parcels and late deliveries."
    card = team_server.card_for("Logistics agent", description, SKILL)
    work = make_work(arguments.slow, arguments.fail)
    agent = team_server.TeamAgent(card, work, Path(arguments.log))
    header = {"alg": "ES256", "typ": "JOSE", "kid": KEY_ID}
    agent.sign_with(team_server.load_private_key(KEY_FILE), header)
    team_server.serve(agent, arguments.port, "The logistics agent")


if __name__ == "__main__":
    main()

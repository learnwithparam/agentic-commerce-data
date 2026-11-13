# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""The A2A side of your ops desk agent.

uv run ops_agent.py serve --port 8810
    serves your Agent Card at /.well-known/agent-card.json

uv run ops_agent.py ask "<question>" --remote http://127.0.0.1:8811 --json [--events]
    hands a carrier question to another team's agent over A2A and prints the answer
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import a2a_client
import serve_card

HERE = Path(__file__).resolve().parent

# An Olist order id is 32 letters and digits from 0-9 and a-f.
ORDER_ID = re.compile(r"\b[0-9a-f]{32}\b")
# Words that make a question about parcels and carriers: the logistics team's job.
CARRIER_WORDS = ("late", "carrier", "parcel", "delivery", "delivered")


class Events:
    """Prints one JSON line per event when --events is on, named like AG-UI events."""

    def __init__(self, show: bool) -> None:
        self.show = show

    def emit(self, event_type: str, **fields) -> None:
        if self.show:
            print(json.dumps({"type": event_type, **fields}), flush=True)

    def task_update(self, update: dict) -> None:
        self.emit("CUSTOM", name="a2a.task_update", value=update)


def route(question: str) -> str:
    """Carrier questions about named orders go to the logistics team. Everything else stays."""
    has_order_ids = ORDER_ID.search(question) is not None
    lowered = question.lower()
    mentions_carriers = any(word in lowered for word in CARRIER_WORDS)
    if has_order_ids and mentions_carriers:
        return "handoff"
    return "sql"


def new_answer(question: str) -> dict:
    return {
        "question": question,
        "route": route(question),
        "refused": False,
        "reason": None,
        "handoff": None,
        "answer": "",
        "error": None,
    }


def ask(question: str, remote: str, events: Events) -> dict:
    events.emit("RUN_STARTED", question=question)
    answer = new_answer(question)
    if answer["route"] == "handoff":
        order_ids = ORDER_ID.findall(question)
        hand_off(answer, order_ids, remote, events)
    else:
        answer["refused"] = True
        answer["reason"] = "This command only hands carrier questions to other teams."
    if answer["error"]:
        events.emit("RUN_ERROR", message=answer["error"])
    else:
        events.emit("RUN_FINISHED")
    return answer


def hand_off(answer: dict, order_ids: list[str], remote: str, events: Events) -> None:
    """Send the task to the remote agent and wait for it, passing updates on."""
    try:
        card = a2a_client.fetch_card(remote)
    except a2a_client.A2AError as error:
        answer["error"] = str(error)
        return
    try:
        outcome = a2a_client.send_task(card, answer["question"], order_ids)
    except a2a_client.A2AError as error:
        answer["error"] = str(error)
        return
    answer["handoff"] = {"agent": card["name"], **outcome}
    if outcome["state"] == "TASK_STATE_COMPLETED":
        answer["answer"] = outcome["result"]
    else:
        answer["error"] = f"The {card['name']} task ended {outcome['state']}: {outcome['result']}"


def main() -> None:
    parser = argparse.ArgumentParser(prog="ops_agent", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    serve_command = commands.add_parser("serve", help="serve your Agent Card")
    serve_command.add_argument("--port", type=int, default=8810)
    ask_command = commands.add_parser("ask", help="hand a carrier question to another agent")
    ask_command.add_argument("question")
    ask_command.add_argument("--remote", default="http://127.0.0.1:8811")
    ask_command.add_argument("--json", action="store_true", help="print the answer as JSON")
    ask_command.add_argument("--events", action="store_true", help="print each event first")
    arguments = parser.parse_args()
    if arguments.command == "serve":
        card = json.loads((HERE / "agent-card.json").read_text(encoding="utf-8"))
        serve_card.serve(card, arguments.port)
        return
    answer = ask(arguments.question, arguments.remote, Events(arguments.events))
    if arguments.json:
        print(json.dumps(answer, ensure_ascii=False))
    else:
        print(answer["error"] or answer["reason"] or answer["answer"])
    sys.exit(0)


if __name__ == "__main__":
    main()

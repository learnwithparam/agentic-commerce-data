"""Talk to another team's agent over A2A 1.0 (JSON-RPC over HTTP).

fetch_card   GET  <remote>/.well-known/agent-card.json
send_task    POST <interface url>  method SendMessage, wait for the finished task
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid

# How long to wait for an answer before we give up.
WAIT_LIMIT_SECONDS = 120


class A2AError(Exception):
    """The other agent could not be reached, or answered with an error. The message says how."""


def fetch_card(remote: str) -> dict:
    url = f"{remote.rstrip('/')}/.well-known/agent-card.json"
    try:
        with urllib.request.urlopen(url, timeout=WAIT_LIMIT_SECONDS) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        raise A2AError(f"could not read the Agent Card at {url}: {error}") from error


def interface_url(card: dict) -> str:
    """The address of the card's JSON-RPC interface for protocol version 1.0."""
    for listed in card.get("supportedInterfaces", []):
        is_json_rpc = listed.get("protocolBinding") == "JSONRPC"
        if is_json_rpc and listed.get("protocolVersion") == "1.0":
            return listed["url"]
    raise A2AError("the Agent Card has no JSON-RPC interface for A2A 1.0")


def request_for(method: str, question: str, order_ids: list[str]) -> bytes:
    """A JSON-RPC request whose message carries the question as text and the ids as data."""
    message = {
        "messageId": str(uuid.uuid4()),
        "role": "ROLE_USER",
        "parts": [{"text": question}, {"data": {"order_ids": order_ids}}],
    }
    request = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"message": message}}
    return json.dumps(request).encode("utf-8")


def send_task(card: dict, question: str, order_ids: list[str]) -> dict:
    """Send the task with SendMessage and wait for the finished task.

    Return {"task_id": ..., "state": ..., "result": ...}.

    TODO(you):
    1. Build the request: request_for("SendMessage", question, order_ids).
    2. POST it to interface_url(card) with urllib.request, Content-Type application/json.
    3. Read the JSON reply. reply["result"]["task"] is the finished task.
    4. Return its id, status.state, and the text parts of its artifacts.
    """
    raise A2AError("send_task is not written yet: open a2a_client.py and follow the TODO")

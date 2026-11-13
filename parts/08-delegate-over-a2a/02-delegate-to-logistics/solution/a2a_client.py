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

    Returns the task id, its last state and its result text.
    """
    body = request_for("SendMessage", question, order_ids)
    headers = {"Content-Type": "application/json"}
    request = urllib.request.Request(interface_url(card), data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=WAIT_LIMIT_SECONDS) as response:
            reply = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError) as error:
        raise A2AError(f"the A2A call failed: {error}") from error
    if "error" in reply:
        raise A2AError(f"the other agent sent an error: {reply['error']}")
    task = reply["result"]["task"]
    return outcome_of(task)


def outcome_of(task: dict) -> dict:
    status = task["status"]
    result = text_of(status.get("message", {}).get("parts", []))
    for artifact in task.get("artifacts", []):
        result = text_of(artifact["parts"])
    return {"task_id": task["id"], "state": status["state"], "result": result}


def text_of(parts: list[dict]) -> str:
    return " ".join(part["text"] for part in parts if "text" in part)

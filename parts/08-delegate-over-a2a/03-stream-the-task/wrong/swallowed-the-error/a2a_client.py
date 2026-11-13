"""Talk to another team's agent over A2A 1.0 (JSON-RPC over HTTP).

fetch_card   GET  <remote>/.well-known/agent-card.json
stream_task  POST <interface url>  method SendStreamingMessage, read the server-sent events
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid

# A stream may stay quiet this long between two events before we give up.
QUIET_LIMIT_SECONDS = 30
FINAL_STATES = {
    "TASK_STATE_COMPLETED",
    "TASK_STATE_FAILED",
    "TASK_STATE_CANCELED",
    "TASK_STATE_REJECTED",
}


class A2AError(Exception):
    """The other agent could not be reached, or answered with an error. The message says how."""


def fetch_card(remote: str) -> dict:
    url = f"{remote.rstrip('/')}/.well-known/agent-card.json"
    try:
        with urllib.request.urlopen(url, timeout=QUIET_LIMIT_SECONDS) as response:
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


def stream_task(card: dict, question: str, order_ids: list[str], on_update) -> dict:
    """Send the task with SendStreamingMessage and pass every update to on_update.

    Returns the task id, its last state and its result text.
    """
    body = request_for("SendStreamingMessage", question, order_ids)
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    request = urllib.request.Request(interface_url(card), data=body, headers=headers)
    outcome = {"task_id": None, "state": None, "result": ""}
    try:
        with urllib.request.urlopen(request, timeout=QUIET_LIMIT_SECONDS) as response:
            for stream_response in server_sent_events(response):
                follow(stream_response, outcome, on_update)
    except (urllib.error.URLError, TimeoutError) as error:
        raise A2AError(f"the A2A stream broke: {error}") from error
    if outcome["state"] not in FINAL_STATES:
        raise A2AError(f"the stream ended before the task finished (last state {outcome['state']})")
    return outcome


def server_sent_events(response):
    """Yield the StreamResponse inside each `data:` line of the stream."""
    for raw_line in response:
        line = raw_line.decode("utf-8").strip()
        if not line.startswith("data:"):
            continue
        envelope = json.loads(line.removeprefix("data:"))
        if "error" in envelope:
            raise A2AError(f"the other agent sent an error: {envelope['error']}")
        yield envelope["result"]


def follow(stream_response: dict, outcome: dict, on_update) -> None:
    """Update the outcome from one StreamResponse, and pass status changes on."""
    if "task" in stream_response:
        task = stream_response["task"]
        outcome["task_id"] = task["id"]
        outcome["state"] = task["status"]["state"]
    if "statusUpdate" in stream_response:
        status = stream_response["statusUpdate"]["status"]
        outcome["state"] = status["state"]
        text = text_of(status.get("message", {}).get("parts", []))
        if outcome["state"] in FINAL_STATES and text:
            outcome["result"] = text
        on_update({"task_id": outcome["task_id"], "state": outcome["state"], "text": text})
    if "artifactUpdate" in stream_response:
        artifact = stream_response["artifactUpdate"]["artifact"]
        outcome["result"] = text_of(artifact["parts"])


def text_of(parts: list[dict]) -> str:
    return " ".join(part["text"] for part in parts if "text" in part)

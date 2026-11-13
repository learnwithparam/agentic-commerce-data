"""Shared code for the other teams' agents: the logistics, pricing and impostor agents.

You do not change this file. It is a small A2A 1.0 server over JSON-RPC, written with the Python
standard library and the `cryptography` package, so you can read every line of it.

Each agent serves three things:

- GET  /.well-known/agent-card.json   its Agent Card
- GET  /.well-known/jwks.json         its public keys, when it signs its card
- POST /a2a                           JSON-RPC: SendMessage and SendStreamingMessage
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

REPO_ROOT = Path(__file__).resolve().parents[2]
LOG_FOLDER = REPO_ROOT / "data" / "logs"

# The checks run the clock faster, so "70 seconds" of work takes a few real seconds.
# A2A_CLOCK_SPEED=20 makes one course second last 1/20 of a real second.
CLOCK_SPEED = float(os.environ.get("A2A_CLOCK_SPEED", "1"))

# The gateway in front of every team agent closes a request that waits longer than this.
GATEWAY_LIMIT_SECONDS = 60

# A streaming task sends a "still working" update this often, so the line never goes quiet.
WORKING_UPDATE_EVERY_SECONDS = 10


def wait(course_seconds: float) -> None:
    time.sleep(course_seconds / CLOCK_SPEED)


def base64url(data: bytes) -> str:
    """Base64url without padding, as JWS writes it."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def canonical_json(value: object) -> bytes:
    """Canonical JSON, close to RFC 8785: for text, lists, objects, booleans and whole numbers."""
    text = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8")


def load_private_key(path: Path) -> ec.EllipticCurvePrivateKey:
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def new_private_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def public_jwk(private_key: ec.EllipticCurvePrivateKey, key_id: str) -> dict:
    """The public half of a P-256 key as a JSON Web Key."""
    numbers = private_key.public_key().public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "x": base64url(numbers.x.to_bytes(32, "big")),
        "y": base64url(numbers.y.to_bytes(32, "big")),
        "kid": key_id,
        "alg": "ES256",
        "use": "sig",
    }


def signed_card(card: dict, private_key: ec.EllipticCurvePrivateKey, header: dict) -> dict:
    """Return the card with one JWS signature (ES256) over its canonical JSON."""
    unsigned = {name: value for name, value in card.items() if name != "signatures"}
    protected = base64url(canonical_json(header))
    payload = base64url(canonical_json(unsigned))
    signing_input = f"{protected}.{payload}".encode("ascii")
    der_signature = private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r_value, s_value = decode_dss_signature(der_signature)
    raw_signature = r_value.to_bytes(32, "big") + s_value.to_bytes(32, "big")
    signature = {"protected": protected, "signature": base64url(raw_signature)}
    return {**unsigned, "signatures": [signature]}


def card_for(name: str, description: str, skill: dict) -> dict:
    """An A2A 1.0 Agent Card. The server fills in its own address when it starts."""
    return {
        "name": name,
        "description": description,
        "version": "1.0.0",
        "supportedInterfaces": [
            {"url": "", "protocolBinding": "JSONRPC", "protocolVersion": "1.0"},
        ],
        "capabilities": {"streaming": True},
        "defaultInputModes": ["application/json", "text/plain"],
        "defaultOutputModes": ["application/json", "text/plain"],
        "skills": [skill],
    }


def new_id() -> str:
    return str(uuid.uuid4())


def status_update(task: dict, state: str, text: str | None = None) -> dict:
    """A TaskStatusUpdateEvent, wrapped as one StreamResponse."""
    status: dict = {"state": state}
    if text:
        status["message"] = agent_message(task, text)
    task["status"] = status
    event = {"taskId": task["id"], "contextId": task["contextId"], "status": status}
    return {"statusUpdate": event}


def agent_message(task: dict, text: str) -> dict:
    return {
        "messageId": new_id(),
        "role": "ROLE_AGENT",
        "taskId": task["id"],
        "contextId": task["contextId"],
        "parts": [{"text": text}],
    }


def data_in(message: dict) -> dict:
    """Merge every data part of a message into one object."""
    merged: dict = {}
    for part in message.get("parts", []):
        if isinstance(part.get("data"), dict):
            merged.update(part["data"])
    return merged


def append_log(log_path: Path, entry: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")


class TeamAgent:
    """What one team agent knows: its card, its keys, and how to work on a task.

    `work(message, task)` yields StreamResponse objects and sleeps between them.
    The last one it yields ends the task.
    """

    def __init__(self, card: dict, work, log_path: Path) -> None:
        self.card = card
        self.work = work
        self.log_path = log_path
        self.private_key: ec.EllipticCurvePrivateKey | None = None
        self.signature_header: dict = {}
        self.jwks: dict | None = None

    def sign_with(self, private_key: ec.EllipticCurvePrivateKey, header: dict) -> None:
        self.private_key = private_key
        self.signature_header = header
        self.jwks = {"keys": [public_jwk(private_key, header["kid"])]}

    def card_at(self, base_url: str) -> dict:
        card = json.loads(json.dumps(self.card))
        card["supportedInterfaces"][0]["url"] = f"{base_url}/a2a"
        if self.private_key is None:
            return card
        header = dict(self.signature_header)
        if header.get("jku") == "":
            header["jku"] = f"{base_url}/.well-known/jwks.json"
        return signed_card(card, self.private_key, header)

    def log_task(self, task: dict, message: dict, method: str) -> None:
        """One line per finished task. The checks read this log, never your agent's words."""
        order_ids = data_in(message).get("order_ids", [])
        entry = {
            "task_id": task["id"],
            "context_id": task["contextId"],
            "order_ids": order_ids,
            "state": task["status"]["state"],
            "method": method,
        }
        append_log(self.log_path, entry)


class Handler(BaseHTTPRequestHandler):
    agent: TeamAgent

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - the base class names it
        """Stay quiet: the checks read the task log, not the request log."""

    def base_url(self) -> str:
        host, port = self.server.server_address[:2]
        return f"http://{host}:{port}"

    def send_json(self, status: int, body: dict) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802 - the standard library names it
        if self.path == "/.well-known/agent-card.json":
            self.send_json(200, self.agent.card_at(self.base_url()))
        elif self.path == "/.well-known/jwks.json" and self.agent.jwks:
            self.send_json(200, self.agent.jwks)
        else:
            self.send_json(404, {"error": f"nothing at {self.path}"})

    def do_POST(self) -> None:  # noqa: N802 - the standard library names it
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length) or b"{}")
        method = request.get("method")
        if self.path != "/a2a":
            self.send_json(404, {"error": f"nothing at {self.path}"})
        elif method == "SendMessage":
            self.answer_blocking(request)
        elif method == "SendStreamingMessage":
            self.answer_streaming(request)
        else:
            error = {"code": -32601, "message": f"method {method!r} not found"}
            self.send_json(200, {"jsonrpc": "2.0", "id": request.get("id"), "error": error})

    def new_task(self, request: dict) -> tuple[dict, dict]:
        message = request.get("params", {}).get("message", {})
        context_id = message.get("contextId") or new_id()
        task = {"id": new_id(), "contextId": context_id, "status": {}}
        task["status"] = {"state": "TASK_STATE_SUBMITTED"}
        return message, task

    def answer_blocking(self, request: dict) -> None:
        """SendMessage waits for the whole task, so a slow task hits the gateway limit."""
        message, task = self.new_task(request)
        started = time.monotonic()
        artifacts = []
        for event in self.agent.work(message, task):
            if "artifactUpdate" in event:
                artifacts.append(event["artifactUpdate"]["artifact"])
            course_seconds = (time.monotonic() - started) * CLOCK_SPEED
            if course_seconds > GATEWAY_LIMIT_SECONDS:
                self.send_json(504, {"error": "gateway timeout: no answer within 60 seconds"})
                return
        self.agent.log_task(task, message, "SendMessage")
        result = {"task": {**task, "artifacts": artifacts}}
        self.send_json(200, {"jsonrpc": "2.0", "id": request.get("id"), "result": result})

    def answer_streaming(self, request: dict) -> None:
        """SendStreamingMessage sends every update as soon as it happens, as server-sent events."""
        message, task = self.new_task(request)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.send_event(request, {"task": dict(task)})
        for event in self.agent.work(message, task):
            self.send_event(request, event)
        self.agent.log_task(task, message, "SendStreamingMessage")
        self.close_connection = True

    def send_event(self, request: dict, stream_response: dict) -> None:
        envelope = {"jsonrpc": "2.0", "id": request.get("id"), "result": stream_response}
        self.wfile.write(f"data: {json.dumps(envelope)}\n\n".encode())
        self.wfile.flush()


def serve(agent: TeamAgent, port: int, name: str) -> None:
    """Start the server. The first line printed names the address, so a check can find it."""
    handler = type("AgentHandler", (Handler,), {"agent": agent})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    host, real_port = server.server_address[:2]
    print(f"{name} is serving on http://{host}:{real_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)

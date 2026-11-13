"""A small web server for your Agent Card.

You do not need to change this file.

It serves the card and nothing else. A call to /a2a gets a 501, so the card says streaming is false.
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def card_for_address(card: dict, base_url: str) -> dict:
    """Point the card's JSON-RPC address at the port this server really listens on."""
    served = json.loads(json.dumps(card))
    for listed in served.get("supportedInterfaces", []):
        listed["url"] = f"{base_url}/a2a"
    return served


def make_handler(card: dict):
    class CardHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:  # noqa: A002 - the base class names it
            """Stay quiet."""

        def send_json(self, status: int, body: dict) -> None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:  # noqa: N802 - the standard library names it
            host, port = self.server.server_address[:2]
            served = card_for_address(card, f"http://{host}:{port}")
            if self.path == "/.well-known/agent-card.json":
                self.send_json(200, served)
            else:
                self.send_json(404, {"error": f"nothing at {self.path}"})

        def do_POST(self) -> None:  # noqa: N802 - the standard library names it
            """The ops agent only serves its card. It does not take A2A calls yet."""
            message = "this agent serves its card only; it does not take A2A calls"
            self.send_json(501, {"error": message})

    return CardHandler


def serve(card: dict, port: int) -> None:
    """Serve until stopped. The first line printed names the address, so a check can find it."""
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(card))
    host, real_port = server.server_address[:2]
    print(f"The ops desk agent is serving on http://{host}:{real_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)

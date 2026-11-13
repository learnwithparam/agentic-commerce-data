"""stream-the-events: POST /ask streams AG-UI events, so the screen shows progress at once.

Run it from the repo root, then open http://localhost:8006 in your browser:

    uv run python parts/06-answer-with-ui/kit.py stream-the-events

Each event is one JSON object sent as "data: {...}" and a blank line. That is Server-Sent Events.
The surface from your render.py travels inside an ACTIVITY_SNAPSHOT event.
"""

import json
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import kit

render = kit.your_render_module()


def events_for(question: str):
    """Yield the AG-UI events for one question, one dictionary at a time, in order."""
    thread_id, run_id, call_id = new_id("thread"), new_id("run"), new_id("call")
    yield {"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id}
    yield {"type": "TOOL_CALL_START", "toolCallId": call_id, "toolCallName": "ask_the_desk"}
    arguments = json.dumps({"question": question})
    yield {"type": "TOOL_CALL_ARGS", "toolCallId": call_id, "delta": arguments}
    # The slow part comes after the first events, so the screen already shows progress.
    answer = kit.finished_answer(question)
    # The call ends only now, when the work is done.
    yield {"type": "TOOL_CALL_END", "toolCallId": call_id}
    if answer["error"]:
        yield {"type": "RUN_ERROR", "message": answer["error"]}
        return
    result = json.dumps({"rows": len(answer["rows"]), "queries": len(answer["sql"])})
    yield {
        "type": "TOOL_CALL_RESULT",
        "messageId": new_id("result"),
        "toolCallId": call_id,
        "content": result,
        "role": "tool",
    }
    yield surface_event(render.surface_for(answer))
    finished = {"type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id}
    yield {**finished, "outcome": {"type": "success"}}


def surface_event(surface: list[dict]) -> dict:
    """A2UI messages travel inside an AG-UI activity of type "a2ui-surface"."""
    return {
        "type": "ACTIVITY_SNAPSHOT",
        "messageId": "a2ui-surface-1",
        "activityType": "a2ui-surface",
        "content": {"a2ui_operations": surface},
        "replace": True,
    }


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


class DeskHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        page = kit.renderer_page().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(page)

    def do_POST(self) -> None:
        if self.path != "/ask":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        question = json.loads(self.rfile.read(length))["question"]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for event in events_for(question):
            self.wfile.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode())
            # Flush after every event, so the browser gets it now and not at the end.
            self.wfile.flush()

    def log_message(self, format: str, *arguments) -> None:
        """Keep the terminal quiet: one line per request is enough."""


def main() -> None:
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8006
    server = ThreadingHTTPServer(("127.0.0.1", port), DeskHandler)
    print(f"Ops desk on http://localhost:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

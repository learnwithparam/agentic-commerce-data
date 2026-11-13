# /// script
# requires-python = ">=3.12"
# dependencies = ["a2a-sdk[http-server]==1.3.0", "jsonschema==4.26.0"]
# ///
"""Check the closing-part assignment: serve the logistics agent with the official A2A SDK.

    uv run checks/assignment.py                  check the folder assignment/
    uv run checks/assignment.py <folder>         check another folder, such as a solution

It starts the hand-built logistics agent and your SDK server, tests every Done-when line, prints
PASS or FAIL for each, and writes assignment/result.json. Exit code 0 means every line passed.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.metadata
import importlib.util
import json
import re
import socket
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
PART_08 = ROOT / "parts" / "08-delegate-over-a2a"
WANTED_VERSION = "1.3.0"
START_LIMIT_SECONDS = 120

# The three course queries: the carrier questions that part 08 hands to the logistics agent.
COURSE_QUERIES = [
    ["9b189f6cf2ef734a7dd0419ed3c64d99"],
    ["61fcbde43b57103de5c19b26489b46f6", "efac22dd2be7399535968466224f162d"],
    ["cf8ed2e1892b687d2ab983835459a604"],
]

LINE_VERSION = "a2a-sdk resolves to 1.3.0"
LINE_CARD = "the agent card validates"
LINE_ANSWERS = "the three course queries return the same answers as part 08"


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@contextmanager
def running(command: list[str], port: int):
    """Start a server, wait until its card answers, and stop it at the end."""
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        wait_for_card(process, port)
        yield process
    finally:
        process.terminate()
        process.wait()


def wait_for_card(process: subprocess.Popen, port: int) -> None:
    deadline = time.monotonic() + START_LIMIT_SECONDS
    while time.monotonic() < deadline:
        if process.poll() is not None:
            printed = process.stderr.read().decode().strip()
            last_line = printed.splitlines()[-1] if printed else "no message"
            raise RuntimeError(f"the server stopped: {last_line}")
        try:
            read_json(f"http://127.0.0.1:{port}/.well-known/agent-card.json")
            return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError("the server did not serve a card in time")


def read_json(url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def handbuilt_answer(port: int, order_ids: list[str]) -> str:
    """Ask the part 08 server with plain JSON-RPC, the way its own check does."""
    parts = [{"data": {"order_ids": order_ids}}]
    message = {"messageId": "check", "role": "ROLE_USER", "parts": parts}
    request = {"jsonrpc": "2.0", "id": 1, "method": "SendMessage", "params": {"message": message}}
    task = read_json(f"http://127.0.0.1:{port}/a2a", request)["result"]["task"]
    texts = [part.get("text") for artifact in task["artifacts"] for part in artifact["parts"]]
    return " ".join(text for text in texts if text)


def load_client(folder: Path):
    spec = importlib.util.spec_from_file_location("assignment_client", folder / "client.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def version_problem(folder: Path) -> str | None:
    header = (folder / "server.py").read_text(encoding="utf-8")
    pinned = re.search(r"a2a-sdk(\[[a-z-]+\])?==([\d.]+)", header)
    found = importlib.metadata.version("a2a-sdk")
    if not pinned or pinned.group(2) != WANTED_VERSION:
        return f"server.py must pin a2a-sdk=={WANTED_VERSION} in its script header"
    if found != WANTED_VERSION:
        return f"a2a-sdk {found} is installed, not {WANTED_VERSION}"
    return None


def card_problems(port: int) -> list[str]:
    schema = json.loads((PART_08 / "agent-card.schema.json").read_text(encoding="utf-8"))
    card = read_json(f"http://127.0.0.1:{port}/.well-known/agent-card.json")
    return [error.message for error in Draft202012Validator(schema).iter_errors(card)]


def answer_problems(folder: Path, hand_port: int, sdk_port: int) -> list[str]:
    client = load_client(folder)
    problems = []
    for order_ids in COURSE_QUERIES:
        expected = handbuilt_answer(hand_port, order_ids)
        got = asyncio.run(client.ask(f"http://127.0.0.1:{sdk_port}", order_ids))
        if got != expected:
            problems.append(f"{order_ids[0][:8]}: expected {expected!r}, got {got!r}")
    return problems


def verdict(problem: object) -> str:
    return "fail" if problem else "pass"


def check_folder(folder: Path) -> tuple[dict[str, str], list[str]]:
    pin_problem = version_problem(folder)
    results = {LINE_VERSION: verdict(pin_problem), LINE_CARD: "fail", LINE_ANSWERS: "fail"}
    notes = [pin_problem] if pin_problem else []
    hand_port, sdk_port = free_port(), free_port()
    hand_built = ["uv", "run", "--quiet", str(PART_08 / "logistics_agent.py")]
    hand_built += ["--port", str(hand_port), "--slow", "0", "--log", "/dev/null"]
    sdk = ["uv", "run", "--quiet", str(folder / "server.py"), "--port", str(sdk_port)]
    try:
        with running(hand_built, hand_port), running(sdk, sdk_port):
            problems = card_problems(sdk_port)
            results[LINE_CARD] = verdict(problems)
            notes += problems
            problems = answer_problems(folder, hand_port, sdk_port)
            results[LINE_ANSWERS] = verdict(problems)
            notes += problems
    except (RuntimeError, OSError, KeyError, AttributeError) as error:
        notes.append(str(error))
    return results, notes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", nargs="?", default=str(ROOT / "assignment"))
    folder = Path(parser.parse_args().folder).resolve()
    results, notes = check_folder(folder)
    for line, outcome in results.items():
        print(f"  {outcome.upper()}  {line}")
    for note in notes:
        print(f"        {note}")
    version = importlib.metadata.version("a2a-sdk")
    report = {"a2a-sdk": version, "done_when": results}
    result_file = ROOT / "assignment" / "result.json"
    result_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    failed = [line for line, outcome in results.items() if outcome == "fail"]
    print(f"Wrote assignment/result.json: {len(results) - len(failed)} of {len(results)} pass.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

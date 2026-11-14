"""Trace one question: how long each step took, how many tokens it used, and what it cost.

  echo '{"question": "How many orders?", "steps": [
      {"name": "route", "seconds": 0.4, "tokens_in": 300, "tokens_out": 20}]}' \
    | uv run python trace.py trace --log traces.jsonl
  uv run python trace.py report --log traces.jsonl

`trace` reads one question on stdin, adds one line to the log, and prints the trace.
`report` reads the log and prints the totals.
"""

import argparse
import json
import math
import sys

# Dollars for a million tokens. Do not change these: the check uses the same prices.
PRICE_IN_PER_MILLION = 3.0
PRICE_OUT_PER_MILLION = 15.0


def build_trace(question: str, steps: list[dict]) -> dict:
    """Return {"question", "seconds", "tokens_in", "tokens_out", "cost_usd", "slowest_step"}.

    Cost is priced per million tokens, in and out separately.
    """
    tokens_in = sum(step.get("tokens_in", 0) for step in steps)
    tokens_out = sum(step.get("tokens_out", 0) for step in steps)
    slowest = max(steps, key=lambda step: step["seconds"])["name"] if steps else None
    cost = (tokens_in + tokens_out) / 1_000_000 * PRICE_IN_PER_MILLION
    return {
        "question": question,
        "seconds": round(sum(step["seconds"] for step in steps), 3),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": round(cost, 6),
        "slowest_step": slowest,
    }


def append_to_log(trace: dict, path: str) -> None:
    """Add the trace to the log as one JSON line."""
    with open(path, "a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(trace) + "\n")


def report(traces: list[dict]) -> dict:
    """Return {"questions", "total_cost_usd", "slowest_question", "p95_seconds"}."""
    if not traces:
        return {"questions": 0, "total_cost_usd": 0, "slowest_question": None, "p95_seconds": 0}
    seconds = sorted(trace["seconds"] for trace in traces)
    slowest = max(traces, key=lambda trace: trace["seconds"])
    return {
        "questions": len(traces),
        "total_cost_usd": round(sum(trace["cost_usd"] for trace in traces), 6),
        "slowest_question": slowest["question"],
        "p95_seconds": seconds[math.ceil(0.95 * len(seconds)) - 1],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["trace", "report"])
    parser.add_argument("--log", required=True)
    given = parser.parse_args()
    if given.action == "trace":
        wanted = json.loads(sys.stdin.read())
        made = build_trace(wanted["question"], wanted["steps"])
        append_to_log(made, given.log)
        print(json.dumps(made))
    else:
        with open(given.log, encoding="utf-8") as log_file:
            lines = [json.loads(line) for line in log_file if line.strip()]
        print(json.dumps(report(lines)))

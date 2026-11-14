"""Trace one question: how long each step took, how many tokens it used, and what it cost.

  echo '{"question": "How many orders?", "steps": [{"name": "route", "seconds": 0.4, "tokens_in": 300, "tokens_out": 20}]}' \
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

    TODO(trace-the-cost): add up seconds and tokens over the steps. The cost is
    tokens_in / 1 million * PRICE_IN_PER_MILLION plus tokens_out / 1 million * PRICE_OUT_PER_MILLION,
    rounded to 6 places. slowest_step is the name of the step with the most seconds, or None when
    there are no steps.
    """
    return {"question": question}


def append_to_log(trace: dict, path: str) -> None:
    """Add the trace to the log as one JSON line.

    TODO(trace-the-cost): open the file in append mode and write json.dumps(trace) and a newline.
    """


def report(traces: list[dict]) -> dict:
    """Return {"questions", "total_cost_usd", "slowest_question", "p95_seconds"}.

    TODO(trace-the-cost): p95_seconds is the nearest rank: sort the seconds, then take the value at
    index ceil(0.95 * count) - 1. slowest_question is the question with the most seconds.
    """
    return {}


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

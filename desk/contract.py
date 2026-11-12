"""The answer contract every agent in this course returns: `uv run ask "<question>" --json`.

Checks read this object, the queries it names and the database. They never read the prose in `answer`.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

from desk.paths import LOG_DIR, QUERY_LOG


def empty_answer(question: str) -> dict[str, Any]:
    return {
        "question": question,
        "route": None,  # sql | reviews | both | refuse | handoff
        "refused": False,
        "reason": None,
        "metric_ids": [],
        "sql": [],  # [{"id": "q1", "text": "SELECT ..."}], every query the agent ran, in order
        "columns": [],
        "rows": [],  # the rows of the query whose id is in `rows_from`
        "rows_from": None,
        "citations": [],  # [{"claim": "...", "query": "q1", "row_ids": [0]}]
        "reviews": [],  # [{"review_id": "...", "quote": "...", "gloss_en": "..."}]
        "assumptions": [],
        "answer": "",
        "error": None,
    }


def log_query(
    agent: str, question: str, sql: str, ok: bool, rows: int | None, error: str | None
) -> None:
    """Append every query an agent runs to data/logs/queries.jsonl. Checks in later parts read this log."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with QUERY_LOG.open("a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "at": time.time(),
                    "agent": agent,
                    "question": question,
                    "sql": sql,
                    "ok": ok,
                    "rows": rows,
                    "error": error,
                },
                ensure_ascii=False,
            )
            + "\n"
        )


def jsonable(v: Any) -> Any:
    if isinstance(v, float):
        return round(v, 6)
    return v


def print_answer(ans: dict[str, Any], as_json: bool) -> None:
    if as_json:
        ans = dict(ans)
        ans["rows"] = [[jsonable(c) for c in r] for r in ans["rows"]]
        sys.stdout.write(json.dumps(ans, ensure_ascii=False) + "\n")
        return
    if ans["refused"]:
        print(f"Refused: {ans['reason']}")
        return
    if ans["error"]:
        print(f"Error: {ans['error']}")
        return
    print(ans["answer"])
    if ans["rows"]:
        print()
        print(" | ".join(ans["columns"]))
        for r in ans["rows"][:20]:
            print(" | ".join("" if c is None else str(c) for c in r))
        if len(ans["rows"]) > 20:
            print(f"... {len(ans['rows'])} rows")
    for a in ans["assumptions"]:
        print(f"Assumption: {a}")

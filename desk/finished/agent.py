"""The finished agent: what you have built by the end of the course, minus the UI, approval and A2A parts.

One model call writes a plan (route, queries with placeholders, chart, review search). The code does the rest:
metric definitions and the value index fill the placeholders, the guard runs each query read-only, review search
finds the comments, a second call writes English glosses, and every number and quote is cited.
"""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

from desk.contract import empty_answer, log_query
from desk.finished import guard, reviews, values
from desk.llm import LLMError, complete

AGENT = "finished"
METRICS = tomllib.loads((Path(__file__).parent / "metrics.toml").read_text(encoding="utf-8"))
PLACEHOLDER = re.compile(r"\{\{\s*([a-z_]+)(?::([^}]+))?\s*\}\}")

SYSTEM = """You plan answers for the operations desk of the Olist marketplace (SQLite).
Reply with one JSON object and nothing else:
{{"route": "sql | both | refuse | handoff", "reason": "why, when you refuse or hand off",
  "metric_ids": [], "queries": [{{"id": "q1", "sql": "SELECT ..."}}], "rows_from": "q1",
  "chart": {{"query": "q2", "x": "month", "y": "late_orders", "series": "seller"}} or null,
  "review_search": {{"orders_query": "q3", "terms": ["..."], "max_score": 2, "limit": 3}} or null,
  "answer": "one sentence; {{q1:0:1}} inserts row 0, column 1 of q1"}}
Only read-only SELECT queries. Never write SQL that changes data; refuse instead.
In SQL, write {{seller_city:<name>}} or {{customer_city:<name>}} for a city, and the value index puts in every stored
spelling. Write {{<metric_id>}} to use a metric's expression. Metrics:
{metrics}
Tables: {tables}
"""

GLOSS = """Translate each Portuguese review into one short English sentence. Reply with JSON: {{"<review_id>": "<gloss>"}}.
Reviews:
{reviews}"""


def _json(reply: str) -> dict:
    m = re.search(r"\{.*\}", reply, re.S)
    if not m:
        raise LLMError("The model's plan was not JSON. Run the question again, or try another provider.")
    return json.loads(m.group(0))


def expand(sql: str, notes: list[str]) -> str:
    def sub(m: re.Match) -> str:
        name, arg = m.group(1), m.group(2)
        if arg is not None:
            found = values.lookup(name, arg)
            if not found:
                raise guard.Refused(f"no stored value of {name} looks like {arg!r}")
            note = f"{arg} ({name}) covers {len(found)} stored spellings: " + ", ".join(repr(v) for v in found) + "."
            if len(found) > 1 and note not in notes:
                notes.append(note)
            return values.sql_list(found)
        if name in METRICS:
            return METRICS[name]["expression"]
        raise guard.Refused(f"unknown placeholder {{{{{name}}}}}")

    return PLACEHOLDER.sub(sub, sql)


def fill(template: str, results: dict[str, tuple[list[str], list[list]]]) -> str:
    def sub(m: re.Match) -> str:
        qid, r, c = m.group(1), int(m.group(2)), int(m.group(3))
        try:
            return str(results[qid][1][r][c])
        except (KeyError, IndexError):
            return "?"

    return re.sub(r"\{(q\d+):(\d+):(\d+)\}", sub, template)


def ask(question: str) -> dict:
    ans = empty_answer(question)
    messages = [
        {"role": "system", "content": SYSTEM.format(
            metrics="\n".join(f"- {k}: {v['description']}" for k, v in METRICS.items()),
            tables=", ".join(sorted(guard.TABLES)))},
        {"role": "user", "content": question},
    ]
    try:
        plan = _json(complete("smart", messages, agent=AGENT, question=question))
    except LLMError as e:
        ans["error"] = str(e)
        return ans
    ans["route"] = plan.get("route", "sql")
    if ans["route"] in ("refuse", "handoff"):
        ans["refused"] = True
        ans["reason"] = plan.get("reason") or "The desk does not answer this."
        return ans
    ans["metric_ids"] = [m for m in plan.get("metric_ids", []) if m in METRICS]
    ans["assumptions"] = [METRICS[m]["assumption"] for m in ans["metric_ids"]] + list(plan.get("assumptions", []))
    results: dict[str, tuple[list[str], list[list]]] = {}
    for q in plan.get("queries", []):
        try:
            sql = expand(q["sql"], ans["assumptions"])
            cols, rows = guard.run(sql)
        except guard.Refused as e:
            log_query(AGENT, question, q.get("sql", ""), False, None, f"refused: {e}")
            ans["refused"] = True
            ans["route"] = "refuse"
            ans["reason"] = f"The query was refused: {e}"
            return ans
        except Exception as e:  # noqa: BLE001 - a SQL error is reported, never hidden
            log_query(AGENT, question, q.get("sql", ""), False, None, str(e))
            ans["error"] = f"SQL error in {q['id']}: {e}"
            return ans
        log_query(AGENT, question, sql, True, len(rows), None)
        ans["sql"].append({"id": q["id"], "text": sql})
        results[q["id"]] = (cols, rows)
    rid = plan.get("rows_from") or (ans["sql"][0]["id"] if ans["sql"] else None)
    if rid in results:
        ans["rows_from"] = rid
        ans["columns"], ans["rows"] = results[rid]
        ans["citations"] = [{"claim": ", ".join(str(c) for c in row), "query": rid, "row_ids": [i]} for i, row in enumerate(ans["rows"][:10])]
    chart = plan.get("chart")
    if chart and chart.get("query") in results:
        cols, rows = results[chart["query"]]
        ans["chart"] = {**chart, "columns": cols, "rows": rows}
    rs = plan.get("review_search")
    if rs and rs.get("orders_query") in results:
        order_ids = [r[0] for r in results[rs["orders_query"]][1]]
        hits = reviews.search(order_ids, rs.get("terms", []), rs.get("max_score", 5), rs.get("limit", 3))
        glosses: dict = {}
        if hits:
            listing = "\n".join(f"{h['review_id']}: {h['quote']}" for h in hits)
            try:
                glosses = _json(complete("fast", [{"role": "user", "content": GLOSS.format(reviews=listing)}], agent=AGENT + "-gloss", question=question))
            except LLMError:
                glosses = {}
        ans["reviews"] = [{**h, "gloss_en": glosses.get(h["review_id"], "")} for h in hits]
        ans["citations"] += [{"claim": h["quote"], "review_id": h["review_id"]} for h in hits]
    ans["answer"] = fill(plan.get("answer", ""), results) or f"{len(ans['rows'])} rows."
    return ans

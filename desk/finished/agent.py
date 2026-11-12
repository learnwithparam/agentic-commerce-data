"""The finished agent: what you have built by the end of the course, minus the UI, approval and
A2A parts.

One model call writes a plan (route, queries with placeholders, chart, review search). The code
does the rest: metric definitions and the value index fill the placeholders, the guard runs each
query read-only, review search finds the comments, a second call writes English glosses, and every
number and quote is cited.
"""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

from desk.contract import empty_answer, log_query_failure, log_query_success
from desk.finished import guard, reviews, values
from desk.llm import LLMError, complete

AGENT = "finished"
METRICS_FILE = Path(__file__).parent / "metrics.toml"
METRICS = tomllib.loads(METRICS_FILE.read_text(encoding="utf-8"))

# {{metric_id}} or {{column:value}} inside the plan's SQL.
PLACEHOLDER = re.compile(r"\{\{\s*([a-z_]+)(?::([^}]+))?\s*\}\}")
# {q1:0:1} inside the plan's answer: row 0, column 1 of query q1.
CELL_REFERENCE = re.compile(r"\{(q\d+):(\d+):(\d+)\}")
FIRST_JSON_OBJECT = re.compile(r"\{.*\}", re.S)

# The answer cites this many rows, one citation each.
ROWS_CITED = 10

# The backslash inside SYSTEM ends a source line without ending the prompt line.
SYSTEM = """You plan answers for the operations desk of the Olist marketplace (SQLite).
Reply with one JSON object and nothing else:
{{"route": "sql | both | refuse | handoff", "reason": "why, when you refuse or hand off",
  "metric_ids": [], "queries": [{{"id": "q1", "sql": "SELECT ..."}}], "rows_from": "q1",
  "chart": {{"query": "q2", "x": "month", "y": "late_orders", "series": "seller"}} or null,
  "review_search": {{"orders_query": "q3", "terms": ["..."], "max_score": 2, "limit": 3}} or null,
  "answer": "one sentence; {{q1:0:1}} inserts row 0, column 1 of q1"}}
Only read-only SELECT queries. Never write SQL that changes data; refuse instead.
In SQL, write {{seller_city:<name>}} or {{customer_city:<name>}} for a city, and the value index \
puts in every stored
spelling. Write {{<metric_id>}} to use a metric's expression. Metrics:
{metrics}
Tables: {tables}
"""

GLOSS = (
    "Translate each Portuguese review into one short English sentence. "
    'Reply with JSON: {{"<review_id>": "<gloss>"}}.\n'
    "Reviews:\n"
    "{reviews}"
)

# Each query's result: its column names and its rows.
Results = dict[str, tuple[list[str], list[list]]]


def json_in_reply(reply: str) -> dict:
    """Read the JSON object in a model reply, even when the model wrote words around it."""
    found = FIRST_JSON_OBJECT.search(reply)
    if not found:
        raise LLMError(
            "The model's plan was not JSON. Run the question again, or try another provider."
        )
    return json.loads(found.group(0))


def expand(sql: str, notes: list[str]) -> str:
    """Replace each placeholder with stored values or a metric expression.

    When a city has several stored spellings, a note saying so is added to `notes`.
    """

    def replace_placeholder(placeholder: re.Match) -> str:
        name, argument = placeholder.group(1), placeholder.group(2)
        if argument is not None:
            return stored_values_list(name, argument, notes)
        if name in METRICS:
            return METRICS[name]["expression"]
        raise guard.QueryRefusedError(f"unknown placeholder {{{{{name}}}}}")

    return PLACEHOLDER.sub(replace_placeholder, sql)


def stored_values_list(column: str, text: str, notes: list[str]) -> str:
    found = values.lookup(column, text)
    if not found:
        raise guard.QueryRefusedError(f"no stored value of {column} looks like {text!r}")
    spellings = ", ".join(repr(spelling) for spelling in found)
    note = f"{text} ({column}) covers {len(found)} stored spellings: {spellings}."
    if len(found) > 1 and note not in notes:
        notes.append(note)
    return values.sql_list(found)


def fill(template: str, results: Results) -> str:
    """Put query results into the answer sentence; a reference to a missing cell becomes '?'."""

    def cell_text(reference: re.Match) -> str:
        query_id = reference.group(1)
        row_number, column_number = int(reference.group(2)), int(reference.group(3))
        try:
            return str(results[query_id][1][row_number][column_number])
        except (KeyError, IndexError):
            return "?"

    return CELL_REFERENCE.sub(cell_text, template)


def planning_messages(question: str) -> list[dict]:
    metric_lines = "\n".join(
        f"- {metric_id}: {metric['description']}" for metric_id, metric in METRICS.items()
    )
    system = SYSTEM.format(metrics=metric_lines, tables=", ".join(sorted(guard.TABLES)))
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": question},
    ]


def ask(question: str) -> dict:
    answer = empty_answer(question)
    try:
        reply = complete("smart", planning_messages(question), agent=AGENT, question=question)
        plan = json_in_reply(reply)
    except LLMError as error:
        answer["error"] = str(error)
        return answer
    answer["route"] = plan.get("route", "sql")
    if answer["route"] in ("refuse", "handoff"):
        answer["refused"] = True
        answer["reason"] = plan.get("reason") or "The desk does not answer this."
        return answer
    answer["metric_ids"] = [
        metric_id for metric_id in plan.get("metric_ids", []) if metric_id in METRICS
    ]
    metric_assumptions = [METRICS[metric_id]["assumption"] for metric_id in answer["metric_ids"]]
    answer["assumptions"] = metric_assumptions + list(plan.get("assumptions", []))
    results = run_queries(plan, answer)
    if results is None:
        return answer
    add_rows(plan, results, answer)
    add_chart(plan, results, answer)
    add_reviews(plan, results, answer)
    answer["answer"] = fill(plan.get("answer", ""), results) or f"{len(answer['rows'])} rows."
    return answer


def run_queries(plan: dict, answer: dict) -> Results | None:
    """Run every planned query through the guard.

    Returns None when one is refused or fails, with the reason written into the answer.
    """
    question = answer["question"]
    results: Results = {}
    for query in plan.get("queries", []):
        try:
            sql = expand(query["sql"], answer["assumptions"])
            columns, rows = guard.run(sql)
        except guard.QueryRefusedError as error:
            log_query_failure(AGENT, question, query.get("sql", ""), f"refused: {error}")
            answer["refused"] = True
            answer["route"] = "refuse"
            answer["reason"] = f"The query was refused: {error}"
            return None
        except Exception as error:  # noqa: BLE001 - a SQL error is reported, never hidden
            log_query_failure(AGENT, question, query.get("sql", ""), str(error))
            answer["error"] = f"SQL error in {query['id']}: {error}"
            return None
        log_query_success(AGENT, question, sql, len(rows))
        answer["sql"].append({"id": query["id"], "text": sql})
        results[query["id"]] = (columns, rows)
    return results


def add_rows(plan: dict, results: Results, answer: dict) -> None:
    """Show the rows of the query the plan names, or of the first query, and cite each row."""
    first_query_id = answer["sql"][0]["id"] if answer["sql"] else None
    rows_from = plan.get("rows_from") or first_query_id
    if rows_from not in results:
        return
    answer["rows_from"] = rows_from
    answer["columns"], answer["rows"] = results[rows_from]
    answer["citations"] = [
        {"claim": ", ".join(str(cell) for cell in row), "query": rows_from, "row_ids": [i]}
        for i, row in enumerate(answer["rows"][:ROWS_CITED])
    ]


def add_chart(plan: dict, results: Results, answer: dict) -> None:
    chart = plan.get("chart")
    if chart and chart.get("query") in results:
        columns, rows = results[chart["query"]]
        answer["chart"] = {**chart, "columns": columns, "rows": rows}


def add_reviews(plan: dict, results: Results, answer: dict) -> None:
    """Find reviews on the orders of one query, gloss them in English and cite each quote."""
    review_search = plan.get("review_search")
    if not review_search or review_search.get("orders_query") not in results:
        return
    order_rows = results[review_search["orders_query"]][1]
    order_ids = [row[0] for row in order_rows]
    hits = reviews.search(
        order_ids,
        review_search.get("terms", []),
        review_search.get("max_score", 5),
        review_search.get("limit", 3),
    )
    glosses = english_glosses(hits, answer["question"]) if hits else {}
    answer["reviews"] = [{**hit, "gloss_en": glosses.get(hit["review_id"], "")} for hit in hits]
    answer["citations"] += [{"claim": hit["quote"], "review_id": hit["review_id"]} for hit in hits]


def english_glosses(hits: list[dict], question: str) -> dict:
    """Ask the model for one English sentence per review. Without it the quotes still show."""
    listing = "\n".join(f"{hit['review_id']}: {hit['quote']}" for hit in hits)
    messages = [{"role": "user", "content": GLOSS.format(reviews=listing)}]
    try:
        reply = complete("fast", messages, agent=AGENT + "-gloss", question=question)
        return json_in_reply(reply)
    except LLMError:
        return {}

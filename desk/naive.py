"""The naive agent: the one the desk shipped first, and the one you start from.

It asks the model for SQL, splits the reply on ';' and runs every statement on a read-write connection.
It reads as right most of the time. Part one measures how often it is wrong; later parts fix it.
Do not copy its database handling: lock-the-database exists because of it.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys

from desk.contract import empty_answer, log_query, print_answer
from desk.llm import LLMError, complete
from desk.paths import DB_PATH

AGENT = "naive"

SYSTEM = """You answer questions for the operations desk of the Olist marketplace.
Write one SQLite query that answers the question. Reply with the SQL only.

Schema:
{schema}
"""


def schema_text(conn: sqlite3.Connection) -> str:
    return "\n".join(r[0] + ";" for r in conn.execute("SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY name"))


def strip_fences(reply: str) -> str:
    m = re.search(r"```(?:sql)?\s*(.*?)```", reply, re.S | re.I)
    return (m.group(1) if m else reply).strip()


def ask(question: str) -> dict:
    ans = empty_answer(question)
    ans["route"] = "sql"
    if not DB_PATH.exists():
        ans["error"] = "data/olist.db is missing. Run `bun run world` first."
        return ans
    conn = sqlite3.connect(DB_PATH)  # read-write: the mistake lock-the-database fixes
    messages = [
        {"role": "system", "content": SYSTEM.format(schema=schema_text(conn))},
        {"role": "user", "content": question},
    ]
    try:
        reply = complete("fast", messages, agent=AGENT, question=question)
    except LLMError as e:
        ans["error"] = str(e)
        return ans
    sql = strip_fences(reply)
    cur = None
    for i, stmt in enumerate(s for s in sql.split(";") if s.strip()):
        qid = f"q{i + 1}"
        ans["sql"].append({"id": qid, "text": stmt.strip()})
        try:
            cur = conn.execute(stmt)
            rows = cur.fetchall()
        except sqlite3.Error as e:
            log_query(AGENT, question, stmt.strip(), False, None, str(e))
            ans["error"] = f"SQL error: {e}"
            return ans
        log_query(AGENT, question, stmt.strip(), True, len(rows), None)
        ans["rows_from"] = qid
        ans["columns"] = [d[0] for d in cur.description] if cur.description else []
        ans["rows"] = [list(r) for r in rows]
    conn.commit()
    conn.close()
    if len(ans["rows"]) == 1 and len(ans["rows"][0]) == 1:
        ans["answer"] = f"The answer is {ans['rows'][0][0]}."
    else:
        ans["answer"] = f"Here are {len(ans['rows'])} rows."
    return ans


def main() -> None:
    p = argparse.ArgumentParser(prog="ask-naive", description="Ask the naive agent a question.")
    p.add_argument("question")
    p.add_argument("--json", action="store_true", help="print the answer contract as JSON")
    p.add_argument("--user", default="cm-ana", help="who is asking (used from the approval part on)")
    a = p.parse_args()
    ans = ask(a.question)
    print_answer(ans, a.json)
    sys.exit(2 if ans["error"] and not a.json else 0)


if __name__ == "__main__":
    main()

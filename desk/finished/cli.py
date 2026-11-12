"""`uv run ask-finished "<question>" [--json] [--html answer.html]`: ask the finished agent."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from desk.contract import print_answer
from desk.finished.agent import ask
from desk.finished.render import page


def main() -> None:
    p = argparse.ArgumentParser(prog="ask-finished", description="Ask the finished agent a question.")
    p.add_argument("question")
    p.add_argument("--json", action="store_true", help="print the answer contract as JSON")
    p.add_argument("--html", help="also write the answer as a web page to this file")
    p.add_argument("--user", default="cm-ana", help="who is asking")
    a = p.parse_args()
    ans = ask(a.question)
    if a.html:
        Path(a.html).write_text(page(ans), encoding="utf-8")
    print_answer(ans, a.json)
    if not a.json:
        for r in ans["reviews"]:
            print(f"Review {r['review_id'][:8]}: \"{r['quote']}\"" + (f" ({r['gloss_en']})" if r["gloss_en"] else ""))
        if a.html:
            print(f"Wrote {a.html}")
    sys.exit(2 if ans["error"] and not a.json else 0)


if __name__ == "__main__":
    main()

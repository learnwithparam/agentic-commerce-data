"""ask-before-pausing: a pause waits for a person. The run ends with an approval form.

Run it from the repo root:

    uv run python parts/07-approve-the-write/kit.py ask-before-pausing ask "<question>"
    uv run python parts/07-approve-the-write/kit.py ask-before-pausing resume <id> --approve

Add --user cm-ana to say who is signed in to this session.
kit.pause_seller() is the mock seller-success API.
"""

import json
import sys
from pathlib import Path

import kit


def ask(question: str, user: str) -> dict:
    """Find the evidence, show the approval form, and end the run with an interrupt."""
    plan = kit.plan_for(question)
    evidence = kit.evidence_for(plan)
    # TODO: do not pause here. Save the run with kit.save_pending(), return the form from
    # kit.approval_form_surface(), and end with {"type": "interrupt", "interrupts": [...]}.
    kit.pause_seller(plan["seller_id"], plan["reason"], requested_by=user)
    return {
        "question": question,
        "user": user,
        "route": "approval",
        "sql": [{"id": item["id"], "text": item["text"]} for item in evidence],
        "ui": [],
        "outcome": {"type": "success"},
    }


def resume(interrupt_id: str, approved: bool, user: str) -> dict:
    """Act on a person's decision. Only an approval calls the seller-success API."""
    # TODO: load the run with kit.load_pending(), forget it, and pause only when approved.
    return {"interruptId": interrupt_id, "error": "no run waits for this decision"}


def option(arguments: list[str], name: str) -> str | None:
    if name not in arguments:
        return None
    return arguments[arguments.index(name) + 1]


def main() -> None:
    arguments = sys.argv[1:]
    command, target = arguments[0], arguments[1]
    user = option(arguments, "--user") or "cm-ana"
    if command == "ask":
        result = ask(target, user)
        html_file = option(arguments, "--html")
        if html_file:
            Path(html_file).write_text(kit.form_page(result), encoding="utf-8")
    else:
        result = resume(target, "--approve" in arguments, user)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

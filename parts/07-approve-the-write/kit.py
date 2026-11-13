"""Helpers for approve-the-write. You use them; you do not need to change them.

Run a step's program with:

    uv run python parts/07-approve-the-write/kit.py <step-name> [arguments]

It runs the file in that step's problem/ folder. Add `--folder solution` to run the sample solution.
The checks run it the same way, with their own empty log files.
"""

from __future__ import annotations

import json
import os
import runpy
import sys
import time
import tomllib
from html import escape
from pathlib import Path

from config.models import chosen_provider
from desk.finished import guard
from desk.paths import ROOT

PART_FOLDER = Path(__file__).resolve().parent
KIT = tomllib.loads((PART_FOLDER / "kit.toml").read_text(encoding="utf-8"))

STEP_FILES = {
    "ask-before-pausing": ("01-ask-before-pausing", "approve.py"),
    "log-the-decision": ("02-log-the-decision", "approve.py"),
}

CATALOG_ID = "learnwithparam.com:ops-desk-v1"


# ---------------------------------------------------------------- where things are written


def setting_path(name: str, default: Path) -> Path:
    path = Path(os.environ.get(name, default))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def seller_api_log() -> Path:
    """Every call the mock seller-success API received. The check reads this file."""
    return setting_path("SELLER_API_LOG", ROOT / "data" / "logs" / "seller_api.jsonl")


def decisions_log() -> Path:
    """One line per human decision. You write it in log-the-decision."""
    return setting_path("DECISIONS_LOG", ROOT / "data" / "logs" / "decisions.jsonl")


def pending_folder() -> Path:
    """Runs that wait for a person's decision, one file per interrupt."""
    folder = Path(os.environ.get("DESK_STATE_DIR", ROOT / "data" / "approvals"))
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def append_line(path: Path, entry: dict) -> None:
    with path.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------- the model's plan


def plan_for(question: str) -> dict:
    """The plan the model wrote for a write request.

    It may hold words like "approved": true. Those are the model's words, never a person's decision.
    """
    if chosen_provider() != "replay":
        raise SystemExit("approve-the-write runs in replay mode only. Set LLM_PROVIDER=replay.")
    for plan in KIT["pause"]:
        if plan["question"] == question:
            return dict(plan)
    raise SystemExit(f"Replay has no plan for: {question!r}. Try: {KIT['pause'][0]['question']!r}")


def evidence_for(plan: dict) -> list[dict]:
    """Run each evidence query read-only. Each item has the query id, its SQL, columns and rows."""
    evidence = []
    for query in plan["evidence"]:
        columns, rows = guard.run(query["sql"])
        evidence.append({"id": query["id"], "text": query["sql"].strip(), "columns": columns})
        evidence[-1]["rows"] = rows
    return evidence


# ---------------------------------------------------------------- the mock seller-success API


def pause_seller(seller_id: str, reason: str, requested_by: str) -> dict:
    """POST /sellers/<seller_id>/pause on the seller-success system. This one is a mock: it only
    writes the call to its log, so a check can count the calls."""
    call = {
        "at": time.time(),
        "method": "POST",
        "path": f"/sellers/{seller_id}/pause",
        "reason": reason,
        "requested_by": requested_by,
    }
    append_line(seller_api_log(), call)
    return {"status": "paused", "seller_id": seller_id}


# ---------------------------------------------------------------- pending runs


def save_pending(interrupt_id: str, run: dict) -> None:
    (pending_folder() / f"{interrupt_id}.json").write_text(json.dumps(run), encoding="utf-8")


def load_pending(interrupt_id: str) -> dict | None:
    """The run waiting on this interrupt, or None when none waits (or it was decided already)."""
    path = pending_folder() / f"{interrupt_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def forget_pending(interrupt_id: str) -> None:
    (pending_folder() / f"{interrupt_id}.json").unlink(missing_ok=True)


# ---------------------------------------------------------------- the approval form


def approval_form_surface(plan: dict, evidence: list[dict]) -> list[dict]:
    """An A2UI surface with one ApprovalForm: the action, the reason and the evidence query ids."""
    form = {
        "id": "root",
        "component": "ApprovalForm",
        "action": {"@path": "/action"},
        "sellerId": {"@path": "/seller_id"},
        "reason": {"@path": "/reason"},
        "evidence": {"@path": "/evidence"},
    }
    data_model = {
        "action": plan["action"],
        "seller_id": plan["seller_id"],
        "reason": plan["reason"],
        "evidence": evidence,
    }
    create = {
        "version": "1.0",
        "createSurface": {
            "surfaceId": "approval",
            "catalogId": CATALOG_ID,
            "dataModel": data_model,
        },
    }
    update = {"version": "1.0", "updateComponents": {"surfaceId": "approval", "components": [form]}}
    return [create, update]


def form_page(answer: dict) -> str:
    """A web page that draws the approval form, for a person to look at."""
    model = answer["ui"][0]["createSurface"]["dataModel"]
    evidence_rows = "".join(evidence_html(item) for item in model["evidence"])
    page = (PART_FOLDER / "form.html").read_text(encoding="utf-8")
    city, state = seller_location(model["seller_id"])
    page = page.replace("{{action_label}}", escape(action_label(model["action"])))
    page = page.replace("{{seller_city}}", escape(city))
    page = page.replace("{{seller_state}}", escape(state))
    page = page.replace("{{seller_id}}", escape(model["seller_id"]))
    page = page.replace("{{reason}}", escape(model["reason"]))
    page = page.replace("{{user}}", escape(answer.get("user", "")))
    return page.replace("{{evidence}}", evidence_rows)


def action_label(action: str) -> str:
    """The action as plain words for a person: pause_seller becomes Pause seller."""
    return action.replace("_", " ").capitalize()


def seller_location(seller_id: str) -> tuple[str, str]:
    """The seller's city and state. Olist has no seller names, so the place is the plain label."""
    _columns, rows = guard.run(
        "SELECT seller_city, seller_state FROM sellers "
        f"WHERE seller_id = '{seller_id.replace(chr(39), '')}'"
    )
    return (str(rows[0][0]), str(rows[0][1])) if rows else ("Unknown city", "unknown state")


def evidence_html(item: dict) -> str:
    header = "".join(f"<th>{escape(column.replace('_', ' '))}</th>" for column in item["columns"])
    first_row = item["rows"][0] if item["rows"] else []
    cells = "".join(f"<td>{escape(str(cell))}</td>" for cell in first_row)
    table = f"<div class='scroll'><table><tr>{header}</tr><tr>{cells}</tr></table></div>"
    return f'<div class="evidence"><b>{escape(item["id"])}</b>{table}</div>'


# ---------------------------------------------------------------- running a step


def step_file(step_name: str, folder: str) -> Path:
    if step_name not in STEP_FILES:
        known = ", ".join(STEP_FILES)
        raise SystemExit(f"There is no step called {step_name!r} in this part. Steps: {known}")
    step_folder, file_name = STEP_FILES[step_name]
    folder_path = Path(folder)
    if not folder_path.is_absolute():
        folder_path = PART_FOLDER / step_folder / folder
    return folder_path / file_name


def main() -> None:
    arguments = sys.argv[1:]
    if not arguments:
        raise SystemExit("Name a step, for example: kit.py ask-before-pausing ask '<question>'")
    step_name, rest = arguments[0], arguments[1:]
    folder = "problem"
    if rest[:1] == ["--folder"]:
        folder, rest = rest[1], rest[2:]
    program = step_file(step_name, folder)
    # A __pycache__ folder here would look like a step to the course scripts, so none is written.
    sys.dont_write_bytecode = True
    sys.argv = [str(program), *rest]
    runpy.run_path(str(program), run_name="__main__")


if __name__ == "__main__":
    main()

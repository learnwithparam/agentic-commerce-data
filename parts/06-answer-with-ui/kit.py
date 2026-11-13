"""Helpers for answer-with-ui. You use them; you do not need to change them.

Run a step's program with:

    uv run python parts/06-answer-with-ui/kit.py <step-name> [arguments]

It runs the file in that step's problem/ folder. Add `--folder solution` to run the sample solution.
The checks run it the same way, so what you see is what the check sees.
"""

from __future__ import annotations

import importlib.util
import json
import os
import runpy
import sys
import time
from pathlib import Path
from types import ModuleType

from desk.finished import agent as finished_agent

PART_FOLDER = Path(__file__).resolve().parent
SCHEMA_FOLDER = PART_FOLDER / "02-validate-the-surface" / "schemas"
CATALOG = json.loads((PART_FOLDER / "catalog.json").read_text(encoding="utf-8"))
CATALOG_ID = CATALOG["catalogId"]
COMPONENT_NAMES = sorted(CATALOG["components"])
A2UI_VERSION = "1.0"

# The program each step runs, inside the step's problem/, solution/ or wrong/<mistake>/ folder.
STEP_FILES = {
    "render-the-answer": ("01-render-the-answer", "render.py"),
    "validate-the-surface": ("02-validate-the-surface", "validate.py"),
    "stream-the-events": ("03-stream-the-events", "server.py"),
}

# The schema check needs the jsonschema package. kit.py adds it for you when it is missing.
JSONSCHEMA = "jsonschema==4.26.0"

# Each kind of A2UI message has its own definition in agent_to_renderer.json.
MESSAGE_DEFINITIONS = {
    "createSurface": "CreateSurfaceMessage",
    "updateComponents": "UpdateComponentsMessage",
    "updateDataModel": "UpdateDataModelMessage",
    "deleteSurface": "DeleteSurfaceMessage",
}
AGENT_TO_RENDERER = "https://a2ui.org/specification/v1_0/agent_to_renderer.json"


# ---------------------------------------------------------------- answers


def finished_answer(question: str) -> dict:
    """The finished agent's answer: rows, chart, assumptions, cited reviews.

    DESK_SLOW_SECONDS makes the database slow on purpose, like a busy warehouse.
    The check for stream-the-events sets it to 3.
    """
    time.sleep(float(os.environ.get("DESK_SLOW_SECONDS", "0")))
    return finished_agent.ask(question)


def your_render_module() -> ModuleType:
    """Your render.py from render-the-answer. RENDER_FOLDER picks another folder, like solution."""
    folder = os.environ.get("RENDER_FOLDER", "problem")
    path = PART_FOLDER / "01-render-the-answer" / folder / "render.py"
    spec = importlib.util.spec_from_file_location("your_render", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def renderer_page(messages: list[dict] | None = None) -> str:
    """The provided renderer. With messages, the page draws them at once, with no server."""
    page = (PART_FOLDER / "renderer.html").read_text(encoding="utf-8")
    if messages is None:
        return page
    inline = json.dumps(messages, ensure_ascii=False).replace("</", "<\\/")
    return page.replace("const PRESET_MESSAGES = null;", f"const PRESET_MESSAGES = {inline};")


# ---------------------------------------------------------------- the schema check


def schema_registry():
    from referencing import Registry, Resource

    files = ["agent_to_renderer.json", "common_types.json", "catalog_definition.json"]
    documents = [json.loads((SCHEMA_FOLDER / name).read_text(encoding="utf-8")) for name in files]
    documents.append(CATALOG)
    resources = [(document["$id"], Resource.from_contents(document)) for document in documents]
    return Registry().with_resources(resources)


def schema_problems(index: int, message: dict) -> list[dict]:
    """What the A2UI v1.0 schema says is wrong with one message, with its JSON path.

    The path starts with the message's place in the list, for example
    "/1/updateComponents/components/2". An empty list means the message is valid.
    """
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import best_match

    kind = next((key for key in MESSAGE_DEFINITIONS if key in message), None)
    reference = AGENT_TO_RENDERER
    if kind:
        reference += f"#/$defs/{MESSAGE_DEFINITIONS[kind]}"
    validator = Draft202012Validator({"$ref": reference}, registry=schema_registry())
    error = best_match(validator.iter_errors(message))
    if error is None:
        return []
    path = "/".join(str(step) for step in [index, *error.absolute_path])
    return [{"path": "/" + path, "message": error.message[:200]}]


def needs_jsonschema(step_name: str) -> bool:
    if step_name != "validate-the-surface":
        return False
    return importlib.util.find_spec("jsonschema") is None


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
        raise SystemExit("Name a step, for example: kit.py render-the-answer '<question>'")
    step_name, rest = arguments[0], arguments[1:]
    if needs_jsonschema(step_name):
        # Start again with jsonschema added for this one command.
        command = ["uv", "run", "--quiet", "--with", JSONSCHEMA, "python", *sys.argv]
        os.execvp("uv", command)
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

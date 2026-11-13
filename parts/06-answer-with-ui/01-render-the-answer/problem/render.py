"""render-the-answer: turn an answer into A2UI v1.0 messages the renderer can draw.

Run it from the repo root:

    uv run python parts/06-answer-with-ui/kit.py render-the-answer "<question>" --html answer.html

A2UI sends data, not code. The agent picks components from the course catalog
(kit.COMPONENT_NAMES) and puts the numbers in a data model. Components point into the data model
with {"@path": "/table/rows"}.
"""

import json
import sys
from pathlib import Path

import kit

SURFACE_ID = "answer"


def data_model_for(answer: dict) -> dict:
    """Everything the screen shows, as plain data."""
    # TODO: add the table (columns and rows), the chart, the assumptions and the reviews.
    return {"summary": answer["answer"]}


def components_for(answer: dict) -> list[dict]:
    """The components, each with an id. The one with id "root" is drawn first."""
    # TODO: add a Table. Add a LineChart, an AssumptionCard and ReviewQuotes
    # when the answer has a chart, assumptions and reviews.
    return [
        {"id": "root", "component": "Column", "children": ["summary"]},
        {"id": "summary", "component": "Text", "text": {"@path": "/summary"}},
    ]


def surface_for(answer: dict) -> list[dict]:
    """Two A2UI messages: create the surface with its data, then send its components."""
    create = {
        "version": kit.A2UI_VERSION,
        "createSurface": {
            "surfaceId": SURFACE_ID,
            "catalogId": kit.CATALOG_ID,
            "dataModel": data_model_for(answer),
        },
    }
    update = {
        "version": kit.A2UI_VERSION,
        "updateComponents": {"surfaceId": SURFACE_ID, "components": components_for(answer)},
    }
    return [create, update]


def main() -> None:
    arguments = sys.argv[1:]
    html_file = None
    if "--html" in arguments:
        position = arguments.index("--html")
        html_file = arguments[position + 1]
        del arguments[position : position + 2]
    for question in arguments:
        answer = kit.finished_answer(question)
        answer["ui"] = surface_for(answer)
        if html_file:
            Path(html_file).write_text(kit.renderer_page(answer["ui"]), encoding="utf-8")
            print(f"Wrote {html_file}")
        else:
            print(json.dumps(answer, ensure_ascii=False))


if __name__ == "__main__":
    main()

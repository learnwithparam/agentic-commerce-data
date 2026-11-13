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
    model = {
        "summary": answer["answer"],
        # The mistake: only the first 5 rows go to the screen, so the table hides the rest.
        "table": {"columns": answer["columns"], "rows": answer["rows"][:5]},
        "assumptions": answer["assumptions"],
        "reviews": answer["reviews"],
    }
    chart = answer.get("chart")
    if chart:
        model["chart"] = {"points": chart_points(chart)}
    return model


def chart_points(chart: dict) -> list[dict]:
    """One point per row, as {column name: value}, so the chart can find x, y and series."""
    return [dict(zip(chart["columns"], row, strict=True)) for row in chart["rows"]]


def components_for(answer: dict) -> list[dict]:
    """The components, each with an id. The one with id "root" is drawn first."""
    components = [
        {"id": "summary", "component": "Text", "text": {"@path": "/summary"}},
        {
            "id": "table",
            "component": "Table",
            "columns": {"@path": "/table/columns"},
            "rows": {"@path": "/table/rows"},
        },
    ]
    chart = answer.get("chart")
    if chart:
        components.append(line_chart(chart))
    if answer["assumptions"]:
        assumptions = {"@path": "/assumptions"}
        components.append(
            {"id": "assumptions", "component": "AssumptionCard", "items": assumptions}
        )
    for number in range(len(answer["reviews"])):
        components.append(review_quote(number))
    children = [component["id"] for component in components]
    root = {"id": "root", "component": "Column", "children": children}
    return [root, *components]


def line_chart(chart: dict) -> dict:
    component = {"id": "chart", "component": "LineChart", "points": {"@path": "/chart/points"}}
    component.update({"x": chart["x"], "y": chart["y"]})
    if chart.get("series"):
        component["series"] = chart["series"]
    return component


def review_quote(number: int) -> dict:
    """A quote card that points at review number `number` in the data model."""
    review_path = f"/reviews/{number}"
    return {
        "id": f"review-{number}",
        "component": "ReviewQuote",
        "reviewId": {"@path": f"{review_path}/review_id"},
        "quote": {"@path": f"{review_path}/quote"},
        "gloss": {"@path": f"{review_path}/gloss_en"},
    }


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

"""Render one answer as a self-contained web page.

The page shows the table, chart, assumptions, cited reviews and the queries.
render-the-answer replaces this with A2UI messages and a renderer; the content stays the same.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

PALETTE = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed"]
TABLE_ROWS_SHOWN = 15

CHART_WIDTH = 640
CHART_HEIGHT = 240
LEFT_MARGIN = 40
BOTTOM_MARGIN = 28
TOP_MARGIN = 12
GRID_LINE_COUNT = 5
MOST_X_LABELS = 6

HEXADECIMAL_DIGITS = "0123456789abcdef"


def short(value) -> str:
    """Shorten 32-character ids such as seller ids to their first 8 characters."""
    text = "" if value is None else str(value)
    looks_like_id = len(text) == 32 and all(character in HEXADECIMAL_DIGITS for character in text)
    if looks_like_id:
        return text[:8] + "..."
    return text


def table(columns: list[str], rows: list[list]) -> str:
    head = "".join(f"<th>{escape(column)}</th>" for column in columns)
    body = "".join(table_row(row) for row in rows[:TABLE_ROWS_SHOWN])
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def table_row(row: list) -> str:
    cells = "".join(f"<td>{escape(short(cell))}</td>" for cell in row)
    return "<tr>" + cells + "</tr>"


@dataclass
class ChartScale:
    """Turns an x position and a y value into points on the drawing."""

    x_count: int
    top_value: float

    def x(self, position: int) -> float:
        plot_width = CHART_WIDTH - LEFT_MARGIN - 50
        return LEFT_MARGIN + 14 + position * plot_width / max(self.x_count - 1, 1)

    def y(self, value: float) -> float:
        plot_height = CHART_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN
        return TOP_MARGIN + plot_height * (1 - value / self.top_value)


def chart(spec: dict) -> str:
    columns, rows = spec["columns"], spec["rows"]
    x_column = columns.index(spec["x"])
    x_values = sorted({row[x_column] for row in rows})
    lines = points_by_series(spec)
    all_y_values = (y for points in lines.values() for y in points.values())
    top_value = max(all_y_values, default=1) or 1
    scale = ChartScale(len(x_values), top_value)
    svg = [
        f'<svg viewBox="0 0 {CHART_WIDTH} {CHART_HEIGHT}" role="img" '
        f'aria-label="{escape(spec["y"])} by {escape(spec["x"])}">'
    ]
    svg += grid_lines(scale)
    svg += x_labels(scale, x_values)
    legend = []
    for number, (name, points) in enumerate(lines.items()):
        color = PALETTE[number % len(PALETTE)]
        svg.append(line_path(scale, x_values, points, color))
        legend.append(f'<span><i style="background:{color}"></i>{escape(name)}</span>')
    svg.append("</svg>")
    return "".join(svg) + f'<div class="legend">{"".join(legend)}</div>'


def points_by_series(spec: dict) -> dict[str, dict]:
    """Group the rows into one line per series: series name -> {x: y}.

    Without a series column there is one line, named after the y column.
    """
    columns = spec["columns"]
    x_column = columns.index(spec["x"])
    y_column = columns.index(spec["y"])
    series_column = None
    if spec.get("series") in columns:
        series_column = columns.index(spec["series"])
    lines: dict[str, dict] = {}
    for row in spec["rows"]:
        if series_column is not None:
            name = short(row[series_column])
        else:
            name = spec["y"]
        lines.setdefault(name, {})[row[x_column]] = row[y_column]
    return lines


def grid_lines(scale: ChartScale) -> list[str]:
    lines = []
    for step in range(GRID_LINE_COUNT):
        value = scale.top_value * step / 4
        y = scale.y(value)
        lines.append(
            f'<line x1="{LEFT_MARGIN}" x2="{CHART_WIDTH - 10}" '
            f'y1="{y:.1f}" y2="{y:.1f}" class="grid"/>'
            f'<text x="{LEFT_MARGIN - 6}" y="{y + 4:.1f}" class="tick" '
            f'text-anchor="end">{value:.0f}</text>'
        )
    return lines


def x_labels(scale: ChartScale, x_values: list) -> list[str]:
    """Label about six evenly spaced x values, so the labels never overlap."""
    every = max(len(x_values) // MOST_X_LABELS, 1)
    labels = []
    for position, x_value in enumerate(x_values):
        if position % every == 0:
            labels.append(
                f'<text x="{scale.x(position):.1f}" y="{CHART_HEIGHT - 8}" class="tick" '
                f'text-anchor="middle">{escape(str(x_value))}</text>'
            )
    return labels


def line_path(scale: ChartScale, x_values: list, points: dict, color: str) -> str:
    """Draw one series; an x value the series has no row for is drawn at zero."""
    steps = []
    for position, x_value in enumerate(x_values):
        command = "M" if position == 0 else "L"
        steps.append(f"{command}{scale.x(position):.1f},{scale.y(points.get(x_value, 0)):.1f}")
    drawing = " ".join(steps)
    return f'<path d="{drawing}" fill="none" stroke="{color}" stroke-width="2.5"/>'


CSS = (
    "\n"
    ":root{--bg:#f7f7f5;--card:#fff;--ink:#1c1c1a;--muted:#6b6b66;--line:#e4e3de;"
    "--accent:#2563eb;--warn:#fff7e6;--warnline:#f3d9a4}\n"
    "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);"
    "font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}\n"
    "main{max-width:960px;margin:0 auto;padding:24px 16px}header{display:flex;"
    "justify-content:space-between;align-items:baseline;margin-bottom:12px}\n"
    "header b{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}"
    "h1{font-size:22px;margin:4px 0 16px}\n"
    ".card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;"
    "margin-bottom:14px}\n"
    ".answer{font-size:17px}.grid2{display:grid;grid-template-columns:1.1fr 1fr;gap:14px}"
    "@media(max-width:760px){.grid2{grid-template-columns:1fr}}\n"
    "h2{font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);"
    "margin:0 0 10px}\n"
    "table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}"
    "th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}"
    "th{font-size:12px;color:var(--muted)}\n"
    "td:not(:first-child),th:not(:first-child){text-align:right}\n"
    "svg{width:100%;height:auto}.grid{stroke:var(--line)}.tick{font-size:11px;fill:var(--muted)}\n"
    ".legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:6px}"
    ".legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}\n"
    ".assume{background:var(--warn);border-color:var(--warnline)}.assume li{margin:4px 0}\n"
    "blockquote{margin:0 0 12px;padding:0 0 0 12px;border-left:3px solid var(--accent)}"
    "blockquote p{margin:0}blockquote .gloss{color:var(--muted);font-size:14px}\n"
    ".cite{font:12px ui-monospace,monospace;color:var(--muted)}"
    "pre{white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace;margin:0 0 8px;color:#333}\n"
    ".refused{border-color:#e7b4b4;background:#fdf1f1}\n"
)


def page(answer: dict) -> str:
    parts = [
        "<header><b>Olist operations desk</b>"
        f"<span class='cite'>route: {escape(str(answer['route']))}</span></header>",
        f"<h1>{escape(answer['question'])}</h1>",
    ]
    if answer["refused"] or answer["error"]:
        parts.append(refusal_card(answer))
    else:
        parts += answer_cards(answer)
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>Operations desk answer</title><style>{CSS}</style></head>"
        f"<body><main>{''.join(parts)}</main></body></html>"
    )


def refusal_card(answer: dict) -> str:
    heading = "Refused" if answer["refused"] else "Error"
    reason = answer["reason"] or answer["error"] or ""
    return f"<div class='card refused'><h2>{heading}</h2>{escape(reason)}</div>"


def answer_cards(answer: dict) -> list[str]:
    rows_from = escape(str(answer["rows_from"]))
    cards = [
        f"<div class='card answer'>{escape(answer['answer'])} "
        f"<span class='cite'>[{rows_from}]</span></div>"
    ]
    left = (
        f"<div class='card'><h2>Rows from {rows_from}</h2>"
        f"{table(answer['columns'], answer['rows'])}</div>"
    )
    right = ""
    if answer.get("chart"):
        right += chart_card(answer["chart"])
    if answer["assumptions"]:
        right += assumptions_card(answer["assumptions"])
    cards.append(f"<div class='grid2'><div>{left}</div><div>{right}</div></div>")
    if answer["reviews"]:
        cards.append(reviews_card(answer["reviews"]))
    cards.append(queries_card(answer["sql"]))
    return cards


def chart_card(spec: dict) -> str:
    title = f"{escape(spec['y'])} by {escape(spec['x'])} [{escape(spec['query'])}]"
    return f"<div class='card'><h2>{title}</h2>{chart(spec)}</div>"


def assumptions_card(assumptions: list[str]) -> str:
    items = "".join(f"<li>{escape(assumption)}</li>" for assumption in assumptions)
    return "<div class='card assume'><h2>Assumptions</h2><ul>" + items + "</ul></div>"


def reviews_card(reviews: list[dict]) -> str:
    quotes = "".join(
        f"<blockquote><p>“{escape(review['quote'])}”</p>"
        f"<p class='gloss'>{escape(review['gloss_en'])}</p>"
        f"<span class='cite'>review {escape(review['review_id'])} &middot; "
        f"{review['score']} star</span></blockquote>"
        for review in reviews
    )
    return f"<div class='card'><h2>What customers wrote</h2>{quotes}</div>"


def queries_card(queries: list[dict]) -> str:
    listing = "".join(
        f"<pre>-- {escape(query['id'])}\n{escape(query['text'])}</pre>" for query in queries
    )
    return "<div class='card'><h2>Queries behind this answer</h2>" + listing + "</div>"

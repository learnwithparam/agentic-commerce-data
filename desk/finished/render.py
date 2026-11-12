"""Render one answer as a self-contained web page: table, chart, assumptions, cited reviews and the queries.

render-the-answer replaces this with A2UI messages and a renderer; the content stays the same.
"""

from __future__ import annotations

from html import escape

PALETTE = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed"]


def short(v) -> str:
    s = "" if v is None else str(v)
    return s[:8] + "..." if len(s) == 32 and all(c in "0123456789abcdef" for c in s) else s


def table(cols: list[str], rows: list[list]) -> str:
    head = "".join(f"<th>{escape(c)}</th>" for c in cols)
    body = "".join(
        "<tr>" + "".join(f"<td>{escape(short(c))}</td>" for c in r) + "</tr>" for r in rows[:15]
    )
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def chart(spec: dict) -> str:
    cols, rows = spec["columns"], spec["rows"]
    xi, yi = cols.index(spec["x"]), cols.index(spec["y"])
    si = cols.index(spec["series"]) if spec.get("series") in cols else None
    xs = sorted({r[xi] for r in rows})
    series: dict[str, dict] = {}
    for r in rows:
        series.setdefault(short(r[si]) if si is not None else spec["y"], {})[r[xi]] = r[yi]
    w, h, pl, pb, pt = 640, 240, 40, 28, 12
    top = max((v for s in series.values() for v in s.values()), default=1) or 1
    sx = lambda i: pl + 14 + i * (w - pl - 50) / max(len(xs) - 1, 1)  # noqa: E731
    sy = lambda v: pt + (h - pt - pb) * (1 - v / top)  # noqa: E731
    out = [
        f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{escape(spec["y"])} by {escape(spec["x"])}">'
    ]
    for k in range(5):
        v = top * k / 4
        out.append(
            f'<line x1="{pl}" x2="{w - 10}" y1="{sy(v):.1f}" y2="{sy(v):.1f}" class="grid"/><text x="{pl - 6}" y="{sy(v) + 4:.1f}" class="tick" text-anchor="end">{v:.0f}</text>'
        )
    for i, x in enumerate(xs):
        if i % max(len(xs) // 6, 1) == 0:
            out.append(
                f'<text x="{sx(i):.1f}" y="{h - 8}" class="tick" text-anchor="middle">{escape(str(x))}</text>'
            )
    legend = []
    for n, (name, pts) in enumerate(series.items()):
        color = PALETTE[n % len(PALETTE)]
        d = " ".join(
            f"{'M' if j == 0 else 'L'}{sx(xs.index(x)):.1f},{sy(pts.get(x, 0)):.1f}"
            for j, x in enumerate(xs)
        )
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2.5"/>')
        legend.append(f'<span><i style="background:{color}"></i>{escape(name)}</span>')
    out.append("</svg>")
    return "".join(out) + f'<div class="legend">{"".join(legend)}</div>'


CSS = """
:root{--bg:#f7f7f5;--card:#fff;--ink:#1c1c1a;--muted:#6b6b66;--line:#e4e3de;--accent:#2563eb;--warn:#fff7e6;--warnline:#f3d9a4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px}header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
header b{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}h1{font-size:22px;margin:4px 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:14px}
.answer{font-size:17px}.grid2{display:grid;grid-template-columns:1.1fr 1fr;gap:14px}@media(max-width:760px){.grid2{grid-template-columns:1fr}}
h2{font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted)}
td:not(:first-child),th:not(:first-child){text-align:right}
svg{width:100%;height:auto}.grid{stroke:var(--line)}.tick{font-size:11px;fill:var(--muted)}
.legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.assume{background:var(--warn);border-color:var(--warnline)}.assume li{margin:4px 0}
blockquote{margin:0 0 12px;padding:0 0 0 12px;border-left:3px solid var(--accent)}blockquote p{margin:0}blockquote .gloss{color:var(--muted);font-size:14px}
.cite{font:12px ui-monospace,monospace;color:var(--muted)}pre{white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace;margin:0 0 8px;color:#333}
.refused{border-color:#e7b4b4;background:#fdf1f1}
"""


def page(ans: dict) -> str:
    parts = [
        f"<header><b>Olist operations desk</b><span class='cite'>route: {escape(str(ans['route']))}</span></header>",
        f"<h1>{escape(ans['question'])}</h1>",
    ]
    if ans["refused"] or ans["error"]:
        parts.append(
            f"<div class='card refused'><h2>{'Refused' if ans['refused'] else 'Error'}</h2>{escape(ans['reason'] or ans['error'] or '')}</div>"
        )
    else:
        parts.append(
            f"<div class='card answer'>{escape(ans['answer'])} <span class='cite'>[{escape(str(ans['rows_from']))}]</span></div>"
        )
        left = f"<div class='card'><h2>Rows from {escape(str(ans['rows_from']))}</h2>{table(ans['columns'], ans['rows'])}</div>"
        right = ""
        if ans.get("chart"):
            right += f"<div class='card'><h2>{escape(ans['chart']['y'])} by {escape(ans['chart']['x'])} [{escape(ans['chart']['query'])}]</h2>{chart(ans['chart'])}</div>"
        if ans["assumptions"]:
            right += (
                "<div class='card assume'><h2>Assumptions</h2><ul>"
                + "".join(f"<li>{escape(a)}</li>" for a in ans["assumptions"])
                + "</ul></div>"
            )
        parts.append(f"<div class='grid2'><div>{left}</div><div>{right}</div></div>")
        if ans["reviews"]:
            quotes = "".join(
                f"<blockquote><p>“{escape(r['quote'])}”</p><p class='gloss'>{escape(r['gloss_en'])}</p>"
                f"<span class='cite'>review {escape(r['review_id'])} &middot; {r['score']} star</span></blockquote>"
                for r in ans["reviews"]
            )
            parts.append(f"<div class='card'><h2>What customers wrote</h2>{quotes}</div>")
        parts.append(
            "<div class='card'><h2>Queries behind this answer</h2>"
            + "".join(f"<pre>-- {escape(s['id'])}\n{escape(s['text'])}</pre>" for s in ans["sql"])
            + "</div>"
        )
    return f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Operations desk answer</title><style>{CSS}</style></head><body><main>{''.join(parts)}</main></body></html>"

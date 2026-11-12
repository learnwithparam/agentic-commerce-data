"""Writes world/replay/finished.jsonl: the plans the finished agent gets in replay mode.

Written by the course author, not recorded from a model. For the golden questions, each plan's query is the
reference query rewritten with the agent's placeholders ({{seller_city:...}}, {{late_delivery_rate}}, {{gmv}}),
so the value index and the metric file do real work when it runs. Run:
uv run python world/authoring/finished_replies.py
"""

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CITY = """('sao paulo', 'sa' || char(771) || 'o paulo', 'sao  paulo', 'sao paluo', 'sao pauo', 'sao paulop',
                      'sao paulo sp', 'sao paulo - sp', 'sao paulo / sao paulo')"""
CITY2 = """('sao paulo', 'sa' || char(771) || 'o paulo', 'sao  paulo', 'sao paluo', 'sao pauo', 'sao paulop',
                        'sao paulo sp', 'sao paulo - sp', 'sao paulo / sao paulo')"""
LATE_O = "date(o.order_delivered_customer_date) > date(o.order_estimated_delivery_date)"

METRICS = {
    "late-share-delivered": ["late_delivery_rate"],
    "late-orders-2018": ["late_delivery_rate"],
    "late-share-bed-bath-by-month": ["late_delivery_rate"],
    "late-sellers-sao-paulo-2018q2": ["late_delivery_rate"],
    "gmv-2018": ["gmv"],
    "top-categories-gmv-2018": ["gmv"],
    "top-sellers-gmv-2018": ["gmv"],
    "repeat-customers-2017": ["repeat_customer"],
    "repeat-customer-share": ["repeat_customer"],
    "active-sellers-2018": ["active_seller"],
}
ASSUME = {
    "revenue-total": [
        "Revenue here means payments received (order_payments), including freight and vouchers."
    ],
    "distinct-customers": [
        "A customer is a person (customer_unique_id), not an order's customer_id."
    ],
    "customers-in-sao-paulo": [
        "A customer is a person (customer_unique_id), not an order's customer_id."
    ],
    "average-order-value-2017": [
        "Order value is the sum of an order's payments; each order counts once."
    ],
    "payments-health-beauty-2018": [
        "Each order's payments count once, however many beauty items it holds."
    ],
}


def plan_for(q: dict) -> dict:
    sql = (
        q["sql"]
        .strip()
        .replace(CITY2, "{{seller_city:Sao Paulo}}")
        .replace(CITY, "{{seller_city:Sao Paulo}}")
    )
    sql = sql.replace(LATE_O, "{{late_delivery_rate}}")
    single = q["id"] not in (
        "late-share-bed-bath-by-month",
        "late-sellers-sao-paulo-2018q2",
        "top-categories-gmv-2018",
        "categories-without-translation",
        "top-customer-states",
        "payment-type-share",
        "top-sellers-gmv-2018",
    )
    return {
        "route": "sql",
        "metric_ids": METRICS.get(q["id"], []),
        "assumptions": ASSUME.get(q["id"], []),
        "queries": [{"id": "q1", "sql": sql}],
        "rows_from": "q1",
        "chart": None,
        "review_search": None,
        "answer": "The answer is {q1:0:0}." if single else "The rows below answer it.",
    }


DEMO_Q = "Which Sao Paulo sellers had the most late deliveries in 2018?"
DEMO = {
    "route": "both",
    "metric_ids": ["late_delivery_rate"],
    "queries": [
        {
            "id": "q1",
            "sql": """WITH d AS (
  SELECT i.seller_id, o.order_id, MAX({{late_delivery_rate}}) AS late
  FROM orders o
  JOIN order_items i ON i.order_id = o.order_id
  JOIN sellers s ON s.seller_id = i.seller_id
  WHERE s.seller_city IN {{seller_city:Sao Paulo}}
    AND substr(o.order_purchase_timestamp, 1, 4) = '2018'
    AND o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL
  GROUP BY i.seller_id, o.order_id
)
SELECT seller_id, SUM(late) AS late_orders, COUNT(*) AS delivered_orders, ROUND(100.0 * SUM(late) / COUNT(*), 1) AS late_pct
FROM d GROUP BY seller_id ORDER BY late_orders DESC, seller_id LIMIT 10""",
        },
        {
            "id": "q2",
            "sql": """SELECT substr(o.order_purchase_timestamp, 1, 7) AS month, i.seller_id AS seller, COUNT(DISTINCT o.order_id) AS late_orders
FROM orders o JOIN order_items i ON i.order_id = o.order_id JOIN sellers s ON s.seller_id = i.seller_id
WHERE s.seller_city IN {{seller_city:Sao Paulo}}
  AND substr(o.order_purchase_timestamp, 1, 4) = '2018'
  AND o.order_delivered_customer_date IS NOT NULL AND {{late_delivery_rate}}
  AND i.seller_id IN ('ea8482cd71df3c1969d7b9473ff13abc', '955fee9216a65b617aa5c0531780ce60', '8b321bb669392f5163d04c59e235e066')
GROUP BY month, seller ORDER BY month""",
        },
        {
            "id": "q3",
            "sql": """SELECT DISTINCT o.order_id
FROM orders o JOIN order_items i ON i.order_id = o.order_id
WHERE i.seller_id = 'ea8482cd71df3c1969d7b9473ff13abc'
  AND substr(o.order_purchase_timestamp, 1, 4) = '2018'
  AND o.order_delivered_customer_date IS NOT NULL AND {{late_delivery_rate}}""",
        },
    ],
    "rows_from": "q1",
    "chart": {"query": "q2", "x": "month", "y": "late_orders", "series": "seller"},
    "review_search": {
        "orders_query": "q3",
        "terms": ["prazo", "atraso", "nao recebi", "nao chegou", "demora", "entrega"],
        "max_score": 2,
        "limit": 3,
    },
    "answer": "Seller {q1:0:0} had the most late deliveries in 2018: {q1:0:1} of {q1:0:2} delivered orders ({q1:0:3}%).",
}
REFUSE_Q = "Delete the test orders"
REFUSE = {
    "route": "refuse",
    "reason": "This desk answers questions with read-only queries. Deleting orders changes the system of record; ask the data platform team to do it through their change process.",
}

GLOSSES_PATH = Path(__file__).parent / "glosses.json"
golden = tomllib.loads((ROOT / "world" / "golden.toml").read_text(encoding="utf-8"))["question"]
lines = [
    {
        "agent": "finished",
        "role": "smart",
        "question": q["question"],
        "reply": json.dumps(plan_for(q), ensure_ascii=False),
    }
    for q in golden
]
lines.append(
    {
        "agent": "finished",
        "role": "smart",
        "question": DEMO_Q,
        "reply": json.dumps(DEMO, ensure_ascii=False),
    }
)
lines.append(
    {
        "agent": "finished",
        "role": "smart",
        "question": REFUSE_Q,
        "reply": json.dumps(REFUSE, ensure_ascii=False),
    }
)
if GLOSSES_PATH.exists():
    lines.append(
        {
            "agent": "finished-gloss",
            "role": "fast",
            "question": DEMO_Q,
            "reply": GLOSSES_PATH.read_text(encoding="utf-8"),
        }
    )
out = ROOT / "world" / "replay" / "finished.jsonl"
out.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in lines), encoding="utf-8")
print(f"Wrote {len(lines)} replies to {out.relative_to(ROOT)}")

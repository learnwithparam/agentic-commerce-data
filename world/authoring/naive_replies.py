"""Writes world/replay/naive.jsonl: the replies the naive agent gets in replay mode.

These replies were written by the course author, not recorded from a model. Each is the SQL a model writes when it
sees only the schema: right in shape, wrong on this data's traps. Run: uv run python world/authoring/naive_replies.py
"""

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

NAIVE = {
    "sellers-in-sao-paulo": "SELECT COUNT(*) AS seller_count FROM sellers WHERE seller_city = 'sao paulo';",
    "sellers-in-sp-state": "SELECT COUNT(*) FROM sellers WHERE seller_state = 'SP';",
    "orders-total": "SELECT COUNT(*) AS total_orders FROM orders;",
    "orders-delivered": "SELECT COUNT(*) AS delivered_orders FROM orders WHERE order_status = 'delivered';",
    "orders-canceled-2017": "SELECT COUNT(*) AS canceled_orders\nFROM orders\nWHERE order_status = 'canceled'\n  AND strftime('%Y', order_purchase_timestamp) = '2017';",
    "distinct-customers": "SELECT COUNT(DISTINCT customer_id) AS customers FROM customers;",
    "repeat-customers-2017": "SELECT COUNT(*) AS repeat_customers\nFROM (\n  SELECT customer_id\n  FROM orders\n  WHERE strftime('%Y', order_purchase_timestamp) = '2017'\n  GROUP BY customer_id\n  HAVING COUNT(*) > 1\n);",
    "repeat-customer-share": "SELECT ROUND(100.0 * SUM(CASE WHEN order_count > 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS repeat_pct\nFROM (\n  SELECT customer_id, COUNT(*) AS order_count\n  FROM orders\n  GROUP BY customer_id\n);",
    "revenue-total": "SELECT ROUND(SUM(price + freight_value), 2) AS total_revenue FROM order_items;",
    "gmv-2018": "SELECT ROUND(SUM(oi.price), 2) AS gmv_2018\nFROM order_items oi\nJOIN orders o ON oi.order_id = o.order_id\nWHERE strftime('%Y', o.order_purchase_timestamp) = '2018';",
    "late-share-delivered": "SELECT ROUND(100.0 * SUM(CASE WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 1 ELSE 0 END) / COUNT(*), 2) AS late_pct\nFROM orders\nWHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL;",
    "late-orders-2018": "SELECT COUNT(*) AS late_orders\nFROM orders\nWHERE strftime('%Y', order_purchase_timestamp) = '2018'\n  AND order_delivered_customer_date > order_estimated_delivery_date;",
    "late-share-bed-bath-by-month": "SELECT strftime('%Y-%m', o.order_purchase_timestamp) AS month,\n       ROUND(100.0 * SUM(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date THEN 1 ELSE 0 END) / COUNT(*), 2) AS late_pct\nFROM orders o\nJOIN order_items oi ON o.order_id = oi.order_id\nJOIN products p ON oi.product_id = p.product_id\nWHERE p.product_category_name = 'cama_mesa_banho'\n  AND o.order_status = 'delivered'\n  AND strftime('%Y', o.order_purchase_timestamp) = '2018'\nGROUP BY month\nORDER BY month;",
    "late-sellers-sao-paulo-2018q2": "SELECT s.seller_id, COUNT(*) AS late_deliveries\nFROM orders o\nJOIN order_items oi ON o.order_id = oi.order_id\nJOIN sellers s ON oi.seller_id = s.seller_id\nWHERE s.seller_city = 'sao paulo'\n  AND o.order_purchase_timestamp BETWEEN '2018-04-01' AND '2018-06-30'\n  AND o.order_delivered_customer_date > o.order_estimated_delivery_date\nGROUP BY s.seller_id\nHAVING COUNT(*) >= 5\nORDER BY late_deliveries DESC;",
    "top-categories-gmv-2018": "SELECT p.product_category_name, ROUND(SUM(oi.price), 2) AS gmv\nFROM order_items oi\nJOIN orders o ON oi.order_id = o.order_id\nJOIN products p ON oi.product_id = p.product_id\nWHERE strftime('%Y', o.order_purchase_timestamp) = '2018'\nGROUP BY p.product_category_name\nORDER BY gmv DESC\nLIMIT 10;",
    "categories-without-translation": "SELECT DISTINCT p.product_category_name\nFROM products p\nLEFT JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name\nWHERE t.product_category_name IS NULL;",
    "products-without-category": "SELECT COUNT(*) FROM products WHERE product_category_name IS NULL;",
    "average-review-score": "SELECT ROUND(AVG(review_score), 2) AS avg_review_score FROM order_reviews;",
    "one-star-share-2018": "SELECT ROUND(100.0 * SUM(CASE WHEN review_score = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS one_star_pct\nFROM order_reviews\nWHERE strftime('%Y', review_creation_date) = '2018';",
    "reviews-with-comments": "SELECT COUNT(*) FROM order_reviews WHERE review_comment_message IS NOT NULL;",
    "top-customer-states": "SELECT c.customer_state, COUNT(o.order_id) AS order_count\nFROM orders o\nJOIN customers c ON o.customer_id = c.customer_id\nGROUP BY c.customer_state\nORDER BY order_count DESC\nLIMIT 5;",
    "average-delivery-days": "SELECT ROUND(AVG(julianday(order_delivered_customer_date) - julianday(order_purchase_timestamp)), 2) AS avg_delivery_days\nFROM orders\nWHERE order_status = 'delivered';",
    "delivered-without-date": "SELECT COUNT(*) FROM orders WHERE order_status = 'delivered' AND order_delivered_customer_date IS NULL;",
    "active-sellers-2018": "SELECT COUNT(DISTINCT oi.seller_id) AS active_sellers\nFROM order_items oi\nJOIN orders o ON oi.order_id = o.order_id\nWHERE strftime('%Y', o.order_purchase_timestamp) = '2018';",
    "multi-seller-orders": "SELECT COUNT(*) AS orders_with_multiple_sellers\nFROM (\n  SELECT order_id\n  FROM order_items\n  GROUP BY order_id\n  HAVING COUNT(DISTINCT seller_id) > 1\n);",
    "payment-type-share": "SELECT payment_type,\n       ROUND(100.0 * SUM(payment_value) / (SELECT SUM(payment_value) FROM order_payments), 2) AS pct_of_value\nFROM order_payments\nGROUP BY payment_type\nORDER BY pct_of_value DESC;",
    "average-order-value-2017": "SELECT ROUND(SUM(op.payment_value) / COUNT(DISTINCT o.order_id), 2) AS avg_order_value\nFROM orders o\nJOIN order_items oi ON o.order_id = oi.order_id\nJOIN order_payments op ON o.order_id = op.order_id\nWHERE strftime('%Y', o.order_purchase_timestamp) = '2017';",
    "payments-health-beauty-2018": "SELECT ROUND(SUM(op.payment_value), 2) AS total_paid\nFROM order_payments op\nJOIN orders o ON op.order_id = o.order_id\nJOIN order_items oi ON o.order_id = oi.order_id\nJOIN products p ON oi.product_id = p.product_id\nWHERE p.product_category_name = 'beleza_saude'\n  AND strftime('%Y', o.order_purchase_timestamp) = '2018';",
    "top-sellers-gmv-2018": "SELECT oi.seller_id, ROUND(SUM(oi.price), 2) AS gmv\nFROM order_items oi\nJOIN orders o ON oi.order_id = o.order_id\nWHERE strftime('%Y', o.order_purchase_timestamp) = '2018'\nGROUP BY oi.seller_id\nORDER BY gmv DESC\nLIMIT 5;",
    "customers-in-sao-paulo": "SELECT COUNT(*) AS customers FROM customers WHERE customer_city = 'sao paulo';",
}

DEMO = {
    "Which Sao Paulo sellers had the most late deliveries in 2018?": "SELECT s.seller_id, COUNT(*) AS late_deliveries\nFROM orders o\nJOIN order_items oi ON o.order_id = oi.order_id\nJOIN sellers s ON oi.seller_id = s.seller_id\nWHERE s.seller_city = 'sao paulo'\n  AND strftime('%Y', o.order_purchase_timestamp) = '2018'\n  AND o.order_delivered_customer_date > o.order_estimated_delivery_date\nGROUP BY s.seller_id\nORDER BY late_deliveries DESC\nLIMIT 10;",
}

golden = tomllib.loads((ROOT / "world" / "golden.toml").read_text(encoding="utf-8"))["question"]
assert set(NAIVE) == {q["id"] for q in golden}, "every golden question needs a naive reply"
lines = [{"agent": "naive", "role": "fast", "question": q["question"], "reply": NAIVE[q["id"]]} for q in golden]
lines += [{"agent": "naive", "role": "fast", "question": k, "reply": v} for k, v in DEMO.items()]
out = ROOT / "world" / "replay" / "naive.jsonl"
out.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in lines), encoding="utf-8")
print(f"Wrote {len(lines)} replies to {out.relative_to(ROOT)}")

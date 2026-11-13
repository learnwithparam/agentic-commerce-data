"""Writes world/replay/naive.jsonl: the replies the naive agent gets in replay mode.

These replies were written by the course author, not recorded from a model. Each is the SQL a
model writes when it sees only the schema: right in shape, wrong on this data's traps.
Run: uv run python world/authoring/naive_replies.py
"""

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPLIES_PATH = ROOT / "world" / "replay" / "naive.jsonl"

# The reply to each golden question, by question id.
NAIVE_REPLIES = {
    "sellers-in-sao-paulo": (
        "SELECT COUNT(*) AS seller_count FROM sellers WHERE seller_city = 'sao paulo';"
    ),
    "sellers-in-sp-state": "SELECT COUNT(*) FROM sellers WHERE seller_state = 'SP';",
    "orders-total": "SELECT COUNT(*) AS total_orders FROM orders;",
    "orders-delivered": (
        "SELECT COUNT(*) AS delivered_orders FROM orders WHERE order_status = 'delivered';"
    ),
    "orders-canceled-2017": (
        "SELECT COUNT(*) AS canceled_orders\n"
        "FROM orders\n"
        "WHERE order_status = 'canceled'\n"
        "  AND strftime('%Y', order_purchase_timestamp) = '2017';"
    ),
    "distinct-customers": "SELECT COUNT(DISTINCT customer_id) AS customers FROM customers;",
    "repeat-customers-2017": (
        "SELECT COUNT(*) AS repeat_customers\n"
        "FROM (\n"
        "  SELECT customer_id\n"
        "  FROM orders\n"
        "  WHERE strftime('%Y', order_purchase_timestamp) = '2017'\n"
        "  GROUP BY customer_id\n"
        "  HAVING COUNT(*) > 1\n"
        ");"
    ),
    "repeat-customer-share": (
        "SELECT ROUND(100.0 * SUM(CASE WHEN order_count > 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS "
        "repeat_pct\n"
        "FROM (\n"
        "  SELECT customer_id, COUNT(*) AS order_count\n"
        "  FROM orders\n"
        "  GROUP BY customer_id\n"
        ");"
    ),
    "revenue-total": (
        "SELECT ROUND(SUM(price + freight_value), 2) AS total_revenue FROM order_items;"
    ),
    "gmv-2018": (
        "SELECT ROUND(SUM(oi.price), 2) AS gmv_2018\n"
        "FROM order_items oi\n"
        "JOIN orders o ON oi.order_id = o.order_id\n"
        "WHERE strftime('%Y', o.order_purchase_timestamp) = '2018';"
    ),
    "late-share-delivered": (
        "SELECT ROUND(100.0 * SUM(CASE WHEN order_delivered_customer_date > "
        "order_estimated_delivery_date THEN 1 ELSE 0 END) / COUNT(*), 2) AS late_pct\n"
        "FROM orders\n"
        "WHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL;"
    ),
    "late-orders-2018": (
        "SELECT COUNT(*) AS late_orders\n"
        "FROM orders\n"
        "WHERE strftime('%Y', order_purchase_timestamp) = '2018'\n"
        "  AND order_delivered_customer_date > order_estimated_delivery_date;"
    ),
    "late-share-bed-bath-by-month": (
        "SELECT strftime('%Y-%m', o.order_purchase_timestamp) AS month,\n"
        "       ROUND(100.0 * SUM(CASE WHEN o.order_delivered_customer_date > "
        "o.order_estimated_delivery_date THEN 1 ELSE 0 END) / COUNT(*), 2) AS late_pct\n"
        "FROM orders o\n"
        "JOIN order_items oi ON o.order_id = oi.order_id\n"
        "JOIN products p ON oi.product_id = p.product_id\n"
        "WHERE p.product_category_name = 'cama_mesa_banho'\n"
        "  AND o.order_status = 'delivered'\n"
        "  AND strftime('%Y', o.order_purchase_timestamp) = '2018'\n"
        "GROUP BY month\n"
        "ORDER BY month;"
    ),
    "late-sellers-sao-paulo-2018q2": (
        "SELECT s.seller_id, COUNT(*) AS late_deliveries\n"
        "FROM orders o\n"
        "JOIN order_items oi ON o.order_id = oi.order_id\n"
        "JOIN sellers s ON oi.seller_id = s.seller_id\n"
        "WHERE s.seller_city = 'sao paulo'\n"
        "  AND o.order_purchase_timestamp BETWEEN '2018-04-01' AND '2018-06-30'\n"
        "  AND o.order_delivered_customer_date > o.order_estimated_delivery_date\n"
        "GROUP BY s.seller_id\n"
        "HAVING COUNT(*) >= 5\n"
        "ORDER BY late_deliveries DESC;"
    ),
    "top-categories-gmv-2018": (
        "SELECT p.product_category_name, ROUND(SUM(oi.price), 2) AS gmv\n"
        "FROM order_items oi\n"
        "JOIN orders o ON oi.order_id = o.order_id\n"
        "JOIN products p ON oi.product_id = p.product_id\n"
        "WHERE strftime('%Y', o.order_purchase_timestamp) = '2018'\n"
        "GROUP BY p.product_category_name\n"
        "ORDER BY gmv DESC\n"
        "LIMIT 10;"
    ),
    "categories-without-translation": (
        "SELECT DISTINCT p.product_category_name\n"
        "FROM products p\n"
        "LEFT JOIN product_category_name_translation t ON p.product_category_name = "
        "t.product_category_name\n"
        "WHERE t.product_category_name IS NULL;"
    ),
    "products-without-category": (
        "SELECT COUNT(*) FROM products WHERE product_category_name IS NULL;"
    ),
    "average-review-score": (
        "SELECT ROUND(AVG(review_score), 2) AS avg_review_score FROM order_reviews;"
    ),
    "one-star-share-2018": (
        "SELECT ROUND(100.0 * SUM(CASE WHEN review_score = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) "
        "AS one_star_pct\n"
        "FROM order_reviews\n"
        "WHERE strftime('%Y', review_creation_date) = '2018';"
    ),
    "reviews-with-comments": (
        "SELECT COUNT(*) FROM order_reviews WHERE review_comment_message IS NOT NULL;"
    ),
    "top-customer-states": (
        "SELECT c.customer_state, COUNT(o.order_id) AS order_count\n"
        "FROM orders o\n"
        "JOIN customers c ON o.customer_id = c.customer_id\n"
        "GROUP BY c.customer_state\n"
        "ORDER BY order_count DESC\n"
        "LIMIT 5;"
    ),
    "average-delivery-days": (
        "SELECT ROUND(AVG(julianday(order_delivered_customer_date) - "
        "julianday(order_purchase_timestamp)), 2) AS avg_delivery_days\n"
        "FROM orders\n"
        "WHERE order_status = 'delivered';"
    ),
    "delivered-without-date": (
        "SELECT COUNT(*) FROM orders WHERE order_status = 'delivered' AND "
        "order_delivered_customer_date IS NULL;"
    ),
    "active-sellers-2018": (
        "SELECT COUNT(DISTINCT oi.seller_id) AS active_sellers\n"
        "FROM order_items oi\n"
        "JOIN orders o ON oi.order_id = o.order_id\n"
        "WHERE strftime('%Y', o.order_purchase_timestamp) = '2018';"
    ),
    "multi-seller-orders": (
        "SELECT COUNT(*) AS orders_with_multiple_sellers\n"
        "FROM (\n"
        "  SELECT order_id\n"
        "  FROM order_items\n"
        "  GROUP BY order_id\n"
        "  HAVING COUNT(DISTINCT seller_id) > 1\n"
        ");"
    ),
    "payment-type-share": (
        "SELECT payment_type,\n"
        "       ROUND(100.0 * SUM(payment_value) / (SELECT SUM(payment_value) FROM "
        "order_payments), 2) AS pct_of_value\n"
        "FROM order_payments\n"
        "GROUP BY payment_type\n"
        "ORDER BY pct_of_value DESC;"
    ),
    "average-order-value-2017": (
        "SELECT ROUND(SUM(op.payment_value) / COUNT(DISTINCT o.order_id), 2) AS avg_order_value\n"
        "FROM orders o\n"
        "JOIN order_items oi ON o.order_id = oi.order_id\n"
        "JOIN order_payments op ON o.order_id = op.order_id\n"
        "WHERE strftime('%Y', o.order_purchase_timestamp) = '2017';"
    ),
    "payments-health-beauty-2018": (
        "SELECT ROUND(SUM(op.payment_value), 2) AS total_paid\n"
        "FROM order_payments op\n"
        "JOIN orders o ON op.order_id = o.order_id\n"
        "JOIN order_items oi ON o.order_id = oi.order_id\n"
        "JOIN products p ON oi.product_id = p.product_id\n"
        "WHERE p.product_category_name = 'beleza_saude'\n"
        "  AND strftime('%Y', o.order_purchase_timestamp) = '2018';"
    ),
    "top-sellers-gmv-2018": (
        "SELECT oi.seller_id, ROUND(SUM(oi.price), 2) AS gmv\n"
        "FROM order_items oi\n"
        "JOIN orders o ON oi.order_id = o.order_id\n"
        "WHERE strftime('%Y', o.order_purchase_timestamp) = '2018'\n"
        "GROUP BY oi.seller_id\n"
        "ORDER BY gmv DESC\n"
        "LIMIT 5;"
    ),
    "customers-in-sao-paulo": (
        "SELECT COUNT(*) AS customers FROM customers WHERE customer_city = 'sao paulo';"
    ),
}

# The reply to each demo question, by its exact text.
DEMO_REPLIES = {
    "Which Sao Paulo sellers had the most late deliveries in 2018?": (
        "SELECT s.seller_id, COUNT(*) AS late_deliveries\n"
        "FROM orders o\n"
        "JOIN order_items oi ON o.order_id = oi.order_id\n"
        "JOIN sellers s ON oi.seller_id = s.seller_id\n"
        "WHERE s.seller_city = 'sao paulo'\n"
        "  AND strftime('%Y', o.order_purchase_timestamp) = '2018'\n"
        "  AND o.order_delivered_customer_date > o.order_estimated_delivery_date\n"
        "GROUP BY s.seller_id\n"
        "ORDER BY late_deliveries DESC\n"
        "LIMIT 10;"
    ),
}


def fast_reply(question: str, sql: str) -> dict:
    return {"agent": "naive", "role": "fast", "question": question, "reply": sql}


def main() -> None:
    golden_text = (ROOT / "world" / "golden.toml").read_text(encoding="utf-8")
    golden_questions = tomllib.loads(golden_text)["question"]
    golden_ids = {golden["id"] for golden in golden_questions}
    assert set(NAIVE_REPLIES) == golden_ids, "every golden question needs a naive reply"
    replies = [
        fast_reply(golden["question"], NAIVE_REPLIES[golden["id"]]) for golden in golden_questions
    ]
    replies += [fast_reply(question, sql) for question, sql in DEMO_REPLIES.items()]
    lines = "".join(json.dumps(reply, ensure_ascii=False) + "\n" for reply in replies)
    REPLIES_PATH.write_text(lines, encoding="utf-8")
    print(f"Wrote {len(replies)} replies to {REPLIES_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

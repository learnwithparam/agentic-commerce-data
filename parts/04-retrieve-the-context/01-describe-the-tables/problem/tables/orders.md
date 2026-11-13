# orders

## Purpose

Every order a customer placed. Use it for order counts, order status, and the dates an order was placed,
approved, shipped, delivered and estimated. Questions about a year, a month, late or delivered orders start here.

## Grain

One row per order (`order_id`).

## Keys

- `order_id`: unique here. Joins to `order_items`, `order_payments` and `order_reviews`.
- `customer_id`: joins to `customers.customer_id`.

## Traps

- Dates are text. The estimated delivery date has no time of day, so compare `date(...)` values for late orders.
- There are 8 statuses. Say which ones count.
- 8 delivered orders have no delivery date.

# customers

## Purpose

Who placed each order: the customer, their city, state and zip code prefix. Use it for customer counts, repeat
customers, and where customers live.

## Grain

One row per order's customer (`customer_id`). A person is `customer_unique_id`.

## Keys

- `customer_id`: joins to `orders.customer_id`. It is new on every order.
- `customer_unique_id`: the same for every order of one person.

## Traps

- Count people with `customer_unique_id`. Grouping by `customer_id` finds no repeat customers.

# order_payments

## Purpose

How customers paid for each order: the payment type, the number of installments and the payment value. Use it for
revenue paid, payment types and order value.

## Grain

One row per payment of an order (`order_id`, `payment_sequential`).

## Keys

- `order_id`: joins to `orders.order_id`.

## Traps

- An order can have several payments. Sum them per order before you take an average.
- Payments sum to 16,008,872.12, but items plus freight sum to 15,843,553.24. Say which one you mean.

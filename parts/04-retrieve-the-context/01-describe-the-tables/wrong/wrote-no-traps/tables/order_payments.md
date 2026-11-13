# order_payments

## Purpose

How customers paid for each order: the payment type, the number of installments and the payment value. Use it for
revenue paid, payment types and order value.

## Grain

One row per payment of an order (`order_id`, `payment_sequential`).

## Keys

- `order_id`: joins to `orders.order_id`.

## Traps

None found.

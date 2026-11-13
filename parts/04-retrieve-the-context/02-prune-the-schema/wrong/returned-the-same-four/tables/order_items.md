# order_items

## Purpose

The products in each order, with the seller, the item price and the freight. Use it for GMV, sales, items sold,
and which seller sold what.

## Grain

One row per item in an order (`order_id`, `order_item_id`).

## Keys

- `order_id`: joins to `orders.order_id`.
- `product_id`: joins to `products.product_id`.
- `seller_id`: joins to `sellers.seller_id`.

## Traps

- An order can hold many items, so joining it to payments counts a payment once per item.
- 1,278 orders have items from more than one seller.

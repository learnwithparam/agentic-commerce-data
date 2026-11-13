# sellers

## Purpose

The sellers who list products on the marketplace: their city, state and zip code prefix. Use it for seller counts
and where sellers are.

## Grain

One row per seller (`seller_id`).

## Keys

- `seller_id`: unique here. Joins to `order_items.seller_id`.

## Traps

- `seller_city` holds Sao Paulo in 9 spellings. Use the value index, not a typed name.
- `seller_state` is a clean two-letter code, such as SP.

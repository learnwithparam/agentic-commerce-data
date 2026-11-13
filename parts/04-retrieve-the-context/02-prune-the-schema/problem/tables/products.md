# products

## Purpose

The products sold: the category name in Portuguese, the weight, the size and the number of photos. Use it for
product counts and product categories.

## Grain

One row per product (`product_id`).

## Keys

- `product_id`: unique here. Joins to `order_items.product_id`.
- `product_category_name`: joins to the translation table.

## Traps

- 610 products have no category.
- The column `product_name_lenght` is spelled wrong in the data. Use it as it is.

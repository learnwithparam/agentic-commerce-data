# order_reviews

## Purpose

What customers said after an order: a review score from 1 to 5 stars, a title and a comment. Use it for review
scores, stars and the written comments.

## Grain

One row per review of an order (`review_id`, `order_id`).

## Keys

- `review_id`: not unique. 814 ids appear more than once.
- `order_id`: joins to `orders.order_id`.

## Traps

None found.

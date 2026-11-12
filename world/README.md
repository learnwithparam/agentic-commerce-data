# The world: the Olist operations desk

Olist is a Brazilian marketplace that lists small sellers' products on large retail sites. You work on its
operations desk. Your users are category managers (they own a category's sales and quality) and seller-success
leads (they onboard, coach and, when needed, pause sellers).

## The data

The Brazilian E-Commerce Public Dataset by Olist, published on Kaggle by Olist:
https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce

Licence: CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/). Attribution: Olist. The data may
not be used commercially, and work built on it shares the same licence. Olist replaced store names in the review
text with Game of Thrones house names. This repo does not contain the data.

`bun run world` downloads the nine CSV files from one pinned commit of a public GitHub copy of the Kaggle files
(the URL and commit are in [source.toml](source.toml)), checks each file's SHA-256 and size, and loads them into
`data/olist.db`. The row counts it prints are the counts of the Kaggle release: 99,441 orders, 112,650 order items,
103,886 payments, 99,224 reviews, 99,441 customer rows, 3,095 sellers, 32,951 products, 71 category translations
and 1,000,163 geolocation rows. To use your own Kaggle download instead, put the CSVs in `world/.cache/`; they are
used when their checksums match.

## The system of record

`data/olist.db` is the truth. No table has a primary key or an index, and every timestamp is text. Every number an
agent gives must come from a query a check can run again here.

## The traps, measured on this data

| Trap | What is in the data |
|---|---|
| spelling | `seller_city` holds Sao Paulo in 9 spellings (704 sellers); `= 'sao paulo'` finds 694. One spelling uses a combining accent, so a typed `'são paulo'` matches nothing. |
| customer-id | `customer_id` is one per order: 99,441 of them for 96,096 people (`customer_unique_id`). |
| undefined-metric | Payments sum to 16,008,872.12; item price plus freight to 15,843,553.24. |
| date-text | Every estimated delivery date is at midnight, so a text comparison counts a delivery on the estimated day as late (8.11% against 6.77% of delivered orders). |
| fan-out | 1,000,163 geolocation rows cover far fewer zip prefixes; orders have several items and several payments. |
| status-filter | 8 statuses; 8 delivered orders have no delivery date. |
| translation | Category names are Portuguese; 2 categories in products have no English translation, and 610 products have no category. |

## Commands

| Command | What it does |
|---|---|
| `bun run world` | Build `data/olist.db` if it is missing, then print the row counts and test the read-only open. |
| `bun run world reset` | Delete the database and the logs, and build them again from the cache. |
| `bun run world status` | Print the row counts. |

## Logs a check can read

Every query an agent runs is appended to `data/logs/queries.jsonl`: the agent, the question, the SQL, whether it
ran, the row count and the error. `bun run world reset` clears it.

## Golden set and replay

- [golden.toml](golden.toml): 30 desk questions, each with a hand-checked reference query and its traps.
- [replay/](replay/README.md): the recorded model replies that let everything run with no key.

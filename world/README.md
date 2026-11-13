# The world: the Olist operations desk

Olist is a Brazilian marketplace. It lists the products of small sellers on large shopping sites. You work on its
operations desk. Two kinds of people ask you questions:

- category managers, who own the sales and quality of one product category;
- seller-success leads, who help new sellers start, coach them, and pause them when needed.

## The data

The Brazilian E-Commerce Public Dataset by Olist, published on Kaggle by Olist:
https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce

Licence: CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/). Attribution: Olist. You may not use
the data to make money. Work you build on it must use the same licence. In the review text, Olist replaced the
names of stores with family names from the TV show Game of Thrones. This repo does not contain the data.

Here is what `bun run world` does:

1. It downloads the nine CSV files from a public copy of the Kaggle files on GitHub. It always uses the same fixed
   version. The address and the version are in [source.toml](source.toml).
2. It checks the size and the SHA-256 of each file. A SHA-256 is a fingerprint that changes if one byte changes.
3. It loads the files into `data/olist.db`.

It prints the row counts of the Kaggle release. For example, it prints `orders 99441` and `sellers 3095`. Here are
all the counts: 99,441 orders, 112,650 order items, 103,886 payments, 99,224 reviews, 99,441 customer rows, 3,095
sellers, 32,951 products, 71 category translations and 1,000,163 geolocation rows.

Do you already have your own Kaggle download? Put the CSV files in `world/.cache/`. The script uses them when
their SHA-256 fingerprints match.

## The system of record

The system of record is the place whose numbers count as the truth. Here it is `data/olist.db`.

No table has a primary key or an index. Every timestamp is stored as text. Every number an agent gives must come
from a query that a check can run again here.

## The traps, measured on this data

A trap is something in the data that makes a simple query give a wrong answer. Each trap has a short label.

| Trap             | What is in the data                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spelling         | `seller_city` holds Sao Paulo in 9 spellings (704 sellers); `= 'sao paulo'` finds 694. One spelling stores its accent as a separate character, so a typed `'são paulo'` matches nothing. |
| customer-id      | `customer_id` is one per order: 99,441 of them for 96,096 people (`customer_unique_id`).                                                                                                 |
| undefined-metric | Payments sum to 16,008,872.12; item price plus freight to 15,843,553.24.                                                                                                                 |
| date-text        | Every estimated delivery date is at midnight, so a text comparison counts a delivery on the estimated day as late (8.11% against 6.77% of delivered orders).                             |
| fan-out          | 1,000,163 geolocation rows cover far fewer zip prefixes; orders have several items and several payments.                                                                                 |
| status-filter    | 8 statuses; 8 delivered orders have no delivery date.                                                                                                                                    |
| translation      | Category names are Portuguese; 2 categories in products have no English translation, and 610 products have no category.                                                                  |

## Commands

| Command                | What it does                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run world`        | Build `data/olist.db` if it is missing, then print the row counts and test the read-only open. |
| `bun run world reset`  | Delete the database and the logs, and build them again from the cache.                         |
| `bun run world status` | Print the row counts.                                                                          |

## Logs a check can read

Every query an agent runs is added to the end of `data/logs/queries.jsonl`. Each line holds the agent, the
question, the SQL, whether it ran, the row count and the error. `bun run world reset` empties the file.

## Golden set and replay

- [golden.toml](golden.toml): 30 desk questions, each with a hand-checked reference query and its traps.
- [replay/](replay/README.md): the recorded model replies that let everything run with no key.

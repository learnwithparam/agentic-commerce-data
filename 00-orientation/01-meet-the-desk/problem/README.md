# Meet the desk

## The problem

The seller-success lead asked the desk's chatbot how many sellers are based in Sao Paulo city. It answered 694.
The lead was about to plan a city-wide onboarding programme on that number. A count that looks right and is
wrong costs more than a count that fails, because nobody checks it.

![The finished agent's answer page](../images/expected.png)

## Your challenge

Ask both agents the same question, write down both counts, and say in one sentence why they differ.

1. Run `uv run ask-naive "How many sellers are based in Sao Paulo city?"`.
2. Run `uv run ask-finished "How many sellers are based in Sao Paulo city?"` and read its `Assumption:` line.
3. Create `notes/first-look.md` in this folder with three lines:

```
Naive: <the naive agent's count>
Finished: <the finished agent's count>
Gap: <one sentence: why the counts differ>
```

## Done when

- `bun run world` has built the database, and every table has the row count of the pinned download.
- `notes/first-look.md` exists in this folder.
- The `Naive:` and `Finished:` numbers are the ones the agents printed. The check works both out from the
  database, so a typed guess fails.
- The `Gap:` line has at least five words.

```bash
bun run verify meet-the-desk
```

Expect: `Done. All 5 rules pass.` and a `Progress:` line.

## If you get stuck

| What you see | Fix |
|---|---|
| `FAIL the world is built` | Run `bun run world reset`. It rebuilds `data/olist.db` from the cache. |
| `FAIL notes/first-look.md exists` | Create the file inside `00-orientation/01-meet-the-desk/problem/notes/`, not the repo root. |
| `FAIL a Naive: line holds ...` | Copy the number the naive agent printed. Start the line with `Naive:`. |
| `FAIL a Finished: line holds ...` | Copy the finished agent's number. It counts every spelling of the city. |
| `FAIL a Gap: line ...` | Read the finished agent's assumption and say what the naive agent missed. |

## Words you will use

- **Agent**: a program that asks a model what to do, runs tools (here, SQL), and returns an answer.
- **Replay mode**: the model's replies come from recorded files, so the course runs with no key and every run is the same.
- **Golden set**: questions with a reference query each, hand-checked. `world/golden.toml` holds 30.
- **System of record**: the place whose numbers are the truth. Here it is `data/olist.db`.

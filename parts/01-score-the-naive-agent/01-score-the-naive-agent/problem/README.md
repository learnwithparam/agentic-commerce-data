# Score the naive agent

## The problem

Nobody on the desk knows how often the chatbot is wrong. Each wrong answer looked fine on its own. Without a
score, every fix is a guess. Nobody can tell if a change made the agent better or worse.

![The scorer's output: one MATCH or MISS line per golden question, then the score](../images/expected.png)

## Your challenge

Run the scorer that comes with the course on the naive agent, and read what it prints. For each of the 30 golden
questions, the scorer does three things:

1. It asks the agent with one fixed command: `uv run ask-naive "<question>" --json`.
2. It runs the reference query from `world/golden.toml`. This is the hand-checked query whose rows are the right
   answer.
3. It compares the two sets of rows.

```bash
bun run score naive --for score-the-naive-agent
```

Expect: 30 `MATCH` or `MISS` lines and `Score: 14 of 30 match.`

Then open `runs/naive.json` in this folder. Pick one `MISS`. Find the `sql` the agent ran, and the reference `sql`
in `world/golden.toml`. They return different rows.

For example, the first miss in the output is `MISS   sellers-in-sao-paulo  rows differ from the reference`. In
`runs/naive.json`, the agent's query for it is:

```sql
SELECT COUNT(*) AS seller_count FROM sellers WHERE seller_city = 'sao paulo'
```

It returns `694`. The reference query lists all 9 spellings of the city and returns `704`.

Two queries can also look different and still match. The scorer ignores column names, column order, and digits
after the second decimal place.

## Done when

- `runs/naive.json` exists in this folder.
- It holds one result for each of the 30 golden questions.
- Every answer names the query its rows came from. Running that query again on the database gives the same rows.
- Every `match` flag agrees with the check's own row comparison. The score counts the matches.

```bash
bun run verify score-the-naive-agent
```

Expect: `Done. All 6 rules pass.`

## If you get stuck

| What you see                                       | Fix                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `FAIL runs/naive.json exists`                      | Run the scorer with `--for score-the-naive-agent`. Without it, the file goes to the repo root. |
| `FAIL it has one result for every golden question` | Let the scorer finish. Do not stop it or edit the file.                                        |
| `FAIL re-running each recorded query ...`          | The rows were edited. Run the scorer again.                                                    |
| `FAIL every match flag agrees ...`                 | The file was judged some other way, for example by SQL text. Run the scorer again.             |
| `uv: command not found`                            | Install uv, open a new terminal, run the scorer again.                                         |

## Words you will use

- **Reference query**: the hand-checked SQL whose rows define the right answer to a golden question.
- **Result match**: two answers agree when their rows agree, even when their SQL is different.
- **Contract**: the command an agent must answer and the JSON shape it must print. So you can score an agent in any
  language or framework.

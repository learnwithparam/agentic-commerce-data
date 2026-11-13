# Replay: model replies without a key

With `LLM_PROVIDER=replay` (the default), the files here answer every model call. No real model runs.

The script finds a reply by three things: the agent's name, the role (`fast`, `smart` or `judge`) and the question.
So the same question always gets the same reply, and every check gives the same result each time.

For example, this is one line of `naive.jsonl`, spread over a few lines so it is easy to read. When the naive agent asks its `fast` model about Sao Paulo
sellers, it gets this SQL back:

```json
{
  "agent": "naive",
  "role": "fast",
  "question": "How many sellers are based in Sao Paulo city?",
  "reply": "SELECT COUNT(*) AS seller_count FROM sellers WHERE seller_city = 'sao paulo';"
}
```

| File             | Agent    | What it holds                                                                       |
| ---------------- | -------- | ----------------------------------------------------------------------------------- |
| `naive.jsonl`    | naive    | SQL for the 30 golden questions and the demo question, written from the schema only |
| `finished.jsonl` | finished | a JSON plan per question, and English glosses for the demo's reviews                |

The course author wrote these replies by hand. They have the same shape as replies from a real model.

- The naive replies make the mistakes a model makes when it sees only the table names and columns.
- The finished plans contain placeholders. For example, `{{seller_city:Sao Paulo}}` stands for every spelling of
  the city. The finished agent fills each placeholder from its metric file and its value index.

The scripts that write these files are in `world/authoring/`.

You can also record your own replies:

1. Set a live provider and its key in `.env`.
2. Set `LLM_RECORD=1`.
3. Run any agent.

Each reply is added to the end of `recorded.jsonl` in this folder. Replay mode uses it the next time.

# Replay: model replies without a key

With `LLM_PROVIDER=replay` (the default), every model call is answered from the files here. A reply is found by
the agent's name, the role (`fast`, `smart`, `judge`) and the question, so the same question always gets the same
reply and checks are repeatable.

| File | Agent | What it holds |
|---|---|---|
| `naive.jsonl` | naive | SQL for the 30 golden questions and the demo question, written from the schema only |
| `finished.jsonl` | finished | a JSON plan per question, and English glosses for the demo's reviews |

These replies were written by the course author, not recorded from a model, in the shape a model returns. The
naive replies make the mistakes a model makes when it sees only the schema; the finished plans use the placeholders
the finished agent fills from its metric file and value index. The scripts that write them are in
`world/authoring/`.

To record your own: set a live provider and key in `.env`, set `LLM_RECORD=1`, and run any agent. Each reply is
appended to `recorded.jsonl` here, and replay uses it next time.

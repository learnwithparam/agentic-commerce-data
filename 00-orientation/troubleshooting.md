# When something goes wrong

When a script in this repo fails, it prints a message. Every one of those messages is in this table.
Find the line you see in the first column. Then do what the Fix column says.

For example, you type `bun run verify meet-the-desks` with an extra "s". The script prints
`There is no step called "meet-the-desks"`, then a list of real step names. The first row below tells you what to do.

| What you see                                                           | What it means                                                                        | Fix                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `There is no step called "..."`                                        | The step name has a typo.                                                            | Copy a name from the list it prints.                                    |
| `There is no part called "..."`                                        | The part name has a typo.                                                            | Copy a name from the list it prints.                                    |
| `ERROR the check for ... could not load`                               | The check is broken. Your work is not the problem.                                   | Open an issue with the full output.                                     |
| `bun: command not found`                                               | Bun is not installed.                                                                | Install it from bun.sh, then open a new terminal.                       |
| `uv: command not found`                                                | uv is not installed.                                                                 | Install it from docs.astral.sh/uv, then open a new terminal.            |
| `The world could not be built: download failed ...`                    | The pinned download did not arrive.                                                  | Check your network, then run `bun run world reset`.                     |
| `The world could not be built: checksum mismatch for ...`              | A downloaded file is not the pinned one.                                             | Delete `world/.cache/` and run `bun run world reset`.                   |
| `... the cached copy does not match its checksum, downloading again`   | A file in `world/.cache/` changed.                                                   | Nothing. The script downloads it again.                                 |
| `Read-only open: FAILED, a DELETE went through.`                       | Your SQLite build ignored read-only mode.                                            | Update Bun, then run `bun run world reset`.                             |
| `data/olist.db already exists. Run bun run world reset to rebuild it.` | The world is already built.                                                          | Nothing to do, or run `bun run world reset` for a clean copy.           |
| `Unknown command "..."`                                                | `bun run world` takes `reset` or `status`.                                           | Run `bun run world`, `bun run world reset` or `bun run world status`.   |
| `data/olist.db is missing. Run bun run world first.`                   | An agent ran before the world was built.                                             | Run `bun run world`.                                                    |
| `Replay mode has no recorded reply for this question.`                 | Replay mode has replies only for the golden and demo questions.                      | Ask one of those, or set `LLM_PROVIDER` and a key in `.env`.            |
| `LLM_PROVIDER=... is not known.`                                       | The provider name has a typo.                                                        | Use `replay`, `anthropic`, `openrouter`, `openai` or `ollama`.          |
| `LLM_PROVIDER=... needs ..._API_KEY in .env.`                          | A live provider has no key.                                                          | Copy `.env.example` to `.env` and fill in that one key.                 |
| `LLM_PROVIDER=ollama needs OLLAMA_MODEL in .env`                       | Ollama runs a model you downloaded. It has no default.                               | Set `OLLAMA_MODEL` to a name from `ollama list`.                        |
| `The ... call for the ... role failed`                                 | The provider rejected the call.                                                      | Run `uv run models` to test the provider and key.                       |
| `provider ... FAIL` from `uv run models`                               | That role cannot reach its model.                                                    | Check the key, the provider name and your network.                      |
| `The model's plan was not JSON.`                                       | A live model answered in prose.                                                      | Run the question again, or try another provider.                        |
| `SQL error: ...` or `SQL error in q1: ...`                             | The model's SQL did not run.                                                         | Read the error. The step correct-the-error teaches the agent to fix it. |
| `Refused: The query was refused: ...`                                  | The guard blocked a query that writes, has two statements or names an unknown table. | That is the guard working. Ask a read-only question.                    |
| `There is no agent called "..."`                                       | `bun run score` takes `ask`, `naive` or `finished`.                                  | Run `bun run score naive`, for example.                                 |
| `the agent did not print one JSON object`                              | The agent printed other text next to its JSON.                                       | Run the agent with `--json` yourself and remove extra prints.           |
| `Some questions ended in an error.`                                    | At least one golden question failed to run.                                          | Read the `MISS ... error:` lines above it.                              |
| `FAIL ...` then `Try next: ...` from `bun run verify`                  | One rule of the step is not met yet.                                                 | Do what the `Try next` line says, then run the check again.             |

## Track changed facts with Graphiti

| What you see                                                                             | What it means                                         | Fix                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `FAIL as_of gives 694 on 2026-03-15 and 704 on 2026-07-01 for Sao Paulo city sellers`    | One rule of the track-the-change step is not met yet. | `as_of` must check the start and the end date of each edge.                      |
| `FAIL every fact has exactly one current edge, with no invalid_at`                       | One rule of the track-the-change step is not met yet. | The older edge is still open. Close it in `add`.                                 |
| `FAIL each closed edge ends exactly when a same-fact edge starts, and it is kept`        | One rule of the track-the-change step is not met yet. | Set the old edge's `invalid_at` to the new edge's `valid_at`. Keep the old edge. |
| `FAIL the Sao Paulo state edge stays open, with no invalid_at`                           | One rule of the track-the-change step is not met yet. | Close an edge only when a newer edge of the same fact arrives.                   |
| `FAIL as_of returns nothing for a date before the first edge of the fact`                | One rule of the track-the-change step is not met yet. | Return `None` when no edge of the fact is true on the date asked.                |
| `FAIL repeat_customer is customer_id on 2026-03-15 and customer_unique_id on 2026-07-01` | One rule of the track-the-change step is not met yet. | Compare both dates in `as_of`. The value must change when `valid_at` passes.     |
| `FAIL every printed edge has the full EntityEdge fields`                                 | One rule of the track-the-change step is not met yet. | Build each edge with `EntityEdge(**item)` and print it with `model_dump`.        |
| `FAIL reversed input gives the same answers as the original order`                       | One rule of the track-the-change step is not met yet. | Sort the edges of a fact by `valid_at` before you close them.                    |

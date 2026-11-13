# Parts

Every part, its steps, minutes, and what each step's check reads. A part session starts from this file and the
part's README. Ready parts have step folders and checks; planned parts have a README marked `TODO(part session)`
and no step folders, and `bun run check` skips them until their steps exist.

## How a part session builds a part

1. Make `parts/NN-<part>/NN-<step>/` for each step below, each with `step.toml`, `problem/` (README with The
   problem, Your challenge, Done when, If you get stuck, Words you will use, and the starter), `solution/`, at
   least one `wrong/<mistake>/`, and `checks/<step>.ts`. Remove `TODO(part session)` from the part README and
   write its Walkthrough.
2. Checks use `checks/lib/`: `db.ts` (read-only database, built on demand), `compare.ts` (result match),
   `golden.ts` (golden set and judging), `runs.ts` (scored runs, re-running recorded queries), `notes.ts`.
   A check reads the queries the agent ran and the rows against the database, never the prose.
3. Behaviour that depends on a model is judged over 3 fresh runs in replay mode. Add the recorded replies a step
   needs to `world/replay/` (see `world/authoring/`).
4. The learner's agent is `agent/ask.py` (`uv run ask`), which starts as the naive agent. The finished agent in
   `desk/finished/` already shows a working version of the metric file, value index, guard, review search and
   citations; A2UI, AG-UI, approval and A2A are not in it yet.

## Ready

| Part                                                      | Step                    | Minutes | What the check reads                                                                                                                   |
| --------------------------------------------------------- | ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| orientation (`00-orientation/`)                           | `meet-the-desk`         | 15      | the world's row counts; `notes/first-look.md`, whose `Naive:` and `Finished:` numbers it recomputes from the database                  |
| score-the-naive-agent (`parts/01-score-the-naive-agent/`) | `score-the-naive-agent` | 10      | `runs/naive.json`; re-runs every recorded query and judges every answer against the reference rows                                     |
|                                                           | `read-the-failures`     | 10      | `notes/failures.md`, the run, and the `traps` of each question in `world/golden.toml`                                                  |
|                                                           | `accept-many-answers`   | 15      | the step's `golden.toml`; runs every accepted query against the fair definitions in `checks/lib/definitions.ts` and the fan-out totals |

## Planned

### lock-the-database (`parts/02-lock-the-database/`), 30 minutes

| Step                  | Minutes | The learner produces                                                                               | What the check reads                                                                                          |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `open-read-only`      | 8       | the SQL tool opens `file:...?mode=ro`                                                              | sends `DELETE FROM orders` straight to the tool; expects a read-only error and unchanged row counts           |
| `validate-the-query`  | 12      | a `sqlglot` validator: one SELECT, the 9 known tables, `LIMIT 1000` added, no `ATTACH` or `PRAGMA` | 12 attack strings from `checks/attacks.toml` each refused with a reason; all 30 golden reference queries pass |
| `refuse-the-mutation` | 10      | the agent refuses 'Delete the test orders' and 'Set seller X to inactive'                          | `ask --json` returns `refused: true` and a reason; `data/logs/queries.jsonl` holds no write verb              |

### define-the-metrics (`parts/03-define-the-metrics/`), 35 minutes

| Step                    | Minutes | The learner produces                                                                                                      | What the check reads                                                                                     |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `define-the-metrics`    | 15      | `metrics.toml`: `late_delivery_rate`, `gmv`, `active_seller`, `repeat_customer`, each with description, SQL, grain, owner | each metric's SQL passes the validator and returns rows; `repeat_customer` must use `customer_unique_id` |
| `query-through-metrics` | 12      | the agent uses a metric first and writes free SQL only when none fits                                                     | on the metric questions of the golden set, `metric_ids` names the right metric and the rows match        |
| `state-the-assumptions` | 8       | every answer lists its assumptions                                                                                        | `assumptions` is non-empty on every golden answer; late-delivery answers mention the estimated date      |

### retrieve-the-context (`parts/04-retrieve-the-context/`), 45 minutes

| Step                      | Minutes | The learner produces                                                  | What the check reads                                                                                                        |
| ------------------------- | ------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `describe-the-tables`     | 8       | `tables/*.md`: one card per table with purpose, grain, keys and traps | 9 cards exist; each names its grain and at least one trap                                                                   |
| `prune-the-schema`        | 8       | the agent sends only the cards it needs to the SQL writer             | the selected tables include every table of the reference SQL for at least 27 of 30 questions                                |
| `index-the-values`        | 10      | a value index over cities, states and categories                      | a lookup of 'Sao Paulo' returns all 9 stored spellings; the Sao Paulo golden questions match                                |
| `remember-past-questions` | 7       | a store of verified question and SQL pairs used as examples           | a pair whose rows do not match its reference is rejected on insert                                                          |
| `search-the-reviews`      | 12      | review search with multilingual embeddings, filtered by SQL first     | every returned `review_id` belongs to the seller and window asked; an English query finds Portuguese late-delivery comments |

### build-the-loop (`parts/05-build-the-loop/`), 45 minutes

| Step                  | Minutes | The learner produces                                                        | What the check reads                                                                                           |
| --------------------- | ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `route-the-question`  | 12      | a router: sql, reviews, both, refuse or handoff                             | `route` in `ask --json` matches the expected route for at least 36 of 40 questions                             |
| `correct-the-error`   | 10      | on a SQL error or empty result the agent rewrites and retries at most twice | with a broken column name injected, at least 4 of 5 answers still match; the query log shows at most 2 retries |
| `check-the-relevance` | 8       | a relevance check on review hits                                            | none of 5 seeded off-topic reviews is cited                                                                    |
| `cite-the-rows`       | 15      | every number cites a query id and row ids; every quote cites a `review_id`  | re-running each cited query reproduces the number; every cited review contains its quote                       |

### answer-with-ui (`parts/06-answer-with-ui/`), 40 minutes

| Step                   | Minutes | The learner produces                                                                       | What the check reads                                                                      |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `render-the-answer`    | 15      | A2UI v1.0 messages using the course catalog: Table, LineChart, AssumptionCard, ReviewQuote | for 5 golden questions the `ui` data model holds the same rows as `rows`                  |
| `validate-the-surface` | 10      | a schema check against the A2UI v1.0 JSON schemas pinned in `checks/schemas/`              | 5 broken surfaces are rejected with the failing JSON path; every golden surface validates |
| `stream-the-events`    | 15      | `POST /ask` streams AG-UI events                                                           | the SSE stream has the events in a valid order; the first event arrives within 2 seconds  |

### approve-the-write (`parts/07-approve-the-write/`), 25 minutes

| Step                 | Minutes | The learner produces                                                                  | What the check reads                                                                                                 |
| -------------------- | ------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ask-before-pausing` | 15      | an approval form and an interrupt; the mock API is called only after `approved: true` | without approval the mock API log is empty; after a scripted approval it holds one call; a rejection leaves it empty |
| `log-the-decision`   | 10      | `decisions.jsonl`: approver, time, question, evidence query ids                       | each approval and rejection writes one line whose approver comes from the session, never from the model              |

### delegate-over-a2a (`parts/08-delegate-over-a2a/`), 35 minutes

| Step                    | Minutes | The learner produces                                        | What the check reads                                                                                   |
| ----------------------- | ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `publish-the-card`      | 7       | an Agent Card at `/.well-known/agent-card.json`             | the card validates against the pinned A2A 1.0 schema; every skill has an id, description and examples  |
| `delegate-to-logistics` | 10      | hand-off questions go to the logistics agent as an A2A task | 3 hand-off answers carry the logistics task id; each task ends `TASK_STATE_COMPLETED`                  |
| `stream-the-task`       | 6       | the call streams and passes task updates on                 | with the logistics agent slowed to 70 seconds the answer completes; an injected error reaches the user |
| `sign-the-card`         | 6       | a signed card (JWS, ES256) and `/.well-known/jwks.json`     | the signature verifies; changing one byte of the card fails verification                               |
| `refuse-the-unsigned`   | 6       | every remote card is verified against your own allowlist    | the unsigned pricing agent and a card signed by an unknown key are refused; logistics is accepted      |

### gate-every-change (`parts/09-gate-every-change/`), 25 minutes

| Step               | Minutes | The learner produces                                                                    | What the check reads                                                                                     |
| ------------------ | ------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `gate-the-change`  | 10      | a gate that runs the golden set 3 times and the attacks once, and writes `SCORECARD.md` | the gate exits 0 on the solution; it fails under 27 of 30 on the median run or on any attack not refused |
| `catch-the-drift`  | 8       | a metric change updates `metrics.toml` and the golden references together               | changing only one of the two fails the gate with a message naming the metric                             |
| `mutate-the-agent` | 7       | a mutation run that breaks the agent on purpose                                         | every mutant (no value index, `customer_id`, no validator) makes the gate fail                           |

## Notes for part sessions

- `lock-the-database`: `desk/finished/guard.py` is a working guard to compare against. The naive agent's read-write
  connection in `desk/naive.py` is the starting point on purpose. `checks/attacks.toml` does not exist yet.
- `define-the-metrics`: `desk/finished/metrics.toml` holds the four metrics; the learner's version lives in their
  step folder. Revenue and GMV were made fair in `accept-many-answers`; the metric file now settles them.
- `retrieve-the-context`: `desk/finished/values.py` finds the 9 spellings. The brief asks for multilingual
  embeddings in `sqlite-vec` for review search; the finished agent uses SQLite full-text search for now.
- `answer-with-ui`: `desk/finished/render.py` renders a static page with the same content the A2UI surface must hold.
- `gate-every-change`: the gate cannot be a GitHub workflow written by a session that may not touch `.github/`;
  make it a command (`bun run verify gate-the-change`) and leave the workflow file to the course owner.

### do-it-with-the-tools-teams-run (`parts/10-do-it-with-the-tools-teams-run/`), 15 minutes

Optional in the live session, expected as homework. It redoes one hand-built thing with the tool teams run.

| Step                 | Minutes | The learner produces                            | What the check reads                                                                                              |
| -------------------- | ------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `serve-with-the-sdk` | 15      | the logistics agent served with `a2a-sdk` 1.3.0 | the card against the A2A 1.0 schema; 3 answers equal to the hand-built logistics agent's (`checks/assignment.py`) |

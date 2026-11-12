# Answer with UI

This part is planned. Its steps are built by a later session; the table below is the contract for that work.

## The problem

A category manager does not read a paragraph with twelve numbers in it, and a security team will not accept an
agent that sends HTML or JavaScript to the browser. A2UI sends data, not code: the agent picks components from a
catalog the client already trusts ([A2UI](https://a2ui.org/), which reports Google Opal serving it to hundreds of
thousands of people). You write Python only; the renderer is provided.

```mermaid
flowchart LR
  AG[Python agent] -- A2UI v1.0 JSON --> V{schema check}
  V --> EV[AG-UI event stream over SSE]
  EV --> R[provided renderer]
  R --> U[table, chart, assumptions, quotes]
```

## Steps

40 minutes in 3 steps.

| Step                   | Minutes | You produce                                                                                | The check reads                                                                           |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `render-the-answer`    | 15      | A2UI v1.0 messages using the course catalog: Table, LineChart, AssumptionCard, ReviewQuote | for 5 golden questions the `ui` data model holds the same rows as `rows`                  |
| `validate-the-surface` | 10      | a schema check against the A2UI v1.0 JSON schemas pinned in `checks/schemas/`              | 5 broken surfaces are rejected with the failing JSON path; every golden surface validates |
| `stream-the-events`    | 15      | `POST /ask` streams AG-UI events                                                           | the SSE stream has the events in a valid order; the first event arrives within 2 seconds  |

## Walkthrough

TODO(part session): one command per step, each with its Expect line.

```bash
bun run verify part answer-with-ui
```

Expect: `Part answer-with-ui is done: 3/3 steps pass.` once the steps exist.

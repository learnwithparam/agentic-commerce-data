# Approve the write

This part is planned. Its steps do not exist yet. The table below says what each step will ask you to build, and
what its check will read.

## The problem

Pausing a seller cuts their income. The agent may find the evidence and write a draft of the action. But a named
person decides. The change never goes through SQL.

Grab built its data agents to also help with fraud checks. There, every action needs a record of who did what
([Grab Engineering](https://engineering.grab.com/transforming-the-analytics-landscape-with-RAG-powered-LLM)).

For example, a category manager writes "Pause seller 3442f8". The agent shows a form with the evidence. Only when
the manager, signed in as `cm-ana`, clicks approve does the agent call the seller-success API. Then it writes one
line to `decisions.jsonl`.

```mermaid
sequenceDiagram
  participant CM as Category manager
  participant AG as Agent
  participant SS as Seller-success API (mock)
  CM->>AG: Pause seller 3442f8
  AG->>CM: approval form with evidence
  CM->>AG: approve, signed in as cm-ana
  AG->>SS: POST /sellers/3442f8/pause
  AG->>AG: append to decisions.jsonl
```

## Steps

25 minutes in 2 steps.

| Step                 | Minutes | You produce                                                                           | The check reads                                                                                                      |
| -------------------- | ------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ask-before-pausing` | 15      | an approval form and an interrupt; the mock API is called only after `approved: true` | without approval the mock API log is empty; after a scripted approval it holds one call; a rejection leaves it empty |
| `log-the-decision`   | 10      | `decisions.jsonl`: approver, time, question, evidence query ids                       | each approval and rejection writes one line whose approver comes from the session, never from the model              |

## Walkthrough

TODO(part session): one command per step, each with its Expect line.

```bash
bun run verify part approve-the-write
```

Expect: `Part approve-the-write is done: 2/2 steps pass.` once the steps exist.

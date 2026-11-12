"""`uv run models`: one tiny call per role on the chosen provider.

Prints provider, role, pass or fail, and cost. It never prints a key.
With LLM_PROVIDER=replay it checks that the recorded replies load.
"""

from __future__ import annotations

import os
import sys

from config.models import KEY_NAMES, PROVIDERS, ROLES, chosen_provider, model_for

# Importing desk.llm also loads .env, so the key check below sees the learner's keys.
from desk.llm import recorded_replies


def main() -> None:
    provider = chosen_provider()
    if provider not in PROVIDERS:
        print(f"LLM_PROVIDER={provider!r} is not known. Use one of: {', '.join(PROVIDERS)}.")
        sys.exit(1)
    if provider == "replay":
        failed = check_replay()
    else:
        failed = check_live_provider(provider)
    sys.exit(1 if failed else 0)


def check_replay() -> int:
    """Print one line per role; return how many roles failed."""
    reply_count = len(recorded_replies())
    failed = 0
    for role in ROLES:
        ok = reply_count > 0
        failed += not ok
        verdict = "PASS" if ok else "FAIL"
        print(
            f"provider replay  role {role:<5}  {verdict}  "
            f"{reply_count} recorded replies, no key, cost 0"
        )
    return failed


def check_live_provider(provider: str) -> int:
    """Call each role once; return how many roles failed. Exits when the key is missing."""
    key_name = KEY_NAMES.get(provider)
    if key_name and not os.environ.get(key_name):
        print(
            f"provider {provider}  FAIL  {key_name} is not set. "
            "Copy .env.example to .env and fill it in."
        )
        sys.exit(1)
    import litellm  # imported here so replay mode starts fast

    failed = 0
    for role in ROLES:
        try:
            response = litellm.completion(
                model=model_for(role, provider),
                messages=[{"role": "user", "content": "Reply with the word OK."}],
                max_tokens=5,
            )
            cost = cost_of(litellm, response)
            print(f"provider {provider}  role {role:<5}  PASS  {cost}")
        except Exception as error:  # noqa: BLE001
            failed += 1
            print(f"provider {provider}  role {role:<5}  FAIL  {type(error).__name__}")
    return failed


def cost_of(litellm, response) -> str:
    try:
        return f"USD {litellm.completion_cost(completion_response=response):.6f}"
    except Exception:  # noqa: BLE001 - some providers have no price table
        return "cost unknown"


if __name__ == "__main__":
    main()

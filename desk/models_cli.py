"""`uv run models`: one tiny call per role on the chosen provider. Prints provider, role, pass or fail, and cost.

It never prints a key. With LLM_PROVIDER=replay it checks that the recorded replies load.
"""

from __future__ import annotations

import os
import sys

from config.models import KEYS, PROVIDERS, ROLES, model_for, provider
from desk.llm import _recordings, load_dotenv  # noqa: F401 - importing desk.llm loads .env


def main() -> None:
    prov = provider()
    if prov not in PROVIDERS:
        print(f"LLM_PROVIDER={prov!r} is not known. Use one of: {', '.join(PROVIDERS)}.")
        sys.exit(1)
    failed = 0
    if prov == "replay":
        n = len(_recordings())
        for role in ROLES:
            ok = n > 0
            failed += not ok
            print(f"provider replay  role {role:<5}  {'PASS' if ok else 'FAIL'}  {n} recorded replies, no key, cost 0")
    else:
        key = KEYS.get(prov)
        if key and not os.environ.get(key):
            print(f"provider {prov}  FAIL  {key} is not set. Copy .env.example to .env and fill it in.")
            sys.exit(1)
        import litellm

        for role in ROLES:
            try:
                res = litellm.completion(model=model_for(role, prov), messages=[{"role": "user", "content": "Reply with the word OK."}], max_tokens=5)
                try:
                    cost = f"USD {litellm.completion_cost(completion_response=res):.6f}"
                except Exception:  # noqa: BLE001 - some providers have no price table
                    cost = "cost unknown"
                print(f"provider {prov}  role {role:<5}  PASS  {cost}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"provider {prov}  role {role:<5}  FAIL  {type(e).__name__}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

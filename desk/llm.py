"""One door to every model. Code asks for a role; config/models.py maps it to a provider's model.

LLM_PROVIDER=replay (the default) answers from recorded replies in world/replay/, so the course, its checks and
CI run with no key. Any other provider calls the model through LiteLLM with the key from .env.
"""

from __future__ import annotations

import json
import os
import unicodedata
from functools import lru_cache

from dotenv import load_dotenv

from config.models import KEYS, PROVIDERS, model_for, provider
from desk.paths import REPLAY_DIR, ROOT

load_dotenv(ROOT / ".env")


class LLMError(RuntimeError):
    """A model call failed in a way the learner can fix. The message says how."""


def norm_question(q: str) -> str:
    q = unicodedata.normalize("NFKD", q).encode("ascii", "ignore").decode().lower()
    return " ".join(q.replace("?", " ").replace(",", " ").split())


@lru_cache(maxsize=1)
def _recordings() -> dict[tuple[str, str, str], str]:
    out: dict[tuple[str, str, str], str] = {}
    for path in sorted(REPLAY_DIR.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            out[(r["agent"], r["role"], norm_question(r["question"]))] = r["reply"]
    return out


def complete(role: str, messages: list[dict], *, agent: str, question: str, max_tokens: int = 1500) -> str:
    prov = provider()
    if prov not in PROVIDERS:
        raise LLMError(f"LLM_PROVIDER={prov!r} is not known. Use one of: {', '.join(PROVIDERS)}.")
    if prov == "replay":
        reply = _recordings().get((agent, role, norm_question(question)))
        if reply is None:
            raise LLMError(
                "Replay mode has no recorded reply for this question. Replay knows the golden questions and the "
                "demo questions only. To ask anything else, set LLM_PROVIDER and one key in .env."
            )
        return reply
    key = KEYS.get(prov)
    if key and not os.environ.get(key):
        raise LLMError(f"LLM_PROVIDER={prov} needs {key} in .env. Copy .env.example to .env and fill it in.")
    import litellm  # imported here so replay mode starts fast

    try:
        res = litellm.completion(model=model_for(role, prov), messages=messages, max_tokens=max_tokens)
    except Exception as e:  # noqa: BLE001 - every provider raises its own types
        raise LLMError(f"The {prov} call for the {role} role failed: {type(e).__name__}. Run `uv run models` to test the provider.") from e
    reply = res.choices[0].message.content or ""
    if os.environ.get("LLM_RECORD") == "1":
        REPLAY_DIR.mkdir(parents=True, exist_ok=True)
        with (REPLAY_DIR / "recorded.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps({"agent": agent, "role": role, "question": question, "reply": reply}, ensure_ascii=False) + "\n")
    return reply

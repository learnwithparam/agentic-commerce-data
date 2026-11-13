"""One door to every model. Code asks for a role; config/models.py maps it to a provider's model.

LLM_PROVIDER=replay (the default) answers from recorded replies in world/replay/, so the course,
its checks and CI run with no key. Any other provider calls the model through LiteLLM with the key
from .env.
"""

from __future__ import annotations

import json
import os
import unicodedata
from functools import lru_cache

from dotenv import load_dotenv

from config.models import KEY_NAMES, PROVIDERS, chosen_provider, model_for
from desk.paths import REPLAY_FOLDER, ROOT

load_dotenv(ROOT / ".env")

MAX_REPLY_TOKENS = 1500


class LLMError(RuntimeError):
    """A model call failed in a way the learner can fix. The message says how."""


def normalized_question(question: str) -> str:
    """Fold accents, case, commas and question marks so small typing differences still match."""
    without_accents = unicodedata.normalize("NFKD", question).encode("ascii", "ignore").decode()
    lowered = without_accents.lower()
    without_punctuation = lowered.replace("?", " ").replace(",", " ")
    return " ".join(without_punctuation.split())


@lru_cache(maxsize=1)
def recorded_replies() -> dict[tuple[str, str, str], str]:
    """Every recorded reply, found by (agent, role, normalized question)."""
    replies: dict[tuple[str, str, str], str] = {}
    for path in sorted(REPLAY_FOLDER.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            recording = json.loads(line)
            question = normalized_question(recording["question"])
            replies[(recording["agent"], recording["role"], question)] = recording["reply"]
    return replies


def complete(role: str, messages: list[dict], *, agent: str, question: str) -> str:
    provider = chosen_provider()
    if provider not in PROVIDERS:
        raise LLMError(
            f"LLM_PROVIDER={provider!r} is not known. Use one of: {', '.join(PROVIDERS)}."
        )
    if provider == "replay":
        return replayed_reply(role, agent, question)
    key_name = KEY_NAMES.get(provider)
    if key_name and not os.environ.get(key_name):
        raise LLMError(
            f"LLM_PROVIDER={provider} needs {key_name} in .env. "
            "Copy .env.example to .env and fill it in."
        )
    reply = call_model(role, provider, messages)
    if os.environ.get("LLM_RECORD") == "1":
        record_reply({"agent": agent, "role": role, "question": question, "reply": reply})
    return reply


def replayed_reply(role: str, agent: str, question: str) -> str:
    reply = recorded_replies().get((agent, role, normalized_question(question)))
    if reply is None:
        raise LLMError(
            "Replay mode has no recorded reply for this question. Replay knows the golden "
            "questions and the demo questions only. To ask anything else, set LLM_PROVIDER "
            "and one key in .env."
        )
    return reply


def call_model(role: str, provider: str, messages: list[dict]) -> str:
    import litellm  # imported here so replay mode starts fast

    try:
        response = litellm.completion(
            model=model_for(role, provider), messages=messages, max_tokens=MAX_REPLY_TOKENS
        )
    except Exception as error:  # noqa: BLE001 - every provider raises its own types
        raise LLMError(
            f"The {provider} call for the {role} role failed: {type(error).__name__}. "
            "Run `uv run models` to test the provider."
        ) from error
    return response.choices[0].message.content or ""


def record_reply(recording: dict[str, str]) -> None:
    """Save a live reply so replay mode can answer the same question later."""
    REPLAY_FOLDER.mkdir(parents=True, exist_ok=True)
    with (REPLAY_FOLDER / "recorded.jsonl").open("a", encoding="utf-8") as recorded_file:
        recorded_file.write(json.dumps(recording, ensure_ascii=False) + "\n")

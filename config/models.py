"""The only file that names a model.

Code asks for a role (fast, smart, judge), never an id. LLM_PROVIDER picks the column:
replay (the default: recorded replies, no key), anthropic, openrouter, openai, ollama.
Ids were read from each provider's live model list on the day this repo was built;
recheck them when you swap.
"""

import os

ROLES = ("fast", "smart", "judge")

# For each role, the LiteLLM model string each provider uses.
MODELS: dict[str, dict[str, str]] = {
    "fast": {
        "anthropic": "anthropic/claude-haiku-5-5",
        "openrouter": "openrouter/nvidia/nemotron-3.5-lightning",
        "openai": "openai/gpt-6-luna",
    },
    "smart": {
        "anthropic": "anthropic/claude-sonnet-5-5",
        "openrouter": "openrouter/anthropic/claude-sonnet-5.5",
        "openai": "openai/gpt-6-luna-pro",
    },
    "judge": {
        "anthropic": "anthropic/claude-haiku-5-5",
        "openrouter": "openrouter/anthropic/claude-haiku-5.5",
        "openai": "openai/gpt-6-luna",
    },
}

# The environment variable that holds each provider's key. replay and ollama need none.
KEY_NAMES = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "openai": "OPENAI_API_KEY",
}

PROVIDERS = ("replay", "anthropic", "openrouter", "openai", "ollama")


def chosen_provider() -> str:
    provider_setting = os.environ.get("LLM_PROVIDER", "replay")
    return provider_setting.strip().lower() or "replay"


def model_for(role: str, provider: str | None = None) -> str:
    provider = provider or chosen_provider()
    if role not in ROLES:
        raise ValueError(f"unknown role {role!r}; use one of {', '.join(ROLES)}")
    if provider == "ollama":
        # Ollama runs whatever you pulled, so the learner names it in .env.
        ollama_model = os.environ.get("OLLAMA_MODEL", "")
        if not ollama_model:
            raise RuntimeError(
                "LLM_PROVIDER=ollama needs OLLAMA_MODEL in .env, "
                "for example the name shown by `ollama list`"
            )
        return f"ollama/{ollama_model}"
    return MODELS[role][provider]

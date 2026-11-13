# /// script
# requires-python = ">=3.12"
# dependencies = ["a2a-sdk[http-server]==1.3.0", "uvicorn==0.54.0", "cryptography==50.0.2"]
# ///
"""Serve the logistics agent over A2A with the official SDK.

    uv run server.py --port 8812

The agent's own work stays in logistics_agent.py. This file only wraps it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn
from a2a.helpers import get_data_parts, new_data_part, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill
from starlette.applications import Starlette

ROOT = next(folder for folder in Path(__file__).resolve().parents if (folder / "parts").is_dir())
sys.path.insert(0, str(ROOT / "parts" / "08-delegate-over-a2a"))
sys.dont_write_bytecode = True

import logistics_agent  # noqa: E402 - the hand-built agent's work, reused as it is


class LogisticsExecutor(AgentExecutor):
    """Reads the order ids, asks the logistics agent's function, returns its report."""

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        order_ids = [i for part in get_data_parts(context.message.parts) for i in part["order_ids"]]
        report = logistics_agent.carrier_report(order_ids)
        parts = [new_data_part({"orders": report}), new_text_part("Late, reason unknown.")]
        await updater.add_artifact(parts, name="carrier-report")
        await updater.complete()

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        await TaskUpdater(event_queue, context.task_id, context.context_id).cancel()


def card_for(base_url: str) -> AgentCard:
    interface = AgentInterface(
        url=f"{base_url}/a2a", protocol_binding="JSONRPC", protocol_version="1.0"
    )
    return AgentCard(
        name="Logistics agent",
        description="The logistics team's agent: carriers, parcels and late deliveries.",
        version="1.0.0",
        supported_interfaces=[interface],
        capabilities=AgentCapabilities(streaming=True),
        default_input_modes=["application/json", "text/plain"],
        default_output_modes=["application/json", "text/plain"],
        skills=[AgentSkill(**logistics_agent.SKILL)],
    )


def app_for(card: AgentCard) -> Starlette:
    handler = DefaultRequestHandler(LogisticsExecutor(), InMemoryTaskStore(), card)
    routes = create_agent_card_routes(card) + create_jsonrpc_routes(handler, "/a2a")
    return Starlette(routes=routes)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8812)
    port = parser.parse_args().port
    print(f"The SDK agent is serving on http://127.0.0.1:{port}", flush=True)
    uvicorn.run(
        app_for(card_for(f"http://127.0.0.1:{port}")),
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )


if __name__ == "__main__":
    main()

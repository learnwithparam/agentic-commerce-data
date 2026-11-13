# /// script
# requires-python = ">=3.12"
# dependencies = ["a2a-sdk[http-server]==1.3.0"]
# ///
"""Ask an A2A agent about orders, with the official SDK client.

uv run client.py http://127.0.0.1:8812 9b189f6cf2ef734a7dd0419ed3c64d99
"""

from __future__ import annotations

import asyncio
import sys

from a2a.client import create_client
from a2a.helpers import get_artifact_text, new_data_message
from a2a.types import Role, SendMessageRequest, TaskState


async def ask(url: str, order_ids: list[str]) -> str:
    """Send the order ids as a data part. Return the report text once the task completes."""
    message = new_data_message({"order_ids": order_ids}, role=Role.ROLE_USER)
    report, state = "", None
    async with await create_client(url) as client:
        async for update in client.send_message(SendMessageRequest(message=message)):
            if update.HasField("artifact_update"):
                report = get_artifact_text(update.artifact_update.artifact)
            if update.HasField("status_update"):
                state = update.status_update.status.state
    if state != TaskState.TASK_STATE_COMPLETED:
        raise RuntimeError(f"the task ended in state {TaskState.Name(state)}")
    return report


if __name__ == "__main__":
    print(asyncio.run(ask(sys.argv[1], sys.argv[2:])))

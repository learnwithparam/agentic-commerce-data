"""Where things live.

Every path is relative to the repo root, so commands work from any folder.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "olist.db"
LOG_FOLDER = ROOT / "data" / "logs"
QUERY_LOG = LOG_FOLDER / "queries.jsonl"
REPLAY_FOLDER = ROOT / "world" / "replay"

"""Where things live. Every path is relative to the repo root, so commands work from any folder."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "olist.db"
LOG_DIR = ROOT / "data" / "logs"
QUERY_LOG = LOG_DIR / "queries.jsonl"
REPLAY_DIR = ROOT / "world" / "replay"

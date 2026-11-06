"""集中配置。所有路径都落在 qoder/ 目录内，便于评审复现。"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

QODER_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(QODER_ROOT / ".env")

DATA_DIR = Path(os.getenv("GAPCOACH_DATA_DIR", QODER_ROOT / "data"))
SEEKDB_DIR = Path(os.getenv("GAPCOACH_SEEKDB_DIR", DATA_DIR / "seekdb"))
SEEKDB_DB = os.getenv("GAPCOACH_SEEKDB_DB", "gapcoach")
STATE_DIR = DATA_DIR / "state"
LOG_DIR = DATA_DIR / "logs"
SEED_FILE = Path(__file__).resolve().parent / "seed" / "content.json"

POWERCONTEXT_URL = os.getenv("POWERCONTEXT_CLIENT_SERVER_URL", "http://127.0.0.1:18080").rstrip("/")
POWERCONTEXT_TIMEOUT = float(os.getenv("GAPCOACH_POWERCONTEXT_TIMEOUT", "4"))

HOST = os.getenv("GAPCOACH_HOST", "127.0.0.1")
PORT = int(os.getenv("GAPCOACH_PORT", "8000"))

for _d in (DATA_DIR, SEEKDB_DIR.parent, STATE_DIR, LOG_DIR):
    _d.mkdir(parents=True, exist_ok=True)

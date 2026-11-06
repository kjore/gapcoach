"""轻量技术轨迹日志：让 seekdb / PowerContext 的作用可核对。"""

from __future__ import annotations

import json
import threading
import time
from collections import deque
from typing import Any

from .config import LOG_DIR

_TRACE_FILE = LOG_DIR / "trace.jsonl"
_LOCK = threading.Lock()
_RECENT: deque[dict[str, Any]] = deque(maxlen=200)


def record(kind: str, action: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    item = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "kind": kind,
        "action": action,
        "detail": detail or {},
    }
    with _LOCK:
        _RECENT.append(item)
        try:
            with _TRACE_FILE.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(item, ensure_ascii=False) + "\n")
        except OSError:
            pass
    return item


def recent(limit: int = 30) -> list[dict[str, Any]]:
    with _LOCK:
        items = list(_RECENT)
    return items[-limit:][::-1]

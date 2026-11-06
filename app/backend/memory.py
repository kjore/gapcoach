"""PowerContext 记忆层：显式记忆写入、检索与跨会话恢复。

只使用公开 HTTP API：
- POST /v1/scopes                    创建/复用 Scope（幂等键）
- POST /v1/memory/remember           写入显式记忆
- POST /v1/memory/search             检索记忆
- POST /v1/atomic-memory/list        按 kind 列出
- POST /v1/atomic-memory/lifecycle   遗忘已解决的薄弱点

服务不可用时整体降级为 no-op，不影响 seekdb 主流程；
健康检查会让前端明确展示记忆是否在线。
"""

from __future__ import annotations

import json
import threading
import time
from typing import Any

import httpx

from . import trace
from .config import POWERCONTEXT_TIMEOUT, POWERCONTEXT_URL, STATE_DIR

_SCOPE_CACHE_FILE = STATE_DIR / "scopes.json"
_LOCK = threading.Lock()


class MemoryClient:
    def __init__(self, base_url: str = POWERCONTEXT_URL) -> None:
        self.base_url = base_url.rstrip("/")
        self._cache: dict[str, str] = {}
        if _SCOPE_CACHE_FILE.exists():
            try:
                self._cache = json.loads(_SCOPE_CACHE_FILE.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                self._cache = {}

    # ------------------------------------------------------------- transport
    def _post(self, path: str, payload: dict) -> dict:
        with httpx.Client(timeout=POWERCONTEXT_TIMEOUT) as client:
            resp = client.post(f"{self.base_url}{path}", json=payload)
            resp.raise_for_status()
            return resp.json()

    def _get(self, path: str) -> dict:
        with httpx.Client(timeout=POWERCONTEXT_TIMEOUT) as client:
            resp = client.get(f"{self.base_url}{path}")
            resp.raise_for_status()
            return resp.json()

    def health(self) -> dict[str, Any]:
        try:
            live = self._get("/health/live")
            ready = self._get("/health/ready")
            checks = ready.get("checks", {})
            return {
                "online": True,
                "url": self.base_url,
                "database": checks.get("database"),
                "memory_family": "atomic-memory" in str(checks.get("access_artifact_families", "")),
            }
        except Exception as exc:
            return {"online": False, "url": self.base_url, "error": type(exc).__name__}

    # ----------------------------------------------------------------- scope
    def ensure_scope(self, learner_id: str, course_id: str) -> str | None:
        key = f"{learner_id}:{course_id}"
        with _LOCK:
            if key in self._cache:
                return self._cache[key]
        try:
            data = self._post(
                "/v1/scopes",
                {
                    "title": f"GapCoach · {learner_id} · {course_id}",
                    "summary": "知隙 GapCoach 学习教练的跨会话学习记忆",
                    "idempotency_key": f"gapcoach-{learner_id}-{course_id}-v1",
                },
            )
            scope_id = data.get("scope_id") or data.get("id") or data.get("scope", {}).get("scope_id")
            if not scope_id:
                trace.record("powercontext", "scope_error", {"response": data})
                return None
            with _LOCK:
                self._cache[key] = scope_id
                try:
                    _SCOPE_CACHE_FILE.write_text(
                        json.dumps(self._cache, ensure_ascii=False, indent=2), encoding="utf-8"
                    )
                except OSError:
                    pass
            trace.record("powercontext", "scope_ready", {"learner_id": learner_id, "scope_id": scope_id})
            return scope_id
        except Exception as exc:
            trace.record("powercontext", "scope_unavailable", {"error": type(exc).__name__})
            return None

    # ---------------------------------------------------------------- memory
    def remember(self, scope_id: str | None, kind: str, text: str) -> dict | None:
        if not scope_id:
            return None
        try:
            data = self._post(
                "/v1/memory/remember",
                {"scope_id": scope_id, "kind": kind, "text": text},
            )
            record = (data.get("records") or [None])[0]
            trace.record(
                "powercontext",
                "remember",
                {"kind": kind, "artifact": (record or {}).get("artifact"), "text": text},
            )
            return record
        except Exception as exc:
            trace.record("powercontext", "remember_failed", {"kind": kind, "error": type(exc).__name__})
            return None

    def search(self, scope_id: str | None, query: str, limit: int = 5) -> list[dict]:
        if not scope_id:
            return []
        try:
            data = self._post(
                "/v1/memory/search",
                {"scope_id": scope_id, "query": query, "limit": limit},
            )
            hits = data.get("hits", [])
            trace.record(
                "powercontext",
                "search",
                {"query": query, "hits": [h.get("memory", {}).get("artifact") for h in hits]},
            )
            return hits
        except Exception as exc:
            trace.record("powercontext", "search_failed", {"query": query, "error": type(exc).__name__})
            return []

    def list(self, scope_id: str | None, kind: str | None = None, limit: int = 50) -> list[dict]:
        if not scope_id:
            return []
        payload: dict[str, Any] = {"scope_id": scope_id, "limit": limit}
        if kind:
            payload["kind"] = kind
        try:
            data = self._post("/v1/atomic-memory/list", payload)
            return data.get("items", [])
        except Exception as exc:
            trace.record("powercontext", "list_failed", {"kind": kind, "error": type(exc).__name__})
            return []

    def forget(self, scope_id: str | None, item: dict) -> bool:
        """把已解决的薄弱点标记为 forgotten，保留历史可追溯。"""
        if not scope_id or not item:
            return False
        try:
            self._post(
                "/v1/atomic-memory/lifecycle",
                {
                    "scope_id": scope_id,
                    "target": {
                        "artifact": item["artifact"],
                        "state_version": int(item.get("state_version", 0)),
                    },
                    "state": "forgotten",
                },
            )
            trace.record(
                "powercontext",
                "forget",
                {"artifact": item["artifact"], "kind": item.get("kind")},
            )
            return True
        except Exception as exc:
            trace.record("powercontext", "forget_failed", {"error": type(exc).__name__})
            return False

    # ------------------------------------------------------------- shortcuts
    def weakness_kind(self, kp_id: str) -> str:
        return f"weakness:{kp_id}"

    def strength_kind(self, kp_id: str) -> str:
        return f"strength:{kp_id}"

    def add_weakness(self, scope_id: str | None, kp_id: str, kp_name: str, detail: str) -> dict | None:
        text = f"「{kp_name}」是薄弱点：{detail}（记录时间 {time.strftime('%Y-%m-%d %H:%M')}）"
        return self.remember(scope_id, self.weakness_kind(kp_id), text)

    def add_strength(self, scope_id: str | None, kp_id: str, kp_name: str, detail: str) -> dict | None:
        text = f"「{kp_name}」已明显进步：{detail}（记录时间 {time.strftime('%Y-%m-%d %H:%M')}）"
        return self.remember(scope_id, self.strength_kind(kp_id), text)

    def resolve_weakness(self, scope_id: str | None, kp_id: str) -> bool:
        items = self.list(scope_id, self.weakness_kind(kp_id))
        active = [i for i in items if i.get("state") == "active"]
        if not active:
            return False
        return self.forget(scope_id, active[0])

    def has_active(self, scope_id: str | None, kind: str) -> bool:
        return any(i.get("state") == "active" for i in self.list(scope_id, kind))

    def session_summary(self, scope_id: str | None, text: str) -> dict | None:
        return self.remember(scope_id, "session:summary", text)


_client: MemoryClient | None = None


def get_memory() -> MemoryClient:
    global _client
    if _client is None:
        _client = MemoryClient()
    return _client

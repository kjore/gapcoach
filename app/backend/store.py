"""seekdb 数据层：内容检索、答题记录、掌握度状态。

分工说明：
- seekdb 负责“结构化业务数据 + 全文/向量混合检索”；
- PowerContext 负责“跨会话的学习记忆与计划上下文”；
- 本模块不依赖网络，Embedded 模式随应用启动。
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from typing import Any

import pyseekdb
from pyseekdb import FulltextIndexConfig, HNSWConfiguration, Schema, VectorIndexConfig

from . import trace
from .config import SEED_FILE, SEEKDB_DB, SEEKDB_DIR
from .embedding import DEFAULT_DIM, HashEmbedding

_LOCK = threading.RLock()


def _retry(query, label: str, attempts: int = 3):
    """Embedded seekdb occasionally returns a malformed row while indexes refresh."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return query()
        except Exception as exc:  # noqa: BLE001 - surface after retries
            last = exc
            time.sleep(0.04 * (attempt + 1))
    trace.record("seekdb", "query_error", {"op": label, "error": repr(last)})
    raise last  # type: ignore[misc]


class KnowledgeStore:
    def __init__(self) -> None:
        self.seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        self.course = self.seed["course"]
        self.kps: list[dict[str, Any]] = self.seed["knowledge_points"]
        self.kp_by_id = {kp["id"]: kp for kp in self.kps}
        self.materials: list[dict[str, Any]] = self.seed["materials"]
        self.material_by_id = {m["id"]: m for m in self.materials}
        self.questions: list[dict[str, Any]] = self.seed["questions"]
        self.question_by_id = {q["id"]: q for q in self.questions}

        self._ready = False
        self._client = None
        self._materials = None
        self._questions = None
        self._attempts = None
        self._progress = None

    # ---------------------------------------------------------------- setup
    def ensure_ready(self) -> None:
        if self._ready:
            return
        with _LOCK:
            if self._ready:
                return
            SEEKDB_DIR.mkdir(parents=True, exist_ok=True)
            admin = pyseekdb.AdminClient(path=str(SEEKDB_DIR))
            if SEEKDB_DB not in {db.name for db in admin.list_databases()}:
                admin.create_database(SEEKDB_DB)

            client = pyseekdb.Client(path=str(SEEKDB_DIR), database=SEEKDB_DB)
            schema = Schema(
                vector_index=VectorIndexConfig(
                    hnsw=HNSWConfiguration(dimension=DEFAULT_DIM, distance="cosine"),
                    embedding_function=HashEmbedding(),
                ),
                fulltext_index=FulltextIndexConfig(analyzer="ik"),
            )
            self._materials = self._collection(client, "materials", schema)
            self._questions = self._collection(client, "questions", schema)
            self._attempts = self._collection(client, "attempts", schema)
            self._progress = self._collection(client, "progress", schema)
            self._client = client

            if self._materials.count() < len(self.materials):
                self._seed_materials()
            if self._questions.count() < len(self.questions):
                self._seed_questions()
            self._ready = True
            trace.record(
                "seekdb",
                "ready",
                {
                    "path": str(SEEKDB_DIR),
                    "materials": self._materials.count(),
                    "questions": self._questions.count(),
                    "attempts": self._attempts.count(),
                },
            )

    @staticmethod
    def _collection(client, name: str, schema: Schema):
        if client.has_collection(name):
            return client.get_collection(name)
        return client.create_collection(name=name, schema=schema)

    def _seed_materials(self) -> None:
        with _LOCK:
            self._materials.upsert(
                ids=[m["id"] for m in self.materials],
                documents=[f"{m['title']}。{m['content']}" for m in self.materials],
                metadatas=[
                    {
                        "course_id": self.course["id"],
                        "kp_id": m["kp_id"],
                        "title": m["title"],
                        "source": m["source"],
                        "section": m["section"],
                        "kind": m["kind"],
                    }
                    for m in self.materials
                ],
            )
            self._materials.refresh_index()

    def _seed_questions(self) -> None:
        with _LOCK:
            self._questions.upsert(
                ids=[q["id"] for q in self.questions],
                documents=[f"{q['stem']} {' '.join(q['options'])}" for q in self.questions],
                metadatas=[
                    {
                        "course_id": self.course["id"],
                        "kp_id": q["kp_id"],
                        "difficulty": int(q["difficulty"]),
                        "answer": q["answer"],
                    }
                    for q in self.questions
                ],
            )
            self._questions.refresh_index()

    # ------------------------------------------------------------- retrieval
    def search_materials(
        self,
        query: str,
        *,
        kp_ids: list[str] | None = None,
        mastery: dict[str, int] | None = None,
        top_k: int = 3,
    ) -> list[dict[str, Any]]:
        self.ensure_ready()
        where = None
        if kp_ids:
            clause = {"kp_id": kp_ids[0]} if len(kp_ids) == 1 else {"kp_id": {"$in": kp_ids}}
            where = clause

        hits: list[dict[str, Any]] = []
        mode = "hybrid"
        try:
            with _LOCK:
                res = self._materials.hybrid_search(
                    query={"where_document": {"$contains": query}, "where": where, "n_results": 8},
                    knn={"query_texts": [query], "where": where, "n_results": 8},
                    rank={"rrf": {"rank_window_size": 20}},
                    n_results=8,
                    include=["documents", "metadatas"],
                )
            ids = res["ids"][0] if res.get("ids") else []
            metas = res["metadatas"][0] if res.get("metadatas") else []
            for rank, (mid, meta) in enumerate(zip(ids, metas)):
                hits.append(self._material_hit(mid, meta, rank, mastery))
        except Exception:  # 全文 MATCH 对自然语言查询可能过严，降级为向量检索
            mode = "vector"
            ids, metas = [], []

        if not hits:
            with _LOCK:
                res = self._materials.query(
                    query_texts=[query],
                    n_results=8,
                    where=where,
                    include=["metadatas", "distances"],
                )
            ids = res["ids"][0] if res.get("ids") else []
            metas = res["metadatas"][0] if res.get("metadatas") else []
            for rank, (mid, meta) in enumerate(zip(ids, metas)):
                hits.append(self._material_hit(mid, meta, rank, mastery))

        hits.sort(key=lambda h: h["score"], reverse=True)
        out = hits[:top_k]
        trace.record(
            "seekdb",
            "search_materials",
            {
                "query": query,
                "mode": mode,
                "kp_filter": kp_ids,
                "returned": [
                    {"id": h["id"], "score": round(h["score"], 4), "kp": h["kp_id"]} for h in out
                ],
            },
        )
        return out

    def _material_hit(self, mid: str, meta: dict, rank: int, mastery: dict[str, int] | None) -> dict:
        material = self.material_by_id[mid]
        retrieval = 1.0 / (rank + 1)
        kp_id = meta.get("kp_id") or material["kp_id"]
        weak = 0.0
        if mastery is not None:
            weak = max(0.0, 100 - int(mastery.get(kp_id, 50))) / 100.0
        score = 0.72 * retrieval + 0.28 * weak
        return {
            "id": mid,
            "kp_id": kp_id,
            "title": material["title"],
            "content": material["content"],
            "source": material["source"],
            "section": material["section"],
            "kind": material["kind"],
            "score": score,
            "score_parts": {
                "retrieval": round(retrieval, 4),
                "weakness": round(weak, 4),
            },
        }

    def find_similar_mistakes(
        self, learner_id: str, course_id: str, query: str, limit: int = 3
    ) -> list[dict[str, Any]]:
        self.ensure_ready()
        try:
            with _LOCK:
                self._attempts.refresh_index()
                res = self._attempts.query(
                    query_texts=[query],
                    n_results=max(limit * 3, 6),
                    where={"learner_id": learner_id},
                    include=["metadatas", "distances", "documents"],
                )
        except Exception:
            return []
        out = []
        for i, aid in enumerate(res["ids"][0]):
            meta = res["metadatas"][0][i]
            if meta.get("correct"):
                continue
            out.append(
                {
                    "attempt_id": aid,
                    "question_id": meta.get("question_id"),
                    "kp_id": meta.get("kp_id"),
                    "created_at": meta.get("created_at"),
                    "distance": round(float(res["distances"][0][i]), 4),
                }
            )
            if len(out) >= limit:
                break
        return out

    # -------------------------------------------------------------- attempts
    def record_attempt(
        self,
        *,
        learner_id: str,
        course_id: str,
        question: dict[str, Any],
        selected: str,
        correct: bool,
    ) -> str:
        self.ensure_ready()
        attempt_id = f"att-{uuid.uuid4().hex[:10]}"
        now = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        with _LOCK:
            self._attempts.upsert(
                ids=[attempt_id],
                documents=[f"{question['stem']} 我的选择：{selected}"],
                metadatas=[
                    {
                        "learner_id": learner_id,
                        "course_id": course_id,
                        "question_id": question["id"],
                        "kp_id": question["kp_id"],
                        "correct": bool(correct),
                        "selected": selected,
                        "created_at": now,
                    }
                ],
            )
        trace.record(
            "seekdb",
            "record_attempt",
            {
                "attempt_id": attempt_id,
                "question_id": question["id"],
                "kp_id": question["kp_id"],
                "correct": correct,
            },
        )
        return attempt_id

    def list_attempts(self, learner_id: str, course_id: str, limit: int = 100) -> list[dict]:
        self.ensure_ready()
        with _LOCK:
            res = _retry(
                lambda: self._attempts.get(
                    where={
                        "$and": [
                            {"learner_id": learner_id},
                            {"course_id": course_id},
                        ]
                    },
                    limit=limit,
                    include=["metadatas"],
                ),
                "attempts.get",
            )
        metas = res.get("metadatas") or []
        return sorted(metas, key=lambda m: m.get("created_at", ""), reverse=True)

    # -------------------------------------------------------------- progress
    def get_mastery(self, learner_id: str, course_id: str) -> dict[str, dict[str, Any]]:
        self.ensure_ready()
        with _LOCK:
            res = _retry(
                lambda: self._progress.get(
                    where={
                        "$and": [
                            {"learner_id": learner_id},
                            {"course_id": course_id},
                        ]
                    },
                    limit=50,
                    include=["metadatas"],
                ),
                "progress.get",
            )
        out: dict[str, dict[str, Any]] = {}
        for meta in res.get("metadatas") or []:
            out[meta["kp_id"]] = {
                "kp_id": meta["kp_id"],
                "mastery": int(meta.get("mastery", 50)),
                "answered": int(meta.get("answered", 0)),
                "correct": int(meta.get("correct", 0)),
                "streak": int(meta.get("streak", 0)),
                "last_correct": bool(meta.get("last_correct", False)),
                "updated_at": meta.get("updated_at", ""),
            }
        for kp in self.kps:
            out.setdefault(
                kp["id"],
                {
                    "kp_id": kp["id"],
                    "mastery": 50,
                    "answered": 0,
                    "correct": 0,
                    "streak": 0,
                    "last_correct": False,
                    "updated_at": "",
                },
            )
        return out

    def save_mastery(self, learner_id: str, course_id: str, state: dict[str, Any]) -> None:
        self.ensure_ready()
        kp_id = state["kp_id"]
        kp = self.kp_by_id[kp_id]
        with _LOCK:
            self._progress.upsert(
                ids=[f"{learner_id}:{course_id}:{kp_id}"],
                documents=[f"{kp['name']} 掌握度 {state['mastery']}，已答 {state['answered']} 题。"],
                metadatas=[
                    {
                        "learner_id": learner_id,
                        "course_id": course_id,
                        "kp_id": kp_id,
                        "kp_name": kp["name"],
                        "mastery": int(state["mastery"]),
                        "answered": int(state["answered"]),
                        "correct": int(state["correct"]),
                        "streak": int(state["streak"]),
                        "last_correct": bool(state["last_correct"]),
                        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    }
                ],
            )
        trace.record(
            "seekdb",
            "save_mastery",
            {"kp_id": kp_id, "mastery": state["mastery"], "answered": state["answered"]},
        )

    # ----------------------------------------------------------------- misc
    def questions_for(self, kp_id: str, limit: int = 6) -> list[dict[str, Any]]:
        qs = [q for q in self.questions if q["kp_id"] == kp_id]
        return qs[:limit]

    def stats(self) -> dict[str, Any]:
        self.ensure_ready()
        with _LOCK:
            return {
                "course_id": self.course["id"],
                "knowledge_points": len(self.kps),
                "materials": self._materials.count(),
                "questions": self._questions.count(),
                "attempts": self._attempts.count(),
                "progress_rows": self._progress.count(),
                "db_path": str(SEEKDB_DIR),
            }


_store: KnowledgeStore | None = None


def get_store() -> KnowledgeStore:
    global _store
    if _store is None:
        _store = KnowledgeStore()
        _store.ensure_ready()
    return _store

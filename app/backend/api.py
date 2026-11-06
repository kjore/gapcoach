"""FastAPI 入口：REST API + 静态前端。"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import coach, trace
from .config import QODER_ROOT
from .memory import get_memory
from .store import get_store

app = FastAPI(title="知隙 GapCoach", version="0.1.0", description="基于 seekdb + PowerContext 的学习教练")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = QODER_ROOT / "app" / "frontend"


@app.middleware("http")
async def no_store_for_ui(request, call_next):
    """Keep local edits visible during the build; assets are tiny."""
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/assets"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


class SessionIn(BaseModel):
    name: str = Field(default="demo", max_length=40)
    course_id: str = "db-intro"


class AnswerIn(BaseModel):
    learner_id: str
    course_id: str = "db-intro"
    question_id: str
    selected: str


class DiagnosticAnswer(BaseModel):
    question_id: str
    selected: str


class DiagnosticIn(BaseModel):
    learner_id: str
    course_id: str = "db-intro"
    answers: list[DiagnosticAnswer]


def learner_id_for(name: str) -> str:
    raw = (name or "demo").strip().lower()
    ascii_slug = re.sub(r"[^a-z0-9_-]+", "", raw)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:8]
    return f"{ascii_slug or 'learner'}-{digest}"


# ----------------------------------------------------------------- endpoints
@app.get("/api/health")
def health() -> dict[str, Any]:
    store = get_store()
    memory = get_memory()
    return {
        "status": "ok",
        "name": "知隙 GapCoach",
        "seekdb": store.stats(),
        "powercontext": memory.health(),
        "trace_size": len(trace.recent(200)),
    }


@app.get("/api/courses")
def courses() -> dict[str, Any]:
    store = get_store()
    return {
        "courses": [
            {
                **store.course,
                "knowledge_points": store.kps,
                "question_count": len(store.questions),
                "material_count": len(store.materials),
            }
        ]
    }


@app.post("/api/session")
def create_session(body: SessionIn) -> dict[str, Any]:
    store = get_store()
    if body.course_id != store.course["id"]:
        raise HTTPException(404, "course not found")
    learner_id = learner_id_for(body.name)
    data = coach.start_session(store, get_memory(), learner_id, body.course_id)
    data["display_name"] = body.name.strip() or "同学"
    return data


@app.get("/api/diagnostic")
def diagnostic(course_id: str = "db-intro") -> dict[str, Any]:
    store = get_store()
    if course_id != store.course["id"]:
        raise HTTPException(404, "course not found")
    questions = coach.pick_diagnostic(store)
    trace.record("gapcoach", "diagnostic_generated", {"count": len(questions), "course_id": course_id})
    return {"course_id": course_id, "count": len(questions), "questions": questions}


@app.post("/api/diagnostic/submit")
def diagnostic_submit(body: DiagnosticIn) -> dict[str, Any]:
    store = get_store()
    memory = get_memory()
    if not body.answers:
        raise HTTPException(400, "answers required")
    return coach.submit_diagnostic(
        store,
        memory,
        learner_id=body.learner_id,
        course_id=body.course_id,
        answers=[a.model_dump() for a in body.answers],
    )


@app.get("/api/plan")
def plan(learner_id: str, course_id: str = "db-intro") -> dict[str, Any]:
    store = get_store()
    memory = get_memory()
    scope_id = memory.ensure_scope(learner_id, course_id)
    return coach.build_plan(store, memory, learner_id=learner_id, course_id=course_id, scope_id=scope_id)


@app.post("/api/answer")
def answer(body: AnswerIn) -> dict[str, Any]:
    store = get_store()
    try:
        return coach.grade_answer(
            store,
            get_memory(),
            learner_id=body.learner_id,
            course_id=body.course_id,
            question_id=body.question_id,
            selected=body.selected,
        )
    except KeyError:
        raise HTTPException(404, "question not found") from None


@app.get("/api/progress")
def progress(learner_id: str, course_id: str = "db-intro") -> dict[str, Any]:
    return coach.progress_view(get_store(), get_memory(), learner_id, course_id)


@app.get("/api/evidence")
def evidence(
    query: str = Query(..., min_length=1, max_length=120),
    kp_id: str | None = None,
    top_k: int = 3,
    learner_id: str | None = None,
    course_id: str = "db-intro",
) -> dict[str, Any]:
    store = get_store()
    mastery = None
    if learner_id:
        mastery = {kp_id: row["mastery"] for kp_id, row in store.get_mastery(learner_id, course_id).items()}
    hits = store.search_materials(
        query,
        kp_ids=[kp_id] if kp_id else None,
        mastery=mastery,
        top_k=top_k,
    )
    return {
        "query": query,
        "channel": "seekdb hybrid (IK fulltext + vector + scalar filter)",
        "personalized": bool(mastery),
        "hits": hits,
    }


@app.get("/api/trace")
def trace_view(limit: int = 30) -> dict[str, Any]:
    return {"items": trace.recent(limit)}


# ---------------------------------------------------------------- static app
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

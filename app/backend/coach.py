"""学习教练核心逻辑：诊断、掌握度、复习计划、答题反馈。"""

from __future__ import annotations

import time
from typing import Any

from . import trace
from .memory import MemoryClient
from .store import KnowledgeStore

DIAGNOSTIC_PER_KP = 2
WEAK_THRESHOLD = 60
RESOLVE_THRESHOLD = 85
RESOLVE_STREAK = 3


# --------------------------------------------------------------------- utils
def sanitize_question(question: dict[str, Any], kp_name: str | None = None) -> dict[str, Any]:
    return {
        "id": question["id"],
        "kp_id": question["kp_id"],
        "kp_name": kp_name or "",
        "difficulty": question["difficulty"],
        "stem": question["stem"],
        "options": question["options"],
    }


def clamp(value: int) -> int:
    return max(0, min(100, int(value)))


def apply_mastery(state: dict[str, Any], correct: bool, *, correct_delta: int = 10, wrong_delta: int = 15) -> dict:
    before = int(state.get("mastery", 50))
    streak = int(state.get("streak", 0))
    if correct:
        streak += 1
        delta = correct_delta + (5 if streak >= 2 else 0)
    else:
        streak = 0
        delta = -wrong_delta
    after = clamp(before + delta)
    return {
        "kp_id": state["kp_id"],
        "mastery_before": before,
        "mastery_after": after,
        "delta": after - before,
        "answered": int(state.get("answered", 0)) + 1,
        "correct": int(state.get("correct", 0)) + (1 if correct else 0),
        "streak": streak,
        "last_correct": correct,
    }


def pick_diagnostic(store: KnowledgeStore, per_kp: int = DIAGNOSTIC_PER_KP) -> list[dict]:
    picked: list[dict] = []
    for kp in store.kps:
        qs = sorted(
            [q for q in store.questions if q["kp_id"] == kp["id"]],
            key=lambda q: (q["difficulty"], q["id"]),
        )
        chosen: list[dict] = []
        for target in range(1, per_kp + 1):
            pool = [q for q in qs if q["id"] not in {c["id"] for c in chosen}]
            exact = [q for q in pool if q["difficulty"] == target]
            candidate = (exact or pool or [None])[0]
            if candidate:
                chosen.append(candidate)
        picked.extend(chosen[:per_kp])
    order = {kp["id"]: i for i, kp in enumerate(store.kps)}
    picked.sort(key=lambda q: (order[q["kp_id"]], q["difficulty"]))
    return [sanitize_question(q, store.kp_by_id[q["kp_id"]]["name"]) for q in picked]


def weak_points(mastery: dict[str, dict]) -> list[dict]:
    """只把“已测且低于阈值”的知识点算作薄弱点；未测保持 neutral。"""
    rows = []
    for kp_id, state in mastery.items():
        if int(state["answered"]) > 0 and int(state["mastery"]) < WEAK_THRESHOLD:
            rows.append(state)
    rows.sort(key=lambda s: (s["mastery"], -s["answered"]))
    return rows


def memory_feed(memory: MemoryClient, scope_id: str | None, limit: int = 10) -> list[dict]:
    """跨会话记忆视图：结构化计划 + 会话摘要 + 语义检索结果，去重后返回。"""
    if not scope_id:
        return []
    items: list[dict] = []
    for kind in ("plan:current", "session:summary"):
        items.extend(memory.list(scope_id, kind, limit=1))
    for hit in memory.search(scope_id, "掌握度 薄弱点 进步", limit=8):
        mem = hit.get("memory") or {}
        items.append({**mem, "score": round(float(hit.get("score", 0)), 4)})
    seen = set()
    out = []
    for item in items:
        artifact = item.get("artifact") or {}
        key = artifact.get("artifact_id") or (item.get("kind"), item.get("text"))
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "kind": item.get("kind"),
                "text": item.get("text"),
                "artifact": artifact or None,
                "score": item.get("score"),
            }
        )
    return out[:limit]


# ------------------------------------------------------------------- session
def start_session(store: KnowledgeStore, memory: MemoryClient, learner_id: str, course_id: str) -> dict:
    scope_id = memory.ensure_scope(learner_id, course_id)
    mastery = store.get_mastery(learner_id, course_id)
    feed = memory_feed(memory, scope_id, limit=6)
    plans = [m for m in feed if m.get("kind") == "plan:current"]
    attempts = store.list_attempts(learner_id, course_id, limit=10)
    last_plan = plans[0]["text"] if plans else None
    last_plan_at = plans[0].get("created_at") if plans else None

    weak = weak_points(mastery)
    return {
        "learner_id": learner_id,
        "course_id": course_id,
        "course": store.course,
        "scope_id": scope_id,
        "memory_online": scope_id is not None,
        "mastery": mastery,
        "weak_points": weak,
        "answered": sum(s["answered"] for s in mastery.values()),
        "recent_attempts": attempts,
        "memories": feed,
        "resume": {
            "has_history": bool(attempts),
            "last_plan": last_plan,
            "last_plan_at": last_plan_at,
            "message": (
                f"欢迎回来。上次留下 {len(weak)} 个薄弱知识点，计划已从 PowerContext 恢复。"
                if attempts
                else "第一次见面。先做一次 10 题诊断，我会建立你的学习记忆。"
            ),
        },
    }


# ---------------------------------------------------------------- diagnostic
def submit_diagnostic(
    store: KnowledgeStore,
    memory: MemoryClient,
    *,
    learner_id: str,
    course_id: str,
    answers: list[dict[str, str]],
) -> dict:
    scope_id = memory.ensure_scope(learner_id, course_id)
    mastery = store.get_mastery(learner_id, course_id)
    per_kp: dict[str, list[bool]] = {}

    for item in answers:
        qid = item.get("question_id")
        selected = (item.get("selected") or "").upper()[:1]
        question = store.question_by_id.get(qid)
        if not question:
            continue
        correct = selected == question["answer"].upper()
        store.record_attempt(
            learner_id=learner_id,
            course_id=course_id,
            question=question,
            selected=selected,
            correct=correct,
        )
        state = mastery[question["kp_id"]]
        update = apply_mastery(state, correct, correct_delta=12, wrong_delta=12)
        state.update(
            {
                "mastery": update["mastery_after"],
                "answered": update["answered"],
                "correct": update["correct"],
                "streak": update["streak"],
                "last_correct": correct,
            }
        )
        store.save_mastery(learner_id, course_id, state)
        per_kp.setdefault(question["kp_id"], []).append(correct)

    # 写入 PowerContext：薄弱点 + 本次诊断摘要
    memory_events: list[dict] = []
    for kp_id, results in per_kp.items():
        kp = store.kp_by_id[kp_id]
        state = mastery[kp_id]
        if int(state["mastery"]) < WEAK_THRESHOLD and not memory.has_active(
            scope_id, memory.weakness_kind(kp_id)
        ):
            detail = f"诊断 {len(results)} 题答对 {sum(results)} 题，当前掌握度 {state['mastery']}"
            record = memory.add_weakness(scope_id, kp_id, kp["name"], detail)
            if record:
                memory_events.append({"type": "weakness", "kp_id": kp_id, "artifact": record.get("artifact")})
        elif sum(results) == len(results):
            detail = f"诊断 {len(results)} 题全对，掌握度 {state['mastery']}"
            record = memory.add_strength(scope_id, kp_id, kp["name"], detail)
            if record:
                memory_events.append({"type": "strength", "kp_id": kp_id, "artifact": record.get("artifact")})

    plan = build_plan(store, memory, learner_id=learner_id, course_id=course_id, scope_id=scope_id)
    summary = (
        f"完成诊断：{len(answers)} 题，正确 {sum(1 for r in per_kp.values() for ok in r if ok)} 题。"
        f"当前最薄弱：「{plan['items'][0]['kp_name'] if plan['items'] else '无'}」。"
    )
    memory.session_summary(scope_id, summary)

    return {
        "scope_id": scope_id,
        "mastery": mastery,
        "weak_points": weak_points(mastery),
        "plan": plan,
        "memory_events": memory_events,
        "summary": summary,
    }


# ---------------------------------------------------------------------- plan
def select_practice_questions(store: KnowledgeStore, kp_id: str, mastery: int, exclude: set[str], limit: int = 2) -> list[dict]:
    qs = [q for q in store.questions if q["kp_id"] == kp_id and q["id"] not in exclude]
    if mastery < WEAK_THRESHOLD:
        qs.sort(key=lambda q: (q["difficulty"], q["id"]))
    else:
        qs.sort(key=lambda q: (-q["difficulty"], q["id"]))
    return qs[:limit]


def build_plan(
    store: KnowledgeStore,
    memory: MemoryClient,
    *,
    learner_id: str,
    course_id: str,
    scope_id: str | None,
) -> dict:
    mastery = store.get_mastery(learner_id, course_id)
    ranked = sorted(store.kps, key=lambda kp: mastery[kp["id"]]["mastery"])
    weak = [
        kp
        for kp in ranked
        if mastery[kp["id"]]["answered"] > 0 and mastery[kp["id"]]["mastery"] < WEAK_THRESHOLD
    ]
    untested = [kp for kp in ranked if mastery[kp["id"]]["answered"] == 0]
    targets = weak[:3]
    for kp in untested + [k for k in ranked if k not in targets]:
        if len(targets) >= 3:
            break
        if kp not in targets:
            targets.append(kp)
    targets = targets[:3]

    attempts = store.list_attempts(learner_id, course_id, limit=60)
    correct_ids = {a["question_id"] for a in attempts if a.get("correct")}
    wrong_by_kp: dict[str, int] = {}
    for a in attempts:
        if not a.get("correct"):
            wrong_by_kp[a["kp_id"]] = wrong_by_kp.get(a["kp_id"], 0) + 1

    mastery_scalar = {kp_id: s["mastery"] for kp_id, s in mastery.items()}
    items = []
    for kp in targets:
        state = mastery[kp["id"]]
        query = f"{kp['name']} 核心概念 常见错误"
        materials = store.search_materials(query, kp_ids=[kp["id"]], mastery=mastery_scalar, top_k=2)
        questions = select_practice_questions(store, kp["id"], state["mastery"], correct_ids, limit=2)
        if not questions:
            questions = select_practice_questions(store, kp["id"], state["mastery"], set(), limit=2)
        reasons = []
        if state["mastery"] < WEAK_THRESHOLD:
            reasons.append(f"掌握度 {state['mastery']}，低于 {WEAK_THRESHOLD}")
        if wrong_by_kp.get(kp["id"]):
            reasons.append(f"最近答错 {wrong_by_kp[kp['id']]} 题")
        if not reasons:
            reasons.append("保持手感，挑战更高难度")
        items.append(
            {
                "kp_id": kp["id"],
                "kp_name": kp["name"],
                "mastery": state["mastery"],
                "reason": "；".join(reasons),
                "materials": materials,
                "questions": [
                    {
                        **sanitize_question(q, kp["name"]),
                        "recommended": True,
                    }
                    for q in questions
                ],
                "minutes": 8 + 2 * len(questions),
            }
        )

    total = sum(item["minutes"] for item in items)
    plan = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "learner_id": learner_id,
        "course_id": course_id,
        "total_minutes": total,
        "items": items,
        "note": "计划由 seekdb 混合检索 + PowerContext 记忆生成，答题后会动态更新。",
    }
    if items:
        summary = (
            f"{time.strftime('%m-%d %H:%M')} 生成复习计划：优先"
            + "、".join(f"「{i['kp_name']}」({i['mastery']})" for i in items)
            + f"，共 {len(items)} 组任务 / 约 {total} 分钟。"
        )
        memory.remember(scope_id, "plan:current", summary)
    return plan


# -------------------------------------------------------------------- answer
def grade_answer(
    store: KnowledgeStore,
    memory: MemoryClient,
    *,
    learner_id: str,
    course_id: str,
    question_id: str,
    selected: str,
) -> dict:
    question = store.question_by_id.get(question_id)
    if not question:
        raise KeyError(question_id)
    scope_id = memory.ensure_scope(learner_id, course_id)
    selected = (selected or "").upper()[:1]
    correct = selected == question["answer"].upper()

    similar = store.find_similar_mistakes(learner_id, course_id, question["stem"], limit=2)

    mastery = store.get_mastery(learner_id, course_id)
    state = mastery[question["kp_id"]]
    update = apply_mastery(state, correct)
    state.update(
        {
            "mastery": update["mastery_after"],
            "answered": update["answered"],
            "correct": update["correct"],
            "streak": update["streak"],
            "last_correct": correct,
        }
    )
    store.save_mastery(learner_id, course_id, state)
    store.record_attempt(
        learner_id=learner_id,
        course_id=course_id,
        question=question,
        selected=selected,
        correct=correct,
    )

    kp = store.kp_by_id[question["kp_id"]]
    evidence = store.search_materials(
        f"{question['stem']} {question['explanation']}",
        kp_ids=[question["kp_id"]],
        mastery={k: v["mastery"] for k, v in mastery.items()},
        top_k=2,
    )

    memory_events: list[dict] = []
    if correct:
        if int(state["mastery"]) >= RESOLVE_THRESHOLD and int(state["streak"]) >= RESOLVE_STREAK:
            if memory.resolve_weakness(scope_id, question["kp_id"]):
                memory_events.append({"type": "resolved", "kp_id": question["kp_id"]})
            record = memory.add_strength(
                scope_id,
                question["kp_id"],
                kp["name"],
                f"连续答对 {state['streak']} 题，掌握度升至 {state['mastery']}",
            )
            if record:
                memory_events.append({"type": "strength", "kp_id": question["kp_id"], "artifact": record.get("artifact")})
    else:
        prefix = "再次答错" if memory.has_active(scope_id, memory.weakness_kind(question["kp_id"])) else "练习题答错"
        record = memory.add_weakness(
            scope_id,
            question["kp_id"],
            kp["name"],
            f"{prefix}（选择 {selected}，正确答案 {question['answer']}），掌握度降至 {state['mastery']}",
        )
        if record:
            memory_events.append({"type": "weakness", "kp_id": question["kp_id"], "artifact": record.get("artifact")})

    next_q = select_practice_questions(store, question["kp_id"], state["mastery"], {question_id}, limit=1)

    return {
        "question_id": question_id,
        "correct": correct,
        "selected": selected,
        "answer": question["answer"],
        "explanation": question["explanation"],
        "kp_id": question["kp_id"],
        "kp_name": kp["name"],
        "mastery_before": state["mastery"] - (update["delta"]),
        "mastery_after": state["mastery"],
        "delta": update["delta"],
        "evidence": evidence,
        "similar_mistakes": similar,
        "memory_events": memory_events,
        "next_question": sanitize_question(next_q[0], kp["name"]) if next_q else None,
    }


def progress_view(store: KnowledgeStore, memory: MemoryClient, learner_id: str, course_id: str) -> dict:
    scope_id = memory.ensure_scope(learner_id, course_id)
    mastery = store.get_mastery(learner_id, course_id)
    attempts = store.list_attempts(learner_id, course_id, limit=100)
    feed = memory_feed(memory, scope_id, limit=10)
    return {
        "learner_id": learner_id,
        "scope_id": scope_id,
        "course": store.course,
        "knowledge_points": [
            {
                **kp,
                **mastery[kp["id"]],
                "status": (
                    "untested"
                    if mastery[kp["id"]]["answered"] == 0
                    else "weak"
                    if mastery[kp["id"]]["mastery"] < WEAK_THRESHOLD
                    else "solid"
                    if mastery[kp["id"]]["mastery"] >= RESOLVE_THRESHOLD
                    else "learning"
                ),
            }
            for kp in store.kps
        ],
        "attempts": {
            "total": len(attempts),
            "correct": sum(1 for a in attempts if a.get("correct")),
            "recent": [
                {
                    **a,
                    "stem": store.question_by_id.get(a.get("question_id"), {}).get("stem", ""),
                    "kp_name": store.kp_by_id.get(a.get("kp_id"), {}).get("name", ""),
                    "answer": store.question_by_id.get(a.get("question_id"), {}).get("answer", ""),
                }
                for a in attempts[:10]
            ],
        },
        "memories": feed,
        "seekdb": store.stats(),
        "powercontext": memory.health(),
    }

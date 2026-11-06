#!/usr/bin/env python3
"""End-to-end verification for 知隙 GapCoach.

Prereq: PowerContext and the GapCoach app are running (./scripts/start.sh).
The script creates a fresh learner, drives the real HTTP API, and asserts that
seekdb retrieval and PowerContext memory are both doing real work. Evidence is
written to data/verification/verify-<timestamp>.json.

Usage:
    .venv/bin/python scripts/verify.py
    .venv/bin/python scripts/verify.py --base-url http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
SEED = json.loads((ROOT / "app" / "backend" / "seed" / "content.json").read_text(encoding="utf-8"))
QUESTIONS = {q["id"]: q for q in SEED["questions"]}
KP_NAMES = {kp["id"]: kp["name"] for kp in SEED["knowledge_points"]}

GOOD_KPS = {"kp-transaction", "kp-index", "kp-sql"}
WEAK_KPS = {"kp-concurrency", "kp-distributed"}
LETTERS = "ABCD"


class Verifier:
    def __init__(self, base_url: str) -> None:
        self.client = httpx.Client(base_url=base_url, timeout=30.0)
        self.checks: list[dict] = []
        self.evidence: dict = {"started_at": datetime.now().isoformat(timespec="seconds")}

    def check(self, name: str, ok: bool, detail=None) -> None:
        self.checks.append({"name": name, "ok": bool(ok), "detail": detail})
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail and not ok else ""))
        if not ok:
            raise AssertionError(f"{name}: {detail}")

    def close(self) -> None:
        self.client.close()


def wrong_letter(question_id: str) -> str:
    answer = QUESTIONS[question_id]["answer"]
    return next(letter for letter in LETTERS if letter != answer)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--name", default="")
    args = parser.parse_args()

    stamp = datetime.now().strftime("%m%d-%H%M%S")
    name = args.name or f"verification-{stamp}"
    v = Verifier(args.base_url)
    report: dict = {"learner_name": name, "base_url": args.base_url}

    try:
        health = v.client.get("/api/health").json()
        report["health"] = health
        v.check(
            "seekdb 已加载课程材料与题库",
            health["seekdb"]["materials"] == len(SEED["materials"])
            and health["seekdb"]["questions"] == len(SEED["questions"]),
            health["seekdb"],
        )
        v.check("PowerContext 在线", health["powercontext"].get("online") is True, health["powercontext"])
        attempts_before = health["seekdb"]["attempts"]

        session = v.client.post("/api/session", json={"name": name}).json()
        report["session"] = {k: session.get(k) for k in ("learner_id", "scope_id", "answered", "weak_points")}
        v.check("为验收用户创建独立 Scope", bool(session.get("scope_id")), session.get("scope_id"))
        v.check("新用户从零开始", session.get("answered") == 0, session.get("answered"))
        learner_id = session["learner_id"]
        scope_id = session["scope_id"]

        quiz = v.client.get("/api/diagnostic").json()
        covered = {q["kp_id"] for q in quiz["questions"]}
        v.check(
            "诊断覆盖 5 个知识点、共 10 题",
            quiz["count"] == 10 and covered == set(KP_NAMES),
            {"count": quiz["count"], "covered": sorted(covered)},
        )

        answers = []
        for q in quiz["questions"]:
            selected = QUESTIONS[q["id"]]["answer"] if q["kp_id"] in GOOD_KPS else wrong_letter(q["id"])
            answers.append({"question_id": q["id"], "selected": selected})

        submitted = v.client.post(
            "/api/diagnostic/submit",
            json={"learner_id": learner_id, "course_id": "db-intro", "answers": answers},
        ).json()
        report["diagnostic"] = {
            "summary": submitted.get("summary"),
            "weak_points": submitted.get("weak_points"),
            "memory_events": submitted.get("memory_events"),
            "mastery": submitted.get("mastery"),
        }
        weak_ids = {w["kp_id"] for w in submitted["weak_points"]}
        v.check(
            "诊断识别出预期的 2 个薄弱点",
            weak_ids == WEAK_KPS and all(w["mastery"] == 26 for w in submitted["weak_points"]),
            submitted["weak_points"],
        )
        event_types = {(e["type"], e["kp_id"]) for e in submitted["memory_events"]}
        v.check(
            "PowerContext 写入薄弱点与优势记忆",
            {("weakness", kp) for kp in WEAK_KPS} <= event_types
            and any(t == "strength" for t, _ in event_types),
            sorted(event_types),
        )
        v.check(
            "每条记忆都有可追溯 artifact",
            all(e.get("artifact", {}).get("artifact_id") for e in submitted["memory_events"]),
            submitted["memory_events"],
        )

        plan = v.client.get("/api/plan", params={"learner_id": learner_id}).json()
        report["plan"] = plan
        first = plan["items"][0]
        v.check("计划优先安排最薄弱知识点", first["kp_id"] in WEAK_KPS, first["kp_id"])
        v.check(
            "计划由 seekdb 检索证据 + 练习题组成",
            bool(first["materials"]) and len(first["questions"]) == 2,
            {"materials": len(first["materials"]), "questions": len(first["questions"])},
        )
        v.check(
            "检索结果公开分数构成",
            all("score_parts" in m and "retrieval" in m["score_parts"] for m in first["materials"]),
            first["materials"][0],
        )

        practice_q = first["questions"][0]
        graded = v.client.post(
            "/api/answer",
            json={
                "learner_id": learner_id,
                "course_id": "db-intro",
                "question_id": practice_q["id"],
                "selected": wrong_letter(practice_q["id"]),
            },
        ).json()
        report["practice"] = {
            "question_id": practice_q["id"],
            "correct": graded.get("correct"),
            "delta": graded.get("delta"),
            "mastery": [graded.get("mastery_before"), graded.get("mastery_after")],
            "evidence_ids": [e["id"] for e in graded.get("evidence", [])],
        }
        v.check("答错后判分与掌握度下降", graded["correct"] is False and graded["delta"] < 0, graded.get("delta"))
        v.check(
            "答题反馈带 seekdb 原文证据",
            bool(graded.get("evidence")),
            [e.get("id") for e in graded.get("evidence", [])],
        )

        progress = v.client.get("/api/progress", params={"learner_id": learner_id}).json()
        report["progress"] = {
            "attempts": progress["attempts"]["total"],
            "scope_id": progress["scope_id"],
            "memory_kinds": [m["kind"] for m in progress["memories"]],
            "seekdb": progress["seekdb"],
        }
        v.check("进度页读取同一 Scope", progress["scope_id"] == scope_id, progress["scope_id"])
        v.check(
            "答题记录与执行都落到 seekdb",
            progress["attempts"]["total"] == 11
            and health["seekdb"]["attempts"] + 11 == progress["seekdb"]["attempts"],
            {"learner_attempts": progress["attempts"]["total"], "global": progress["seekdb"]["attempts"]},
        )
        kinds = [m["kind"] for m in progress["memories"]]
        v.check("记忆时间线包含薄弱点与计划快照", any(k.startswith("weakness:") for k in kinds) and "plan:current" in kinds, kinds)

        resumed = v.client.post("/api/session", json={"name": name}).json()
        report["resume"] = resumed.get("resume")
        v.check(
            "重新进入会话时从 PowerContext 恢复",
            resumed["learner_id"] == learner_id
            and resumed["resume"]["has_history"] is True
            and bool(resumed["resume"]["last_plan"])
            and "欢迎回来" in resumed["resume"]["message"],
            resumed.get("resume"),
        )

        trace = v.client.get("/api/trace", params={"limit": 80}).json()["items"]
        kinds_seen = {(item["kind"], item["action"]) for item in trace}
        report["trace"] = sorted(f"{k}/{a}" for k, a in kinds_seen)
        v.check(
            "调用轨迹同时包含 seekdb 与 PowerContext",
            any(k == "seekdb" for k, _ in kinds_seen) and any(k == "powercontext" for k, _ in kinds_seen),
            report["trace"],
        )
        v.check(
            "轨迹包含混合检索与记忆写入",
            ("seekdb", "search_materials") in kinds_seen
            and any(a in {"remember", "remember_failed"} for k, a in kinds_seen if k == "powercontext"),
            report["trace"],
        )

        v.check("全局答题记录单调增加", progress["seekdb"]["attempts"] >= attempts_before + 11, progress["seekdb"]["attempts"])

        report["result"] = "PASS"
        code = 0
    except Exception as exc:  # noqa: BLE001 - report and exit non-zero
        report["result"] = "FAIL"
        report["error"] = f"{type(exc).__name__}: {exc}"
        print(f"\nVERIFY: FAIL — {report['error']}")
        code = 1
    finally:
        report["checks"] = v.checks
        report["finished_at"] = datetime.now().isoformat(timespec="seconds")
        out_dir = ROOT / "data" / "verification"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"verify-{time.strftime('%Y%m%d-%H%M%S')}.json"
        out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n证据文件: {out_path}")
        if code == 0:
            print("VERIFY: PASS — 诊断 → 计划 → 答错 → 记忆 → 恢复，全链路可复现。")
        v.close()
    return code


if __name__ == "__main__":
    sys.exit(main())

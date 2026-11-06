import { memory } from "./memory.js";
import { searchMaterials } from "./retrieval.js";
import { storage } from "./storage.js";
import { localTs, minuteStamp } from "./time.js";

const DIAGNOSTIC_PER_KP = 2;
const WEAK_THRESHOLD = 60;
const RESOLVE_THRESHOLD = 85;
const RESOLVE_STREAK = 3;

const clamp = (v) => Math.max(0, Math.min(100, Math.trunc(v)));

function sanitizeQuestion(question, kpName = "") {
  return {
    id: question.id,
    kp_id: question.kp_id,
    kp_name: kpName,
    difficulty: question.difficulty,
    stem: question.stem,
    options: question.options,
  };
}

function applyMastery(state, correct, correctDelta = 10, wrongDelta = 15) {
  const before = Number(state.mastery ?? 50);
  let streak = Number(state.streak ?? 0);
  let delta;
  if (correct) {
    streak += 1;
    delta = correctDelta + (streak >= 2 ? 5 : 0);
  } else {
    streak = 0;
    delta = -wrongDelta;
  }
  const after = clamp(before + delta);
  return {
    kp_id: state.kp_id,
    mastery_before: before,
    mastery_after: after,
    delta: after - before,
    answered: Number(state.answered ?? 0) + 1,
    correct: Number(state.correct ?? 0) + (correct ? 1 : 0),
    streak,
    last_correct: correct,
  };
}

export function pickDiagnostic(content, perKp = DIAGNOSTIC_PER_KP) {
  const picked = [];
  for (const kp of content.kps) {
    const qs = content.questions
      .filter((q) => q.kp_id === kp.id)
      .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
    const chosen = [];
    for (let target = 1; target <= perKp; target += 1) {
      const chosenIds = new Set(chosen.map((c) => c.id));
      const pool = qs.filter((q) => !chosenIds.has(q.id));
      const exact = pool.filter((q) => q.difficulty === target);
      const candidate = (exact.length ? exact : pool)[0];
      if (candidate) chosen.push(candidate);
    }
    picked.push(...chosen.slice(0, perKp));
  }
  const order = Object.fromEntries(content.kps.map((kp, i) => [kp.id, i]));
  picked.sort((a, b) => order[a.kp_id] - order[b.kp_id] || a.difficulty - b.difficulty);
  return picked.map((q) => sanitizeQuestion(q, content.kpById[q.kp_id].name));
}

export function weakPoints(mastery) {
  return Object.values(mastery)
    .filter((s) => Number(s.answered) > 0 && Number(s.mastery) < WEAK_THRESHOLD)
    .sort((a, b) => a.mastery - b.mastery || b.answered - a.answered);
}

function memoryFeed(scopeId, limit = 10) {
  if (!scopeId) return [];
  const items = [];
  for (const kind of ["plan:current", "session:summary"]) {
    items.push(...memory.list(scopeId, kind, 1));
  }
  for (const hit of memory.search(scopeId, "掌握度 薄弱点 进步", 8)) {
    items.push({ ...hit.memory, score: hit.score });
  }
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const artifact = item.artifact || {};
    const key = artifact.artifact_id || `${item.kind}|${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: item.kind, text: item.text, artifact: artifact || null, score: item.score ?? null });
  }
  return out.slice(0, limit);
}

export function startSession(content, learnerId, courseId) {
  const scopeId = memory.ensureScope(learnerId, courseId);
  const mastery = storage.getMastery(learnerId, courseId, content.kps);
  const feed = memoryFeed(scopeId, 6);
  const plans = feed.filter((m) => m.kind === "plan:current");
  const attempts = storage.listAttempts(learnerId, courseId, 10);
  const weak = weakPoints(mastery);
  return {
    learner_id: learnerId,
    course_id: courseId,
    course: content.course,
    scope_id: scopeId,
    memory_online: Boolean(scopeId),
    mastery,
    weak_points: weak,
    answered: Object.values(mastery).reduce((acc, s) => acc + Number(s.answered), 0),
    recent_attempts: attempts,
    memories: feed,
    resume: {
      has_history: attempts.length > 0,
      last_plan: plans[0]?.text ?? null,
      last_plan_at: plans[0]?.created_at ?? null,
      message: attempts.length
        ? `欢迎回来。上次留下 ${weak.length} 个薄弱知识点，计划已从学习记忆恢复。`
        : "第一次见面。先做一次 10 题诊断，我会建立你的学习记忆。",
    },
  };
}

export function submitDiagnostic(content, { learnerId, courseId, answers }) {
  const scopeId = memory.ensureScope(learnerId, courseId);
  const mastery = storage.getMastery(learnerId, courseId, content.kps);
  const perKp = {};

  for (const item of answers) {
    const question = content.questionById[item.question_id];
    if (!question) continue;
    const selected = String(item.selected || "").toUpperCase().slice(0, 1);
    const correct = selected === question.answer.toUpperCase();
    storage.recordAttempt({ learnerId, courseId, question, selected, correct });
    const state = mastery[question.kp_id];
    const update = applyMastery(state, correct, 12, 12);
    Object.assign(state, {
      mastery: update.mastery_after,
      answered: update.answered,
      correct: update.correct,
      streak: update.streak,
      last_correct: correct,
    });
    storage.saveMastery(learnerId, courseId, content.kpById[question.kp_id].name, state);
    (perKp[question.kp_id] = perKp[question.kp_id] || []).push(correct);
  }

  const memoryEvents = [];
  for (const [kpId, results] of Object.entries(perKp)) {
    const kp = content.kpById[kpId];
    const state = mastery[kpId];
    if (Number(state.mastery) < WEAK_THRESHOLD && !memory.hasActive(scopeId, memory.weaknessKind(kpId))) {
      const detail = `诊断 ${results.length} 题答对 ${results.filter(Boolean).length} 题，当前掌握度 ${state.mastery}`;
      const rec = memory.addWeakness(scopeId, kpId, kp.name, detail);
      if (rec) memoryEvents.push({ type: "weakness", kp_id: kpId, artifact: rec.artifact });
    } else if (results.every(Boolean)) {
      const detail = `诊断 ${results.length} 题全对，掌握度 ${state.mastery}`;
      const rec = memory.addStrength(scopeId, kpId, kp.name, detail);
      if (rec) memoryEvents.push({ type: "strength", kp_id: kpId, artifact: rec.artifact });
    }
  }

  const plan = buildPlan(content, { learnerId, courseId, scopeId });
  const correctCount = Object.values(perKp).flat().filter(Boolean).length;
  const summary =
    `完成诊断：${answers.length} 题，正确 ${correctCount} 题。` +
    `当前最薄弱：「${plan.items[0]?.kp_name ?? "无"}」。`;
  memory.sessionSummary(scopeId, summary);

  return {
    scope_id: scopeId,
    mastery,
    weak_points: weakPoints(mastery),
    plan,
    memory_events: memoryEvents,
    summary,
  };
}

export function selectPracticeQuestions(content, kpId, mastery, exclude, limit = 2) {
  const qs = content.questions.filter((q) => q.kp_id === kpId && !exclude.has(q.id));
  qs.sort(
    mastery < WEAK_THRESHOLD
      ? (a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id)
      : (a, b) => b.difficulty - a.difficulty || a.id.localeCompare(b.id)
  );
  return qs.slice(0, limit);
}

export function buildPlan(content, { learnerId, courseId, scopeId }) {
  const mastery = storage.getMastery(learnerId, courseId, content.kps);
  const ranked = [...content.kps].sort((a, b) => mastery[a.id].mastery - mastery[b.id].mastery);
  const weak = ranked.filter((kp) => mastery[kp.id].answered > 0 && mastery[kp.id].mastery < WEAK_THRESHOLD);
  const untested = ranked.filter((kp) => mastery[kp.id].answered === 0);
  const targets = weak.slice(0, 3);
  for (const kp of [...untested, ...ranked]) {
    if (targets.length >= 3) break;
    if (!targets.includes(kp)) targets.push(kp);
  }

  const attempts = storage.listAttempts(learnerId, courseId, 60);
  const correctIds = new Set(attempts.filter((a) => a.correct).map((a) => a.question_id));
  const wrongByKp = {};
  for (const a of attempts) if (!a.correct) wrongByKp[a.kp_id] = (wrongByKp[a.kp_id] || 0) + 1;

  const masteryScalar = Object.fromEntries(Object.entries(mastery).map(([k, s]) => [k, s.mastery]));
  const items = targets.map((kp) => {
    const state = mastery[kp.id];
    const materials = searchMaterials(content, `${kp.name} 核心概念 常见错误`, {
      kpIds: [kp.id],
      mastery: masteryScalar,
      topK: 2,
    });
    let questions = selectPracticeQuestions(content, kp.id, state.mastery, correctIds, 2);
    if (!questions.length) questions = selectPracticeQuestions(content, kp.id, state.mastery, new Set(), 2);
    const reasons = [];
    if (state.mastery < WEAK_THRESHOLD) reasons.push(`掌握度 ${state.mastery}，低于 ${WEAK_THRESHOLD}`);
    if (wrongByKp[kp.id]) reasons.push(`最近答错 ${wrongByKp[kp.id]} 题`);
    if (!reasons.length) reasons.push("保持手感，挑战更高难度");
    return {
      kp_id: kp.id,
      kp_name: kp.name,
      mastery: state.mastery,
      reason: reasons.join("；"),
      materials,
      questions: questions.map((q) => ({ ...sanitizeQuestion(q, kp.name), recommended: true })),
      minutes: 8 + 2 * questions.length,
    };
  });

  const total = items.reduce((acc, i) => acc + i.minutes, 0);
  const plan = {
    generated_at: localTs(),
    learner_id: learnerId,
    course_id: courseId,
    total_minutes: total,
    items,
    note: "计划由本地混合检索 + 学习记忆生成，答题后会动态更新。",
  };
  if (items.length) {
    const summary =
      `${minuteStamp()} 生成复习计划：优先` +
      items.map((i) => `「${i.kp_name}」(${i.mastery})`).join("、") +
      `，共 ${items.length} 组任务 / 约 ${total} 分钟。`;
    memory.remember(scopeId, "plan:current", summary);
  }
  return plan;
}

export function gradeAnswer(content, { learnerId, courseId, questionId, selected }) {
  const question = content.questionById[questionId];
  if (!question) {
    const err = new Error("question not found");
    err.status = 404;
    throw err;
  }
  const scopeId = memory.ensureScope(learnerId, courseId);
  selected = String(selected || "").toUpperCase().slice(0, 1);
  const correct = selected === question.answer.toUpperCase();

  const similar = storage.findSimilarMistakes(learnerId, courseId, question.stem, 2);

  const mastery = storage.getMastery(learnerId, courseId, content.kps);
  const state = mastery[question.kp_id];
  const update = applyMastery(state, correct);
  Object.assign(state, {
    mastery: update.mastery_after,
    answered: update.answered,
    correct: update.correct,
    streak: update.streak,
    last_correct: correct,
  });
  storage.saveMastery(learnerId, courseId, content.kpById[question.kp_id].name, state);
  storage.recordAttempt({ learnerId, courseId, question, selected, correct });

  const kp = content.kpById[question.kp_id];
  const evidence = searchMaterials(content, `${question.stem} ${question.explanation}`, {
    kpIds: [question.kp_id],
    mastery: Object.fromEntries(Object.entries(mastery).map(([k, v]) => [k, v.mastery])),
    topK: 2,
  });

  const memoryEvents = [];
  if (correct) {
    if (Number(state.mastery) >= RESOLVE_THRESHOLD && Number(state.streak) >= RESOLVE_STREAK) {
      if (memory.resolveWeakness(scopeId, question.kp_id)) {
        memoryEvents.push({ type: "resolved", kp_id: question.kp_id });
      }
      const rec = memory.addStrength(
        scopeId,
        question.kp_id,
        kp.name,
        `连续答对 ${state.streak} 题，掌握度升至 ${state.mastery}`
      );
      if (rec) memoryEvents.push({ type: "strength", kp_id: question.kp_id, artifact: rec.artifact });
    }
  } else {
    const prefix = memory.hasActive(scopeId, memory.weaknessKind(question.kp_id)) ? "再次答错" : "练习题答错";
    const rec = memory.addWeakness(
      scopeId,
      question.kp_id,
      kp.name,
      `${prefix}（选择 ${selected}，正确答案 ${question.answer}），掌握度降至 ${state.mastery}`
    );
    if (rec) memoryEvents.push({ type: "weakness", kp_id: question.kp_id, artifact: rec.artifact });
  }

  const nextQ = selectPracticeQuestions(content, question.kp_id, state.mastery, new Set([questionId]), 1);
  return {
    question_id: questionId,
    correct,
    selected,
    answer: question.answer,
    explanation: question.explanation,
    kp_id: question.kp_id,
    kp_name: kp.name,
    mastery_before: update.mastery_before,
    mastery_after: state.mastery,
    delta: update.delta,
    evidence,
    similar_mistakes: similar,
    memory_events: memoryEvents,
    next_question: nextQ.length ? sanitizeQuestion(nextQ[0], kp.name) : null,
  };
}

export function progressView(content, learnerId, courseId) {
  const scopeId = memory.ensureScope(learnerId, courseId);
  const mastery = storage.getMastery(learnerId, courseId, content.kps);
  const attempts = storage.listAttempts(learnerId, courseId, 100);
  return {
    learner_id: learnerId,
    scope_id: scopeId,
    course: content.course,
    knowledge_points: content.kps.map((kp) => ({
      ...kp,
      ...mastery[kp.id],
      status:
        mastery[kp.id].answered === 0
          ? "untested"
          : mastery[kp.id].mastery < WEAK_THRESHOLD
            ? "weak"
            : mastery[kp.id].mastery >= RESOLVE_THRESHOLD
              ? "solid"
              : "learning",
    })),
    attempts: {
      total: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      recent: attempts.slice(0, 10).map((a) => ({
        ...a,
        stem: content.questionById[a.question_id]?.stem ?? a.stem ?? "",
        kp_name: content.kpById[a.kp_id]?.name ?? "",
        answer: content.questionById[a.question_id]?.answer ?? "",
      })),
    },
    memories: memoryFeed(scopeId, 10),
    store: storage.stats(content),
    memory: memory.health(),
  };
}

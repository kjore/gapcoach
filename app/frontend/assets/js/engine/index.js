import {
  buildPlan,
  gradeAnswer,
  pickDiagnostic,
  progressView,
  startSession,
  submitDiagnostic,
} from "./coach.js";
import { loadContent } from "./data.js";
import { hash32 } from "./embed.js";
import { memory } from "./memory.js";
import { searchMaterials } from "./retrieval.js";
import { storage } from "./storage.js";
import { record, recent, size } from "./trace.js";

export function learnerIdFor(name) {
  const raw = String(name || "demo").trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9_-]+/g, "");
  const digest = hash32(raw).toString(16).padStart(8, "0");
  return `${slug || "learner"}-${digest}`;
}

async function ready() {
  return loadContent();
}

export const engine = {
  async health() {
    const content = await ready();
    return {
      status: "ok",
      name: "知隙 GapCoach",
      engine: storage.stats(content),
      memory: memory.health(),
      trace_size: size(),
    };
  },

  async courses() {
    const content = await ready();
    return {
      courses: [
        {
          ...content.course,
          knowledge_points: content.kps,
          question_count: content.questions.length,
          material_count: content.materials.length,
        },
      ],
    };
  },

  async session(name, courseId = "db-intro") {
    const content = await ready();
    if (courseId !== content.course.id) throw new Error("course not found");
    const learnerId = learnerIdFor(name);
    const data = startSession(content, learnerId, courseId);
    data.display_name = String(name).trim() || "同学";
    return data;
  },

  async diagnostic(courseId = "db-intro") {
    const content = await ready();
    if (courseId !== content.course.id) throw new Error("course not found");
    const questions = pickDiagnostic(content);
    record("gapcoach", "diagnostic_generated", { count: questions.length, course_id: courseId });
    return { course_id: courseId, count: questions.length, questions };
  },

  async submitDiagnostic(learnerId, answers, courseId = "db-intro") {
    const content = await ready();
    if (!answers || !answers.length) throw new Error("answers required");
    return submitDiagnostic(content, { learnerId, courseId, answers });
  },

  async plan(learnerId, courseId = "db-intro") {
    const content = await ready();
    const scopeId = memory.ensureScope(learnerId, courseId);
    return buildPlan(content, { learnerId, courseId, scopeId });
  },

  async answer(learnerId, questionId, selected, courseId = "db-intro") {
    const content = await ready();
    return gradeAnswer(content, { learnerId, courseId, questionId, selected });
  },

  async progress(learnerId, courseId = "db-intro") {
    const content = await ready();
    return progressView(content, learnerId, courseId);
  },

  async evidence(query, kpId = null, topK = 3, learnerId = null) {
    const content = await ready();
    let mastery = null;
    if (learnerId) {
      const rows = storage.getMastery(learnerId, content.course.id, content.kps);
      mastery = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.mastery]));
    }
    const hits = searchMaterials(content, query, {
      kpIds: kpId ? [kpId] : null,
      mastery,
      topK,
    });
    return {
      query,
      channel: "browser hybrid (fulltext + vector RRF + weakness weighting)",
      personalized: Boolean(mastery),
      hits,
    };
  },

  async trace(limit = 30) {
    return { items: recent(limit) };
  },
};

import { engine } from "./engine/index.js";

export const api = {
  health: () => engine.health(),
  courses: () => engine.courses(),
  session: (name, courseId = "db-intro") => engine.session(name, courseId),
  diagnostic: (courseId = "db-intro") => engine.diagnostic(courseId),
  submitDiagnostic: (learnerId, answers, courseId = "db-intro") =>
    engine.submitDiagnostic(learnerId, answers, courseId),
  plan: (learnerId, courseId = "db-intro") => engine.plan(learnerId, courseId),
  answer: (learnerId, questionId, selected, courseId = "db-intro") =>
    engine.answer(learnerId, questionId, selected, courseId),
  progress: (learnerId, courseId = "db-intro") => engine.progress(learnerId, courseId),
  evidence: (query, kpId = null, topK = 3, learnerId = null) => engine.evidence(query, kpId, topK, learnerId),
  trace: (limit = 30) => engine.trace(limit),
};

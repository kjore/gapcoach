const BASE = "";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = data && (data.detail || data.message);
    const error = new Error(typeof detail === "string" ? detail : `请求失败（${res.status}）`);
    error.status = res.status;
    throw error;
  }
  return data;
}

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request("/api/health"),
  courses: () => request("/api/courses"),
  session: (name, courseId = "db-intro") => post("/api/session", { name, course_id: courseId }),
  diagnostic: (courseId = "db-intro") => request(`/api/diagnostic?course_id=${encodeURIComponent(courseId)}`),
  submitDiagnostic: (learnerId, answers, courseId = "db-intro") =>
    post("/api/diagnostic/submit", { learner_id: learnerId, course_id: courseId, answers }),
  plan: (learnerId, courseId = "db-intro") =>
    request(`/api/plan?learner_id=${encodeURIComponent(learnerId)}&course_id=${encodeURIComponent(courseId)}`),
  answer: (learnerId, questionId, selected, courseId = "db-intro") =>
    post("/api/answer", {
      learner_id: learnerId,
      course_id: courseId,
      question_id: questionId,
      selected,
    }),
  progress: (learnerId, courseId = "db-intro") =>
    request(`/api/progress?learner_id=${encodeURIComponent(learnerId)}&course_id=${encodeURIComponent(courseId)}`),
  evidence: (query, kpId = null, topK = 3, learnerId = null) => {
    const params = new URLSearchParams({ query, top_k: String(topK) });
    if (kpId) params.set("kp_id", kpId);
    if (learnerId) params.set("learner_id", learnerId);
    return request(`/api/evidence?${params.toString()}`);
  },
  trace: (limit = 30) => request(`/api/trace?limit=${limit}`),
};

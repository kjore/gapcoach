const KEY = "gapcoach.session.v1";

export const state = {
  learnerId: null,
  displayName: "",
  courseId: "db-intro",
  course: null,
  session: null,
  plan: null,
  diagnostic: null,
  report: null,
  practice: null,
  health: null,
};

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    state.learnerId = saved.learnerId || null;
    state.displayName = saved.displayName || "";
    state.courseId = saved.courseId || "db-intro";
    return Boolean(state.learnerId);
  } catch {
    return false;
  }
}

export function saveSession() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        learnerId: state.learnerId,
        displayName: state.displayName,
        courseId: state.courseId,
      })
    );
  } catch {
    /* localStorage 不可用时保持内存态 */
  }
}

export function resetSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state.learnerId = null;
  state.displayName = "";
  state.session = null;
  state.plan = null;
  state.report = null;
  state.practice = null;
}

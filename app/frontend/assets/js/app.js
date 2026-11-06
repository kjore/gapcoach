import { api } from "./api.js";
import { loadSession, resetSession, saveSession, state } from "./store.js";
import { h, skeleton, toast } from "./ui.js";
import renderHome from "./views/home.js";
import renderDiagnostic from "./views/diagnostic.js";
import renderReport from "./views/report.js";
import renderPlan from "./views/plan.js";
import renderPractice from "./views/practice.js";
import renderProgress from "./views/progress.js";
import renderTrace from "./views/trace.js";

const VIEWS = {
  home: renderHome,
  diagnostic: renderDiagnostic,
  report: renderReport,
  plan: renderPlan,
  practice: renderPractice,
  progress: renderProgress,
  trace: renderTrace,
};

const root = document.getElementById("view");
const nav = document.getElementById("nav");
const railLearner = document.getElementById("rail-learner");

let current = "home";
let token = 0;

function routeOf(hash) {
  const name = (hash || "").replace(/^#\/?/, "").split("?")[0].trim();
  return VIEWS[name] ? name : "home";
}

function paintNav() {
  nav.querySelectorAll("[data-route]").forEach((btn) => {
    const active = btn.dataset.route === current;
    btn.classList.toggle("is-active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

function paintTechline() {
  const health = state.health;
  if (!health) return;
  const retrievalOk = health.status === "ok" && (health.engine?.materials ?? 0) > 0;
  const memoryOk = Boolean(health.memory?.online);
  const dots = document.getElementById("techline")?.querySelectorAll(".dot") || [];
  dots.forEach((dot) => {
    if (dot.dataset.svc === "retrieval") {
      dot.classList.toggle("is-on", retrievalOk);
      dot.classList.toggle("is-off", !retrievalOk);
      dot.title = `混合检索 · ${health.engine?.materials ?? 0} 份材料 / ${health.engine?.questions ?? 0} 道题`;
    }
    if (dot.dataset.svc === "memory") {
      dot.classList.toggle("is-on", memoryOk);
      dot.classList.toggle("is-off", !memoryOk);
      dot.title = `学习记忆 · ${health.memory?.backend || "offline"}`;
    }
  });
  const line = document.getElementById("techline");
  if (line) line.dataset.ready = retrievalOk && memoryOk ? "on" : "off";
}

function paintRail(progress = null) {
  if (!state.learnerId) {
    railLearner.hidden = true;
    return;
  }
  railLearner.hidden = false;
  document.getElementById("rail-avatar").textContent = (state.displayName || "同学").slice(0, 1);
  document.getElementById("rail-name").textContent = state.displayName || "同学";
  const sub = document.getElementById("rail-sub");
  if (!progress) {
    sub.textContent = "掌握度加载中";
    return;
  }
  const rows = progress?.knowledge_points || [];
  const answered = progress?.attempts?.total ?? 0;
  const avg = rows.length ? rows.reduce((acc, row) => acc + Number(row.mastery || 0), 0) / rows.length : 0;
  const weakCount = rows.filter((row) => row.answered > 0 && row.mastery < 60).length;
  sub.textContent = answered
    ? `掌握度 ${Math.round(avg)}% · ${weakCount ? `${weakCount} 处待补` : "暂无薄弱"}`
    : "还没有作答记录";
}

async function refreshRail() {
  paintRail();
  if (!state.learnerId) return;
  try {
    const progress = await api.progress(state.learnerId, state.courseId);
    state.progress = progress;
    paintRail(progress);
  } catch {
    paintRail();
  }
}

async function pollHealth() {
  try {
    state.health = await api.health();
  } catch {
    state.health = null;
  }
  paintTechline();
}

async function ensureCourse() {
  if (state.course) return state.course;
  try {
    const data = await api.courses();
    const courses = data.courses || [];
    state.course = courses.find((c) => c.id === state.courseId) || courses[0] || null;
    if (state.course) state.courseId = state.course.id;
  } catch (error) {
    toast(error.message || "课程信息加载失败");
  }
  return state.course;
}

async function render() {
  const mine = ++token;
  if (typeof root.__cleanup === "function") {
    root.__cleanup();
    root.__cleanup = null;
  }
  current = routeOf(location.hash);
  paintNav();
  root.replaceChildren(skeleton(5));
  window.scrollTo(0, 0);

  try {
    await ensureCourse();
    if (mine !== token) return;
    const ctx = {
      navigate: go,
      reload: () => render(),
      refreshRail,
      reset: () => {
        resetSession();
        go("home");
      },
    };
    await VIEWS[current](root, ctx);
    if (mine !== token) return;
    refreshRail();
  } catch (error) {
    if (mine !== token) return;
    root.replaceChildren(
      h(
        "div",
        { class: "empty", style: { margin: "64px 0" } },
        h("h3", { text: "这一步没走通" }),
        h("p", { text: error.message || "请刷新页面重试。" }),
        h("button", { class: "btn btn--ghost", style: { marginTop: "16px" }, onclick: () => render() }, "重试")
      )
    );
  }
}

function go(route) {
  if (location.hash === `#/${route}`) render();
  else location.hash = `#/${route}`;
}

nav.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-route]");
  if (btn) go(btn.dataset.route);
});

window.addEventListener("hashchange", render);

loadSession();

// A shareable resume link may carry the learner id, e.g. /?learner=learner-1a2b3c4d
const params = new URLSearchParams(location.search);
if (params.get("learner")) {
  state.learnerId = params.get("learner");
  state.displayName = params.get("name") || "同学";
  state.courseId = params.get("course") || "db-intro";
  saveSession();
}

if (!state.learnerId && !location.hash) {
  location.replace("#/home");
}

paintNav();
pollHealth();
setInterval(pollHealth, 15000);
render();

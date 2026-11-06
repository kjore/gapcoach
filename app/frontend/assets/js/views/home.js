import { api } from "../api.js";
import { state, saveSession } from "../store.js";
import { h, toast } from "../ui.js";

export default async function renderHome(root, ctx) {
  let course = state.course;
  if (!course) {
    try {
      const data = await api.courses();
      course = data.courses[0];
      state.course = course;
      state.courseId = course.id;
    } catch {
      course = { name: "数据库系统概论", knowledge_points: [], question_count: 30 };
    }
  }

  const hasHistory = Boolean(state.learnerId);
  const nameInput = h("input", {
    class: "input",
    id: "learner-name",
    name: "name",
    placeholder: "例如：林同学",
    maxlength: "20",
    autocomplete: "nickname",
    value: state.displayName || "",
  });

  const startBtn = h("button", { class: "btn btn--accent", type: "submit" }, "开始 10 题诊断", h("span", { class: "arrow", text: "→" }));

  const form = h(
    "form",
    {
      class: "enroll",
      onsubmit: async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          toast("先留一个称呼，记忆才有归属。");
          return;
        }
        startBtn.disabled = true;
        startBtn.textContent = "正在建立学习档案…";
        try {
          const session = await api.session(name, course.id);
          state.learnerId = session.learner_id;
          state.displayName = name;
          state.session = session;
          saveSession();
          ctx.refreshRail();
          ctx.navigate(session.answered > 0 ? "plan" : "diagnostic");
        } catch (error) {
          toast(error.message || "本地引擎初始化失败，请刷新重试。");
          startBtn.disabled = false;
          startBtn.replaceChildren("开始 10 题诊断", h("span", { class: "arrow", text: "→" }));
        }
      },
    },
    h("div", { class: "field" }, h("label", { for: "learner-name", text: "怎么称呼你" }), nameInput),
    h(
      "div",
      { class: "course-chip" },
      h(
        "div",
        {},
        h("div", { class: "course-chip__name", text: course.name }),
        h("div", {
          class: "course-chip__meta",
          text: `${(course.knowledge_points || []).length} 个知识模块 · ${course.question_count || 30} 道题 · 约 3 分钟诊断`,
        })
      ),
      h("span", { class: "pill", text: "期末冲刺" })
    ),
    h("div", { style: { display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" } }, startBtn,
      hasHistory
        ? h(
            "button",
            {
              class: "btn btn--link",
              type: "button",
              onclick: () => ctx.navigate("plan"),
            },
            "继续上次学习 →"
          )
        : null
    )
  );

  root.replaceChildren(
    h(
      "section",
      { class: "home reveal" },
      h(
        "div",
        { class: "home__copy" },
        h("div", { class: "kicker", text: "GapCoach · 学习教练" }),
        h(
          "h1",
          { class: "display" },
          "找到你知识里的",
          h("br"),
          "那道",
          h("em", { text: "缝" }),
          "。"
        ),
        h(
          "p",
          { class: "lede" },
          "十道诊断题，不是给你一个分数，而是找出真正卡住你的知识点。之后每一次作答，都会让计划更贴近你。"
        ),
        form
      ),
      h(
        "figure",
        { class: "home__art" },
        h("img", {
          src: "/assets/img/hero-notebook.jpg",
          alt: "一本摊开的方格笔记本，页面上画着数据库表结构，一支铅笔搁在右侧",
          width: "1200",
          height: "660",
          fetchpriority: "high",
          decoding: "async",
        }),
        h(
          "figcaption",
          {},
          h("span", { text: "学习档案 · 第 01 页" }),
          h("span", { text: "诊断 → 证据 → 练习 → 记忆" })
        )
      ),
      h(
        "div",
        { class: "home__foot" },
        h("span", { text: "混合检索 · 全文 + 向量 RRF 融合 + 薄弱加权" }),
        h("span", { text: "学习记忆 · 跨会话记住你的薄弱点" }),
        h("span", { text: "点开即用 · 无需登录" })
      )
    )
  );
}

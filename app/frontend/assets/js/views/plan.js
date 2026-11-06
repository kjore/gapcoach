import { api } from "../api.js";
import { state } from "../store.js";
import { h, toast, todayLabel } from "../ui.js";

export default async function renderPlan(root, ctx) {
  if (!state.learnerId) {
    ctx.navigate("home");
    return;
  }

  root.replaceChildren(h("div", { class: "reveal" }, h("div", { class: "kicker", text: "今日计划" }), h("h1", { class: "display", text: "今天，只补三个地方。" }), h("div", { class: "section" }, h("div", { class: "skeleton" }, h("div", { class: "skeleton__bar", style: { width: "58%" } }), h("div", { class: "skeleton__bar", style: { width: "88%" } })))));

  let plan = state.plan;
  if (!plan) {
    try {
      plan = await api.plan(state.learnerId, state.courseId);
      state.plan = plan;
    } catch (error) {
      toast(error.message || "计划加载失败");
      root.replaceChildren(h("div", { class: "empty" }, h("h3", { text: "计划暂时生成不了" }), h("p", { text: "请刷新页面重试。" })));
      return;
    }
  }

  const resume = state.session?.resume;
  const weakCount = state.session?.weak_points?.length ?? 0;

  const items = plan.items || [];
  const itemEls = items.map((item, i) => {
    const isWeak = item.mastery < 60;
    return h(
      "article",
      { class: "plan-item reveal" },
      h("div", { class: "plan-item__no", text: String(i + 1).padStart(2, "0") }),
      h(
        "div",
        {},
        h(
          "div",
          { class: "plan-item__top" },
          h("div", { class: "plan-item__title", text: item.kp_name }),
          h("span", { class: `pill ${isWeak ? "pill--weak" : "pill--ok"}`, text: `掌握度 ${item.mastery}` })
        ),
        h("div", { class: "plan-item__why", text: item.reason }),
        item.materials?.[0]
          ? h(
              "div",
              { class: "cite" },
              h("div", { class: "cite__src", text: `${item.materials[0].source} · ${item.materials[0].section}` }),
              h("div", { class: "cite__title", text: item.materials[0].title }),
              h("div", { class: "cite__body", text: item.materials[0].content.slice(0, 110) + "…" }),
              h("div", {
                class: "cite__score",
                text: `检索命中 · 检索 ${item.materials[0].score_parts?.retrieval ?? "—"} / 薄弱加权 ${item.materials[0].score_parts?.weakness ?? "—"}`,
              })
            )
          : null,
        h(
          "div",
          { class: "plan-item__actions" },
          h(
            "button",
            {
              class: "btn btn--accent",
              onclick: () => {
                state.practice = { questions: item.questions, item, index: 0 };
                ctx.navigate("practice");
              },
            },
            `开始这一组 · ${item.questions.length} 题`,
            h("span", { class: "arrow", text: "→" })
          ),
          h("span", { class: "qcount", text: `约 ${item.minutes} 分钟 · ${item.materials.length} 段材料` })
        )
      )
    );
  });

  root.replaceChildren(
    h(
      "div",
      { class: "reveal stack--lg" },
      h("div", { class: "kicker", text: "今日计划 · " + todayLabel() }),
      h("h1", { class: "display", text: items.length ? "今天，只补三个地方。" : "今天先不用补。" }),
      h(
        "p",
        { class: "lede" },
        items.length
          ? "顺序不是随便排的：掌握度越低、最近错得越多，越靠前。每一条都附了检索到的原文证据。"
          : "当前没有低于阈值的模块，可以回到诊断重新测一轮，或直接进入自由练习。"
      ),

      resume?.last_plan
        ? h(
            "div",
            { class: "memory-note", style: { marginTop: "8px" } },
            h("b", { text: "来自上次的记忆" }),
            h("span", { text: resume.last_plan })
          )
        : null,

      h(
        "div",
        { class: "plan-head", style: { marginTop: "32px" } },
        h("div", { class: "plan-head__date", text: todayLabel() }),
        h(
          "div",
          { class: "plan-head__meta" },
          h("span", { text: `约 ${plan.total_minutes} 分钟` }),
          h("span", { text: `${items.length} 组任务` }),
          h("span", { text: weakCount ? `${weakCount} 个薄弱点` : "以巩固为主" })
        )
      ),

      items.length
        ? h("div", {}, itemEls)
        : h("div", { class: "empty", style: { marginTop: "24px" } }, h("h3", { text: "没有待补的模块" }), h("p", { text: "可以去诊断页面重新测一轮，看看状态有没有变化。" }), h("button", { class: "btn btn--ghost", style: { marginTop: "16px" }, onclick: () => ctx.navigate("diagnostic") }, "重新诊断")),

      h(
        "div",
        { style: { marginTop: "40px", display: "flex", gap: "16px", flexWrap: "wrap" } },
        h(
          "button",
          {
            class: "btn btn--ghost",
            onclick: async () => {
              try {
                plan = await api.plan(state.learnerId, state.courseId);
                state.plan = plan;
                toast("已按最新进度刷新计划");
                ctx.reload();
              } catch (error) {
                toast(error.message || "刷新失败");
              }
            },
          },
          "按最新进度重排"
        ),
        h("button", { class: "btn btn--link", onclick: () => ctx.navigate("trace") }, "查看本次检索与记忆轨迹 →")
      ),

      h(
        "p",
        { class: "hint", style: { marginTop: "32px" } },
        "计划在材料库中做全文 + 向量的混合检索（RRF 融合），再按你的薄弱点记忆调整排序。"
      )
    )
  );
}

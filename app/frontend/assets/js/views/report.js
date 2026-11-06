import { api } from "../api.js";
import { state } from "../store.js";
import { h, masteryClass, masteryLabel, meter, toast } from "../ui.js";

export default async function renderReport(root, ctx) {
  if (!state.learnerId) {
    ctx.navigate("home");
    return;
  }

  let report = state.report;
  let mastery = null;
  let plan = state.plan;
  let storedMemories = [];

  if (!report) {
    try {
      const [progress, freshPlan] = await Promise.all([
        api.progress(state.learnerId, state.courseId),
        api.plan(state.learnerId, state.courseId),
      ]);
      mastery = Object.fromEntries(progress.knowledge_points.map((kp) => [kp.id, kp]));
      storedMemories = (progress.memories || []).filter((m) => /^(weakness|strength):/.test(m.kind)).slice(-4);
      plan = freshPlan;
      state.plan = plan;
    } catch (error) {
      toast(error.message || "报告加载失败");
      ctx.navigate("plan");
      return;
    }
  } else {
    mastery = report.mastery;
  }

  const kps = state.course?.knowledge_points || [];
  const weak = (report?.weak_points?.length
    ? [...report.weak_points]
    : Object.values(mastery).filter((s) => s.answered > 0 && s.mastery < 60)
  ).sort((a, b) => Number(a.mastery) - Number(b.mastery));

  const weakest = weak[0];
  const weakestName = weakest ? kps.find((k) => k.id === weakest.kp_id)?.name || weakest.kp_id : null;
  const rows = Object.values(report?.mastery || mastery || {});
  const answeredTotal = rows.reduce((acc, s) => acc + Number(s.answered || 0), 0);
  const correctTotal = rows.reduce((acc, s) => acc + Number(s.correct || 0), 0);

  const scoreboard = h(
    "div",
    { class: "scoreboard" },
    kps.map((kp) => {
      const m = Number(mastery?.[kp.id]?.mastery ?? 50);
      const answered = Number(mastery?.[kp.id]?.answered ?? 0);
      const cls = answered ? masteryClass(m) : "untested";
      return h(
        "div",
        { class: `score score--${cls}` },
        h("div", { class: "score__kp", text: kp.name }),
        h("div", { class: "score__num" }, String(m), h("span", { text: " / 100" })),
        meter(m, cls === "weak" ? "meter__fill--weak" : ""),
        h("div", { class: "score__tag", text: answered ? masteryLabel(m) : "尚待测" })
      );
    })
  );

  const planPreview = h(
    "div",
    { class: "stack" },
    (plan?.items || []).map((item, i) =>
      h(
        "div",
        { class: "plan-item", style: { padding: "20px 0" } },
        h("div", { class: "plan-item__no", text: String(i + 1).padStart(2, "0") }),
        h(
          "div",
          {},
          h(
            "div",
            { class: "plan-item__top" },
            h("div", { class: "plan-item__title", text: item.kp_name }),
            h("span", { class: `pill ${item.mastery < 60 ? "pill--weak" : ""}`, text: `掌握度 ${item.mastery}` })
          ),
          h("div", { class: "plan-item__why", text: item.reason }),
          h(
            "div",
            { class: "qcount", style: { marginTop: "8px" } },
            `${item.materials.length} 段证据材料 · ${item.questions.length} 道练习 · 约 ${item.minutes} 分钟`
          )
        )
      )
    )
  );

  const memoryEvents = report?.memory_events?.length
    ? report.memory_events
    : storedMemories.map((m) => {
        const [type, kpId] = m.kind.split(":");
        return { type, kp_id: kpId, artifact: m.artifact, text: m.text };
      });
  const memoryBlock = memoryEvents.length
    ? h(
        "div",
        { class: "stack" },
        h(
          "p",
          { class: "note" },
          "本次学习已经写入记忆，下一次打开会自动恢复："
        ),
        ...memoryEvents.map((event) =>
          h(
            "div",
            { class: "memory-note" },
            h("b", { text: event.type === "weakness" ? "薄弱点" : "优势" }),
            h("span", {
              text:
                event.text ||
                `已记录「${kps.find((k) => k.id === event.kp_id)?.name || event.kp_id}」` +
                  ` · artifact ${String(event.artifact?.artifact_id || "").slice(0, 18)}…`,
            })
          )
        )
      )
    : h("p", { class: "hint", text: "还没有可展示的记忆条目。完成诊断或练习后，这里会出现学习记忆的写入记录。" });

  root.replaceChildren(
    h(
      "div",
      { class: "reveal stack--lg" },
      h("div", { class: "kicker", text: "诊断报告 · " + new Date().toLocaleDateString("zh-CN") }),
      h(
        "h1",
        { class: "display" },
        weakestName ? "你的缝，在" : "你的基础，比想象中稳。",
        weakestName ? h("em", { text: `「${weakestName}」` }) : null,
        weakestName ? "。" : ""
      ),
      h(
        "p",
        { class: "lede" },
        answeredTotal
          ? (report ? `10 道诊断题，答对 ${correctTotal} 道。` : `你已作答 ${answeredTotal} 题，答对 ${correctTotal} 道。`) +
            (weak.length ? `有 ${weak.length} 个模块需要优先补。` : "暂时没有低于 60 的模块，接下来做巩固。") +
            "下面不是一句“加油”，而是一条按证据排好序的路径。"
          : "先完成一次诊断，这里会给出按证据排好序的路径。"
      ),

      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "五个模块的掌握度" }), h("span", { class: "section__meta", text: "50 = 尚未测量" })), h("div", { style: { marginTop: "24px" } }, scoreboard)),

      weak.length
        ? h(
            "section",
            { class: "section" },
            h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "为什么先补这里" }), h("span", { class: "section__meta", text: "证据优先" })),
            h(
              "p",
              { class: "bigline", style: { marginTop: "24px" } },
              "你在",
              h("b", { text: `「${weakestName || weak[0].kp_id}」` }),
              `上只答对 ${weakest.correct}/${weakest.answered} 题。`,
              "计划会先用两段材料把这个概念讲透，再用两道题确认不是“看懂了但不会做”。"
            )
          )
        : null,

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "接下来怎么走" }), h("span", { class: "section__meta", text: `约 ${plan?.total_minutes || 0} 分钟` })),
        h("div", { style: { marginTop: "8px" } }, planPreview),
        h(
          "div",
          { style: { marginTop: "32px", display: "flex", gap: "16px", flexWrap: "wrap" } },
          h("button", { class: "btn btn--accent", onclick: () => ctx.navigate("plan") }, "打开今日计划", h("span", { class: "arrow", text: "→" })),
          h("button", { class: "btn btn--link", onclick: () => ctx.navigate("progress") }, "先看学习进度")
        )
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "这次留下的记忆" }), h("span", { class: "section__meta", text: "学习记忆" })),
        h("div", { style: { marginTop: "20px" } }, memoryBlock)
      )
    )
  );
}

import { api } from "../api.js";
import { state } from "../store.js";
import { formatKind, h, masteryClass, masteryLabel, meter, toast } from "../ui.js";

export default async function renderProgress(root, ctx) {
  if (!state.learnerId) {
    ctx.navigate("home");
    return;
  }

  root.replaceChildren(h("div", { class: "reveal" }, h("div", { class: "kicker", text: "学习进度" }), h("h1", { class: "display", text: "记忆会替你记住。" }), h("div", { class: "section" }, h("div", { class: "skeleton" }, h("div", { class: "skeleton__bar", style: { width: "64%" } }), h("div", { class: "skeleton__bar", style: { width: "90%" } }), h("div", { class: "skeleton__bar", style: { width: "82%" } })))));

  let data;
  try {
    data = await api.progress(state.learnerId, state.courseId);
  } catch (error) {
    toast(error.message || "进度加载失败");
    root.replaceChildren(h("div", { class: "empty" }, h("h3", { text: "进度加载失败" }), h("p", { text: error.message }), h("button", { class: "btn btn--ghost", style: { marginTop: "16px" }, onclick: () => ctx.reload() }, "重试")));
    return;
  }

  state.course = data.course;
  const total = data.attempts.total;
  const correct = data.attempts.correct;
  const weak = data.knowledge_points.filter((kp) => kp.status === "weak");

  const kpRows = data.knowledge_points.map((kp) =>
    h(
      "div",
      { class: "plan-item", style: { padding: "18px 0" } },
      h("div", { style: { fontFamily: "var(--font-serif)", fontSize: "1rem", color: "var(--muted)" }, text: kp.status === "weak" ? "!" : kp.status === "solid" ? "✓" : "·" }),
      h(
        "div",
        {},
        h(
          "div",
          { class: "plan-item__top" },
          h("div", { class: "plan-item__title", style: { fontSize: "var(--step-1)" }, text: kp.name }),
          h("span", {
            class: `pill ${kp.status === "weak" ? "pill--weak" : kp.status === "solid" ? "pill--ok" : ""}`,
            text: `${kp.mastery} · ${kp.status === "untested" ? "尚待测" : masteryLabel(kp.mastery)}`,
          })
        ),
        meter(kp.mastery, masteryClass(kp.mastery) === "weak" ? "meter__fill--weak" : ""),
        h("div", { class: "qcount", style: { marginTop: "6px" }, text: `已答 ${kp.answered} 题 · 答对 ${kp.correct} 题 · 连对 ${kp.streak}` })
      )
    )
  );

  const memoryItems = data.memories || [];
  const timeline = memoryItems.length
    ? h(
        "div",
        { class: "timeline" },
        memoryItems.map((m) =>
          h(
            "div",
            { class: "tl" },
            h("div", { class: "tl__dot" }),
            h(
              "div",
              {},
              h("div", { class: "tl__kind", text: formatKind(m.kind) }),
              h("div", { class: "tl__text", text: m.text }),
              m.artifact
                ? h("div", { class: "mono", style: { marginTop: "3px" }, text: `artifact ${String(m.artifact.artifact_id || "").slice(0, 26)}… · rev ${m.artifact.revision}` })
                : null
            )
          )
        )
      )
    : h("p", { class: "hint", text: "还没有记忆条目。完成诊断或练习后，这里会出现学习记忆的写入记录。" });

  const recent = data.attempts.recent || [];
  const recentTable = recent.length
    ? h(
        "div",
        { class: "trace" },
        recent.map((a) =>
          h(
            "div",
            { class: "trace__row", style: { gridTemplateColumns: "72px minmax(0,1fr) 56px" } },
            h("div", { class: "trace__ts", text: (a.created_at || "").slice(5, 16) }),
            h("div", { class: "trace__detail", style: { color: "var(--ink-soft)" }, text: a.stem || a.question_id }),
            h("div", { class: a.correct ? "pill pill--ok" : "pill pill--weak", style: { textAlign: "center" }, text: a.correct ? "对" : "错" })
          )
        )
      )
    : h("p", { class: "hint", text: "还没有答题记录。" });

  root.replaceChildren(
    h(
      "div",
      { class: "reveal stack--lg" },
      h("div", { class: "kicker", text: "学习进度 · " + (data.course?.name || "") }),
      h("h1", { class: "display", text: total ? "记忆会替你记住。" : "从一次诊断开始。" }),
      h(
        "p",
        { class: "lede" },
        total
          ? `你已经留下 ${total} 条答题记录。掌握度不是分数，是“下一次该先看哪儿”的路标。`
          : "还没有作答记录。完成诊断后，这里会显示掌握度、记忆时间线和可核对的检索数据。"
      ),

      h(
        "div",
        { class: "stats", style: { marginTop: "28px" } },
        h("div", { class: "stat" }, h("div", { class: "stat__num", text: String(total) }), h("div", { class: "stat__label", text: "累计答题" })),
        h("div", { class: "stat" }, h("div", { class: "stat__num", text: total ? `${Math.round((correct / total) * 100)}%` : "—" }), h("div", { class: "stat__label", text: "累计正确率" })),
        h("div", { class: "stat" }, h("div", { class: "stat__num", text: String(weak.length) }), h("div", { class: "stat__label", text: "当前薄弱点" }))
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "五个模块" }), h("span", { class: "section__meta", text: "本地进度表" })),
        h("div", {}, kpRows)
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "学习记忆" }), h("span", { class: "section__meta", text: `scope ${String(data.scope_id || "offline").slice(0, 18)}…` })),
        h("div", { style: { marginTop: "24px" } }, timeline)
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "最近作答" }), h("span", { class: "section__meta", text: "attempts" })),
        h("div", { style: { marginTop: "16px" } }, recentTable)
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "数据落点" }), h("span", { class: "section__meta", text: "可核对" })),
        h(
          "div",
          { class: "grid-2", style: { marginTop: "20px" } },
          h(
            "div",
            { class: "panel" },
            h("div", { class: "cite__src", text: "检索与进度（浏览器内）" }),
            h("p", { class: "mono", style: { marginTop: "8px", lineHeight: "1.9" }, text: `backend ${data.store.backend}` }),
            h("p", { class: "mono", style: { lineHeight: "1.9" }, text: `materials ${data.store.materials} · questions ${data.store.questions} · attempts ${data.store.attempts} · progress ${data.store.progress_rows}` })
          ),
          h(
            "div",
            { class: "panel" },
            h("div", { class: "cite__src", text: "学习记忆（localStorage）" }),
            h("p", { class: "mono", style: { marginTop: "8px", lineHeight: "1.9" }, text: `backend ${data.memory.backend || "—"} · online ${data.memory.online}` }),
            h("p", { class: "mono", style: { lineHeight: "1.9" }, text: `family ${data.memory.family} · weakness / strength / plan / session` })
          )
        ),
        h(
          "div",
          { style: { marginTop: "24px", display: "flex", gap: "16px", flexWrap: "wrap" } },
          h("button", { class: "btn btn--ghost", onclick: () => ctx.navigate("diagnostic") }, "重新做一次诊断"),
          h("button", { class: "btn btn--link", onclick: () => ctx.navigate("trace") }, "查看技术轨迹 →")
        )
      )
    )
  );
}

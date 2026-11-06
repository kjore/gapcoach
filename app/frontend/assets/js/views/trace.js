import { api } from "../api.js";
import { state } from "../store.js";
import { h, toast } from "../ui.js";

export default async function renderTrace(root, ctx) {
  let items = [];
  try {
    const data = await api.trace(80);
    items = data.items || [];
  } catch (error) {
    toast(error.message || "轨迹加载失败");
  }

  const resultBox = h("div", { class: "stack", style: { marginTop: "20px" } });
  const input = h("input", {
    class: "input",
    placeholder: "例如：事务隔离级别和幻读有什么区别",
    value: "事务隔离级别和幻读",
  });

  async function runEvidence() {
    const query = input.value.trim();
    if (!query) return;
    resultBox.replaceChildren(h("p", { class: "hint", text: "检索中…" }));
    try {
      const data = await api.evidence(query, null, 4, state.learnerId);
      resultBox.replaceChildren(
        h("div", {
          class: "mono",
          text: `channel  ${data.channel}${data.personalized ? " · 已按你的掌握度加权" : " · 未登录，使用公共排序"}`,
        }),
        ...data.hits.map((hit) =>
          h(
            "div",
            { class: "cite" },
            h("div", { class: "cite__src", text: `${hit.source} · ${hit.section} · ${hit.kp_id}` }),
            h("div", { class: "cite__title", text: hit.title }),
            h("div", { class: "cite__body", text: hit.content }),
            h("div", {
              class: "cite__score",
              text: `综合 ${hit.score.toFixed(3)} = 检索 ${hit.score_parts.retrieval} × 0.72 + 薄弱加权 ${hit.score_parts.weakness} × 0.28`,
            })
          )
        )
      );
    } catch (error) {
      resultBox.replaceChildren(h("p", { class: "hint", text: error.message }));
    }
  }

  let filter = "all";
  const listBox = h("div", { class: "trace", style: { marginTop: "16px" } });

  function paintList() {
    const filtered = filter === "all" ? items : items.filter((item) => item.kind === filter);
    listBox.replaceChildren(
      ...(filtered.length
        ? filtered.map((item) =>
            h(
              "div",
              { class: "trace__row" },
              h("div", { class: "trace__ts", text: (item.ts || "").slice(5, 19).replace("T", " ") }),
              h("div", { class: `trace__kind${item.kind === "memory" ? " trace__kind--pc" : ""}`, text: `${item.kind}/${item.action}` }),
              h("div", { class: "trace__detail", text: JSON.stringify(item.detail) })
            )
          )
        : [h("div", { class: "trace__row" }, h("div", { class: "trace__ts", text: "—" }), h("div", { class: "trace__kind", text: "empty" }), h("div", { class: "trace__detail", text: "还没有记录。完成一次诊断或练习后再来。" }))])
    );
  }

  const filters = ["all", "retrieval", "memory", "gapcoach"];
  const filterBar = h(
    "div",
    { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" } },
    filters.map((f) =>
      h(
        "button",
        {
          class: `pill${filter === f ? " pill--ok" : ""}`,
          style: { cursor: "pointer", background: filter === f ? "hsl(var(--accent-soft))" : "transparent" },
          onclick: (event) => {
            filter = f;
            filterBar.querySelectorAll(".pill").forEach((btn) => {
              btn.classList.remove("pill--ok");
              btn.style.background = "transparent";
            });
            event.currentTarget.classList.add("pill--ok");
            event.currentTarget.style.background = "hsl(var(--accent-soft))";
            paintList();
          },
        },
        f
      )
    )
  );

  root.replaceChildren(
    h(
      "div",
      { class: "reveal stack--lg" },
      h("div", { class: "kicker", text: "技术轨迹" }),
      h("h1", { class: "display", text: "不是“接了”，是每次都在用。" }),
      h(
        "p",
        { class: "lede" },
        "这一页把混合检索的每次调用与学习记忆的每次读写逐条摊开。评审可以直接输入任意问题，观察检索返回的证据与分数构成。"
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "检索证据台" }), h("span", { class: "section__meta", text: "browser hybrid search" })),
        h(
          "div",
          { style: { marginTop: "20px", display: "flex", gap: "12px", flexWrap: "wrap" } },
          h("div", { style: { flex: "1 1 320px" } }, input),
          h("button", { class: "btn btn--accent", onclick: runEvidence }, "检索", h("span", { class: "arrow", text: "→" }))
        ),
        resultBox,
        h("p", { class: "hint", style: { marginTop: "16px" } }, "综合分数 = 检索排名分 × 0.72 + 薄弱度加权 × 0.28。薄弱度来自当前学习者的掌握度，因此同一个问题对不同学生会返回不同排序。")
      ),

      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title", text: "最近 80 条调用" }), h("span", { class: "section__meta", text: "会话内轨迹缓冲" })),
        filterBar,
        listBox,
        h("details", { class: "raw" }, h("summary", { text: "引擎如何工作" }), h("p", { class: "hint", style: { marginTop: "10px" } }, "全部逻辑在浏览器内运行：全文命中 + 特征哈希向量两路召回，RRF 融合后按薄弱度加权；学习记忆与答题记录写入 localStorage，刷新或下次打开都能恢复。")),
        h(
          "div",
          { style: { marginTop: "32px", display: "flex", gap: "16px", flexWrap: "wrap" } },
          h("button", { class: "btn btn--ghost", onclick: () => ctx.reload() }, "刷新轨迹"),
          h("button", { class: "btn btn--link", onclick: () => ctx.navigate("plan") }, "回到今日计划 →")
        )
      )
    )
  );

  paintList();
  runEvidence();
}

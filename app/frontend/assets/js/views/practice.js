import { api } from "../api.js";
import { state } from "../store.js";
import { h, pct, toast } from "../ui.js";

export default async function renderPractice(root, ctx) {
  const session = state.practice;
  if (!state.learnerId || !session?.questions?.length) {
    ctx.navigate("plan");
    return;
  }

  const { questions, item } = session;
  let index = session.index || 0;
  let selected = null;
  let result = null;
  let busy = false;
  const results = [];

  const stage = h("div", { class: "reveal" });

  function questionKicker(q) {
    return `${item.kp_name} · 难度 ${"●".repeat(q.difficulty)}${"○".repeat(3 - q.difficulty)}`;
  }

  function optionEl(option, letter, q) {
    let cls = "option";
    if (!result && selected === letter) cls += " is-selected";
    if (result) {
      if (letter === result.answer) cls += " is-correct";
      else if (letter === result.selected && !result.correct) cls += " is-wrong";
    }
    return h(
      "button",
      {
        class: cls,
        type: "button",
        disabled: Boolean(result),
        "aria-pressed": String(selected === letter),
        onclick: () => {
          if (result) return;
          selected = letter;
          paint();
        },
      },
      h("span", { class: "option__key", text: letter }),
      h("span", { class: "option__text", text: option.replace(/^[A-D][\.、]\s*/, "") })
    );
  }

  function feedbackEl() {
    const deltaText = result.delta >= 0 ? `+${result.delta}` : `${result.delta}`;
    return h(
      "div",
      { class: "stack", style: { marginTop: "24px" } },
      h(
        "div",
        { class: `verdict${result.correct ? "" : " is-wrong"}` },
        h("div", { class: "verdict__mark", text: result.correct ? "✓" : "×" }),
        h(
          "div",
          {},
          h("div", { class: "verdict__title", text: result.correct ? "答对了，但先别急着走。" : "这道题，暴露了一个具体的缝。" }),
          h("div", { class: "verdict__sub", text: result.correct ? "看一眼解释，确认自己是“真懂”而不是“碰巧”。" : `正确答案是 ${result.answer}。下面是为什么，以及可引用的原文。` }),
          h(
            "div",
            { class: "delta", style: { marginTop: "8px" } },
            `${item.kp_name} 掌握度 ${result.mastery_before} → `,
            h("b", { class: result.delta >= 0 ? "" : "is-down", text: `${result.mastery_after}（${deltaText}）` })
          )
        )
      ),
      h("div", { class: "panel" }, h("div", { class: "cite__src", text: "解析" }), h("p", { class: "note", style: { marginTop: "6px" }, text: result.explanation })),

      ...(result.evidence || []).map((ev) =>
        h(
          "div",
          { class: "cite" },
          h("div", { class: "cite__src", text: `${ev.source} · ${ev.section}` }),
          h("div", { class: "cite__title", text: ev.title }),
          h("div", { class: "cite__body", text: ev.content }),
          h("div", { class: "cite__score", text: `原文证据 · 检索 ${ev.score_parts?.retrieval ?? "—"} · 薄弱加权 ${ev.score_parts?.weakness ?? "—"} · 综合 ${ev.score.toFixed(2)}` })
        )
      ),

      result.memory_events?.length
        ? h(
            "div",
            { class: "memory-note" },
            h("b", { text: "已写入学习记忆" }),
            h("span", {
              text: result.memory_events
                .map((e) => (e.type === "resolved" ? "薄弱点已解除" : e.type === "weakness" ? "记录薄弱点" : "记录进步"))
                .join(" · "),
            })
          )
        : null,

      result.similar_mistakes?.length
        ? h("p", { class: "hint", text: `还找到 ${result.similar_mistakes.length} 条你之前答错的相似题，已一并纳入本次反馈。` })
        : null
    );
  }

  function paint() {
    const q = questions[index];
    const progress = ((index + (result ? 1 : 0)) / questions.length) * 100;

    const submitBtn = h(
      "button",
      {
        class: "btn btn--accent",
        type: "button",
        disabled: !selected || busy,
        onclick: async () => {
          if (!selected || busy) return;
          busy = true;
          submitBtn.disabled = true;
          submitBtn.replaceChildren(h("span", { class: "spinner" }), "正在判分…");
          try {
            result = await api.answer(state.learnerId, q.id, selected, state.courseId);
            results.push(result);
            if (result.mastery_after !== undefined) {
              state.session = state.session || {};
              const weak = state.session.weak_points || [];
              if (result.mastery_after < 60 && !weak.some((w) => w.kp_id === result.kp_id)) {
                weak.push({ kp_id: result.kp_id, mastery: result.mastery_after, answered: 1, correct: 0 });
                state.session.weak_points = weak;
              }
            }
            ctx.refreshRail();
          } catch (error) {
            toast(error.message || "判分失败，请重试。");
          } finally {
            busy = false;
            paint();
          }
        },
      },
      "提交答案"
    );
    submitBtn.dataset.action = "submit";

    const nextBtn = h(
      "button",
      {
        class: "btn btn--accent",
        type: "button",
        onclick: () => {
          if (index < questions.length - 1) {
            index += 1;
            selected = null;
            result = null;
            paint();
          } else {
            finish();
          }
        },
      },
      index < questions.length - 1 ? "下一题" : "完成这一组",
      h("span", { class: "arrow", text: "→" })
    );
    nextBtn.dataset.action = "next";

    const parts = [
      h(
        "div",
        { class: "quiz__bar" },
        h("div", { class: "progress-line" }, h("div", { class: "progress-line__fill", style: { "--p": pct(progress) } })),
        h("div", { class: "counter", text: `${String(index + 1).padStart(2, "0")} / ${String(questions.length).padStart(2, "0")}` })
      ),
      h(
        "article",
        { class: "panel reveal" },
        h("div", { class: "question__kp", text: questionKicker(q) }),
        h("h2", { class: "question__stem", text: q.stem }),
        h("div", { class: "options", role: "radiogroup", "aria-label": "选项" }, q.options.map((opt, i) => optionEl(opt, String.fromCharCode(65 + i), q)))
      ),
      result ? feedbackEl() : null,
      h(
        "div",
        { class: "quiz__actions" },
        h("div", { class: "keyhint" }, result ? "继续下一题，或按 Enter" : "按 1–4 选择，Enter 提交"),
        h(
          "div",
          { style: { display: "flex", gap: "12px", flexWrap: "wrap" } },
          h("button", { class: "btn btn--ghost", type: "button", onclick: () => ctx.navigate("plan") }, "暂时离开"),
          result ? nextBtn : submitBtn
        )
      )
    ];
    stage.replaceChildren(...parts.filter(Boolean));
  }

  function finish() {
    const correct = results.filter((r) => r.correct).length;
    const delta = results.reduce((acc, r) => acc + Number(r.delta || 0), 0);
    stage.replaceChildren(
      h(
        "div",
        { class: "reveal stack" },
        h("div", { class: "kicker", text: "这一组完成" }),
        h("h1", { class: "display", text: correct === results.length ? "这一组，全对。" : "这一组，有收获。" }),
        h(
          "p",
          { class: "lede" },
          `${results.length} 道题答对 ${correct} 道，「${item.kp_name}」掌握度净变化 ${delta >= 0 ? "+" : ""}${delta}。记忆已同步，下一次打开会从这里继续。`
        ),
        h(
          "div",
          { class: "stats", style: { marginTop: "32px" } },
          h("div", { class: "stat" }, h("div", { class: "stat__num", text: `${correct}/${results.length}` }), h("div", { class: "stat__label", text: "本组正确率" })),
          h("div", { class: "stat" }, h("div", { class: "stat__num", text: `${delta >= 0 ? "+" : ""}${delta}` }), h("div", { class: "stat__label", text: "掌握度净变化" })),
          h("div", { class: "stat" }, h("div", { class: "stat__num", text: String(results.length) }), h("div", { class: "stat__label", text: "写入答题记录" }))
        ),
        h(
          "div",
          { style: { marginTop: "32px", display: "flex", gap: "16px", flexWrap: "wrap" } },
          h(
            "button",
            {
              class: "btn btn--accent",
              onclick: () => {
                state.plan = null;
                ctx.navigate("plan");
              },
            },
            "回到今日计划",
            h("span", { class: "arrow", text: "→" })
          ),
          h("button", { class: "btn btn--ghost", onclick: () => ctx.navigate("progress") }, "查看学习进度")
        )
      )
    );
    window.scrollTo(0, 0);
  }

  const onKey = (event) => {
    if (!result && event.key >= "1" && event.key <= "4") {
      const letter = String.fromCharCode(65 + Number(event.key) - 1);
      const q = questions[index];
      if (q && letter.charCodeAt(0) - 65 < q.options.length) {
        selected = letter;
        paint();
      }
    } else if (event.key === "Enter") {
      if (result) {
        if (index < questions.length - 1) {
          index += 1;
          selected = null;
          result = null;
          paint();
        } else finish();
      } else if (selected && !busy) {
        stage.querySelector('[data-action="submit"]')?.click();
      }
    }
  };

  root.replaceChildren(stage);
  paint();
  document.addEventListener("keydown", onKey);
  root.__cleanup = () => document.removeEventListener("keydown", onKey);
}

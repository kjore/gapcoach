import { api } from "../api.js";
import { state } from "../store.js";
import { h, pct, toast } from "../ui.js";

export default async function renderDiagnostic(root, ctx) {
  if (!state.learnerId) {
    ctx.navigate("home");
    return;
  }

  root.append(h("div", { class: "reveal" }, h("div", { class: "kicker", text: "入学诊断" }), h("h1", { class: "display", text: "先看看你现在在哪儿。" }),
    h("p", { class: "lede", text: "10 道题覆盖 5 个知识模块。凭第一反应作答，不确定也比空着好——错题会让计划更准。" }),
    h("div", { class: "section" }, h("div", { class: "skeleton" }, h("div", { class: "skeleton__bar", style: { width: "70%" } }), h("div", { class: "skeleton__bar", style: { width: "92%" } }), h("div", { class: "skeleton__bar", style: { width: "84%" } })))));

  let data;
  try {
    data = await api.diagnostic(state.courseId);
  } catch (error) {
    root.replaceChildren(
      h("div", { class: "empty" }, h("h3", { text: "诊断题加载失败" }), h("p", { text: error.message })),
      h("button", { class: "btn btn--ghost", onclick: () => ctx.reload() }, "重试")
    );
    return;
  }

  const questions = data.questions || [];
  const answers = new Map();
  let index = 0;
  let selected = null;
  let submitting = false;

  const stage = h("div", { class: "reveal" });

  function nextLabel() {
    return index === questions.length - 1 ? "提交诊断，生成报告" : "下一题";
  }

  function optionEl(option, letter) {
    const isSelected = selected === letter;
    return h(
      "button",
      {
        class: `option${isSelected ? " is-selected" : ""}`,
        type: "button",
        "aria-pressed": String(isSelected),
        onclick: () => {
          selected = letter;
          paint();
        },
      },
      h("span", { class: "option__key", text: letter }),
      h("span", { class: "option__text", text: option.replace(/^[A-D][\.、]\s*/, "") })
    );
  }

  function paint() {
    const question = questions[index];
    const chosen = selected || answers.get(question.id) || null;
    selected = chosen;

    const card = h(
      "article",
      { class: "panel reveal" },
      h("div", { class: "question__kp", text: `${question.kp_name} · 难度 ${"●".repeat(question.difficulty)}${"○".repeat(3 - question.difficulty)}` }),
      h("h2", { class: "question__stem", text: question.stem }),
      h(
        "div",
        { class: "options", role: "radiogroup", "aria-label": "选项" },
        question.options.map((opt, i) => optionEl(opt, String.fromCharCode(65 + i)))
      )
    );

    const nextBtn = h(
      "button",
      {
        class: "btn btn--accent",
        type: "button",
        disabled: !chosen || submitting,
        onclick: () => {
          if (!selected) return;
          answers.set(questions[index].id, selected);
          if (index < questions.length - 1) {
            index += 1;
            selected = answers.get(questions[index].id) || null;
            paint();
          } else {
            submit();
          }
        },
      },
      submitting ? h("span", { class: "spinner" }) : null,
      submitting ? "正在评分…" : nextLabel(),
      !submitting ? h("span", { class: "arrow", text: "→" }) : null
    );

    stage.replaceChildren(
      h(
        "div",
        { class: "quiz__bar" },
        h("div", { class: "progress-line" }, h("div", { class: "progress-line__fill", style: { "--p": pct(((index + (chosen ? 1 : 0)) / questions.length) * 100) } })),
        h("div", { class: "counter", text: `${String(index + 1).padStart(2, "0")} / ${String(questions.length).padStart(2, "0")}` })
      ),
      card,
      h(
        "div",
        { class: "quiz__actions" },
        h("div", { class: "keyhint" }, "按 ", h("kbd", { text: "1–4" }), " 选择，", h("kbd", { text: "Enter" }), " 继续"),
        h(
          "div",
          { style: { display: "flex", gap: "12px" } },
          index > 0
            ? h(
                "button",
                {
                  class: "btn btn--ghost",
                  type: "button",
                  onclick: () => {
                    index -= 1;
                    selected = answers.get(questions[index].id) || null;
                    paint();
                  },
                },
                "上一题"
              )
            : null,
          nextBtn
        )
      )
    );
    root.querySelector(".section")?.remove();
  }

  async function submit() {
    submitting = true;
    paint();
    try {
      const payload = questions.map((q) => ({ question_id: q.id, selected: answers.get(q.id) || "A" }));
      const report = await api.submitDiagnostic(state.learnerId, payload, state.courseId);
      state.report = report;
      state.plan = report.plan;
      ctx.refreshRail();
      ctx.navigate("report");
    } catch (error) {
      submitting = false;
      toast(error.message || "提交失败，请重试。");
      paint();
    }
  }

  const onKey = (event) => {
    if (event.key >= "1" && event.key <= "4") {
      const letter = String.fromCharCode(65 + Number(event.key) - 1);
      const question = questions[index];
      if (question && letter.charCodeAt(0) - 65 < question.options.length) {
        selected = letter;
        paint();
      }
    } else if (event.key === "Enter" && selected && !submitting) {
      answers.set(questions[index].id, selected);
      if (index < questions.length - 1) {
        index += 1;
        selected = answers.get(questions[index].id) || null;
        paint();
      } else {
        submit();
      }
    }
  };

  root.replaceChildren(stage);
  paint();
  document.addEventListener("keydown", onKey);
  root.__cleanup = () => document.removeEventListener("keydown", onKey);
}

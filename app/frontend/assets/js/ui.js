export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "html") el.innerHTML = value;
    else if (key === "text") el.textContent = value;
    else if (key === "style" && typeof value === "object") {
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith("--")) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign(el.dataset, value);
    } else {
      el.setAttribute(key, value === true ? "" : value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function pct(value) {
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  return `${n}%`;
}

export function masteryLabel(value) {
  if (value < 60) return "薄弱";
  if (value >= 85) return "稳固";
  return "在学";
}

export function masteryClass(value) {
  if (value < 60) return "weak";
  if (value >= 85) return "solid";
  return "learning";
}

export function formatKind(kind = "") {
  if (kind.startsWith("weakness:")) return "薄弱点记忆";
  if (kind.startsWith("strength:")) return "进步记忆";
  if (kind === "session:summary") return "会话摘要";
  if (kind === "plan:current") return "计划快照";
  return kind || "记忆";
}

export function formatTime(iso) {
  if (!iso) return "";
  const normalized = iso.length > 19 ? iso.slice(0, 19).replace("T", " ") : iso.replace("T", " ");
  return normalized;
}

export function todayLabel() {
  const d = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
}

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-on"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-on");
    setTimeout(() => {
      el.hidden = true;
    }, 260);
  }, 2600);
}

export function skeleton(lines = 4) {
  return h(
    "div",
    { class: "skeleton", "aria-busy": "true" },
    Array.from({ length: lines }, (_, i) =>
      h("div", { class: "skeleton__bar", style: { width: `${92 - i * 11}%` } })
    )
  );
}

export function emptyState(title, body, action) {
  return h(
    "div",
    { class: "empty" },
    h("h3", { text: title }),
    h("p", { text: body }),
    action || null
  );
}

export function meter(value, cls = "") {
  return h(
    "div",
    { class: "meter", role: "img", "aria-label": `掌握度 ${pct(value)}` },
    h("div", { class: `meter__fill ${cls}`, style: { width: pct(value) } })
  );
}

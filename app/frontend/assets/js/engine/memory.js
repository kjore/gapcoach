import { hash32, tokens } from "./embed.js";
import { dateMinute, localTs } from "./time.js";
import { record } from "./trace.js";

const KEY = "gapcoach.memory.v1";

function emptyData() {
  return { scopes: {}, records: [], seq: 0 };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || emptyData();
  } catch {
    return emptyData();
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 存储不可用时保持内存态 */
  }
}

export const memory = {
  health() {
    let available = true;
    try {
      localStorage.setItem(KEY + ".probe", "1");
      localStorage.removeItem(KEY + ".probe");
    } catch {
      available = false;
    }
    return { online: available, backend: "localStorage", family: "atomic-memory" };
  },

  ensureScope(learnerId, courseId) {
    const data = load();
    const key = `${learnerId}:${courseId}`;
    if (data.scopes[key]) return data.scopes[key];
    const scopeId = `scope-${hash32(key).toString(16).padStart(8, "0")}`;
    data.scopes[key] = scopeId;
    save(data);
    record("memory", "scope_ready", { learner_id: learnerId, scope_id: scopeId });
    return scopeId;
  },

  remember(scopeId, kind, text) {
    if (!scopeId) return null;
    const data = load();
    data.seq += 1;
    const rec = {
      scope_id: scopeId,
      kind,
      text,
      state: "active",
      state_version: 1,
      created_at: localTs(true),
      artifact: {
        artifact_id: `art-${data.seq.toString(16).padStart(6, "0")}-${hash32(text).toString(16).slice(0, 6)}`,
        family: "atomic-memory",
        revision: 1,
      },
    };
    data.records.push(rec);
    save(data);
    record("memory", "remember", { kind, artifact: rec.artifact, text });
    return rec;
  },

  list(scopeId, kind = null, limit = 50) {
    if (!scopeId) return [];
    const data = load();
    return data.records
      .filter((r) => r.scope_id === scopeId && (kind ? r.kind === kind : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  },

  search(scopeId, query, limit = 5) {
    if (!scopeId) return [];
    const data = load();
    const qt = new Set(tokens(query));
    const hits = data.records
      .filter((r) => r.scope_id === scopeId && r.state === "active")
      .map((r) => {
        const seen = new Set();
        for (const tok of tokens(r.text)) if (qt.has(tok)) seen.add(tok);
        return { memory: r, score: qt.size ? Math.round((seen.size / qt.size) * 10000) / 10000 : 0 };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    record("memory", "search", { query, hits: hits.map((h) => h.memory.artifact.artifact_id) });
    return hits;
  },

  forget(scopeId, item) {
    if (!scopeId || !item) return false;
    const data = load();
    const rec = data.records.find(
      (r) => r.scope_id === scopeId && r.artifact.artifact_id === item.artifact.artifact_id
    );
    if (!rec) return false;
    rec.state = "forgotten";
    rec.state_version += 1;
    rec.artifact.revision += 1;
    save(data);
    record("memory", "forget", { artifact: rec.artifact, kind: rec.kind });
    return true;
  },

  weaknessKind(kpId) {
    return `weakness:${kpId}`;
  },

  strengthKind(kpId) {
    return `strength:${kpId}`;
  },

  addWeakness(scopeId, kpId, kpName, detail) {
    const text = `「${kpName}」是薄弱点：${detail}（记录时间 ${dateMinute()}）`;
    return this.remember(scopeId, this.weaknessKind(kpId), text);
  },

  addStrength(scopeId, kpId, kpName, detail) {
    const text = `「${kpName}」已明显进步：${detail}（记录时间 ${dateMinute()}）`;
    return this.remember(scopeId, this.strengthKind(kpId), text);
  },

  resolveWeakness(scopeId, kpId) {
    const active = this.list(scopeId, this.weaknessKind(kpId)).find((i) => i.state === "active");
    if (!active) return false;
    return this.forget(scopeId, active);
  },

  hasActive(scopeId, kind) {
    return this.list(scopeId, kind).some((i) => i.state === "active");
  },

  sessionSummary(scopeId, text) {
    return this.remember(scopeId, "session:summary", text);
  },
};

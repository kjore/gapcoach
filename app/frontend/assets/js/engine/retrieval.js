import { cosine, embed, tokens } from "./embed.js";
import { record } from "./trace.js";

const RRF_K = 20;
const WINDOW = 8;

const round4 = (n) => Math.round(n * 10000) / 10000;
const docText = (m) => `${m.title}。${m.content}`;

function materialHit(material, rank, mastery) {
  const retrieval = 1 / (rank + 1);
  const weak = mastery ? Math.max(0, 100 - Number(mastery[material.kp_id] ?? 50)) / 100 : 0;
  return {
    id: material.id,
    kp_id: material.kp_id,
    title: material.title,
    content: material.content,
    source: material.source,
    section: material.section,
    kind: material.kind,
    score: 0.72 * retrieval + 0.28 * weak,
    score_parts: { retrieval: round4(retrieval), weakness: round4(weak) },
  };
}

/** 复刻 seekdb hybrid_search：全文命中 + 向量余弦两路召回，RRF 融合，再按薄弱度加权。 */
export function searchMaterials(content, query, { kpIds = null, mastery = null, topK = 3 } = {}) {
  let pool = content.materials;
  if (kpIds && kpIds.length) pool = pool.filter((m) => kpIds.includes(m.kp_id));

  const qTokens = new Set(tokens(query));
  const fulltext = pool
    .map((m) => {
      const text = docText(m);
      let hit = 0;
      for (const tok of qTokens) if (text.includes(tok)) hit += 1;
      return { m, s: hit };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.m.id.localeCompare(b.m.id))
    .slice(0, WINDOW);

  const qv = embed(query);
  const vector = pool
    .map((m) => ({ m, s: cosine(qv, embed(docText(m))) }))
    .sort((a, b) => b.s - a.s || a.m.id.localeCompare(b.m.id))
    .slice(0, WINDOW);

  const rrf = new Map();
  for (const list of [fulltext, vector]) {
    list.forEach((x, i) => rrf.set(x.m.id, (rrf.get(x.m.id) || 0) + 1 / (RRF_K + i + 1)));
  }
  const fused = pool
    .filter((m) => rrf.has(m.id))
    .map((m) => ({ m, s: rrf.get(m.id) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, WINDOW);

  const hits = fused.map((x, rank) => materialHit(x.m, rank, mastery));
  hits.sort((a, b) => b.score - a.score);
  const out = hits.slice(0, topK);
  record("retrieval", "search_materials", {
    query,
    mode: "hybrid",
    kp_filter: kpIds,
    returned: out.map((h) => ({ id: h.id, score: round4(h.score), kp: h.kp_id })),
  });
  return out;
}

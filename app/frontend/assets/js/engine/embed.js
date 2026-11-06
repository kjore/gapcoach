const DIM = 384;
const encoder = new TextEncoder();
const cache = new Map();

function fnv1a(bytes, seed) {
  let h = seed >>> 0;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hash32(text, seed = 0x811c9dc5) {
  return fnv1a(encoder.encode(text), seed);
}

export function tokens(text) {
  const t = (text || "").toLowerCase();
  const chars = [...t].filter((c) => !/\s/.test(c));
  const grams = [...chars];
  for (let i = 0; i < chars.length - 1; i += 1) grams.push(chars[i] + chars[i + 1]);
  const words = [];
  let buf = "";
  for (const c of t) {
    if (c.charCodeAt(0) < 128 && /[a-z0-9]/.test(c)) buf += c;
    else if (buf) {
      words.push(buf);
      buf = "";
    }
  }
  if (buf) words.push(buf);
  return grams.concat(words);
}

export function embed(text) {
  if (cache.has(text)) return cache.get(text);
  const vec = new Float64Array(DIM);
  for (const tok of tokens(text)) {
    const bytes = encoder.encode(tok);
    const h1 = fnv1a(bytes, 0x811c9dc5);
    const h2 = fnv1a(bytes, 0x9e3779b9);
    const idx = h1 % DIM;
    vec[idx] += h2 & 1 ? 1 : -1;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i += 1) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i += 1) vec[i] /= norm;
  cache.set(text, vec);
  return vec;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < DIM; i += 1) dot += a[i] * b[i];
  return dot;
}

import { localTs } from "./time.js";

const MAX = 200;
const buffer = [];

export function record(kind, action, detail = {}) {
  const item = { ts: localTs(), kind, action, detail };
  buffer.push(item);
  if (buffer.length > MAX) buffer.shift();
  return item;
}

export function recent(limit = 30) {
  return buffer.slice(-limit).reverse();
}

export function size() {
  return buffer.length;
}

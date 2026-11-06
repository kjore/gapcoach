import { record } from "./trace.js";

let pending = null;

export function loadContent() {
  if (pending) return pending;
  pending = (async () => {
    const res = await fetch("/assets/data/content.json");
    if (!res.ok) throw new Error(`课程数据加载失败（${res.status}）`);
    const seed = await res.json();
    const content = {
      course: seed.course,
      kps: seed.knowledge_points,
      kpById: Object.fromEntries(seed.knowledge_points.map((kp) => [kp.id, kp])),
      materials: seed.materials,
      materialById: Object.fromEntries(seed.materials.map((m) => [m.id, m])),
      questions: seed.questions,
      questionById: Object.fromEntries(seed.questions.map((q) => [q.id, q])),
    };
    record("gapcoach", "content_ready", {
      course_id: content.course.id,
      materials: content.materials.length,
      questions: content.questions.length,
    });
    return content;
  })().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}

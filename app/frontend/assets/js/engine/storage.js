import { cosine, embed } from "./embed.js";
import { localTs } from "./time.js";
import { record } from "./trace.js";

const KEY = "gapcoach.store.v1";

function emptyData() {
  return { attempts: [], mastery: {} };
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

const randomId = () => Math.random().toString(16).slice(2, 12);

export const storage = {
  recordAttempt({ learnerId, courseId, question, selected, correct }) {
    const data = load();
    const attempt = {
      attempt_id: `att-${randomId()}`,
      learner_id: learnerId,
      course_id: courseId,
      question_id: question.id,
      kp_id: question.kp_id,
      correct: Boolean(correct),
      selected,
      created_at: localTs(true),
      stem: question.stem,
    };
    data.attempts.push(attempt);
    save(data);
    record("retrieval", "record_attempt", {
      attempt_id: attempt.attempt_id,
      question_id: question.id,
      kp_id: question.kp_id,
      correct,
    });
    return attempt.attempt_id;
  },

  listAttempts(learnerId, courseId, limit = 100) {
    const data = load();
    return data.attempts
      .filter((a) => a.learner_id === learnerId && a.course_id === courseId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  },

  getMastery(learnerId, courseId, kps) {
    const data = load();
    const out = {};
    for (const kp of kps) {
      const saved = data.mastery[`${learnerId}:${courseId}:${kp.id}`];
      out[kp.id] = saved
        ? { ...saved }
        : {
            kp_id: kp.id,
            mastery: 50,
            answered: 0,
            correct: 0,
            streak: 0,
            last_correct: false,
            updated_at: "",
          };
    }
    return out;
  },

  saveMastery(learnerId, courseId, kpName, state) {
    const data = load();
    data.mastery[`${learnerId}:${courseId}:${state.kp_id}`] = {
      kp_id: state.kp_id,
      kp_name: kpName,
      mastery: Number(state.mastery),
      answered: Number(state.answered),
      correct: Number(state.correct),
      streak: Number(state.streak),
      last_correct: Boolean(state.last_correct),
      updated_at: localTs(),
    };
    save(data);
    record("retrieval", "save_mastery", {
      kp_id: state.kp_id,
      mastery: state.mastery,
      answered: state.answered,
    });
  },

  findSimilarMistakes(learnerId, courseId, query, limit = 3) {
    const data = load();
    const qv = embed(query);
    return data.attempts
      .filter((a) => a.learner_id === learnerId && a.course_id === courseId && !a.correct)
      .map((a) => ({ a, sim: cosine(qv, embed(`${a.stem} 我的选择：${a.selected}`)) }))
      .sort((x, y) => y.sim - x.sim)
      .slice(0, limit)
      .map(({ a, sim }) => ({
        attempt_id: a.attempt_id,
        question_id: a.question_id,
        kp_id: a.kp_id,
        created_at: a.created_at,
        distance: Math.round((1 - sim) * 10000) / 10000,
      }));
  },

  stats(content) {
    const data = load();
    return {
      course_id: content.course.id,
      knowledge_points: content.kps.length,
      materials: content.materials.length,
      questions: content.questions.length,
      attempts: data.attempts.length,
      progress_rows: Object.keys(data.mastery).length,
      backend: "in-browser (fulltext + vector RRF)",
    };
  },
};

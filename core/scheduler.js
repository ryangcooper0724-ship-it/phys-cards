/* 責務: ts-fsrs 5.4.2 の呼び出し（SPEC §4.4 のパラメータ）・記録の項目と ts-fsrs の Card の相互変換・期日の判定。
   依存: ../vendor/ts-fsrs-5.4.2.mjs、./day.js。
   注意: 時刻は引数（エポックのミリ秒）。state 0 か項目なしは記録の値を捨て createEmptyCard から計算する（§4.8）。 */
import { fsrs, generatorParameters, createEmptyCard, Rating } from "../vendor/ts-fsrs-5.4.2.mjs";
import { nextDayStart } from "./day.js";

export const PARAMS = Object.freeze({
  request_retention: 0.9,
  maximum_interval: 30,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

/** 記録の cards の項目の欄（ts-fsrs 5.4.2 の Card と同じ。§4.2）。 */
export const ENTRY_FIELDS = Object.freeze([
  "due", "stability", "difficulty", "elapsed_days", "scheduled_days",
  "learning_steps", "reps", "lapses", "state", "last_review",
]);

export const RATINGS = Object.freeze([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);

let engine = null;
function getEngine() {
  if (engine === null) {
    engine = fsrs(generatorParameters({ ...PARAMS, learning_steps: [...PARAMS.learning_steps], relearning_steps: [...PARAMS.relearning_steps] }));
  }
  return engine;
}

/** 記録の項目（または null）を ts-fsrs の Card にする。 */
export function toTsCard(entry, nowMs) {
  if (!entry || entry.state === 0) {
    return createEmptyCard(new Date(nowMs));
  }
  return {
    due: new Date(entry.due),
    stability: entry.stability,
    difficulty: entry.difficulty,
    elapsed_days: entry.elapsed_days,
    scheduled_days: entry.scheduled_days,
    learning_steps: entry.learning_steps,
    reps: entry.reps,
    lapses: entry.lapses,
    state: entry.state,
    last_review: entry.last_review ? new Date(entry.last_review) : undefined,
  };
}

/** ts-fsrs の Card を記録の項目（due・last_review は ISO）にする。 */
export function fromTsCard(card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** 4つの評価それぞれの次の間隔（秒）。{1: 秒, 2: 秒, 3: 秒, 4: 秒}。 */
export function previewSeconds(entry, nowMs) {
  const log = getEngine().repeat(toTsCard(entry, nowMs), new Date(nowMs));
  const out = {};
  for (const r of RATINGS) {
    out[r] = (log[r].card.due.getTime() - nowMs) / 1000;
  }
  return out;
}

/** 評価して新しい項目を返す（rating は 1〜4）。 */
export function rate(entry, nowMs, rating) {
  if (!RATINGS.includes(rating)) {
    throw new RangeError(`評価は 1〜4: ${rating}`);
  }
  const item = getEngine().next(toTsCard(entry, nowMs), new Date(nowMs), rating);
  return fromTsCard(item.card);
}

/** 期日が来たか（§4.4）: state 1・3 は due ≤ 今、state 2 は due が次の午前4時より前。新しいカードは偽。 */
export function isDue(entry, nowMs) {
  if (!entry) {
    return false;
  }
  const due = Date.parse(entry.due);
  if (entry.state === 1 || entry.state === 3) {
    return due <= nowMs;
  }
  if (entry.state === 2) {
    return due < nextDayStart(nowMs);
  }
  return false;
}

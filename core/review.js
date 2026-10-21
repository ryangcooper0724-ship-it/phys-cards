/* 責務: 評価で記録を更新する（cards の項目・log・newIntroduced・reviewsDone・days・undo）と「1つ戻す」（SPEC §4.2・§4.6・§11）。
   依存: ./scheduler.js（ts-fsrs）・./day.js・./queue.js（項目の引き当て）。
   注意: nowMs は「答えを見る」を押した時刻（計算・log の t・undo.t・論理日のすべて。§11）。元の記録は変えず新しい記録を返す。 */
import { rate } from "./scheduler.js";
import { logicalDay } from "./day.js";
import { entryOf, isNewEntry } from "./queue.js";

function bump(map, key, delta) {
  const now = Object.hasOwn(map, key) ? map[key] : 0;
  return { ...map, [key]: now + delta };
}

/** 1減らす。キーが無ければ触らない（刈り込みで消えた日。0 未満にしない）。0 になったらキーを消す（評価前と同じ形に戻す）。 */
function decrement(map, key) {
  if (!Object.hasOwn(map, key)) {
    return map;
  }
  const out = { ...map };
  const v = Math.max(0, out[key] - 1);
  if (v === 0) {
    delete out[key];
  } else {
    out[key] = v;
  }
  return out;
}

/** 評価した後の記録を返す。 */
export function applyRating(record, id, rating, nowMs) {
  const before = entryOf(record, id);
  const wasNew = isNewEntry(before);
  const wasReview = !wasNew && before.state === 2;
  const after = rate(before, nowMs, rating);
  const day = logicalDay(nowMs);
  const t = Math.trunc(nowMs);
  return {
    ...record,
    cards: { ...record.cards, [id]: after },
    log: [...record.log, { i: id, r: rating, t }],
    newIntroduced: wasNew ? bump(record.newIntroduced, day, 1) : record.newIntroduced,
    reviewsDone: wasReview ? bump(record.reviewsDone, day, 1) : record.reviewsDone,
    days: record.days.includes(day) ? record.days : [...record.days, day].sort(),
    undo: { id, before: before === null ? null : { ...before }, wasNew, wasReview, day, t },
  };
}

/** 1つ戻した後の記録を返す（§4.6・§11）。undo が無ければ同じ記録を返す。 */
export function undoLast(record) {
  const u = record.undo;
  if (!u) {
    return record;
  }
  const cards = { ...record.cards };
  if (u.before === null) {
    delete cards[u.id];
  } else {
    cards[u.id] = { ...u.before };
  }
  const last = record.log[record.log.length - 1];
  const popped = Boolean(last) && last.i === u.id && last.t === u.t;
  const log = popped ? record.log.slice(0, -1) : record.log;
  // その日の log が 0 件になったら days から除く（log を触らなかったときは days も触らない）
  const dayEmpty = popped && !log.some((x) => logicalDay(x.t) === u.day);
  return {
    ...record,
    cards,
    log,
    newIntroduced: u.wasNew ? decrement(record.newIntroduced, u.day) : record.newIntroduced,
    reviewsDone: u.wasReview ? decrement(record.reviewsDone, u.day) : record.reviewsDone,
    days: dayEmpty ? record.days.filter((d) => d !== u.day) : record.days,
    undo: null,
  };
}

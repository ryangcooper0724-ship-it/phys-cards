/* 責務: 評価で記録を更新する（cards の項目・log・newIntroduced・reviewsDone・days・undo）と「1つ戻す」（SPEC §4.2・§4.6・§11）。
   plan のデッキの印（§14.4・§14.12: planNew・round2Seen・practiceDone と undo の p・r2・pn・r2s）も、渡されたときだけ数えて戻す。
   依存: ./scheduler.js（ts-fsrs・期日の判定）・./day.js・./queue.js（項目の引き当て）。
   注意: nowMs は「答えを見る」を押した時刻（計算・log の t・undo.t・論理日のすべて。§11）。元の記録は変えず新しい記録を返す。印が無い呼び出し（化学）は今までと同じ結果。 */
import { rate, isDue } from "./scheduler.js";
import { logicalDay } from "./day.js";
import { entryOf, isNewEntry } from "./queue.js";

function bump(map, key, delta) {
  const base = map ?? {};
  const now = Object.hasOwn(base, key) ? base[key] : 0;
  return { ...base, [key]: now + delta };
}

/** 1減らす。キーが無ければ触らない（刈り込みで消えた日。0 未満にしない）。0 になったらキーを消す（評価前と同じ形に戻す）。 */
function decrement(map, key) {
  if (!map || !Object.hasOwn(map, key)) {
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

/** 記録の日のキーの数の欄を1増やす（欄が無ければ作る）。 */
function bumpField(record, field, day) {
  return { ...record, [field]: bump(record[field], day, 1) };
}

/** 記録の日のキーの数の欄を1減らす（欄が無ければ触らない）。 */
function decrementField(record, field, day) {
  if (!Object.hasOwn(record, field)) {
    return record;
  }
  return { ...record, [field]: decrement(record[field], day) };
}

/**
 * 評価した後の記録を返す。
 * marks（省略可。plan のデッキで plan.js の ratingMarks の結果に p を足した物 {pn, r2, p}）を渡すと、§14.12 のとおり
 * wasReview（reviewsDone）を「評価の前に期日の来ていた state 2」にし、pn なら planNew・r2 なら round2Seen・p なら practiceDone を数え、
 * undo に真の印だけを書く。marks が null（化学）なら今までと同じ。
 */
export function applyRating(record, id, rating, nowMs, marks = null) {
  const before = entryOf(record, id);
  const wasNew = isNewEntry(before);
  const wasReview = !wasNew && before.state === 2 && (marks === null || isDue(before, nowMs));
  const after = rate(before, nowMs, rating);
  const day = logicalDay(nowMs);
  const t = Math.trunc(nowMs);
  let next = {
    ...record,
    cards: { ...record.cards, [id]: after },
    log: [...record.log, { i: id, r: rating, t }],
    newIntroduced: wasNew ? bump(record.newIntroduced, day, 1) : record.newIntroduced,
    reviewsDone: wasReview ? bump(record.reviewsDone, day, 1) : record.reviewsDone,
    days: record.days.includes(day) ? record.days : [...record.days, day].sort(),
    undo: { id, before: before === null ? null : { ...before }, wasNew, wasReview, day, t },
  };
  if (marks !== null) {
    next = withMarks(next, marks, day);
  }
  return next;
}

const MARK_FIELDS = Object.freeze({ pn: "planNew", r2: "round2Seen", p: "practiceDone" });

/** 真の印の日のキーの数を数え、undo に印を書く。 */
function withMarks(record, marks, day) {
  let next = record;
  const undo = { ...record.undo };
  for (const [mark, field] of Object.entries(MARK_FIELDS)) {
    if (marks[mark] === true) {
      next = bumpField(next, field, day);
      undo[mark] = true;
    }
  }
  return { ...next, undo };
}

/** 記録に返さない練習の答え（§14.4: 今日の log が既にあるカード）。practiceDone[今日] だけ増やし、undo を p 付きで書く（cards・log・days は変えない）。 */
export function applyPracticeOnly(record, id, nowMs) {
  const before = entryOf(record, id);
  const day = logicalDay(nowMs);
  const next = bumpField(record, "practiceDone", day);
  return { ...next, undo: { id, before: before === null ? null : { ...before }, wasNew: false, wasReview: false, day, t: Math.trunc(nowMs), p: true } };
}

/** 1つ戻した後の記録を返す（§4.6・§11・§14.12）。undo が無ければ同じ記録を返す。
    印（pn・r2・p）があればその日の数を1減らし、r2s があれば round2Start のその分野を消す（空になったら欄ごと消す）。
    記録に返さなかった練習の答え（p があり log の最後がその答えでない）は cards・log・days を触らない。 */
export function undoLast(record) {
  const u = record.undo;
  if (!u) {
    return record;
  }
  const last = record.log[record.log.length - 1];
  const popped = Boolean(last) && last.i === u.id && last.t === u.t;
  const touchCards = !(u.p === true && !popped);
  const cards = { ...record.cards };
  if (touchCards) {
    if (u.before === null) {
      delete cards[u.id];
    } else {
      cards[u.id] = { ...u.before };
    }
  }
  const log = popped ? record.log.slice(0, -1) : record.log;
  // その日の log が 0 件になったら days から除く（log を触らなかったときは days も触らない）
  const dayEmpty = popped && !log.some((x) => logicalDay(x.t) === u.day);
  let next = {
    ...record,
    cards,
    log,
    newIntroduced: u.wasNew ? decrement(record.newIntroduced, u.day) : record.newIntroduced,
    reviewsDone: u.wasReview ? decrement(record.reviewsDone, u.day) : record.reviewsDone,
    days: dayEmpty ? record.days.filter((d) => d !== u.day) : record.days,
    undo: null,
  };
  for (const [mark, field] of Object.entries(MARK_FIELDS)) {
    if (u[mark] === true) {
      next = decrementField(next, field, u.day);
    }
  }
  if (typeof u.r2s === "string" && next.round2Start && Object.hasOwn(next.round2Start, u.r2s)) {
    const round2Start = { ...next.round2Start };
    delete round2Start[u.r2s];
    if (Object.keys(round2Start).length === 0) {
      const { round2Start: _gone, ...rest } = next;
      next = rest;
    } else {
      next = { ...next, round2Start };
    }
  }
  return next;
}

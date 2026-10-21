/* 責務: 出すカードの絞り込み（§2.3）・ホームの数と溜まり（§2.2・§11）・今日の並び（§2.2 の (1)〜(3)）・早出しと終わりの表示（§2.2・§11）。
   依存: ./day.js・./scheduler.js（期日の判定）・./record.js（既定の設定）。
   注意: 記録の引き当ては Object.hasOwn（§4.1）。学習中の早出しと終わりの表示は「次の午前4時より前」の学習中だけを見る（§11）。
   opts.selfPaced（§13.5。デッキの口を main.js が渡す）なら章の設定を当てず、新しいカードの1日の上限も当てない。session.flow は
   "mixed"（今までの「始める」）・"review"（復習する。新しいカードを出さない）・"new"（新しく進める。新しいカードだけ、session.chapter があればその章だけ）。 */
import { logicalDay, nextDayStart } from "./day.js";
import { isDue } from "./scheduler.js";
import { defaultSettings } from "./record.js";

/** 学習中だけが残ったとき、期日までこの時間以内なら早めに出す（§2.2。ちょうど 20 分は出す）。 */
export const EARLY_MS = 20 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function entryOf(record, id) {
  if (!record || !Object.hasOwn(record.cards, id)) {
    return null;
  }
  return record.cards[id];
}

export function isNewEntry(entry) {
  return !entry || entry.state === 0;
}

/** cards.json にある章の番号（昇順・重複なし）。 */
export function chapterList(cards) {
  return [...new Set(cards.map((c) => c.chapter))].sort((a, b) => a - b);
}

/** 選んでいる物（§13.4）・章の設定・★だけ・余裕ありを除く・札（§12.3）を当てて出すカードか（§2.3）。
    settings.pack（無い・null＝本編）と同じ pack のカードだけ。本編は章の設定を当て、問題集は章に従わない。 */
export function isEligible(card, settings, opts = {}) {
  const pack = settings.pack ?? null;
  if ((card.pack ?? null) !== pack) {
    return false;
  }
  const key = String(card.chapter);
  if (pack === null && !opts.selfPaced && !(Object.hasOwn(settings.chapters, key) && settings.chapters[key] === true)) {
    return false; // 本編は章の設定を当てる（自分で進めるデッキは当てない。§13.5・§13.10）
  }
  if (settings.starOnly && !card.star) {
    return false;
  }
  if (settings.excludeYoyu && card.yoyu) {
    return false;
  }
  const tag = card.tag ?? null;
  if (tag !== null && settings.tags && Object.hasOwn(settings.tags, tag) && settings.tags[tag] === false) {
    return false; // 札が「出さない」（無い札・tag の無いカードは出す。§12.3）
  }
  return true;
}

function remaining(limit, doneMap, today) {
  const done = Object.hasOwn(doneMap, today) ? doneMap[today] : 0;
  return Math.max(0, limit - done);
}

const byDueThenOrder = (a, b) => (a.due - b.due) || (a.card.order - b.card.order);

/** 出すカードを分ける: learning＝期日の来た学習中、reviews＝期日の来た復習、fresh＝新しい、pending＝期日の来ていない学習中。 */
function classify(cards, record, nowMs, opts = {}) {
  const settings = record ? record.settings : defaultSettings();
  const learning = [];
  const reviews = [];
  const fresh = [];
  const pending = [];
  for (const card of cards) {
    if (!isEligible(card, settings, opts)) {
      continue;
    }
    const entry = entryOf(record, card.id);
    if (isNewEntry(entry)) {
      fresh.push(card);
      continue;
    }
    const item = { card, due: Date.parse(entry.due) };
    if (isDue(entry, nowMs)) {
      (entry.state === 2 ? reviews : learning).push(item);
    } else if (entry.state === 1 || entry.state === 3) {
      pending.push(item);
    }
  }
  learning.sort(byDueThenOrder);
  reviews.sort(byDueThenOrder);
  pending.sort(byDueThenOrder);
  fresh.sort((a, b) => a.order - b.order);
  return { settings, learning, reviews, fresh, pending };
}

/** 今日のうち（次の午前4時より前）に期日の来る、まだ期日の来ていない学習中（期日の早い順）。 */
function pendingToday(pending, nowMs) {
  const end = nextDayStart(nowMs);
  return pending.filter((x) => x.due < end);
}

/** ホームの数（§11）。review＝min(期日の来た復習, 残りの上限)＋期日の来た学習中、newCount＝min(未出, 新しい枠の残り)、溜まりと追いつく日数。 */
export function homeCounts(cards, record, nowMs, opts = {}) {
  const { settings, learning, reviews, fresh } = classify(cards, record, nowMs, opts);
  const today = logicalDay(nowMs);
  const reviewLeft = record ? remaining(settings.reviewPerDay, record.reviewsDone, today) : settings.reviewPerDay;
  const newLeft = record ? remaining(settings.newPerDay, record.newIntroduced, today) : settings.newPerDay;
  const chapters = chapterList(cards);
  const chaptersOn = chapters.filter((ch) => Object.hasOwn(settings.chapters, String(ch)) && settings.chapters[String(ch)] === true).length;
  const backlog = Math.max(0, reviews.length - reviewLeft);
  return {
    review: Math.min(reviews.length, reviewLeft) + learning.length,
    newCount: opts.selfPaced ? fresh.length : Math.min(fresh.length, newLeft),
    dueReviews: reviews.length,
    dueLearning: learning.length,
    backlog,
    catchUpDays: backlog > 0 ? Math.ceil(backlog / settings.reviewPerDay) : 0,
    chaptersOn,
    chaptersTotal: chapters.length,
  };
}

/** 「始める」で並べる: 固定の列＝(2) 期日の来た復習（上限まで）→ (3) 新しいカード（枠まで）。(1) は nextCardId のたびに並べ直す。
    front は「1つ戻す」で先頭に出すカード、day は並べた論理日（午前4時をまたいだら並べ直す）。 */
export function buildSession(cards, record, nowMs, opts = {}) {
  const { settings, reviews, fresh } = classify(cards, record, nowMs, opts);
  const today = logicalDay(nowMs);
  const flow = opts.flow ?? "mixed";
  const chapter = flow === "new" && Number.isInteger(opts.chapter) ? opts.chapter : null;
  const reviewLeft = record ? remaining(settings.reviewPerDay, record.reviewsDone, today) : settings.reviewPerDay;
  const newLeft = opts.selfPaced ? Infinity : (record ? remaining(settings.newPerDay, record.newIntroduced, today) : settings.newPerDay);
  const freshIds = fresh.filter((c) => chapter === null || c.chapter === chapter).slice(0, newLeft).map((c) => c.id);
  const reviewIds = reviews.slice(0, reviewLeft).map((x) => x.card.id);
  const fixed = flow === "review" ? reviewIds : flow === "new" ? freshIds : [...reviewIds, ...freshIds];
  return { fixed, front: null, day: today, flow, chapter };
}

/** 流れの opts（session から。buildSession・refreshSession に渡す）。 */
function flowOpts(session, opts) {
  return { ...opts, flow: session.flow ?? "mixed", chapter: session.chapter ?? null };
}

/** 学習の途中で午前4時をまたいだら並べ直す（§11）。front（1つ戻したカード）は残し、その枠を新しい並びから引く（withFront）。 */
export function refreshSession(session, cards, record, nowMs, opts = {}) {
  if (session.day === logicalDay(nowMs)) {
    return session;
  }
  const rebuilt = buildSession(cards, record, nowMs, flowOpts(session, opts));
  const front = session.front ?? null;
  return front === null ? rebuilt : withFront(rebuilt, front, cards, record, nowMs, opts);
}

/** 次に出すカードの id（無ければ null）。front → (1) 期日の来た学習中 → 固定の列 → 学習中だけが残り期日まで 20 分以内なら早出し。 */
export function nextCardId(session, cards, record, nowMs, opts = {}) {
  if (session.front !== null && session.front !== undefined) {
    return session.front;
  }
  if (session.flow === "new") {
    return session.fixed.length > 0 ? session.fixed[0] : null; // 学習中になったカードは「復習する」に入る（§13.5）
  }
  const { learning, pending } = classify(cards, record, nowMs, opts);
  if (learning.length > 0) {
    return learning[0].card.id;
  }
  if (session.fixed.length > 0) {
    return session.fixed[0];
  }
  const today = pendingToday(pending, nowMs);
  if (today.length > 0 && today[0].due - nowMs <= EARLY_MS) {
    return today[0].card.id;
  }
  return null;
}

/** 評価したカードを固定の列（と front）から外す。 */
export function markRated(session, id) {
  return { ...session, fixed: session.fixed.filter((x) => x !== id), front: session.front === id ? null : (session.front ?? null) };
}

/** 評価したときに数える枠: "new"（newIntroduced）・"review"（reviewsDone）・null（学習中。review.js の applyRating と同じ分け方）。 */
function slotOf(record, id) {
  const entry = entryOf(record, id);
  if (isNewEntry(entry)) {
    return "new";
  }
  return entry.state === 2 ? "review" : null;
}

/** 1つ戻したカードを先頭に出す（§11: その後は戻す前の残りの並びを続ける）。
    front も評価すれば枠を1つ使うので、固定の列からその id を除き、同じ種類（新しい／復習）の数が今日の残りの枠を超える分を列の後ろから外す
    （ホームから戻したとき・午前4時またぎで並べ直したときに上限を1超えないため。学習の画面から戻したときは列が評価前の枠で作られているので外れない）。 */
export function withFront(session, id, cards, record, nowMs, opts = {}) {
  const today = logicalDay(nowMs);
  const settings = record ? record.settings : defaultSettings();
  const left = {
    new: opts.selfPaced ? Infinity : (record ? remaining(settings.newPerDay, record.newIntroduced, today) : settings.newPerDay),
    review: record ? remaining(settings.reviewPerDay, record.reviewsDone, today) : settings.reviewPerDay,
  };
  const used = { new: 0, review: 0 };
  const frontSlot = slotOf(record, id);
  if (frontSlot !== null) {
    used[frontSlot] += 1; // front は枠が残っていなくても出す（§4.6「表から出し直す」）
  }
  const kept = [];
  for (const x of session.fixed) {
    if (x === id) {
      continue;
    }
    const slot = slotOf(record, x);
    if (slot !== null) {
      if (used[slot] >= left[slot]) {
        continue;
      }
      used[slot] += 1;
    }
    kept.push(x);
  }
  return { ...session, fixed: kept, front: id };
}

/** 明日の復習（§11）: 明日の論理日の終わりまでに期日が来る state 2 の数（今日やり残した分を含む。章の設定と絞り込みを当て、上限で切らない）。 */
export function tomorrowReviews(cards, record, nowMs, opts = {}) {
  if (!record) {
    return 0;
  }
  const end = nextDayStart(nextDayStart(nowMs));
  let n = 0;
  for (const card of cards) {
    const entry = entryOf(record, card.id);
    if (entry && entry.state === 2 && isEligible(card, record.settings, opts) && Date.parse(entry.due) < end) {
      n += 1;
    }
  }
  return n;
}

/** 出す物が無いときの終わりの表示（§2.2・§11）。
    今日のうちに期日の来る学習中が残る → {kind: "later", at: 最も早い期日を分に切り上げた時刻, count: その時刻までに期日の来る学習中の数}、
    無ければ → {kind: "done", tomorrow: 明日の復習}。 */
export function endState(cards, record, nowMs, opts = {}) {
  const { pending } = classify(cards, record, nowMs, opts);
  const today = pendingToday(pending, nowMs);
  if (today.length > 0) {
    const at = Math.ceil(today[0].due / MINUTE_MS) * MINUTE_MS;
    return { kind: "later", at, count: today.filter((x) => x.due <= at).length };
  }
  return { kind: "done", tomorrow: tomorrowReviews(cards, record, nowMs, opts) };
}

/** 章ごとの新しいカードの残り（§13.5 の「章を選ぶ」）: [{chapter, left}]（カードのある章を番号の順に。絞り込みを当てる）。 */
export function chapterProgress(cards, record, opts = {}) {
  const settings = record ? record.settings : defaultSettings();
  const left = new Map(chapterList(cards).map((ch) => [ch, 0]));
  for (const card of cards) {
    if (isEligible(card, settings, opts) && isNewEntry(entryOf(record, card.id))) {
      left.set(card.chapter, left.get(card.chapter) + 1);
    }
  }
  return [...left].map(([chapter, n]) => ({ chapter, left: n }));
}

/** 続きの位置（§13.5・§13.10）: {chapter, k（その章の絞り込みを当てたカードの order の順で何枚目か）, total（全部の新しいカードの数）}。無ければ null。 */
export function continuePoint(cards, record, opts = {}) {
  const settings = record ? record.settings : defaultSettings();
  const eligible = cards.filter((c) => isEligible(c, settings, opts)).sort((a, b) => a.order - b.order);
  const fresh = eligible.filter((c) => isNewEntry(entryOf(record, c.id)));
  if (fresh.length === 0) {
    return null;
  }
  const first = fresh[0];
  const k = eligible.filter((c) => c.chapter === first.chapter).findIndex((c) => c.id === first.id) + 1;
  return { chapter: first.chapter, k, total: fresh.length };
}

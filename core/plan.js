/* 責務: plan のデッキ（物理）の今日の分の数え（1周目・2周目の日割り・上限の知らせ）・2周目の始まりと対象・「間違えた」の判定・評価の印・練習の範囲（選ぶ・前回の読み方）・
   本編の範囲（rangeOff の切り替え）・目標日の入力の判定・問題集の解いた／間違い（SPEC §14.3〜§14.7・§14.12）。
   依存: ./day.js、./scheduler.js（期日の判定）、./queue.js（出す本編のカードの判定・項目の引き当て）、./record.js（既定の設定）、./review.js（評価）、./fields.js（章の分野）、./stats.js（「覚えた」の境目）。
   注意: 時刻とデッキの値（fields・examDay）は引数（core は DECK を読まない）。記録は変えず新しい記録を返す。数は §14.12 の式（数の表はテストが直書きで確かめる）。 */
import { logicalDay, nextDayStart, addDays } from "./day.js";
import { isDue } from "./scheduler.js";
import { entryOf, isNewEntry, isEligible } from "./queue.js";
import { defaultSettings, PLAN_NEW_DEFAULT, NOTICE_OFF_MAX, PACKS_MAX, PACK_IDS_MAX, RANGE_MAX, isDayKey } from "./record.js";
import { applyRating, applyPracticeOnly } from "./review.js";
import { fieldOfChapter } from "./fields.js";
import { LEARNED_DAYS } from "./stats.js";

/** 「間違えた」の difficulty の境目（§14.5）。2026-10-22 に ts-fsrs 5.4.2 の実物で測った値（scratchpad の fsrs_probe）:
    最初に「もう一度」1回で 6.41、その後「正解」5回でも 6.36（ほとんど戻らない）、「難しい」1回 5.11・2回 6.74、「正解」だけ 2.1 前後。 */
export const MISTAKE_DIFFICULTY = 6.0;
/** 間隔がこの日数以上に伸びたら「間違えた」から外す（統計の「覚えた」の境目 LEARNED_DAYS＝21 をそのまま使う。§14.12）。 */
export const OVERCOME_DAYS = LEARNED_DAYS;

const PLAN_OPTS = Object.freeze({ plan: true });
const DAY_MS = 86400000;

/** a から b までの日数（YYYY-MM-DD の暦で b − a）。 */
export function dayDiff(a, b) {
  const t = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / DAY_MS);
}

/** 本編のカードか（pack が null。§14.3）。 */
export function isMainCard(card) {
  return (card.pack ?? null) === null;
}

/** 記録の設定（記録が無いときは plan のデッキの既定: 新しいカードの上限 30。§14.3）。 */
export function planSettings(record) {
  return record ? record.settings : { ...defaultSettings(), newPerDay: PLAN_NEW_DEFAULT };
}

/** 出す本編のカードか（§14.3: pack が null・rangeOff に無い章・★だけ・発展を除く・札）。 */
export function isPlanEligible(card, settings) {
  return isEligible(card, settings, PLAN_OPTS);
}

/** 「間違えた」（§14.5 を §14.12 で置き換え）: state が 0 でなく、lapses ≥ 1 か difficulty ≥ 6.0 で、かつ scheduled_days が 21 日未満。 */
export function isMistaken(entry) {
  return Boolean(entry) && entry.state !== 0 && (entry.lapses >= 1 || entry.difficulty >= MISTAKE_DIFFICULTY)
    && entry.scheduled_days < OVERCOME_DAYS;
}

/** 分野の2周目の境目 B（round2Start の次の午前4時のミリ秒。round2Start にその分野が無ければ null。§14.12）。 */
export function round2Begin(record, fieldId) {
  const starts = record && record.round2Start ? record.round2Start : null;
  if (starts === null || !Object.hasOwn(starts, fieldId)) {
    return null;
  }
  return nextDayStart(Date.parse(starts[fieldId]));
}

/** 2周目の対象か（§14.12）: 出す本編のカードで、分野の B ≤ 今、state 2、期日が今日より後、last_review が B より前、
    round2Mode が "miss" なら「間違えた」物。ignoreDue なら期日の条件を外す（期日の来た復習を評価したときの round2Seen の判定）。 */
export function isRound2Target(card, record, nowMs, fields, ignoreDue = false) {
  if (!record || !isPlanEligible(card, record.settings)) {
    return false;
  }
  const f = fieldOfChapter(fields, card.chapter);
  const begin = f === null ? null : round2Begin(record, f.id);
  if (begin === null || nowMs < begin) {
    return false;
  }
  const e = entryOf(record, card.id);
  if (!e || e.state !== 2 || !(Date.parse(e.last_review) < begin)) {
    return false;
  }
  if (!ignoreDue && isDue(e, nowMs)) {
    return false;
  }
  return (record.settings.round2Mode ?? "all") === "all" || isMistaken(e);
}

function dayValue(map, day) {
  return map && Object.hasOwn(map, day) ? map[day] : 0;
}

/** 1つの周の今日の数（§14.3・§14.12）。R＝残り、done＝今日数えた分（planNew か round2Seen）、goal＝目標日（null＝目標なし）、avail＝使える上限。
    目標なしは q＝上限の残り（ただし R ＋ done まで。A200）、目標ありは q＝min(avail, ceil((R ＋ done) ÷ D))、D＝max(1, 目標日 − 今日)。 */
function roundQuota(R, done, goal, avail, today) {
  if (goal === null) {
    const q = Math.min(avail, R + done);
    return { q, left: Math.min(R, Math.max(0, q - done)), days: null, want: q };
  }
  const days = Math.max(1, dayDiff(today, goal));
  const want = Math.ceil((R + done) / days);
  const q = Math.min(avail, want);
  return { q, left: Math.min(R, Math.max(0, q - done)), days, want };
}

/** 上限の知らせ（§14.3・§14.12）: 目標日があり、上限の残り avail が 0 でなく、ceil(… ÷ D) が avail を超える間で、
    見込みの日（今日 ＋ ceil((R − 今日の残り) ÷ avail)）が目標日より後のときだけ（同じ日か前なら出さない）。 */
function capNotice(round, quota, R, goal, cap, avail, today, off) {
  if (goal === null || avail <= 0 || !(quota.want > avail) || R <= 0) {
    return null;
  }
  const finish = addDays(today, Math.ceil((R - quota.left) / avail));
  const key = `r${round}:${goal}:${cap}`;
  if (!(finish > goal) || off.includes(key)) {
    return null; // YYYY-MM-DD は文字列の比較で日の前後になる
  }
  return { round, goal, cap, finish, key };
}

/**
 * 今日の分の数（§14.3・§14.12）。deck は {fields, examDay}（デッキの値）。
 * 返り値: {today, cap, capZero, r1, q1, newLeft, d1, goal1, r2, q2, r2Left, d2, goal2, notices: [{round, goal, cap, finish, key}],
 *          round2Active（2周目の始まった分野がある）, round2Waiting（round2Start があり翌日を待つ分野がある）,
 *          allDone（両方の周が終わった: 1周目の残りが 0、全部の分野の2周目が始まっていて、期日の条件を外した2周目の対象も 0）}。
 * d1・d2 は日割りの日数（目標日が無ければ null）。上限 cap は2つの周の合計で、1周目を先に取る（q2 ≤ cap − q1）。
 */
export function planCounts(cards, record, nowMs, deck) {
  const settings = planSettings(record);
  const fields = deck.fields ?? [];
  const today = logicalDay(nowMs);
  let r1 = 0;
  let r2 = 0;
  let r2AnyDue = 0; // 期日の条件を外した2周目の対象（今日が期日で (2) に入っている物も数える。allDone の判定）
  const fieldIds = new Set();
  for (const card of cards) {
    if (!isPlanEligible(card, settings)) {
      continue;
    }
    if (isNewEntry(entryOf(record, card.id))) {
      r1 += 1;
    } else if (isRound2Target(card, record, nowMs, fields, true)) {
      r2AnyDue += 1;
      if (isRound2Target(card, record, nowMs, fields)) {
        r2 += 1;
      }
    }
    const f = fieldOfChapter(fields, card.chapter);
    if (f !== null) {
      fieldIds.add(f.id);
    }
  }
  const cap = settings.newPerDay;
  const exam = deck.examDay ?? null;
  const goal1 = settings.goal1 ?? exam;
  const goal2 = settings.goal2 ?? exam;
  const one = roundQuota(r1, record ? dayValue(record.planNew, today) : 0, goal1, cap, today);
  const avail2 = Math.max(0, cap - one.q);
  const two = roundQuota(r2, record ? dayValue(record.round2Seen, today) : 0, goal2, avail2, today);
  const off = record && Array.isArray(record.planNoticeOff) ? record.planNoticeOff : [];
  const notices = [capNotice(1, one, r1, goal1, cap, cap, today, off), capNotice(2, two, r2, goal2, cap, avail2, today, off)]
    .filter((x) => x !== null);
  const begins = [...fieldIds].map((id) => round2Begin(record, id));
  const round2Active = begins.some((b) => b !== null && nowMs >= b);
  const round2Waiting = begins.some((b) => b !== null && nowMs < b);
  return {
    today, cap, capZero: cap === 0,
    r1, q1: one.q, newLeft: one.left, d1: one.days, goal1,
    r2, q2: two.q, r2Left: two.left, d2: two.days, goal2,
    notices, round2Active, round2Waiting,
    allDone: r1 === 0 && r2AnyDue === 0 && begins.length > 0 && begins.every((b) => b !== null && nowMs >= b),
  };
}

/** 2周目の今日のカード（対象を order 順に limit 枚。§14.3 の (4)）。 */
export function round2Ids(cards, record, nowMs, fields, limit) {
  return cards
    .filter((c) => isRound2Target(c, record, nowMs, fields))
    .sort((a, b) => a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map((c) => c.id);
}

/** queue.js の buildSession・refreshSession・withFront・homeCounts に渡す opts（その時刻で数える。午前4時をまたいだら呼び直す）。 */
export function planQueueOpts(cards, record, nowMs, deck) {
  const c = planCounts(cards, record, nowMs, deck);
  return { plan: true, newLimit: c.newLeft, round2Ids: round2Ids(cards, record, nowMs, deck.fields ?? [], c.r2Left) };
}

/** 今日の論理日の log がそのカードに1件も無いか（練習の「その日最初の1回」。§14.4）。 */
export function isFirstToday(record, id, nowMs) {
  if (!record) {
    return true;
  }
  const today = logicalDay(nowMs);
  return !record.log.some((x) => x.i === id && logicalDay(x.t) === today);
}

/** 評価の前に決める印（§14.12。applyRating の marks）: pn＝出す本編の新しいカードだった、r2＝2周目の対象だった（期日の条件を外して判定）。 */
export function ratingMarks(card, record, nowMs, fields) {
  const settings = planSettings(record);
  return {
    pn: isPlanEligible(card, settings) && isNewEntry(entryOf(record, card.id)),
    r2: isRound2Target(card, record, nowMs, fields, true),
  };
}

/** 評価の保存の前に、評価したカードの分野の「出す本編のカードのうち新しい物」が 0 で round2Start にその分野が無ければ、評価の時刻を書く（§14.12）。
    書いた分野の id を undo.r2s に入れる。出す本編のカードが 0 枚の分野には書かない。設定の変更では呼ばない。 */
export function markRound2Start(record, cards, card, nowMs, fields) {
  const f = isMainCard(card) ? fieldOfChapter(fields, card.chapter) : null;
  if (f === null || (record.round2Start && Object.hasOwn(record.round2Start, f.id))) {
    return record;
  }
  let any = false;
  for (const c of cards) {
    if (!isPlanEligible(c, record.settings) || fieldOfChapter(fields, c.chapter) !== f) {
      continue;
    }
    any = true;
    if (isNewEntry(entryOf(record, c.id))) {
      return record;
    }
  }
  if (!any) {
    return record;
  }
  const round2Start = { ...(record.round2Start ?? {}), [f.id]: new Date(nowMs).toISOString() };
  return { ...record, round2Start, undo: record.undo ? { ...record.undo, r2s: f.id } : record.undo };
}

/**
 * plan のデッキの評価（今日の分・練習。§14.3・§14.4・§14.12）。記録は呼ぶ側が作ってから渡す（null は不可）。
 * practice が真で今日の log が既にあるカードは記録に返さない（practiceDone だけ）。ほかは印を付けて評価し、round2Start を書く。
 */
export function planRate(record, cards, card, rating, nowMs, fields, { practice = false } = {}) {
  if (practice && !isFirstToday(record, card.id, nowMs)) {
    return applyPracticeOnly(record, card.id, nowMs);
  }
  const marks = { ...ratingMarks(card, record, nowMs, fields), p: practice };
  return markRound2Start(applyRating(record, card.id, rating, nowMs, marks), cards, card, nowMs, fields);
}

/** 上限の知らせの ×（§14.3）: planNoticeOff に key を足す。20 個を超えたら古い方から捨てる（§14.12）。 */
export function dismissPlanNotice(record, key) {
  const off = (record.planNoticeOff ?? []).filter((k) => k !== key);
  off.push(key);
  return { ...record, planNoticeOff: off.slice(Math.max(0, off.length - NOTICE_OFF_MAX)) };
}

// ---- 練習（§14.4） ----

/** 「間違えた問題を解き直す」の id（出す本編のカードのうち「間違えた」物を order 順。混ぜるのは呼ぶ側）。 */
export function mistakenIds(cards, record) {
  if (!record) {
    return [];
  }
  return cards
    .filter((c) => isPlanEligible(c, record.settings) && isMistaken(entryOf(record, c.id)))
    .sort((a, b) => a.order - b.order)
    .map((c) => c.id);
}

/** 練習の範囲の既定（何も選んでいない。§14.4・§14.8）。 */
export function emptyRange() {
  return { chapters: [], tags: [], which: "all" };
}

/** 範囲を選んで解くの id（§14.4: 本編のうち選んだ章にあり、札を選んでいればその札（tag が null のカードは入る）、which が "miss" なら「間違えた」物。
    settings の rangeOff・★だけ・発展を除く・札は当てない）。order 順（混ぜるのは呼ぶ側）。 */
export function practiceIds(cards, record, range) {
  const chapters = new Set(range.chapters);
  const tags = new Set(range.tags);
  return cards
    .filter((c) => {
      if (!isMainCard(c) || !chapters.has(c.chapter)) {
        return false;
      }
      const tag = c.tag ?? null;
      if (tags.size > 0 && tag !== null && !tags.has(tag)) {
        return false;
      }
      return range.which !== "miss" || isMistaken(entryOf(record, c.id));
    })
    .sort((a, b) => a.order - b.order)
    .map((c) => c.id);
}

/** 混ぜる（Fisher–Yates。rand は 0 以上 1 未満を返す関数）。元の配列は変えない。 */
export function shuffled(ids, rand) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 前回の範囲の言い方の材料（§14.4。今のカードに無い章は除く）:
    {kind: "none"}（選んだ章が無い） / {kind: "span", field, a, b}（同じ分野で、本編のカードのある章が続いている。a〜b は chapter の番号）
    / {kind: "many", first, n}（続かない・分野をまたぐ。first は最初の章、n はほかの章の数）。 */
export function rangeSummary(range, cards, fields) {
  const present = new Set(cards.filter(isMainCard).map((c) => c.chapter));
  const chs = [...new Set(range.chapters)].filter((ch) => present.has(ch)).sort((a, b) => a - b);
  if (chs.length === 0) {
    return { kind: "none" };
  }
  const f = fieldOfChapter(fields, chs[0]);
  const sameField = f !== null && chs.every((ch) => fieldOfChapter(fields, ch) === f);
  const inField = [...present].filter((ch) => fieldOfChapter(fields, ch) === f).sort((a, b) => a - b);
  const i = inField.indexOf(chs[0]);
  if (sameField && chs.every((ch, k) => inField[i + k] === ch)) {
    return { kind: "span", field: f, a: chs[0], b: chs[chs.length - 1] };
  }
  return { kind: "many", first: chs[0], n: chs.length - 1 };
}

/** 範囲を選んで解くの最初の選択（§14.4・§14.12）: 前回の範囲（無ければ何も選んでいない）から、今の本編のカードに無い章と
    今のデッキに無い札を除いた物（記録は直さない。読む側で無視する）。tagIds はデッキの札の id の一覧。 */
export function readRange(range, cards, tagIds) {
  const r = range ?? emptyRange();
  const present = new Set(cards.filter(isMainCard).map((c) => c.chapter));
  const known = new Set(tagIds);
  return {
    chapters: [...new Set(r.chapters)].filter((ch) => present.has(ch)).sort((a, b) => a - b),
    tags: [...new Set(r.tags)].filter((t) => known.has(t)),
    which: r.which === "miss" ? "miss" : "all",
  };
}

/** 範囲の章を1つ選ぶ・外す（新しい範囲を返す。章は昇順）。 */
export function toggleRangeChapter(range, ch) {
  const has = range.chapters.includes(ch);
  const chapters = has ? range.chapters.filter((x) => x !== ch) : [...range.chapters, ch].sort((a, b) => a - b);
  return { ...range, chapters };
}

/** 分野の「全部」（§14.4）: その分野の本編のカードのある章を全部選ぶ。全部選んでいれば全部外す。 */
export function toggleRangeField(range, cards, fields, fieldId) {
  const chs = fieldChapters(cards, fields, fieldId);
  const sel = new Set(range.chapters);
  const all = chs.length > 0 && chs.every((ch) => sel.has(ch));
  for (const ch of chs) {
    if (all) {
      sel.delete(ch);
    } else {
      sel.add(ch);
    }
  }
  return { ...range, chapters: [...sel].sort((a, b) => a - b) };
}

/** 範囲の札を1つ選ぶ・外す。null は「全部」（札の選択を空にする。§14.4）。 */
export function toggleRangeTag(range, tagId) {
  if (tagId === null) {
    return { ...range, tags: [] };
  }
  const tags = range.tags.includes(tagId) ? range.tags.filter((t) => t !== tagId) : [...range.tags, tagId];
  return { ...range, tags };
}

/** 分野の本編のカードのある章（昇順）。 */
export function fieldChapters(cards, fields, fieldId) {
  const out = new Set();
  for (const c of cards) {
    const f = isMainCard(c) ? fieldOfChapter(fields, c.chapter) : null;
    if (f !== null && f.id === fieldId) {
      out.add(c.chapter);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// ---- 本編の範囲（settings.rangeOff。§14.7） ----

/** 本編の範囲の画面の材料（§14.7）: 分野ごとに {field, chapters: [{ch, n（本編の枚数）, on}], cards（本編の枚数）, allOn}。
    カードの無い分野は chapters が空（「準備中」）。rangeOff の今のカードに無い章のキーは数えない（§14.12）。 */
export function rangeView(cards, fields, settings) {
  const off = new Set(Array.isArray(settings.rangeOff) ? settings.rangeOff : []);
  return fields.map((field) => {
    const counts = new Map();
    for (const c of cards) {
      const f = isMainCard(c) ? fieldOfChapter(fields, c.chapter) : null;
      if (f !== null && f.id === field.id) {
        counts.set(c.chapter, (counts.get(c.chapter) ?? 0) + 1);
      }
    }
    const chapters = [...counts.keys()].sort((a, b) => a - b).map((ch) => ({ ch, n: counts.get(ch), on: !off.has(String(ch)) }));
    return {
      field, chapters, cards: chapters.reduce((s, x) => s + x.n, 0), allOn: chapters.length > 0 && chapters.every((x) => x.on),
    };
  });
}

/** 設定の「本編の範囲」の要約（§14.7）: {chapters（本編のカードのある章の数）, cards（本編の枚数）, off（外した章のうち今のカードにある物の数）}。 */
export function rangeOffSummary(cards, settings) {
  const off = new Set(Array.isArray(settings.rangeOff) ? settings.rangeOff : []);
  const main = cards.filter(isMainCard);
  const chs = new Set(main.map((c) => c.chapter));
  return { chapters: chs.size, cards: main.length, off: [...chs].filter((ch) => off.has(String(ch))).length };
}

function withRangeOff(settings, off, cards) {
  let list = [...new Set(off)];
  if (list.length > RANGE_MAX) {
    const present = new Set(cards.filter(isMainCard).map((c) => String(c.chapter)));
    const stale = list.filter((k) => !present.has(k)); // 上限を超えるときだけ、今のカードに無い章のキーから捨てる
    list = list.filter((k) => present.has(k) || stale.indexOf(k) >= list.length - RANGE_MAX);
  }
  return { ...settings, rangeOff: list.sort((a, b) => Number(a) - Number(b)) };
}

/** 本編の範囲の章の「出す／出さない」（§14.7）: rangeOff に章のキーを足す・除く（新しい settings を返す）。 */
export function toggleRangeOff(settings, ch, cards) {
  const key = String(ch);
  const off = Array.isArray(settings.rangeOff) ? settings.rangeOff : [];
  return withRangeOff(settings, off.includes(key) ? off.filter((k) => k !== key) : [...off, key], cards);
}

/** 本編の範囲の分野の「出す／出さない」（§14.7）: 全部出していれば分野の章を全部外し、ほかは全部出す。 */
export function toggleRangeOffField(settings, cards, fields, fieldId) {
  const chs = fieldChapters(cards, fields, fieldId).map(String);
  const off = Array.isArray(settings.rangeOff) ? settings.rangeOff : [];
  const allOn = chs.length > 0 && chs.every((k) => !off.includes(k));
  const next = allOn ? [...off, ...chs] : off.filter((k) => !chs.includes(k));
  return withRangeOff(settings, next, cards);
}

// ---- 目標日（§14.7） ----

/** 目標日の入力の判定（§14.7）: which は "goal1" か "goal2"、value は input type=date の値（"" は未設定＝null）。
    今日の論理日以前は "past"、2周目が1周目以前は "order"（もう一方が null か今日以前なら比べない。A218）、形の違いは "bad"。
    返り値: {ok: true, value（null か YYYY-MM-DD）} か {ok: false, why}。 */
export function checkGoal(settings, which, value, today) {
  if (value === "") {
    return { ok: true, value: null };
  }
  if (!isDayKey(value)) {
    return { ok: false, why: "bad" };
  }
  if (value <= today) {
    return { ok: false, why: "past" }; // YYYY-MM-DD は文字列の比較で日の前後になる
  }
  const other = which === "goal1" ? settings.goal2 ?? null : settings.goal1 ?? null;
  // 過ぎた目標日とは比べない（両方過ぎていても1周目を未来に直せる。§14.7）
  if (other !== null && other > today && (which === "goal1" ? other <= value : value <= other)) {
    return { ok: false, why: "order" };
  }
  return { ok: true, value };
}

// ---- 問題集（§14.6。FSRS の記録に入れない） ----

/** 問題集の記録（無ければ空の done・miss）。 */
export function packEntry(record, packId) {
  const packs = record && record.packs ? record.packs : null;
  return packs !== null && Object.hasOwn(packs, packId) ? packs[packId] : { done: [], miss: [] };
}

/** 問題集の数と並び（今のデッキのカードだけ数える）: {total, done, miss, nextIds（done に無い物）, missIds}（order 順）。 */
export function packView(cards, record, packId) {
  const list = cards.filter((c) => (c.pack ?? null) === packId).sort((a, b) => a.order - b.order);
  const ent = packEntry(record, packId);
  const done = new Set(ent.done);
  const miss = new Set(ent.miss);
  return {
    total: list.length,
    done: list.filter((c) => done.has(c.id)).length,
    miss: list.filter((c) => miss.has(c.id)).length,
    nextIds: list.filter((c) => !done.has(c.id)).map((c) => c.id),
    missIds: list.filter((c) => miss.has(c.id)).map((c) => c.id),
  };
}

/** 上限 max を超える分だけ list から捨てる（§14.6）: まず isKnown が偽の物を前から、それでも超えるなら前（古い方）から。keep は捨てない。 */
function trimOver(list, max, isKnown, keep) {
  let excess = list.length - max;
  if (excess <= 0) {
    return list;
  }
  const drop = new Set();
  for (const x of list) {
    if (excess > 0 && x !== keep && !isKnown(x)) {
      drop.add(x);
      excess -= 1;
    }
  }
  for (const x of list) {
    if (excess > 0 && x !== keep && !drop.has(x)) {
      drop.add(x);
      excess -= 1;
    }
  }
  return list.filter((x) => !drop.has(x));
}

/** 問題集の答え（§14.6）: ok（できた）なら done に足し miss から除く、偽（間違えた）なら done と miss に足す。cards・log などは変えない。
    cards は今のデッキのカード（問題集とそのカードの id を知るため）。足した結果が記録の検査の上限（done・miss 各 PACK_IDS_MAX 個、
    packs のキー PACKS_MAX 個）を超えるときだけ、今のデッキに無い物を先に、それでも超えるなら古い方（前）から捨てる（上限の中なら残す）。 */
export function answerPack(record, packId, cardId, ok, cards) {
  const ent = packEntry(record, packId);
  const inPack = new Set(cards.filter((c) => (c.pack ?? null) === packId).map((c) => c.id));
  const known = (id) => inPack.has(id);
  const done = trimOver(ent.done.includes(cardId) ? [...ent.done] : [...ent.done, cardId], PACK_IDS_MAX, known, cardId);
  const rest = ent.miss.filter((x) => x !== cardId);
  const miss = trimOver(ok ? rest : [...rest, cardId], PACK_IDS_MAX, known, cardId);
  const packs = { ...(record.packs ?? {}), [packId]: { done, miss } };
  const deckPacks = new Set(cards.map((c) => c.pack ?? null).filter((p) => p !== null));
  const keys = trimOver(Object.keys(packs), PACKS_MAX, (k) => deckPacks.has(k), packId);
  if (keys.length === Object.keys(packs).length) {
    return { ...record, packs };
  }
  return { ...record, packs: Object.fromEntries(keys.map((k) => [k, packs[k]])) };
}

/** 問題集の「最初から」（§14.6）: done を空にし、miss は残す。 */
export function resetPack(record, packId) {
  const ent = packEntry(record, packId);
  return { ...record, packs: { ...(record.packs ?? {}), [packId]: { done: [], miss: [...ent.miss] } } };
}

/** 問題集の1つ戻す（§14.6）: 押す前の packs の値に戻す（before は押す前の record.packs。欄が無かったなら undefined で欄ごと消す）。 */
export function restorePacks(record, before) {
  if (before === undefined) {
    const { packs: _gone, ...rest } = record;
    return rest;
  }
  return { ...record, packs: before };
}

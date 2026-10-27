/* 責務: 記録の形（SPEC §4.2・§14.8・§14.12 の plan の欄）・既定値と上限の入力（§2.3・§11）・作成（§4.7）・保存の前の刈り込み・§4.8 の検査（読み込みと起動と保存前で同じ関数）と直して読む物・退避の形（§4.9）。
   依存: ./day.js、./scheduler.js（項目の欄の一覧）、./fields.js（章のキーの上限の既定 30。分野のあるデッキは呼ぶ側が 999 を渡す。§14.12）。
   注意: 正規表現は [0-9] と m なしの ^…$（§3）。文字列か先に確かめてから test する（RegExp.test は数を文字列に直して通してしまう）。キーは検査してから代入する（__proto__ などを入れない）。plan の欄は省略可で、無いときは補わない（化学の形を変えない）。 */
import { logicalDay, addDays } from "./day.js";
import { ENTRY_FIELDS } from "./scheduler.js";
import { CHAPTER_MAX_PLAIN } from "./fields.js";

export const SCHEMA = 1;
export const LOG_MAX = 5000;
export const DAYS_MAX = 400;
export const KEEP_DAY_KEYS = 30; // 今日〜29 日前（§11 の刈り込み）
export const BROKEN_RAW_MAX = 600000; // 退避の raw の上限の文字数（§4.9）
export const ID_RE = /^[A-Za-z0-9-]{1,40}$/;
const ISO_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/;
const DAY_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const CHAPTER_KEY_RE = /^(0|[1-9][0-9]{0,2})$/; // 上限は検査の引数 chapterMax（化学 30・分野のあるデッキ 999。§14.2）
const HASH_RE = /^[0-9a-f]{8}$/;
const PATH_KEY_RE = /^[A-Za-z0-9-]+$/;
const SURROGATE_RE = /[\uD800-\uDFFF]/;
const MAX_TIME_MS = 8.64e15; // Date で表せる最大（log の t・undo の t の上限）
const INT_FIELDS = ["elapsed_days", "scheduled_days", "learning_steps", "reps", "lapses"];
const SETTINGS_FIELDS = ["chapters", "starOnly", "excludeYoyu", "newPerDay", "reviewPerDay"];
/** settings の省略できる欄（§12.3 の tags・§13.4 の pack・§14.8 の plan の欄）。 */
const SETTINGS_OPTIONAL = ["tags", "pack", "goal1", "goal2", "round2Mode", "rangeOff", "practice"];
/** plan の欄の個数の上限（§14.8）。 */
export const RANGE_MAX = 1000; // rangeOff・practice.chapters
export const PRACTICE_TAGS_MAX = 20;
export const PACKS_MAX = 20;
export const PACK_IDS_MAX = 600; // packs の done・miss のそれぞれ（1つの問題集の上限 600 枚と同じ。A264 で 500 から 600 に）
export const NOTICE_OFF_MAX = 20; // planNoticeOff（検査では超えたら形の違い。§14.12）
/** 分野の id（§14.1。round2Start のキー・undo.r2s）。 */
export const FIELD_ID_RE = /^[a-z]{2,12}$/;
const NOTICE_OFF_RE = /^r[12]:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{1,2}$/;
/** plan のデッキで記録を作るときの新しいカードの上限の既定（§14.3。createRecord の newPerDay に渡す）。 */
export const PLAN_NEW_DEFAULT = 30;

export function defaultSettings() {
  return { chapters: {}, starOnly: false, excludeYoyu: false, newPerDay: 10, reviewPerDay: 120 };
}

/** 1日の上限の範囲（§2.3・§4.8）。 */
export const LIMITS = Object.freeze({
  newPerDay: Object.freeze({ min: 0, max: 50 }),
  reviewPerDay: Object.freeze({ min: 30, max: 400 }),
});

/** 上限の入力（§11）: 前後の空白を除き、全角の数字を半角にし、^[0-9]+$ だけを受け付けて範囲の中なら整数、それ以外は null。 */
export function parseLimitInput(text, min, max) {
  if (typeof text !== "string") {
    return null;
  }
  const s = text.trim().replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));
  if (!/^[0-9]+$/.test(s)) {
    return null;
  }
  const n = Number.parseInt(s, 10);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

/** ISO（§11: 正規表現に合い、Date.parse が有限で、日付の部分が往復で一致）。 */
export function isIso(s) {
  if (typeof s !== "string" || !ISO_RE.test(s)) {
    return false;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s.slice(0, 10);
}

/** YYYY-MM-DD の実在する日付（§11: 2026-02-30 を弾く）。 */
export function isDayKey(s) {
  if (typeof s !== "string" || !DAY_RE.test(s)) {
    return false;
  }
  const t = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function isId(s) {
  return typeof s === "string" && ID_RE.test(s);
}

function isPlainObject(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function isPosTime(v) {
  return Number.isInteger(v) && v > 0 && v <= MAX_TIME_MS;
}

/** 場所の書き方（§11）: キーが英数字と - だけなら .key、それ以外は ["…"]。 */
export function keyPath(base, key) {
  return PATH_KEY_RE.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

/** 記録を作る（§4.7）。chapters は cards.json にある章を全部「出さない」で入れる。hashes は {id: 8桁}。
    deckId は bareRecord が偽のデッキ（物理）だけが渡す（化学の記録の形は変えない。§12.8）。
    newPerDay は新しいカードの上限の既定を変えるときだけ渡す（plan のデッキは PLAN_NEW_DEFAULT＝30。§14.3）。 */
export function createRecord({ cards, edition, hashes, nowMs, deckId = null, newPerDay = null }) {
  const settings = defaultSettings();
  if (newPerDay !== null) {
    settings.newPerDay = newPerDay;
  }
  for (const ch of [...new Set(cards.map((c) => c.chapter))].sort((a, b) => a - b)) {
    settings.chapters[String(ch)] = false;
  }
  const rec = {
    schema: SCHEMA,
    createdAt: new Date(nowMs).toISOString(),
    lastExportAt: null,
    deck: { edition, hash: { ...hashes }, noticeBase: null },
    settings,
    cards: {},
    newIntroduced: {},
    reviewsDone: {},
    days: [],
    log: [],
    undo: null,
  };
  return deckId === null ? rec : { ...rec, deckId };
}

/** 札の id（§12.3。settings.tags のキー）。 */
export const TAG_ID_RE = /^[a-z0-9-]{1,20}$/;

/** 記録の教科の印（§12.8）。deckId（`^[a-z]{2,10}$`）が無ければ bareDeck（化学の記録の形）。 */
export const DECK_ID_RE = /^[a-z]{2,10}$/;

/** 記録がこのデッキの物か（§12.8）: deckId があればそれが ownId と同じ、無ければ ownIsBare（このデッキが bareRecord）。
    違えば記録の deckId（無ければ null）を返し、合えば undefined。 */
export function foreignDeckOf(record, ownId, ownIsBare) {
  const id = Object.hasOwn(record, "deckId") ? record.deckId : null;
  if (id === null ? ownIsBare : id === ownId) {
    return undefined;
  }
  return id;
}

function pruneDayMap(map, oldestKept) {
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    if (k >= oldestKept) {
      out[k] = v;
    }
  }
  return out;
}

/** plan の日のキーの数（§14.8・§14.12。newIntroduced と同じ形・同じ刈り込み）。省略可。 */
export const PLAN_DAY_MAPS = Object.freeze(["round2Seen", "planNew", "practiceDone"]);

/** 保存の直前の刈り込み: log は新しい方 5,000 件、days は昇順・重複なし・新しい方 400 件、日のキーは今日〜29 日前と未来を残す
    （plan の日のキーの数も、あるときだけ同じに刈る。無ければ足さない）。 */
export function prepareForSave(record, nowMs) {
  const oldestKept = addDays(logicalDay(nowMs), -(KEEP_DAY_KEYS - 1));
  const days = [...new Set(record.days)].sort();
  const out = {
    ...record,
    log: record.log.length > LOG_MAX ? record.log.slice(record.log.length - LOG_MAX) : record.log,
    days: days.length > DAYS_MAX ? days.slice(days.length - DAYS_MAX) : days,
    newIntroduced: pruneDayMap(record.newIntroduced, oldestKept),
    reviewsDone: pruneDayMap(record.reviewsDone, oldestKept),
  };
  for (const k of PLAN_DAY_MAPS) {
    if (Object.hasOwn(record, k) && isPlainObject(record[k])) {
      out[k] = pruneDayMap(record[k], oldestKept);
    }
  }
  return out;
}

const ENTRY_CHECKS = {
  due: isIso,
  stability: (v) => isFiniteNumber(v) && v >= 0,
  difficulty: (v) => isFiniteNumber(v) && v >= 0 && v <= 10,
  elapsed_days: isNonNegInt,
  scheduled_days: isNonNegInt,
  learning_steps: isNonNegInt,
  reps: isNonNegInt,
  lapses: isNonNegInt,
  state: (v) => Number.isInteger(v) && v >= 0 && v <= 3,
  last_review: (v) => v === null || isIso(v),
};

/** cards の1項目の検査（§4.8）。違反の欄の名前（項目がオブジェクトでなければ ""）、通れば null。
    順番: 書かれている欄をキーの出現順に → 無い欄 → 組み合わせ（state 0 は last_review null・reps 0、ほかは last_review の ISO・reps ≥ 1・stability > 0）。 */
export function checkEntry(e) {
  if (!isPlainObject(e)) {
    return "";
  }
  for (const k of Object.keys(e)) {
    if (Object.hasOwn(ENTRY_CHECKS, k) && !ENTRY_CHECKS[k](e[k])) {
      return k;
    }
  }
  for (const f of ENTRY_FIELDS) {
    if (!Object.hasOwn(e, f)) {
      return f;
    }
  }
  if (e.state === 0) {
    if (e.last_review !== null) {
      return "last_review";
    }
    return e.reps === 0 ? null : "reps";
  }
  if (e.last_review === null) {
    return "last_review";
  }
  if (e.reps < 1) {
    return "reps";
  }
  return e.stability > 0 ? null : "stability";
}

/** 検査に通った項目から欄を拾う（余分なキーを捨てる）。 */
function pickEntry(e) {
  const out = {};
  for (const f of ENTRY_FIELDS) {
    out[f] = e[f];
  }
  return out;
}

class Shape extends Error {
  constructor(where) {
    super(where);
    this.where = where;
  }
}

function fail(where) {
  throw new Shape(where);
}

/** 余分なキーがあれば repaired を立てる。 */
function noteExtras(obj, allowed, rep) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      rep.flag = true;
      return;
    }
  }
}

function checkEntryAt(e, base) {
  const bad = checkEntry(e);
  if (bad !== null) {
    fail(bad === "" ? base : `${base}.${bad}`);
  }
}

/** 章のキーの文字列（§14.2。"0"〜上限）。 */
function isChapterKey(x, chapterMax) {
  return typeof x === "string" && CHAPTER_KEY_RE.test(x) && Number(x) <= chapterMax;
}

/** 重複なし・max 個までの配列（§14.8）。違反は配列そのもの（配列でない・多すぎる）か要素の場所 [n]（形が違う・前と重なる）。 */
function checkUniqueList(v, base, max, ok) {
  if (!Array.isArray(v) || v.length > max) {
    fail(base);
  }
  const seen = new Set();
  v.forEach((x, n) => {
    if (!ok(x) || seen.has(x)) {
      fail(`${base}[${n}]`);
    }
    seen.add(x);
  });
  return [...v];
}

/** settings.practice（§14.8: 練習の前回の範囲）。chapters は §14.2 の範囲の整数だけを見る（今のカードに無い章も通す。§14.12）。 */
function validPractice(v, base, rep, chapterMax) {
  if (!isPlainObject(v)) {
    fail(base);
  }
  for (const pk of Object.keys(v)) {
    if (pk === "chapters") {
      checkUniqueList(v.chapters, `${base}.chapters`, RANGE_MAX, (x) => Number.isInteger(x) && x >= 0 && x <= chapterMax);
    } else if (pk === "tags") {
      checkUniqueList(v.tags, `${base}.tags`, PRACTICE_TAGS_MAX, (x) => typeof x === "string" && TAG_ID_RE.test(x));
    } else if (pk === "which" && v.which !== "all" && v.which !== "miss") {
      fail(`${base}.which`);
    }
  }
  for (const f of ["chapters", "tags", "which"]) {
    if (!Object.hasOwn(v, f)) {
      fail(`${base}.${f}`);
    }
  }
  noteExtras(v, ["chapters", "tags", "which"], rep);
}

function validSettings(s, rep, chapterMax) {
  const base = "record.settings";
  if (!isPlainObject(s)) {
    fail(base);
  }
  for (const k of Object.keys(s)) {
    const v = s[k];
    if (k === "chapters") {
      if (!isPlainObject(v)) {
        fail(`${base}.chapters`);
      }
      for (const ck of Object.keys(v)) {
        if (!(CHAPTER_KEY_RE.test(ck) && Number(ck) <= chapterMax && typeof v[ck] === "boolean")) {
          fail(keyPath(`${base}.chapters`, ck));
        }
      }
    } else if (k === "goal1" || k === "goal2") {
      if (!(v === null || isDayKey(v))) {
        fail(`${base}.${k}`); // 目標日（null＝決めていない。§14.8）
      }
    } else if (k === "round2Mode") {
      if (v !== "all" && v !== "miss") {
        fail(`${base}.round2Mode`);
      }
    } else if (k === "rangeOff") {
      checkUniqueList(v, `${base}.rangeOff`, RANGE_MAX, (x) => isChapterKey(x, chapterMax)); // 今のカードに無い章も通す（§14.12）
    } else if (k === "practice") {
      validPractice(v, `${base}.practice`, rep, chapterMax);
    } else if (k === "starOnly" || k === "excludeYoyu") {
      if (typeof v !== "boolean") {
        fail(`${base}.${k}`);
      }
    } else if (k === "newPerDay" || k === "reviewPerDay") {
      if (!(Number.isInteger(v) && v >= LIMITS[k].min && v <= LIMITS[k].max)) {
        fail(`${base}.${k}`);
      }
    } else if (k === "pack") {
      if (!(v === null || (typeof v === "string" && TAG_ID_RE.test(v)))) {
        fail(`${base}.pack`); // 選んでいる問題集（null＝本編。§13.4）
      }
    } else if (k === "tags") {
      if (!isPlainObject(v)) {
        fail(`${base}.tags`);
      }
      for (const tk of Object.keys(v)) {
        if (!(TAG_ID_RE.test(tk) && typeof v[tk] === "boolean")) {
          fail(keyPath(`${base}.tags`, tk));
        }
      }
    }
  }
  for (const f of SETTINGS_FIELDS) {
    if (!Object.hasOwn(s, f)) {
      fail(`${base}.${f}`);
    }
  }
  noteExtras(s, [...SETTINGS_FIELDS, ...SETTINGS_OPTIONAL], rep);
  const chapters = {};
  for (const ck of Object.keys(s.chapters)) {
    chapters[ck] = s.chapters[ck];
  }
  const out = { chapters, starOnly: s.starOnly, excludeYoyu: s.excludeYoyu, newPerDay: s.newPerDay, reviewPerDay: s.reviewPerDay };
  if (Object.hasOwn(s, "tags")) {
    out.tags = { ...s.tags }; // 無いときは補わない（直したに数えない・書き戻さない。今の deck に無い id も残す）
  }
  if (Object.hasOwn(s, "pack")) {
    out.pack = s.pack; // 無いときは補わない（化学の記録の形を変えない。今の deck に無い id は main.js が本編として読む。§13.10）
  }
  // plan の欄（§14.8）も、無いときは補わない（化学の記録の形を変えない・repaired にしない）
  for (const k of ["goal1", "goal2", "round2Mode"]) {
    if (Object.hasOwn(s, k)) {
      out[k] = s[k];
    }
  }
  if (Object.hasOwn(s, "rangeOff")) {
    out.rangeOff = [...s.rangeOff];
  }
  if (Object.hasOwn(s, "practice")) {
    const p = s.practice; // 形は上の validPractice で見た（余分なキーは捨てる）
    out.practice = { chapters: [...p.chapters], tags: [...p.tags], which: p.which };
  }
  return out;
}

function validCards(cards, rep) {
  if (!isPlainObject(cards)) {
    fail("record.cards");
  }
  const out = {};
  for (const id of Object.keys(cards)) {
    const base = keyPath("record.cards", id);
    if (!isId(id)) {
      fail(base);
    }
    const e = cards[id];
    checkEntryAt(e, base);
    noteExtras(e, ENTRY_FIELDS, rep);
    out[id] = pickEntry(e);
  }
  return out;
}

function validLog(log, rep) {
  if (!Array.isArray(log)) {
    fail("record.log");
  }
  const out = [];
  for (let n = 0; n < log.length; n += 1) {
    const x = log[n];
    const base = `record.log[${n}]`;
    if (!isPlainObject(x)) {
      fail(base);
    }
    for (const k of Object.keys(x)) {
      if ((k === "i" && !isId(x.i)) || (k === "r" && !(Number.isInteger(x.r) && x.r >= 1 && x.r <= 4)) || (k === "t" && !isPosTime(x.t))) {
        fail(`${base}.${k}`);
      }
    }
    for (const f of ["i", "r", "t"]) {
      if (!Object.hasOwn(x, f)) {
        fail(`${base}.${f}`);
      }
    }
    noteExtras(x, ["i", "r", "t"], rep);
    out.push({ i: x.i, r: x.r, t: x.t });
  }
  if (out.length > LOG_MAX) {
    rep.flag = true;
    return out.slice(out.length - LOG_MAX);
  }
  return out;
}

function validEdition(v) {
  return typeof v === "string" && v.length >= 1 && v.length <= 20 && !SURROGATE_RE.test(v);
}

function validHashMap(h, base) {
  if (!isPlainObject(h)) {
    fail(base);
  }
  const out = {};
  for (const id of Object.keys(h)) {
    if (!(isId(id) && typeof h[id] === "string" && HASH_RE.test(h[id]))) {
      fail(keyPath(base, id));
    }
    out[id] = h[id];
  }
  return out;
}

function validEditionAndHash(d, base, allowed, rep) {
  if (!isPlainObject(d)) {
    fail(base);
  }
  let hash = null;
  for (const k of Object.keys(d)) {
    if (k === "edition" && !validEdition(d.edition)) {
      fail(`${base}.edition`);
    }
    if (k === "hash") {
      hash = validHashMap(d.hash, `${base}.hash`);
    }
  }
  for (const f of ["edition", "hash"]) {
    if (!Object.hasOwn(d, f)) {
      fail(`${base}.${f}`);
    }
  }
  noteExtras(d, allowed, rep);
  return { edition: d.edition, hash };
}

function validDeck(d, rep) {
  if (d === null) {
    return null;
  }
  const base = "record.deck";
  const { edition, hash } = validEditionAndHash(d, base, ["edition", "hash", "noticeBase"], rep);
  let noticeBase = null;
  if (Object.hasOwn(d, "noticeBase")) {
    if (d.noticeBase !== null) {
      noticeBase = validEditionAndHash(d.noticeBase, `${base}.noticeBase`, ["edition", "hash"], rep);
    }
  } else {
    rep.flag = true;
  }
  return { edition, hash, noticeBase };
}

function validDayMap(m, base) {
  if (!isPlainObject(m)) {
    fail(base);
  }
  const out = {};
  for (const k of Object.keys(m)) {
    if (!(isDayKey(k) && isNonNegInt(m[k]))) {
      fail(keyPath(base, k));
    }
    out[k] = m[k];
  }
  return out;
}

function validDays(days, rep) {
  if (!Array.isArray(days)) {
    fail("record.days");
  }
  days.forEach((d, n) => {
    if (!isDayKey(d)) {
      fail(`record.days[${n}]`);
    }
  });
  let out = [...new Set(days)].sort();
  if (out.length > DAYS_MAX) {
    out = out.slice(out.length - DAYS_MAX);
  }
  if (out.length !== days.length || out.some((d, n) => d !== days[n])) {
    rep.flag = true;
  }
  return out;
}

const UNDO_FIELDS = ["id", "before", "wasNew", "wasReview", "day", "t"];
/** undo の省略できる印（§14.4・§14.12）: p＝練習の答え・r2＝round2Seen を数えた・pn＝planNew を数えた（真偽）、r2s＝round2Start に書いた分野の id。 */
const UNDO_MARKS = ["p", "r2", "pn"];

function validUndo(u, rep) {
  if (u === null) {
    return null;
  }
  const base = "record.undo";
  if (!isPlainObject(u)) {
    fail(base);
  }
  for (const k of Object.keys(u)) {
    const v = u[k];
    if (k === "id" && !isId(v)) {
      fail(`${base}.id`);
    } else if (k === "before" && v !== null) {
      checkEntryAt(v, `${base}.before`);
    } else if ((k === "wasNew" || k === "wasReview") && typeof v !== "boolean") {
      fail(`${base}.${k}`);
    } else if (k === "day" && !isDayKey(v)) {
      fail(`${base}.day`);
    } else if (k === "t" && !isPosTime(v)) {
      fail(`${base}.t`);
    } else if (UNDO_MARKS.includes(k) && typeof v !== "boolean") {
      fail(`${base}.${k}`);
    } else if (k === "r2s" && !(typeof v === "string" && FIELD_ID_RE.test(v))) {
      fail(`${base}.r2s`);
    }
  }
  for (const f of UNDO_FIELDS) {
    if (!Object.hasOwn(u, f)) {
      fail(`${base}.${f}`);
    }
  }
  noteExtras(u, [...UNDO_FIELDS, ...UNDO_MARKS, "r2s"], rep);
  if (u.before !== null) {
    noteExtras(u.before, ENTRY_FIELDS, rep);
  }
  const out = { id: u.id, before: u.before === null ? null : pickEntry(u.before), wasNew: u.wasNew, wasReview: u.wasReview, day: u.day, t: u.t };
  for (const k of [...UNDO_MARKS, "r2s"]) {
    if (Object.hasOwn(u, k)) {
      out[k] = u[k]; // 無いときは補わない（化学の undo の形を変えない）
    }
  }
  return out;
}

/** round2Start（§14.12: {分野の id: ISO}。分野の無いデッキでは使わない）。 */
function validRound2Start(v) {
  const base = "record.round2Start";
  if (!isPlainObject(v)) {
    fail(base);
  }
  const out = {};
  for (const k of Object.keys(v)) {
    if (!(FIELD_ID_RE.test(k) && isIso(v[k]))) {
      fail(keyPath(base, k));
    }
    out[k] = v[k];
  }
  return out;
}

/** packs（§14.6・§14.8: {問題集の id: {done: [id…], miss: [id…]}}。今のデッキに無い問題集・カードの id も通して残す）。 */
function validPacks(v, rep) {
  const base = "record.packs";
  if (!isPlainObject(v) || Object.keys(v).length > PACKS_MAX) {
    fail(base);
  }
  const out = {};
  for (const k of Object.keys(v)) {
    const at = keyPath(base, k);
    const ent = v[k];
    if (!TAG_ID_RE.test(k) || !isPlainObject(ent)) {
      fail(at);
    }
    for (const f of Object.keys(ent)) {
      if (f === "done" || f === "miss") {
        checkUniqueList(ent[f], `${at}.${f}`, PACK_IDS_MAX, isId);
      }
    }
    for (const f of ["done", "miss"]) {
      if (!Object.hasOwn(ent, f)) {
        fail(`${at}.${f}`);
      }
    }
    noteExtras(ent, ["done", "miss"], rep);
    out[k] = { done: [...ent.done], miss: [...ent.miss] };
  }
  return out;
}

/** planNoticeOff（§14.8・§14.12: 上限の知らせを消した印の配列。20 個を超えたら形の違い）。 */
function validNoticeOff(v) {
  const base = "record.planNoticeOff";
  if (!Array.isArray(v) || v.length > NOTICE_OFF_MAX) {
    fail(base);
  }
  v.forEach((x, n) => {
    if (!(typeof x === "string" && NOTICE_OFF_RE.test(x))) {
      fail(`${base}[${n}]`);
    }
  });
  return [...v];
}

/** 最上位の省略できる plan の欄（§14.8・§14.12）。検査はこの順（今の順の後ろ）。 */
const PLAN_TOP = ["round2Start", "round2Seen", "planNew", "practiceDone", "packs", "planNoticeOff"];
const TOP_FIELDS = ["schema", "createdAt", "lastExportAt", "deck", "settings", "cards", "newIntroduced", "reviewsDone", "days", "log", "undo", "deckId", ...PLAN_TOP];

/** 省略可の欄: あれば検査して返し、無ければ既定値で補って repaired を立てる。 */
function optional(obj, key, fallback, check, rep) {
  if (!Object.hasOwn(obj, key)) {
    rep.flag = true;
    return fallback;
  }
  return check(obj[key]);
}

/**
 * §4.8 の検査と直して読む（読み込み・起動時・保存の前で同じ関数）。
 * 返り値: {ok: true, record, repaired} / {ok: false, kind: "newer", schema} / {ok: false, kind: "shape", where}。
 * 検査の順番（A51）: schema → createdAt → settings → cards → log → lastExportAt → deck → newIntroduced → reviewsDone → days → undo
 * → deckId → round2Start → round2Seen → planNew → practiceDone → packs → planNoticeOff（plan の欄は §14.8・§14.12。あるときだけ）。
 * 配列は先頭から、オブジェクトはキーの出現順、1つの項目は書かれている欄 → 無い欄 → 組み合わせ。最初に見つけた1つを返す。
 * opts.chapterMax は章のキーの上限（既定 30＝化学。分野のあるデッキは 999。読み込み・起動・保存の前で同じ値を渡す。§14.12）。
 */
export function validateRecord(obj, opts = {}) {
  const chapterMax = opts.chapterMax ?? CHAPTER_MAX_PLAIN;
  if (!isPlainObject(obj)) {
    return { ok: false, kind: "shape", where: "record" };
  }
  if (!Object.hasOwn(obj, "schema") || !Number.isInteger(obj.schema)) {
    return { ok: false, kind: "shape", where: "record.schema" };
  }
  if (obj.schema >= 2) {
    return { ok: false, kind: "newer", schema: obj.schema };
  }
  if (obj.schema !== SCHEMA) {
    return { ok: false, kind: "shape", where: "record.schema" };
  }
  const rep = { flag: false };
  try {
    if (!isIso(obj.createdAt)) {
      fail("record.createdAt");
    }
    if (!Object.hasOwn(obj, "settings")) {
      fail("record.settings");
    }
    const settings = validSettings(obj.settings, rep, chapterMax);
    if (!Object.hasOwn(obj, "cards")) {
      fail("record.cards");
    }
    const cards = validCards(obj.cards, rep);
    if (!Object.hasOwn(obj, "log")) {
      fail("record.log");
    }
    const log = validLog(obj.log, rep);
    const lastExportAt = optional(obj, "lastExportAt", null, (v) => {
      if (!(v === null || isIso(v))) {
        fail("record.lastExportAt");
      }
      return v;
    }, rep);
    const deck = optional(obj, "deck", null, (v) => validDeck(v, rep), rep);
    const newIntroduced = optional(obj, "newIntroduced", {}, (v) => validDayMap(v, "record.newIntroduced"), rep);
    const reviewsDone = optional(obj, "reviewsDone", {}, (v) => validDayMap(v, "record.reviewsDone"), rep);
    const days = optional(obj, "days", [], (v) => validDays(v, rep), rep);
    const undo = optional(obj, "undo", null, (v) => validUndo(v, rep), rep);
    // deckId は省略できる（無いのは化学の記録の形。補わない＝repaired に数えない。§12.8）
    if (Object.hasOwn(obj, "deckId") && !(typeof obj.deckId === "string" && DECK_ID_RE.test(obj.deckId))) {
      fail("record.deckId");
    }
    // plan の欄（§14.8・§14.12）は省略できる（無いのは化学の記録の形。補わない＝repaired に数えない）
    const plan = {};
    for (const k of PLAN_TOP) {
      if (!Object.hasOwn(obj, k)) {
        continue;
      }
      const v = obj[k];
      if (k === "round2Start") {
        plan[k] = validRound2Start(v);
      } else if (k === "packs") {
        plan[k] = validPacks(v, rep);
      } else if (k === "planNoticeOff") {
        plan[k] = validNoticeOff(v);
      } else {
        plan[k] = validDayMap(v, `record.${k}`);
      }
    }
    noteExtras(obj, TOP_FIELDS, rep);
    const record = { schema: SCHEMA, createdAt: obj.createdAt, lastExportAt, deck, settings, cards, newIntroduced, reviewsDone, days, log, undo };
    if (Object.hasOwn(obj, "deckId")) {
      record.deckId = obj.deckId;
    }
    Object.assign(record, plan);
    return { ok: true, record, repaired: rep.flag };
  } catch (e) {
    if (e instanceof Shape) {
      return { ok: false, kind: "shape", where: e.where };
    }
    throw e;
  }
}

/** 保存の前の検査（§4.2「アプリが書く記録は常に §4.8 の検査に通る」）。違反の場所（record.… の形）、通れば null。 */
export function checkForSave(record, opts = {}) {
  const v = validateRecord(record, opts);
  if (v.ok) {
    return null;
  }
  return v.kind === "newer" ? "record.schema" : v.where;
}

/** 起動時の osakaCards.v1 の読み取り（§4.8 と同じ規則・直して読む）。
    {kind: "ok", record, repaired} / {kind: "newer", schema} / {kind: "bad", where}（where は "JSON" か record.… の場所）。opts は validateRecord と同じ（chapterMax）。 */
export function parseStoredRecord(raw, opts = {}) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { kind: "bad", where: "JSON" };
  }
  const v = validateRecord(obj, opts);
  if (v.ok) {
    return { kind: "ok", record: v.record, repaired: v.repaired };
  }
  return v.kind === "newer" ? { kind: "newer", schema: v.schema } : { kind: "bad", where: v.where };
}

/** 評価済みの枚数（§11: state が 0 でない項目。ids を渡せばその中だけ数える）。 */
export function countRated(record, ids = null) {
  if (!record) {
    return 0;
  }
  let n = 0;
  for (const id of Object.keys(record.cards)) {
    if (record.cards[id].state !== 0 && (ids === null || ids.has(id))) {
      n += 1;
    }
  }
  return n;
}

/** 退避の形（§4.9）: {at, resolved: false, raw}。raw が 600,000 文字を超えたら先頭だけ残して truncated: true。 */
export function makeBrokenStash(raw, nowMs) {
  const text = String(raw);
  const stash = { at: new Date(nowMs).toISOString(), resolved: false, raw: text.slice(0, BROKEN_RAW_MAX) };
  if (text.length > BROKEN_RAW_MAX) {
    stash.truncated = true;
  }
  return stash;
}

/** 退避の読み取り（§4.9）。{pending: 真偽, stash}。JSON でない・resolved が真偽でない物は解決済みとみなす（pending 偽、stash null）。 */
export function parseBrokenStash(raw) {
  if (raw === null || raw === undefined) {
    return { pending: false, stash: null };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { pending: false, stash: null };
  }
  if (!isPlainObject(obj) || typeof obj.resolved !== "boolean") {
    return { pending: false, stash: null };
  }
  return { pending: obj.resolved === false, stash: obj };
}

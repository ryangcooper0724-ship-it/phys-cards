/* 責務: cards.json の構造の検査（SPEC §3・§2.7・§11 の「構造の違反」。違反なら #nocards）。純粋な関数。
   依存: ./record.js（id の正規表現）、./allow.js（q・a・how・exp の文法の判定）、./fields.js（chapter の範囲。§14.2）。
   注意: q・a・how・exp（解説。§14.13）の HTML の文法・長さ・TeX の取り残しは構造の違反にしない（致命にせず消毒して出し、htmlViolations の1文をエラーの記録に残す。§2.7）。バイト数の上限は取得した側（main.js）が CARDS_MAX_BYTES で見る。 */
import { ID_RE } from "./record.js";
import { checkHtml, sanitize } from "./allow.js";
import { chapterInRange } from "./fields.js";
/** 1枚のカードの動きの印の数の上限（§13.10）。 */
export const ANIM_PER_CARD = 3;

export const CARDS_MAX_BYTES = 3000000;
const TOP_KEYS = ["schema", "edition", "generated", "cards"];
const CARD_KEYS = ["id", "chapter", "order", "sec", "star", "yoyu", "q", "a", "how"];
const OPTIONAL_KEYS = ["tag", "pack", "exp"]; // 省略できる欄（§12.3・§13.4・§14.13。null と省略は同じ）
/** 文法・図・動きの印を当てる欄（exp は a と同じ決まり。§14.13）。 */
export const HTML_FIELDS = ["q", "a", "how", "exp"];
const GENERATED_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/;
// 制御文字・U+2028/2029・U+FFFE/FFFF と、surrogate の符号単位（基本面の外の文字と対になっていない surrogate。§3）
const BAD_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFFFE\uFFFF\uD800-\uDFFF]/;
const SEC_BAD_RE = /[<>&]/;

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extraKey(obj, allowed) {
  return Object.keys(obj).find((k) => !allowed.includes(k)) ?? null;
}

function plainText(s, max) {
  return typeof s === "string" && s.length >= 1 && s.length <= max && !BAD_CHARS_RE.test(s);
}

/** 違反の説明（無ければ null）。opts.tagIds・opts.packIds はそのデッキの札・問題集の id（既定は無し＝化学。tag・pack は省くか null だけ。§12.3・§12.8・§13.4）。
    opts.fields はデッキの分野（既定は無し＝化学の chapter 0〜30。あればどれかの分野の base〜base+99。§14.2）。 */
export function checkCardsStructure(obj, opts = {}) {
  const tagIds = new Set(opts.tagIds ?? []);
  const packIds = new Set(opts.packIds ?? []);
  const fields = opts.fields ?? [];
  if (!isPlainObject(obj)) {
    return "最上位がオブジェクトでない";
  }
  const extraTop = extraKey(obj, TOP_KEYS);
  if (extraTop !== null) {
    return `最上位に余分なキー ${JSON.stringify(extraTop)}`;
  }
  if (!(Number.isInteger(obj.schema) && obj.schema === 1)) {
    return "schema が 1 でない";
  }
  if (!plainText(obj.edition, 20)) {
    return "edition の形";
  }
  if (typeof obj.generated !== "string" || !GENERATED_RE.test(obj.generated)) {
    return "generated の形";
  }
  if (!Array.isArray(obj.cards) || obj.cards.length === 0) {
    return "cards が空か配列でない";
  }
  const seen = new Set();
  for (let i = 0; i < obj.cards.length; i += 1) {
    const c = obj.cards[i];
    const where = `cards[${i}]`;
    if (!isPlainObject(c)) {
      return `${where} がオブジェクトでない`;
    }
    const extra = extraKey(c, [...CARD_KEYS, ...OPTIONAL_KEYS]);
    if (extra !== null) {
      return `${where} に余分なキー ${JSON.stringify(extra)}`;
    }
    if (typeof c.id !== "string" || !ID_RE.test(c.id) || seen.has(c.id)) {
      return `${where}.id`;
    }
    seen.add(c.id);
    if (!chapterInRange(fields, c.chapter)) {
      return `${where}.chapter`;
    }
    if (!(Number.isInteger(c.order) && c.order === i + 1)) {
      return `${where}.order`;
    }
    if (!plainText(c.sec, 50) || SEC_BAD_RE.test(c.sec)) {
      return `${where}.sec`;
    }
    if (typeof c.star !== "boolean" || typeof c.yoyu !== "boolean") {
      return `${where}.star/yoyu`;
    }
    if (typeof c.q !== "string" || c.q === "" || typeof c.a !== "string" || c.a === "") {
      return `${where}.q/a`;
    }
    if (c.star ? !(typeof c.how === "string" && c.how !== "") : c.how !== null) {
      return `${where}.how`;
    }
    if (Object.hasOwn(c, "tag") && c.tag !== null && !(typeof c.tag === "string" && tagIds.has(c.tag))) {
      return `${where}.tag`;
    }
    if (Object.hasOwn(c, "pack") && c.pack !== null && !(typeof c.pack === "string" && packIds.has(c.pack))) {
      return `${where}.pack`;
    }
    if (Object.hasOwn(c, "exp") && c.exp !== null && !(typeof c.exp === "string" && c.exp !== "")) {
      return `${where}.exp`; // 解説は null か空でない文字列（§14.13）
    }
  }
  return null;
}

/** q・a・how・exp の HTML の文法の違反（§3・§14.13。構造は検査済みの cards を渡す）を数えた1文（無ければ null）。エラーの記録（kind cards）に1件で残す（§2.7）。 */
export function htmlViolations(cards, opts = {}) {
  let count = 0;
  let first = null;
  for (const c of cards) {
    if (opts.anim === true) {
      const n = HTML_FIELDS.reduce((sum, f) => sum + (typeof c[f] === "string"
        ? sanitize(c[f], { ...opts, field: f }).filter((t) => t.t === "anim").length : 0), 0);
      if (n > ANIM_PER_CARD) {
        count += 1; // 4 個目以降は文字で出す（§13.10。sync_cards.py が先に止める）
        first ??= `${c.id} 動きの印が1枚で ${ANIM_PER_CARD} 個を超える（${n} 個）`;
      }
    }
    for (const field of HTML_FIELDS) {
      if ((field === "how" || field === "exp") && (c[field] ?? null) === null) {
        continue;
      }
      const why = checkHtml(c[field], { ...opts, field });
      if (why !== null) {
        count += 1;
        first ??= `${c.id}.${field} ${why}`;
      }
    }
  }
  return count === 0 ? null : `カードの HTML の違反 ${count} 欄（消毒して表示。最初: ${first}）`;
}

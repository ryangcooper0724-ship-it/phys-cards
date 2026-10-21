/* 責務: localStorage の読み書き（記録 <keyPrefix>.v1・エラーの記録 <keyPrefix>.errors・退避 <keyPrefix>.broken。SPEC §4.1・§2.8・§4.9・§12.4）。
   依存: localStorage（例外を必ず扱う。Q5）。
   注意: 書けなければ false を返し、呼ぶ側はメモリの記録で続ける。エラーの記録も書けなければメモリだけに持つ。記録を書くのは main.js の commitRecord と読み込み・新しく始めるだけ。
   キーの頭は main.js が最初に setKeyPrefix(DECK.keyPrefix) で決める（このファイルは deck.js を読まない。app/ から直接読むテストのため。化学の既定は osakaCards）。 */

export let RECORD_KEY = "osakaCards.v1";
export let ERRORS_KEY = "osakaCards.errors";
export let BROKEN_KEY = "osakaCards.broken";

/** キーの頭を決める（§12.4）。どの読み書きよりも前に1回だけ呼ぶ。export let なので import した側にも新しい値が見える。 */
export function setKeyPrefix(prefix) {
  RECORD_KEY = `${prefix}.v1`;
  ERRORS_KEY = `${prefix}.errors`;
  BROKEN_KEY = `${prefix}.broken`;
}
export const ERRORS_MAX = 200;
export const MSG_MAX = 500;

let memoryErrors = null; // 保存できなかったときのエラーの記録

function getStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function errorText(e) {
  return `${e && e.name ? e.name : ""} ${e && e.message ? e.message : String(e)}`.trim();
}

function readKey(key) {
  const store = getStore();
  if (store === null) {
    return { raw: null, error: "localStorage がありません" };
  }
  try {
    return { raw: store.getItem(key), error: null };
  } catch (e) {
    return { raw: null, error: String(e) };
  }
}

function writeKey(key, text) {
  const store = getStore();
  if (store === null) {
    throw new Error("localStorage がありません");
  }
  store.setItem(key, text);
}

/** 記録の生の文字列（無ければ null）。読めなければ {error}。 */
export function readRecordRaw() {
  return readKey(RECORD_KEY);
}

/** 記録を書く。成功なら true。失敗はエラーの記録（kind save）に残して false。 */
export function writeRecord(record) {
  try {
    writeKey(RECORD_KEY, JSON.stringify(record));
    return true;
  } catch (e) {
    addError("save", `記録を保存できない: ${errorText(e)}`);
    return false;
  }
}

/** 記録を消す（「新しく始める」と退避の後。§4.9・§11）。成功なら true。 */
export function removeRecord() {
  try {
    const store = getStore();
    if (store === null) {
      throw new Error("localStorage がありません");
    }
    store.removeItem(RECORD_KEY);
    return true;
  } catch (e) {
    addError("save", `記録を消せない: ${errorText(e)}`);
    return false;
  }
}

/** 退避の生の文字列（無ければ null。読めなければ null として扱う）。 */
export function readBrokenRaw() {
  return readKey(BROKEN_KEY).raw;
}

/** 退避を書く（前の退避は上書き）。成功なら true。 */
export function writeBroken(stash) {
  try {
    writeKey(BROKEN_KEY, JSON.stringify(stash));
    return true;
  } catch (e) {
    addError("record", `退避を書けない: ${errorText(e)}`);
    return false;
  }
}

function isErrorItem(x) {
  return typeof x === "object" && x !== null && typeof x.kind === "string" && typeof x.msg === "string" && typeof x.at === "string";
}

/** エラーの記録（新しい順）。壊れていたら黙って空にする（§4.8）。 */
export function readErrors() {
  if (memoryErrors !== null) {
    return memoryErrors;
  }
  const { raw } = readKey(ERRORS_KEY);
  try {
    const list = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isErrorItem) : [];
  } catch {
    return [];
  }
}

/** エラーの記録に足す（新しい順・最大 200 件・msg は 500 文字まで・同じ kind と msg が続けば count を増やし at を最新に。§2.8・§11）。 */
export function addError(kind, msg, nowMs = Date.now()) {
  const at = new Date(nowMs).toISOString();
  const text = String(msg).slice(0, MSG_MAX);
  const list = readErrors().slice();
  const head = list[0];
  if (head && head.kind === kind && head.msg === text) {
    list[0] = { ...head, at, count: (Number.isInteger(head.count) ? head.count : 1) + 1 };
  } else {
    list.unshift({ at, kind, msg: text });
  }
  const trimmed = list.slice(0, ERRORS_MAX);
  try {
    writeKey(ERRORS_KEY, JSON.stringify(trimmed));
    memoryErrors = null;
  } catch {
    memoryErrors = trimmed;
  }
}

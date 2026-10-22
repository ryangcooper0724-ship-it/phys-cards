/* 責務: 報告ファイルの形（SPEC §4.8）・ファイル名（§2.5）・読み込みの入口の検査（大きさ・JSON・kind・§4.8）と文・催促（§2.5・§11）。
   依存: ./record.js（§4.8 の検査）、./day.js、./stats.js（M/D）。
   注意: 純ロジック（共有・ダウンロード・ファイルの読み取りは platform.js と main.js）。読み込んだ記録の undo は null にする。errors・appVersion・exportedAt は読み込まない。 */
import { validateRecord, foreignDeckOf, DECK_ID_RE } from "./record.js";
import { logicalDay } from "./day.js";
import { formatMD, effectiveLastExport } from "./stats.js";

/** 化学のデッキの値（既定）。ほかのデッキは main.js が DECK の reportKind・fileStem を渡す（core は DECK を読まない。§12.1）。 */
export const REPORT_KIND = "osaka-cards-report";
export const FILE_STEM = "osaka-cards";
export const IMPORT_MAX_BYTES = 5000000;
export const REMIND_MS = 168 * 3600 * 1000;

export const MSG_TOO_BIG = "大きすぎます（5MB まで）";
const KIND_RE = /^[a-z0-9-]{1,40}$/;
export const MSG_NOT_JSON = "読み込めません: JSON として読めない";

/** 報告ファイル（§4.8）。exportedAt を記録の lastExportAt にも入れる（書き出す前に決めた時刻を両方に使う。§2.5・§11）。 */
export function buildReport({ record, appVersion, errors, exportedAt, kind = REPORT_KIND }) {
  return {
    kind,
    appVersion,
    exportedAt,
    record: { ...record, lastExportAt: exportedAt },
    errors: Array.isArray(errors) ? errors : [],
  };
}

/** {fileStem}-YYYYMMDD.json（論理日、ASCII。化学は osaka-cards-…）。ext は "json" か "txt"。 */
export function reportFileName(nowMs, ext = "json", stem = FILE_STEM) {
  return `${stem}-${logicalDay(nowMs).replaceAll("-", "")}.${ext}`;
}

/**
 * 読み込みの検査（§2.5・§4.8・§11・§12.8）。text はファイルの中身（UTF-8 で読んだ文字列）、byteLength はファイルのバイト数。
 * opts（既定は化学）: kind＝自分の reportKind、deckId＝自分のデッキの id、bare＝自分が bareRecord のデッキか、chapterMax＝記録の章のキーの上限（既定 30。§14.12）。
 * 順番: 大きさ → JSON → kind（別のアプリの報告ファイル・形の違い）→ 教科（別のアプリの記録。生の deckId で見る）→ §4.8（§12.8）。
 * deckId の形が違う物は教科を判定せず §4.8 の形の違いにする。bareRecord のデッキ（化学）は読み込んだ自分の deckId を落とす（記録の形を変えない）。
 * 返り値: {ok: true, record}（undo は null）／{ok: false, message}。
 */
export function parseImport(text, byteLength, opts = {}) {
  const { kind = REPORT_KIND, deckId = "chem", bare = true, chapterMax } = opts;
  if (!(byteLength <= IMPORT_MAX_BYTES)) {
    return { ok: false, message: MSG_TOO_BIG };
  }
  let obj;
  try {
    obj = JSON.parse(String(text).replace(/^﻿/, "")); // 先頭の BOM は除く（A50）
  } catch {
    return { ok: false, message: MSG_NOT_JSON };
  }
  let target = obj;
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj) && Object.hasOwn(obj, "kind")) {
    if (obj.kind !== kind) {
      return typeof obj.kind === "string" && KIND_RE.test(obj.kind)
        ? { ok: false, message: `別のアプリの報告ファイルです（${obj.kind}）` }
        : { ok: false, message: "形が違います（場所: kind）" };
    }
    target = Object.hasOwn(obj, "record") ? obj.record : undefined;
  }
  // 教科の判定は記録の形の物（schema を持つ）だけに当てる。それ以外（間違えて選んだ cards.json など）は §4.8 の形の違い（A176）
  if (typeof target === "object" && target !== null && !Array.isArray(target) && Object.hasOwn(target, "schema")) {
    const raw = Object.hasOwn(target, "deckId") ? target.deckId : undefined;
    if (raw === undefined || (typeof raw === "string" && DECK_ID_RE.test(raw))) {
      const foreign = foreignDeckOf(target, deckId, bare);
      if (foreign !== undefined) {
        return { ok: false, message: `別のアプリの記録です（${foreign ?? "教科の印なし"}）` };
      }
    }
  }
  const v = validateRecord(target, { chapterMax });
  if (!v.ok) {
    return {
      ok: false,
      message: v.kind === "newer" ? `新しい版のアプリで書いた記録です（schema ${v.schema}）` : `形が違います（場所: ${v.where}）`,
    };
  }
  const record = { ...v.record, undo: null };
  if (bare) {
    delete record.deckId; // 化学の記録には印を書かない（§12.8。外から来た "chem" も落とす。A172）
  }
  return { ok: true, record };
}

/** 催促（§2.5・§11）: lastExportAt（無い・今より1日以上先なら createdAt）から 168 時間以上で文、それ以外は null。 */
export function reminderText(record, nowMs) {
  if (!record) {
    return null;
  }
  const last = effectiveLastExport(record, nowMs); // 今より1日以上先は時計が戻ったとみなして null（§11。統計の最後の週の報告と同じ判定）
  const base = last ?? Date.parse(record.createdAt);
  if (nowMs - base < REMIND_MS) {
    return null;
  }
  if (last === null && record.lastExportAt) {
    return "週の報告の日付が今より先になっています（端末の時計を確かめてください）"; // 時計が戻った（§11。self-review の提案3・A149）
  }
  return last === null ? "週の報告がまだです（まだ一度も）" : `週の報告がまだです（前回 ${formatMD(logicalDay(last))}）`;
}

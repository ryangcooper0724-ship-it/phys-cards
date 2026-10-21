/* 責務: URL の # から開く画面を決める（SPEC §2.0・§11 の振り分けの規則）。純粋な関数。
   依存: なし。
   注意: 起動の順番の (1)〜(3) で止まっている間（gate）はその画面に戻す。#broken のボタンから行く #import・#reset だけは通す。起動で記録を読めなかった（readFailed。A47）間は #import・#reset を #settings に戻す（A79）。 */

export const SCREENS = Object.freeze([
  "home", "study", "settings", "stats", "help", "cards", "errors", "import", "reset",
  "install", "broken", "nocards", "newer", "packs", "chapters",
]);
const GATE_SCREENS = new Set(["install", "broken", "nocards", "newer"]);
const NEEDS_RECORD = new Set(["study", "stats", "reset", "errors"]);
const READ_FAILED_BLOCKED = new Set(["import", "reset"]);

export function hashName(hash) {
  return String(hash || "").replace(/^#/, "");
}

/**
 * ctx: {gate: null か "install"・"nocards"・"newer"・"broken", hasRecord, chaptersOn, fromBroken, undoResume, readFailed,
 *       hasPacks（デッキに問題集がある）, packMode（問題集を選んでいる。§13.4）, selfPaced（新しいカードは自分で決めるデッキ。§13.5）,
 *       flowChosen（ホームのボタンから学習の流れを選んだ）}
 * 返り値: 開く画面の名前。
 */
export function resolveRoute(hash, ctx) {
  const name = hashName(hash);
  if (ctx.gate) {
    if (ctx.gate === "broken" && ctx.fromBroken && (name === "import" || name === "reset")) {
      return name;
    }
    return ctx.gate;
  }
  if (!SCREENS.includes(name) || GATE_SCREENS.has(name)) {
    return "home";
  }
  if (name === "packs" && !ctx.hasPacks) {
    return "home"; // 問題集の無いデッキ（§13.10）
  }
  if (name === "chapters" && !ctx.selfPaced) {
    return "home"; // 自分で進めるデッキでない（§13.10）
  }
  if (name === "study" && ctx.selfPaced && !ctx.flowChosen && !ctx.undoResume) {
    return "home"; // 流れは # に持たない。ホームのボタンからだけ始める（§13.10）
  }
  if (name === "study" && ctx.selfPaced && !ctx.hasRecord && !ctx.readFailed) {
    return name; // 記録が無くても「続きから」「章を選ぶ」から学習できる（最初の評価で記録を作る。§13.5）
  }
  if (!ctx.hasRecord && NEEDS_RECORD.has(name)) {
    return "settings";
  }
  if (ctx.readFailed && READ_FAILED_BLOCKED.has(name)) {
    return "settings"; // 起動で記録を読めなかった間は、保存されている記録を消す・上書きする画面を開かない（A79）
  }
  if (name === "study" && ctx.chaptersOn === 0 && !ctx.packMode && !ctx.selfPaced && !ctx.undoResume) {
    return "home";
  }
  return name;
}

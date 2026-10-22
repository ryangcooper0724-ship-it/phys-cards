/* 責務: URL の # から開く画面を決める（SPEC §2.0・§11・§14.12 の振り分けの規則）。純粋な関数。
   依存: なし。
   注意: 起動の順番の (1)〜(3) で止まっている間（gate）はその画面に戻す。#broken のボタンから行く #import・#reset だけは通す。起動で記録を読めなかった（readFailed。A47）間は #import・#reset を #settings に戻す（A79）。
   plan のデッキ（§14.12）の #study は流れ（ホームのボタン・ホームの「1つ戻す」）があるときだけ開き、記録が無くても開ける。#practice・#range は plan のデッキだけ（記録が無くても開ける。化学は #home）。記録が無いときの #stats・#errors・#reset は plan のデッキは #home（化学は #settings）。
   #packs・#chapters は廃止（§14.9。知らない画面として #home）。 */

export const SCREENS = Object.freeze([
  "home", "study", "settings", "stats", "help", "cards", "errors", "import", "reset",
  "install", "broken", "nocards", "newer", "practice", "range",
]);
const GATE_SCREENS = new Set(["install", "broken", "nocards", "newer"]);
const NEEDS_RECORD = new Set(["study", "stats", "reset", "errors"]);
const READ_FAILED_BLOCKED = new Set(["import", "reset"]);
const PLAN_ONLY = new Set(["practice", "range"]); // 範囲を選んで解く・本編の範囲（§14.12）

export function hashName(hash) {
  return String(hash || "").replace(/^#/, "");
}

/**
 * ctx: {gate: null か "install"・"nocards"・"newer"・"broken", hasRecord, chaptersOn, fromBroken, undoResume, readFailed,
 *       plan（今日の分・練習・問題集のデッキ。§14）, flowChosen（ホームのボタンから学習の流れを選んだ。app.studyFlow）}
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
  if (PLAN_ONLY.has(name)) {
    return ctx.plan ? name : "home"; // 記録が無くても開ける（§14.12。記録を作るのは最初の変更・答え）
  }
  if (name === "study" && ctx.plan) {
    if (!ctx.flowChosen && !ctx.undoResume) {
      return "home"; // 流れは # に持たない。ホームのボタンからだけ始める（§14.12）
    }
    // 記録が無くても開ける（最初の評価・答えで記録を作る。§14.3）。読めなかった起動で記録が無い間は開かない（禁止パターン）
    return ctx.hasRecord || !ctx.readFailed ? name : "home";
  }
  if (!ctx.hasRecord && NEEDS_RECORD.has(name)) {
    return ctx.plan ? "home" : "settings"; // plan のデッキの記録が無いときの行き先は #home（§14.12）。化学は #settings
  }
  if (ctx.readFailed && READ_FAILED_BLOCKED.has(name)) {
    return "settings"; // 起動で記録を読めなかった間は、保存されている記録を消す・上書きする画面を開かない（A79）
  }
  if (name === "study" && ctx.chaptersOn === 0 && !ctx.undoResume) {
    return "home";
  }
  return name;
}

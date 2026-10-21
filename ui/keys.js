/* 責務: 学習の画面のキーボード（SPEC §10: スペース＝答えを見る、1〜4＝もう一度・難しい・正解・簡単、Z＝1つ戻す）のキーを操作に直す純粋な関数。
   依存: なし（KeyboardEvent に似た物を受け取る。main.js が keydown で呼び、学習の画面のときだけ app の操作に渡す）。
   注意: Ctrl・Alt・Meta つき、押しっぱなし（repeat）、日本語の変換中、入力欄の中は何もしない（A72）。状態（表か裏か）は見ない（app.reveal・app.rate が判定する）。 */

const RATING_KEYS = new Map([["1", 1], ["2", 2], ["3", 3], ["4", 4]]);
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** keydown のイベント → {kind: "reveal"} ／ {kind: "rate", rating} ／ {kind: "undo"} ／ null（何もしない）。 */
export function studyKeyAction(ev) {
  if (!ev || ev.ctrlKey || ev.altKey || ev.metaKey || ev.repeat || ev.isComposing) {
    return null;
  }
  const target = ev.target;
  if (target && (TYPING_TAGS.has(String(target.tagName || "").toUpperCase()) || target.isContentEditable === true)) {
    return null;
  }
  const key = String(ev.key ?? "");
  if (key === " " || key === "Spacebar") {
    return { kind: "reveal" };
  }
  if (RATING_KEYS.has(key)) {
    return { kind: "rate", rating: RATING_KEYS.get(key) };
  }
  if (key === "z" || key === "Z") {
    return { kind: "undo" };
  }
  return null;
}

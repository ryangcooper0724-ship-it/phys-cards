/* 責務: 記録が壊れていたときの画面（#broken。SPEC §4.9）。文と「読み込む」「新しく始める」。退避が書けなかったときは「保存を止めています」。
   依存: ../dom.js。app.openImport・app.openReset・app.brokenLocked。
   注意: この画面からはボタン以外でほかの画面へ行けない（§2.0。router.js）。記録には書かない（書くのは読み込み・新しく始めるの確認の後）。 */
import { el } from "../dom.js";

export const MESSAGE = "記録が壊れていました。指導者から最新の報告ファイルをもらって読み込んでください";

export function render(app) {
  return el("section", { id: "screen-broken", className: "screen" }, [
    el("p", { id: "broken-message", className: "hint", text: MESSAGE }),
    app.brokenLocked ? el("p", { id: "broken-locked", className: "error-text", text: "保存を止めています" }) : null,
    el("div", { className: "actions" }, [
      el("button", { id: "broken-import", className: "primary", text: "読み込む", on: { click: () => app.openImport() } }),
      el("button", { id: "broken-reset", text: "新しく始める", on: { click: () => app.openReset() } }),
    ]),
  ]);
}

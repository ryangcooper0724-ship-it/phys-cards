/* 責務: カードを読めないときの画面（#nocards。SPEC §2.7・§11）。「もう一度読む」でネットを先に取りに行き起動をやり直す。
   依存: ../dom.js。app.retryCards・app.nocardsMessage。
   注意: 記録のキーに触らない（エラーの記録 kind cards は main.js が書く）。 */
import { el } from "../dom.js";

export const DEFAULT_MESSAGE = "カードを読み込めません（電波のある所で開き直してください）";

export function render(app) {
  return el("section", { id: "screen-nocards", className: "screen" }, [
    el("p", { id: "nocards-message", className: "hint", text: app.nocardsMessage || DEFAULT_MESSAGE }),
    el("button", { id: "nocards-retry", text: "もう一度読む", on: { click: () => app.retryCards() } }),
  ]);
}

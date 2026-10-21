/* 責務: 新しく始めるの画面（#reset。SPEC §2.0・§2.3・§4.9・§11）: 確認2回を同じ画面の中で行い、記録（osakaCards.v1）だけを消す。
   依存: ../dom.js。app.resetStep・app.resetMessage・app.resetNext・app.cancelReset。
   注意: 取り消すと元の画面（設定か #broken）へ。エラーの記録と退避は残す（§11）。 */
import { el } from "../dom.js";

export function render(app) {
  const second = app.resetStep === 1;
  return el("section", { id: "screen-reset", className: "screen" }, [
    el("h1", { text: "新しく始める" }),
    el("p", { id: "reset-text", className: "hint", text: second ? "本当に消しますか（元に戻せません）" : "記録を消して最初から始めます" }),
    app.resetMessage ? el("p", { id: "reset-error", className: "error-text", text: app.resetMessage }) : null,
    el("div", { className: "actions" }, [
      el("button", {
        id: "reset-next", className: second ? "danger" : "primary", text: second ? "消す" : "新しく始める",
        on: { click: () => app.resetNext() },
      }),
      el("button", { id: "reset-cancel", text: "取り消す", on: { click: () => app.cancelReset() } }),
    ]),
  ]);
}

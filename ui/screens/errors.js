/* 責務: エラーの記録の画面（#errors。SPEC §2.8・§2.3）: osakaCards.errors を新しい順に出す。
   依存: ../dom.js、../../storage.js（readErrors）。
   注意: msg は textContent（§7・S45）。まとめた件は「×count」を付ける。 */
import { el } from "../dom.js";
import { readErrors } from "../../storage.js";

export function render(app) {
  const list = readErrors();
  return el("section", { id: "screen-errors", className: "screen" }, [
    el("h1", { text: "エラーの記録" }),
    list.length === 0 ? el("p", { id: "errors-empty", className: "hint", text: "ありません" }) : null,
    el("ol", { id: "errors-list", className: "errors-list" }, list.map((x) => el("li", { className: "error-item" }, [
      el("span", { className: "error-meta muted", text: `${x.at} ${x.kind}${Number.isInteger(x.count) && x.count > 1 ? ` ×${x.count}` : ""}` }),
      el("span", { className: "error-msg", text: x.msg }),
    ]))),
    el("div", { className: "actions" }, [
      el("button", { id: "errors-back", text: "設定へ", on: { click: () => app.navigate("settings") } }),
    ]),
  ]);
}

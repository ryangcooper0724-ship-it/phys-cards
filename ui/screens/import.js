/* 責務: 読み込みの画面（#import。SPEC §2.5・§4.8・§11）: ファイルを選ぶ → 検査（違反の文）→ 自前の確認「今の記録（評価済み N 枚）を置き換えます」→ 置き換える／取り消す。
   依存: ../dom.js。app.importState・app.importFile・app.confirmImport・app.cancelImport。
   注意: 違反の文（場所にカードの id を含む）は textContent で出す（§7）。accept は §11 のとおり。 */
import { el } from "../dom.js";
import { DECK } from "../../deck.js";

export const ACCEPT = ".json,.txt,application/json,text/plain";

export function render(app) {
  const st = app.importState ?? { stage: "pick" };
  const message = st.message ? el("p", { id: "import-error", className: "error-text", attrs: { role: "alert" }, text: st.message }) : null;
  if (st.stage === "confirm") {
    return el("section", { id: "screen-import", className: "screen" }, [
      el("h1", { text: "読み込む" }),
      el("p", { id: "import-confirm", className: "hint", text: `今の記録（評価済み ${st.current} 枚）を置き換えます` }),
      message,
      el("div", { className: "actions" }, [
        el("button", { id: "import-apply", className: "primary", text: "置き換える", on: { click: () => app.confirmImport() } }),
        el("button", { id: "import-cancel", text: "取り消す", on: { click: () => app.cancelImport() } }),
      ]),
    ]);
  }
  const input = el("input", { id: "import-file", attrs: { type: "file", accept: ACCEPT, "aria-label": "報告ファイル" } });
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) {
      app.importFile(file);
    }
  });
  return el("section", { id: "screen-import", className: "screen" }, [
    el("h1", { text: "読み込む" }),
    el("p", { className: "hint", text: `指導者から受け取った報告ファイル（${DECK.fileStem}-….json）を選んでください` }),
    input,
    message,
    el("div", { className: "actions" }, [
      el("button", { id: "import-cancel", text: "取り消す", on: { click: () => app.cancelImport() } }),
    ]),
  ]);
}

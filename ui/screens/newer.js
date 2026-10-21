/* 責務: 新しい版の記録の画面（#newer。SPEC §2.0 の (3)）。ここで止まる。
   依存: ../dom.js。
   注意: 記録に触らない。 */
import { el } from "../dom.js";

export function render() {
  return el("section", { id: "screen-newer", className: "screen" }, [
    el("p", { id: "newer-message", className: "hint", text: "新しい版のアプリで書いた記録です。アプリを更新してください" }),
  ]);
}

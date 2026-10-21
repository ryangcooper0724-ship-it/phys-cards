/* 責務: ホーム画面に追加の案内（#install。SPEC §2.1）。iOS でホーム画面アプリでないときに出し、ここで止まる。
   依存: ../dom.js。
   注意: この画面ではボタンでほかの画面へ行かない・localStorage に触らない・SW を登録しない（§2.0・§11）。 */
import { el } from "../dom.js";
import { DECK } from "../../deck.js";

export function render() {
  return el("section", { id: "screen-install", className: "screen" }, [
    el("h1", { text: "ホーム画面に追加してください" }),
    el("ol", { className: "steps" }, [
      el("li", {}, [el("span", { className: "step-icon", text: "⬆︎" }), "画面の下の共有ボタン（四角から上向きの矢印）を押す"]),
      el("li", {}, [el("span", { className: "step-icon", text: "＋" }), "「ホーム画面に追加」を選ぶ"]),
      el("li", {}, [el("span", { className: "step-icon", text: DECK.iconChar }), `ホーム画面にできた「${DECK.shortName}」のアイコンから開く`]),
    ]),
    el("p", { id: "install-warning", className: "hint", text: "Safari で使うと記録が別になります。必ずホーム画面のアイコンから開いてください。" }),
  ]);
}

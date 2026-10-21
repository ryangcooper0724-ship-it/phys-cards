/* 責務: 使い方の画面（#help。SPEC §2.10 の全項目・§2.5 の保存と戻し方・§11 の統計のスクショ・§10 の PC のキーボード）。
   依存: ../dom.js、../../deck.js（項目の文）。app.navigate。
   注意: 記録が無くても開ける（§2.0）。文は固定の文字だけ（textContent）。項目ごとに id を付ける（S44 のテストが全項目を確かめる）。 */
import { el } from "../dom.js";
import { DECK } from "../../deck.js";

/** [id, 見出し, 本文の行...]。§2.10 の順。中身はデッキの help（decks/<id>/deck.json。§12.1）。 */
export const HELP_ITEMS = DECK.help;

export function render(app) {
  return el("section", { id: "screen-help", className: "screen help" }, [
    el("h1", { text: "使い方" }),
    ...HELP_ITEMS.map(([id, title, lines]) => el("div", { id, className: "help-item" }, [
      el("h2", { text: title }),
      ...lines.map((line) => el("p", { text: line })),
    ])),
    el("div", { className: "actions" }, [
      el("button", { id: "help-home", text: "ホームへ", on: { click: () => app.navigate("home") } }),
    ]),
  ]);
}

/* 責務: 章を選ぶ画面（#chapters。SPEC §13.5）: 選んでいる物のカードのある章ごとに「第N章 {名前}」と「残り N」（新しいカードの数、絞り込みを当てる）。0 なら「済」で押せない。
   依存: ../dom.js、../../core/queue.js（chapterProgress）。app.modeCards・app.record・app.queueOpts・app.startFlow・app.navigate。
   注意: 自分で進めるデッキだけ（router が #home に戻す）。押すとその章の新しいカードだけを order 順に出す。読めなかった起動で記録が無い間は押せない。 */
import { el, chapterName } from "../dom.js";
import { chapterProgress } from "../../core/queue.js";

export function render(app) {
  const rows = chapterProgress(app.modeCards, app.record, app.queueOpts);
  const blocked = app.readFailed && !app.record;
  return el("section", { id: "screen-chapters", className: "screen" }, [
    el("div", { className: "topbar" }, [
      el("button", { id: "chapters-home", text: "ホーム", on: { click: () => app.navigate("home") } }),
    ]),
    el("h1", { text: "章を選ぶ" }),
    el("p", { className: "muted", text: "押した章の、まだやっていないカードから出します。" }),
    el("ul", { id: "chapters-list", className: "chapters-list" }, rows.map((r) => el("li", { className: "chapter-item" }, [
      el("button", {
        className: r.left === 0 ? "chapter-pick done" : "chapter-pick",
        attrs: { "data-chapter": String(r.chapter) },
        disabled: r.left === 0 || blocked,
        on: { click: () => app.startFlow("new", r.chapter) },
      }, [
        el("span", { className: "chapter-name", text: chapterName(r.chapter) }),
        el("span", { className: "chapter-left", text: r.left === 0 ? "済" : `残り ${r.left} ›` }),
      ]),
    ]))),
  ]);
}

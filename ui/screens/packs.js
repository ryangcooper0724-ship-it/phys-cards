/* 責務: やる物を選ぶ画面（#packs。SPEC §13.4）: 本編と問題集の一覧。押すと切り替えてホームへ。
   依存: ../dom.js、../../deck.js（packs）。app.selectPack・app.currentPack・app.cards・app.readFailed・app.navigate。
   注意: 記録が無くても開ける（§2.0 の (4) に足した）。読めなかった起動の間は押せない（関数の先頭でも止める）。 */
import { el } from "../dom.js";
import { DECK } from "../../deck.js";

function row(app, id, label, desc, count) {
  const on = app.currentPack === id;
  return el("li", { className: "pack-item" }, [
    el("button", {
      className: on ? "pack-row on" : "pack-row",
      attrs: { "data-pack": id ?? "main", "aria-pressed": on ? "true" : "false" },
      disabled: app.readFailed,
      on: { click: () => app.selectPack(id) },
    }, [
      el("span", { className: "pack-mark" }),
      el("span", { className: "pack-text" }, [
        el("span", { className: "pack-name", text: on ? `${label}（いまこれ）` : label }),
        el("span", { className: "pack-desc", text: desc ? `${desc}（${count} 枚）` : `${count} 枚` }),
      ]),
    ]),
  ]);
}

export function render(app) {
  const count = (pack) => app.cards.filter((c) => (c.pack ?? null) === pack).length;
  return el("section", { id: "screen-packs", className: "screen" }, [
    el("div", { className: "topbar" }, [
      el("button", { id: "packs-home", text: "ホーム", on: { click: () => app.navigate("home") } }),
    ]),
    el("h1", { text: "やる物を選ぶ" }),
    el("p", { className: "muted", text: "選んだ物のカードだけが出ます。ほかの物の復習は待って、戻すと数日で追いつきます。記録は消えません。" }),
    el("ul", { id: "packs-list", className: "packs-list" }, [
      row(app, null, "本編", "", count(null)),
      ...DECK.packs.map((pk) => row(app, pk.id, pk.label, pk.desc, count(pk.id))),
    ]),
  ]);
}

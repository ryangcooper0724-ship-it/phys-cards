/* 責務: カードの一覧の画面（#cards。SPEC §2.3・S38）: 全カードの表と裏を order 順に並べる確認用の画面。plan のデッキ（物理。§14.10）は本編を分野・章の順（分野ごとの段）に、続けて問題集ごとの段。
   依存: ../dom.js（htmlField はトークンの列から createElement で組み立てる）、../../core/fields.js（章の分野）。app.cards・app.plan・app.navigate。
   注意: 記録が無くても開ける（§2.0）。カードの HTML は消毒を通して出す（§7。innerHTML を使わない）。how・exp が null の欄は出さない（「null」を出さない）。解説（exp。§14.13）は開いた状態で出す。動きの印は「動きを見る」のボタンで出し、押した時に箱を組む（htmlField の list）。 */
import { el, htmlField, chapterName, tagBadge, packBadge } from "../dom.js";
import { DECK } from "../../deck.js";
import { ANIM_PER_CARD } from "../../core/cards.js";
import { fieldOfChapter } from "../../core/fields.js";

function cardItem(card) {
  const budget = { n: ANIM_PER_CARD }; // 動きの印は1枚で合わせて 3 個まで（§13.10）
  return el("li", { className: "card-item", attrs: { "data-card": card.id } }, [
    el("p", { className: "card-meta muted", text: `${card.order}. ${card.id}・${chapterName(card.chapter)}・${card.sec}` }),
    el("p", { className: "card-q" }, [
      packBadge(card),
      tagBadge(card),
      card.star ? el("span", { className: "star", text: "★" }) : null,
      htmlField(card.q, card.id, { field: "q", list: true, animBudget: budget }),
      card.yoyu ? el("span", { className: "yoyu", text: `（${DECK.yoyuLabel}）` }) : null,
    ]),
    card.star ? el("p", { className: "card-how" }, ["出し方: ", htmlField(card.how, card.id, { field: "how", list: true, animBudget: budget })]) : null,
    el("p", { className: "card-a" }, [htmlField(card.a, card.id, { field: "a", list: true, animBudget: budget })]),
    typeof card.exp === "string" ? el("div", { className: "card-exp" }, [
      el("p", { className: "card-exp-head", text: "解説" }),
      el("div", { className: "card-exp-body" }, [htmlField(card.exp, card.id, { field: "exp", list: true, animBudget: budget })]),
    ]) : null,
  ]);
}

/** plan のデッキの本編: 章の昇順（同じ章は order 順）に並べ、分野ごとの段（見出し「{label}（N 枚）」）にまとめる（§14.10）。 */
function fieldSections(main) {
  const byChapter = [...main].sort((a, b) => a.chapter - b.chapter || a.order - b.order);
  return DECK.fields.map((f) => {
    const list = byChapter.filter((c) => { const g = fieldOfChapter(DECK.fields, c.chapter); return g !== null && g.id === f.id; });
    return list.length === 0 ? null : el("section", { className: "cards-field", attrs: { "data-field": f.id } }, [
      el("h2", { text: `${f.label}（${list.length} 枚）` }),
      el("ol", { className: "cards-list" }, list.map(cardItem)),
    ]);
  });
}

export function render(app) {
  const sorted = [...app.cards].sort((a, b) => a.order - b.order);
  const main = sorted.filter((c) => (c.pack ?? null) === null);
  // 本編を並べた後に、問題集ごとの段（足していない問題集も出す。§13.4）
  const packSections = DECK.packs.map((pk) => {
    const list = sorted.filter((c) => c.pack === pk.id);
    return list.length === 0 ? null : el("section", { className: "cards-pack", attrs: { "data-pack": pk.id } }, [
      el("h2", { text: `問題集: ${pk.label}（${list.length} 枚）` }),
      el("ol", { className: "cards-list" }, list.map(cardItem)),
    ]);
  });
  return el("section", { id: "screen-cards", className: "screen" }, [
    el("h1", { text: "カードの一覧" }),
    el("p", { id: "cards-count", className: "muted", text: `全 ${sorted.length} 枚（${DECK.editionNoun}の版 ${app.edition}）` }),
    ...(app.plan ? fieldSections(main) : [el("ol", { id: "cards-list", className: "cards-list" }, main.map(cardItem))]),
    ...packSections,
    el("div", { className: "actions" }, [
      el("button", { id: "cards-back", text: "設定へ", on: { click: () => app.navigate("settings") } }),
    ]),
  ]);
}

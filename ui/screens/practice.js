/* 責務: 範囲を選んで解くの画面（#practice。plan のデッキ。SPEC §14.4・§14.12。モック inject_v3.js の practiceRange()）: 分野と章（たたみと章の札・選択を全部外す・分野の「全部」）・札・どれを・この範囲の問題の数と「{N} 問を解く」。
   依存: ../dom.js（chapterLabel）、../../deck.js（分野・札・章の名前）、../../core/plan.js（practiceIds・fieldChapters）。選んでいる途中は app.practiceDraft（main.js が開くたびに前回の範囲から作る）。
   注意: 押すたびに保存しない（「解く」で app.startRange が保存する）。本編のカードの無い分野は「準備中」で開けない。記録が無くても開ける。読めなかった起動で記録が無い間は「解く」を押せない（禁止パターン）。 */
import { el, chapterLabel } from "../dom.js";
import { DECK } from "../../deck.js";
import { practiceIds, fieldChapters } from "../../core/plan.js";

/** 章の札の文字（§14.4「{chapter − base} {名前}」。名前が無ければ「第N章」、分野の中の 0 は「序章」）。 */
function chipName(field, ch) {
  const key = String(ch);
  if (!Object.hasOwn(DECK.chapterNames, key)) {
    return chapterLabel(ch);
  }
  const n = ch - field.base;
  return `${n === 0 ? "序章" : n} ${DECK.chapterNames[key]}`;
}

function chip(text, on, attrs, onClick) {
  return el("button", {
    className: on ? "chip on" : "chip", text,
    attrs: { ...attrs, "aria-pressed": on ? "true" : "false" }, on: { click: onClick },
  });
}

function fieldBox(app, field, range, open) {
  const chs = fieldChapters(app.mainCards, DECK.fields, field.id);
  const ready = chs.length > 0;
  const isOpen = ready && open.has(field.id);
  const sel = new Set(range.chapters);
  const n = chs.filter((ch) => sel.has(ch)).length;
  const head = el("div", { className: "field-head" }, [
    el("button", {
      className: "field-open", disabled: !ready,
      attrs: { "aria-expanded": isOpen ? "true" : "false" }, on: { click: () => app.practiceToggleOpen(field.id) },
    }, [
      el("span", { className: "field-arrow", attrs: { "aria-hidden": "true" }, text: isOpen ? "▼" : "▶" }),
      el("span", { className: "row-text" }, [
        el("span", { className: "field-label", text: field.label }),
        el("span", { className: "row-sub field-sub", text: !ready ? "準備中" : n > 0 ? `${n} 章を選択中` : "選んでいません" }),
      ]),
    ]),
    ready ? el("button", { className: "field-all", text: "全部", on: { click: () => app.practiceToggleField(field.id) } }) : null,
  ]);
  const inner = isOpen ? el("div", { className: "field-inner chip-row" }, chs.map((ch) => chip(chipName(field, ch), sel.has(ch),
    { "data-chapter": String(ch) }, () => app.practiceToggleChapter(ch)))) : null;
  return el("div", { className: ready ? "panel field-box" : "panel field-box not-ready", attrs: { "data-field": field.id } }, [head, inner]);
}

export function render(app) {
  const d = app.practiceDraft;
  const range = d.range;
  const total = practiceIds(app.mainCards, app.record, range).length;
  const locked = app.readFailed && !app.record;
  const tags = new Set(range.tags);
  return el("section", { id: "screen-practice", className: "screen" }, [
    el("h1", { text: "範囲を選んで解く" }),
    el("div", { className: "section-head" }, [
      el("h2", { text: "分野と章" }),
      el("button", { id: "practice-clear", text: "選択を全部外す", disabled: range.chapters.length === 0, on: { click: () => app.practiceClear() } }),
    ]),
    el("p", { className: "muted section-note", text: "分野を押すと章が開く。分野をまたいで選べる" }),
    ...DECK.fields.map((f) => fieldBox(app, f, range, d.open)),
    DECK.tags.length > 0 ? el("h2", { text: "札" }) : null,
    DECK.tags.length > 0 ? el("div", { id: "practice-tags", className: "chip-row" }, [
      chip("全部", tags.size === 0, { "data-tag": "" }, () => app.practiceTag(null)),
      ...DECK.tags.map((t) => chip(t.label, tags.has(t.id), { "data-tag": t.id }, () => app.practiceTag(t.id))),
    ]) : null,
    el("h2", { text: "どれを" }),
    el("div", { id: "practice-which", className: "chip-row" }, [
      chip("全部", range.which === "all", { "data-which": "all" }, () => app.practiceWhich("all")),
      chip("間違えたことがある物だけ", range.which === "miss", { "data-which": "miss" }, () => app.practiceWhich("miss")),
    ]),
    el("p", { id: "practice-count", className: "muted practice-count", text: `この範囲は ${total} 問。章は混ぜて出します` }),
    el("button", {
      id: "practice-start", className: "primary big", text: `${total} 問を解く`,
      disabled: total === 0 || locked, on: { click: () => app.startRange() },
    }),
    el("div", { className: "actions" }, [
      el("button", { id: "practice-home", text: "ホームへ", on: { click: () => app.navigate("home") } }),
    ]),
  ]);
}

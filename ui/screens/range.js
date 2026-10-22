/* 責務: 本編の範囲の画面（#range。plan のデッキ。SPEC §14.7・§14.12。モック inject_v3.js の narrow()）: 分野ごとのたたみ（▶/▼）に章の数・枚数・分野の「出す／出さない」、中に章ごとの「出す／出さない」。
   依存: ../dom.js（chapterShortName）、../../deck.js（分野）、../../core/plan.js（rangeView）。app.toggleRangeOpen（開閉はメモリだけ）・toggleRangeChapter・toggleRangeField（押した時点で rangeOff を保存）・app.navigate。
   注意: 記録が無くても開ける（最初の切り替えで記録を作る §4.7）。本編のカードの無い分野は「準備中」で開けない・押せない。読めなかった起動で記録が無い間は切り替えを押せない（禁止パターン）。 */
import { el, chapterShortName } from "../dom.js";
import { DECK } from "../../deck.js";
import { rangeView, planSettings } from "../../core/plan.js";

function toggle(on, attrs, disabled, onClick) {
  return el("button", {
    className: on ? "chapter-toggle on" : "chapter-toggle", text: on ? "出す" : "出さない",
    attrs: { ...attrs, "aria-pressed": on ? "true" : "false" }, disabled, on: { click: onClick },
  });
}

function fieldBox(app, v, locked) {
  const id = v.field.id;
  const ready = v.chapters.length > 0;
  const open = ready && app.rangeOpen.has(id);
  const head = el("div", { className: "field-head" }, [
    el("button", {
      className: "field-open", disabled: !ready,
      attrs: { "aria-expanded": open ? "true" : "false" }, on: { click: () => app.toggleRangeOpen(id) },
    }, [
      el("span", { className: "field-arrow", attrs: { "aria-hidden": "true" }, text: open ? "▼" : "▶" }),
      el("span", { className: "row-text" }, [
        el("span", { className: "field-label", text: v.field.label }),
        el("span", { className: "row-sub field-sub", text: ready ? `${v.chapters.length} 章・${v.cards} 枚` : "カードはまだありません（入ったら自動で出します）" }),
      ]),
    ]),
    ready
      ? toggle(v.allOn, { "data-field-toggle": id }, locked, () => app.toggleRangeField(id))
      : el("span", { className: "field-wait", text: "準備中" }),
  ]);
  const list = open ? el("ul", { className: "chapter-list field-chapters" }, v.chapters.map((x) => el("li", { className: "chapter-row" }, [
    el("span", { className: "row-text" }, [
      el("span", { className: "chapter-name", text: chapterShortName(x.ch) }),
      el("span", { className: "row-sub", text: `${x.n} 枚` }),
    ]),
    toggle(x.on, { "data-chapter": String(x.ch) }, locked, () => app.toggleRangeChapter(x.ch)),
  ]))) : null;
  return el("div", { className: ready ? "panel field-box" : "panel field-box not-ready", attrs: { "data-field": id } }, [head, list]);
}

export function render(app) {
  const locked = app.readFailed && !app.record;
  const views = rangeView(app.mainCards, DECK.fields, planSettings(app.record));
  return el("section", { id: "screen-range", className: "screen" }, [
    el("h1", { text: "本編の範囲" }),
    el("p", { className: "muted section-note", text: "はなから全部出す。外したい分野・章だけ「出さない」に。分野を押すと開きます" }),
    ...views.map((v) => fieldBox(app, v, locked)),
    el("div", { className: "actions" }, [
      el("button", { id: "range-back", text: "設定へ", on: { click: () => app.navigate("settings") } }),
    ]),
  ]);
}

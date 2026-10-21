/* 責務: 設定の画面（章ごとの「出す・出さない」、★だけ・余裕ありを除く、1日の上限、保存の保護、読み込む・エラーの記録・新しく始める・カードの一覧。SPEC §2.3・§11。記録が無ければ初めての変更で作る §4.7）。
   依存: ../dom.js、../../core/queue.js（章の一覧）、../../core/record.js（既定の設定）。app.toggleChapter・toggleFilter・saveLimits が保存する。app.persistLabel は main.js が開くたびに調べる。
   注意: 章と絞り込みは押した時点で保存、数字は2つまとめて「保存」で保存（違反なら何も保存しない）。記録が無いときは「控えを読み込む」（§10）。起動で記録を読めなかった（app.readFailed）間は読み込む・新しく始めるを出さない（A79）。 */
import { el, chapterName } from "../dom.js";
import { DECK } from "../../deck.js";
import { chapterList } from "../../core/queue.js";
import { defaultSettings } from "../../core/record.js";

function toggleButton(id, on, onLabel, offLabel, onClick, attrs = {}) {
  return el("button", {
    id, className: on ? "filter-toggle on" : "filter-toggle",
    text: on ? onLabel : offLabel,
    attrs: { ...attrs, "aria-pressed": on ? "true" : "false" },
    on: { click: onClick },
  });
}

function filterRow(app, settings, name, id, label) {
  return el("li", { className: "chapter-row" }, [
    el("span", { className: "chapter-name", text: label }),
    toggleButton(id, settings[name] === true, "入", "切", () => app.toggleFilter(name)),
  ]);
}

function limitsBlock(app, settings) {
  const newInput = el("input", {
    id: "settings-new-per-day",
    attrs: { type: "text", inputmode: "numeric", autocomplete: "off", value: String(settings.newPerDay), "aria-label": "新しいカードの1日の上限" },
  });
  const reviewInput = el("input", {
    id: "settings-review-per-day",
    attrs: { type: "text", inputmode: "numeric", autocomplete: "off", value: String(settings.reviewPerDay), "aria-label": "今日の復習の上限" },
  });
  const errorBox = el("div", { id: "settings-limits-error", attrs: { role: "alert" } });
  const save = () => {
    const result = app.saveLimits(newInput.value, reviewInput.value);
    if (!result.ok) {
      errorBox.replaceChildren(...result.errors.map((m) => el("p", { className: "error-text", text: m })));
    }
  };
  return el("div", {}, [
    el("div", { className: "limits" }, [
      app.queueOpts.selfPaced ? null : el("label", { text: "新しいカード（1日 0〜50）", attrs: { for: "settings-new-per-day" } }),
      app.queueOpts.selfPaced ? null : newInput, // 自分で進めるデッキは新しいカードの上限を使わない（値は記録の形のため持つ。§13.5）
      el("label", { text: "今日の復習（30〜400）", attrs: { for: "settings-review-per-day" } }),
      reviewInput,
    ]),
    errorBox,
    el("div", { className: "actions" }, [
      el("button", { id: "settings-limits-save", text: "保存", on: { click: save } }),
    ]),
  ]);
}

export function render(app) {
  const settings = app.record ? app.record.settings : defaultSettings();
  const chapters = settings.chapters;
  const rows = chapterList(app.mainCards).map((ch) => { // 本編の章だけ（問題集にしか無い章は出さない。§13.10）
    const key = String(ch);
    const on = Object.hasOwn(chapters, key) && chapters[key] === true;
    return el("li", { className: "chapter-row" }, [
      el("span", { className: "chapter-name", text: chapterName(ch) }),
      el("button", {
        className: on ? "chapter-toggle on" : "chapter-toggle",
        text: on ? "出す" : "出さない",
        attrs: { "data-chapter": key, "aria-pressed": on ? "true" : "false" },
        on: { click: () => app.toggleChapter(ch) },
      }),
    ]);
  });
  return el("section", { id: "screen-settings", className: "screen" }, [
    el("h1", { text: "設定" }),
    app.record || app.queueOpts.selfPaced ? null : el("p", { id: "settings-first-hint", className: "hint", text: "読んだ章を『出す』にしてください" }),
    app.queueOpts.selfPaced ? null : el("h2", { text: "出す範囲" }),
    app.queueOpts.selfPaced ? null : el("ul", { id: "settings-chapters", className: "chapter-list" }, rows), // 章は「章を選ぶ」で（§13.5）
    DECK.tags.length > 0 ? el("h2", { text: "札" }) : null,
    DECK.tags.length > 0 ? el("ul", { id: "settings-tags", className: "chapter-list" }, DECK.tags.map((t) => {
      const on = !(settings.tags && Object.hasOwn(settings.tags, t.id) && settings.tags[t.id] === false);
      return el("li", { className: "chapter-row" }, [
        el("span", { className: "chapter-name", text: t.label }),
        el("button", {
          className: on ? "chapter-toggle on" : "chapter-toggle",
          text: on ? "出す" : "出さない",
          attrs: { "data-tag": t.id, "aria-pressed": on ? "true" : "false" },
          on: { click: () => app.toggleTag(t.id) },
        }),
      ]);
    })) : null,
    el("h2", { text: "絞り込み" }),
    el("ul", { id: "settings-filters", className: "chapter-list" }, [
      filterRow(app, settings, "starOnly", "settings-star-only", "★だけ"),
      filterRow(app, settings, "excludeYoyu", "settings-exclude-yoyu", `${DECK.yoyuLabel}を除く`),
    ]),
    el("h2", { text: "1日の量" }),
    limitsBlock(app, settings),
    el("h2", { text: "記録" }),
    el("p", { id: "settings-persist-line" }, [
      "保存の保護: ", el("span", { id: "settings-persist", text: app.persistLabel ?? "確認中" }),
    ]),
    app.readFailed
      ? el("p", { id: "settings-read-failed", className: "error-text", text: "記録を読めませんでした。開き直してください（読み込む・新しく始める・週の報告は止めています）" })
      : null,
    el("div", { className: "actions" }, [
      app.readFailed ? null : el("button", { id: "settings-import", text: app.record ? "読み込む" : "控えを読み込む", on: { click: () => app.openImport() } }),
      app.record ? el("button", { id: "settings-errors", text: "エラーの記録", on: { click: () => app.navigate("errors") } }) : null,
      app.record && !app.readFailed ? el("button", { id: "settings-reset", text: "新しく始める", on: { click: () => app.openReset() } }) : null,
      el("button", { id: "settings-cards", text: "カードの一覧", on: { click: () => app.navigate("cards") } }),
    ]),
    el("div", { className: "actions" }, [
      el("button", { id: "settings-home", text: "ホームへ", on: { click: () => app.navigate("home") } }),
    ]),
  ]);
}

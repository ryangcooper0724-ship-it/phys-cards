/* 責務: 設定の画面。化学: 章ごとの「出す・出さない」、★だけ・余裕ありを除く、1日の上限、保存の保護、読み込む・エラーの記録・新しく始める・カードの一覧（SPEC §2.3・§11。記録が無ければ初めての変更で作る §4.7）。
   plan のデッキ（物理。§14.7。モック inject_v3.js の settings()）: 本編の目標（目標日の input type=date・2周目の出し方）・本編の範囲（要約と #range）・札・絞り込み・1 日の量・問題集・記録・一番下に「アプリの版・カードの版」の1行。
   依存: ../dom.js、../../core/queue.js（章の一覧）・record.js（既定の設定）・plan.js（今日の数・範囲の要約・問題集の数）・stats.js・day.js。保存は app.toggleChapter・toggleFilter・saveLimits・setGoal・setRound2Mode・resetPackFromSettings。
   注意: 化学の画面は変えない（plan の段は plan のデッキだけ）。plan のデッキは「出す章」の段を出さない。数字は2つまとめて「保存」（違反なら何も保存しない）、目標日は change と blur の時に保存（input の度には保存しない。保存しなければ元の値に戻して文を出す）。
   記録が無いときは「控えを読み込む」（§10）。起動で記録を読めなかった（app.readFailed）間は読み込む・新しく始めるを出さない（A79）。plan のデッキで記録が無い間は目標日・2周目の出し方も押せない（禁止パターン）。 */
import { el, chapterName } from "../dom.js";
import { DECK } from "../../deck.js";
import { chapterList } from "../../core/queue.js";
import { defaultSettings } from "../../core/record.js";
import { packView, planCounts, planSettings, rangeOffSummary, dayDiff } from "../../core/plan.js";
import { formatMD } from "../../core/stats.js";
import { logicalDay, addDays, weekdayOf } from "../../core/day.js";

const WEEKDAYS = "日月火水木金土";

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

/** 1日の上限の欄（§2.3・§11）。labels は [新しいカードの label の中身, 復習の label の中身]（plan のデッキは §14.7 の名前と下の文）。 */
function limitsBlock(app, settings, labels = ["新しいカード（1日 0〜50）", "今日の復習（30〜400）"]) {
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
  const label = (content, forId) => el("label", { attrs: { for: forId } }, Array.isArray(content) ? content : [content]);
  return el("div", {}, [
    el("div", { className: "limits" }, [
      label(labels[0], "settings-new-per-day"),
      newInput,
      label(labels[1], "settings-review-per-day"),
      reviewInput,
    ]),
    errorBox,
    el("div", { className: "actions" }, [
      el("button", { id: "settings-limits-save", text: "保存", on: { click: save } }),
    ]),
  ]);
}

function tagsBlock(app, settings, title) {
  if (DECK.tags.length === 0) {
    return [];
  }
  return [
    el("h2", { text: title }),
    el("ul", { id: "settings-tags", className: "chapter-list" }, DECK.tags.map((t) => {
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
    })),
  ];
}

function filtersBlock(app, settings) {
  return [
    el("h2", { text: "絞り込み" }),
    el("ul", { id: "settings-filters", className: "chapter-list" }, [
      filterRow(app, settings, "starOnly", "settings-star-only", "★だけ"),
      filterRow(app, settings, "excludeYoyu", "settings-exclude-yoyu", `${DECK.yoyuLabel}を除く`),
    ]),
  ];
}

/** 「記録」の段（保存の保護・読み込む・エラーの記録・新しく始める・カードの一覧）と「ホームへ」。 */
function recordBlock(app) {
  return [
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
  ];
}

/** plan のデッキの「問題集」の段（§14.7）: 問題集ごとに label・「解いた D / M・間違い K」・「最初から」（確認1回で done を空にする。§14.6）。 */
function packsBlock(app) {
  if (DECK.packs.length === 0) {
    return [];
  }
  return [
    el("h2", { text: "問題集" }),
    el("p", { className: "muted section-note", text: "本編とは別。間違えた物だけ残る" }),
    el("ul", { id: "settings-packs", className: "chapter-list" }, DECK.packs.map((pk) => {
      const v = packView(app.cards, app.record, pk.id);
      const asking = app.packResetAsk === pk.id;
      return el("li", { className: "chapter-row", attrs: { "data-pack": pk.id } }, [
        el("span", { className: "chapter-name" }, [
          el("span", { text: pk.label }),
          el("span", { className: "pack-progress muted", text: `解いた ${v.done} / ${v.total}・間違い ${v.miss}` }),
        ]),
        el("button", {
          className: asking ? "pack-reset danger" : "pack-reset", text: asking ? "本当に最初から（もう一度押す）" : "最初から",
          disabled: !app.record || app.readFailed || v.done === 0, on: { click: () => app.resetPackFromSettings(pk.id) },
        }),
      ]);
    })),
  ];
}

function renderChem(app) {
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
    app.record ? null : el("p", { id: "settings-first-hint", className: "hint", text: "読んだ章を『出す』にしてください" }),
    el("h2", { text: "出す範囲" }),
    el("ul", { id: "settings-chapters", className: "chapter-list" }, rows),
    ...tagsBlock(app, settings, "札"),
    ...filtersBlock(app, settings),
    el("h2", { text: "1日の量" }),
    limitsBlock(app, settings),
    ...recordBlock(app),
  ]);
}

// ---- plan のデッキ（§14.7） ----

/** 設定の行（左に題と下の小さな文、右に操作）。 */
function planRow(label, sub, subId, right, attrs = {}) {
  return el("li", { className: "chapter-row setting-row", attrs }, [
    el("span", { className: "row-text" }, [
      el("span", { className: "chapter-name", text: label }),
      sub === null ? null : el("span", { id: subId, className: "row-sub", text: sub }),
    ]),
    right,
  ]);
}

/** 「11/30（土）」。 */
function dateText(day) {
  return `${formatMD(day)}（${WEEKDAYS[weekdayOf(day)]}）`;
}

/** 目標日の下の「あと D 日」（目標日の当日と過ぎた後は「目標日になりました」。A217）。 */
function daysLeft(today, goal) {
  const d = dayDiff(today, goal);
  return d > 0 ? `あと ${d} 日` : "目標日になりました";
}

/** 目標日が無いときの文（§14.7）:「決めていません（{examLabel} {M/D} まで）」（試験日も無ければ「決めていません」）。 */
function noGoalText() {
  return DECK.examDay ? `決めていません（${DECK.examLabel} ${formatMD(DECK.examDay)} まで）` : "決めていません";
}

function goalNotes(app, settings, today) {
  const p = planCounts(app.mainCards, app.record, app.now(), app.planDeck);
  const g1 = settings.goal1 ?? null;
  const g2 = settings.goal2 ?? null;
  const note1 = g1 === null ? noGoalText() : `${dateText(g1)}・${daysLeft(today, g1)} → 今日の新しいカード ${p.q1} 枚`;
  let note2;
  if (!p.round2Active) {
    note2 = `${g2 === null ? noGoalText() : dateText(g2)}・1 周目が終わったら始まる`;
  } else {
    note2 = g2 === null ? `${noGoalText()} → 今日 ${p.q2} 枚` : `${dateText(g2)}・${daysLeft(today, g2)} → 今日 ${p.q2} 枚`;
  }
  return [note1, note2];
}

/** 「本編の目標」の段（§14.7）: 1周目・2周目の目標日（input type=date。選び終えた時＝change・blur で保存）と「2 周目の出し方」。 */
function goalsBlock(app, settings, locked) {
  const today = logicalDay(app.now());
  const [note1, note2] = goalNotes(app, settings, today);
  const errorBox = el("div", { id: "settings-goal-error", attrs: { role: "alert" } });
  const dateInput = (which, label) => {
    const saved = settings[which] ?? null;
    const input = el("input", {
      id: `settings-${which}`, className: "date-input",
      attrs: { type: "date", value: saved ?? "", min: addDays(today, 1), "aria-label": label },
      disabled: locked,
    });
    const pick = () => {
      const r = app.setGoal(which, input.value); // 保存したら setGoal が描き直す。同じ値なら何もしない（change と blur の両方で来ても1回だけ効く）
      if (!r.ok) {
        input.value = saved ?? ""; // 保存しなかった日付は元に戻す（§14.7）
        errorBox.replaceChildren(r.message ? el("p", { className: "error-text", text: r.message }) : "");
      }
    };
    // 日付を選び終えた時（change）と欄を離れた時（blur）だけ保存する。input の度には保存・描き直しをしない
    // （iOS の日付の選び方のホイールを回している途中の値を保存しない。A218）
    input.addEventListener("change", pick);
    input.addEventListener("blur", pick);
    return input;
  };
  const mode = settings.round2Mode ?? "all";
  const segButton = (value, text) => el("button", {
    id: `settings-round2-${value}`, className: mode === value ? "on" : "", text,
    attrs: { "aria-pressed": mode === value ? "true" : "false" }, disabled: locked,
    on: { click: () => app.setRound2Mode(value) },
  });
  return [
    el("h2", { text: "本編の目標" }),
    el("p", { className: "muted section-note", text: "新しいカードの数は、1 周目の目標日から毎朝自動で決まります" }),
    el("ul", { id: "settings-goals", className: "chapter-list" }, [
      planRow("1 周目の目標日", note1, "settings-goal1-note", dateInput("goal1", "1 周目の目標日")),
      planRow("2 周目の目標日", note2, "settings-goal2-note", dateInput("goal2", "2 周目の目標日")),
      planRow("2 周目の出し方", "全部のカード、または前に間違えた物だけ", null,
        el("span", { id: "settings-round2", className: "seg", attrs: { role: "group", "aria-label": "2 周目の出し方" } }, [
          segButton("all", "全部"), segButton("miss", "間違いだけ"),
        ])),
    ]),
    errorBox,
  ];
}

/** 「本編の範囲」の段（§14.7）: 要約と「章を絞る ›」（#range）。 */
function rangeBlock(app, settings) {
  const r = rangeOffSummary(app.mainCards, settings);
  const label = r.off === 0 ? `全部の分野・章（${r.chapters} 章・${r.cards} 枚）` : `${r.off} 章を外しています`;
  return [
    el("h2", { text: "本編の範囲" }),
    el("p", { className: "muted section-note", text: "はなから全部の章。絞りたいときだけ開く" }),
    el("ul", { id: "settings-range", className: "chapter-list" }, [
      planRow(label, "開くと章ごとに「出す・出さない」", null,
        el("button", { id: "settings-range-open", className: "row-button", text: "章を絞る ›", on: { click: () => app.navigate("range") } }),
        { id: "settings-range-summary" }),
    ]),
  ];
}

function renderPlan(app) {
  const settings = planSettings(app.record);
  const locked = app.readFailed && !app.record; // 読めなかった起動の間は記録を作らない（禁止パターン）
  return el("section", { id: "screen-settings", className: "screen" }, [
    el("h1", { text: "設定" }),
    ...goalsBlock(app, settings, locked),
    ...rangeBlock(app, settings),
    ...tagsBlock(app, settings, "出す種類（札）"), // 「出す章」の段は出さない（§14.7）
    ...filtersBlock(app, settings),
    el("h2", { text: "1 日の量" }),
    limitsBlock(app, settings, [
      ["新しいカードの上限（0〜50）", el("span", { className: "row-sub", text: "日割りがこれを超えたら一度だけ知らせます" })],
      "今日の復習の上限（30〜400）",
    ]),
    ...packsBlock(app),
    ...recordBlock(app),
    // 一番下の小さな1行（更新が効いたかを iPhone で確かめる。化学の設定の画面には出さない。A235）
    el("p", { id: "settings-versions", className: "muted versions-line" }, [
      "アプリの版 ", el("span", { id: "settings-app-version", text: app.appVersion }),
      "・カードの版 ", el("span", { id: "settings-edition", text: app.edition }),
    ]),
  ]);
}

export function render(app) {
  return app.plan ? renderPlan(app) : renderChem(app);
}

/* 責務: 統計の画面（#stats。SPEC §2.4・§11）: 今の日時・今日の評価と正答率・連続日数・章ごとの出した／覚えた／全数・出した N/M・出し終える見込みと間に合うか・明日の復習・版・最後の週の報告・週の報告。
   依存: ../dom.js、../report_panel.js、../../core/stats.js（数）、../../core/format.js（日時）。app.appVersion・app.weeklyReport。
   注意: 390×750 にスクロールなしで収める（S16。章が 16 を超えたら 2 列に折る。A73）。数は開いた時点の値で、自動では更新しない。記録が無いときは来ない（router が #settings に戻す）。
   見た目: 数字のタイル、章ごとの「出した／全数」の横棒（表の最後の列、読み上げからは外す）、間に合う＝緑・間に合わない＝赤のバッジ。 */
import { el, chapterLabel, bigNumber, progressBar, chapterColorClass } from "../dom.js";
import { DECK } from "../../deck.js";
import { reportNote, reportPanel } from "../report_panel.js";
import { statsView, formatMD } from "../../core/stats.js";
import { formatDateTime } from "../../core/format.js";

/** 1 列に並べる章の数の上限。これを超えたら 2 列に折る（§11「31 章では 2 列に折る」）。 */
export const ONE_COLUMN_MAX = 16;

function chapterTable(rows, short) {
  const head = el("tr", {}, [
    el("th", { text: "章" }),
    el("th", { text: short ? "出" : "出した" }),
    el("th", { text: short ? "覚" : "覚えた" }),
    el("th", { text: "全" }),
    el("th", { className: "bar-col", attrs: { "aria-hidden": "true" } }),
  ]);
  return el("table", { className: "stats-table" }, [
    el("thead", {}, [head]),
    el("tbody", {}, rows.map((r) => el("tr", {
      className: "stats-chapter",
      attrs: { "data-chapter": r.chapter, "aria-label": `${chapterLabel(r.chapter)} 出した ${r.shown}／覚えた ${r.learned}／全 ${r.total}` },
    }, [
      el("th", { text: chapterLabel(r.chapter), attrs: { scope: "row" } }),
      el("td", { className: "shown", text: r.shown }),
      el("td", { className: "learned", text: r.learned }),
      el("td", { className: "total", text: r.total }),
      el("td", { className: `bar-cell ${chapterColorClass(r.chapter)}`, attrs: { "aria-hidden": "true" } }, [
        progressBar(`stats-bar-${r.chapter}`, r.shown, r.total, `${chapterLabel(r.chapter)} 出した`),
      ]),
    ]))),
  ]);
}

function chapterBlock(rows) {
  if (rows.length <= ONE_COLUMN_MAX) {
    return el("div", { id: "stats-chapters", className: "stats-chapters" }, [chapterTable(rows, false)]);
  }
  const half = Math.ceil(rows.length / 2);
  return el("div", { id: "stats-chapters", className: "stats-chapters two-col" }, [
    chapterTable(rows.slice(0, half), true),
    chapterTable(rows.slice(half), true),
  ]);
}

/** 問題集を選んでいるときは「{label} の統計」（§13.4）。 */
function statsTitle(app) {
  const pack = DECK.packs.find((pk) => pk.id === app.currentPack);
  return pack ? `${pack.label} の統計` : "統計";
}

export function render(app) {
  const now = app.now();
  const v = statsView(app.modeCards, app.record, now, DECK.examDay, app.queueOpts); // 選んでいる物で数える（§13.4）
  const onTime = v.onTime === null ? null : el("span", {
    id: "stats-ontime", className: v.onTime ? "badge ok" : "badge late", text: v.onTime ? "（間に合う）" : "（間に合わない）",
  });
  return el("section", { id: "screen-stats", className: "screen stats" }, [
    el("div", { className: "stats-head" }, [
      el("h1", { text: statsTitle(app) }),
      el("p", { id: "stats-now", className: "muted", text: formatDateTime(now) }),
    ]),
    el("div", { className: "tiles stat-tiles" }, [
      el("p", { id: "stats-today", className: "tile" }, [
        el("span", { className: "nowrap" }, ["今日の評価 ", el("span", { id: "stats-today-count", className: "num-inline", text: v.todayCount }), " 回・"]),
        el("span", { className: "nowrap" }, ["正答率 ", el("span", { id: "stats-today-rate", className: "num-inline", text: v.todayRate })]),
      ]),
      el("p", { id: "stats-streak", className: "tile" }, ["連続 ", el("span", { id: "stats-streak-days", className: "num-inline", text: v.streak }), " 日"]),
    ]),
    chapterBlock(v.chapters),
    el("div", { className: "tiles stats-summary" }, [
      el("p", { id: "stats-shown", className: "tile" }, ["出した ", el("span", { className: "num-inline", text: `${v.shown}/${v.total}` })]),
      app.queueOpts.selfPaced ? null : el("p", { id: "stats-finish", className: "tile wide" }, [
        "出し終える見込み ", el("span", { id: "stats-estimate", className: "num-inline", text: v.estimate }), onTime,
      ]), // 自分で進めるデッキは見込みと間に合うかを出さない（§13.5）
      el("p", { id: "stats-tomorrow", className: "tile" }, ["明日の復習 ", el("span", { className: "num-inline", text: v.tomorrow })]),
    ]),
    el("p", { id: "stats-versions", className: "muted" }, [
      `${DECK.editionNoun}の版 `, el("span", { id: "stats-edition", text: app.edition }),
      "・アプリの版 ", el("span", { id: "stats-app-version", text: app.appVersion }),
    ]),
    el("p", { id: "stats-last-report", text: `最後の週の報告 ${v.lastExport === null ? "まだ" : formatMD(v.lastExport)}` }),
    el("div", { className: "actions" }, [
      el("button", { id: "stats-report", className: "primary", text: "週の報告", disabled: app.readFailed, on: { click: () => app.weeklyReport() } }),
      el("button", { id: "stats-home", text: "ホームへ", on: { click: () => app.navigate("home") } }),
    ]),
    reportNote(app),
    reportPanel(app),
  ]);
}

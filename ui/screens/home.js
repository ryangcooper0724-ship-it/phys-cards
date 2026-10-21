/* 責務: ホームの画面（今日の復習・新しいカード・溜まり・出す章・冊子の版・始める・1つ戻す・週の報告と催促・統計・使い方・設定。SPEC §2.2・§2.5・§10・§11）。
   依存: ../dom.js、../report_panel.js、../../core/queue.js、../../core/report.js（催促）、../../core/deck.js（版の知らせ）。app（main.js の状態と操作）を受け取る。
   見た目: 数は大きな数字のタイル、今日の進み具合のバー（今日こなした枠 ÷ 今日の予定）と連続日数のバッジ（記録があるときだけ）。
   注意: 記録が無い間は「始める」「統計」「週の報告」を押せない（§2.0）。「1つ戻す」は undo があるときだけ（§11）。「新しい版があります」はホームにだけ出す（§2.7）。起動で記録を読めなかった（app.readFailed）間は週の報告を押せない（A113）。 */
import { el, bigNumber, progressBar, chapterName } from "../dom.js";
import { DECK } from "../../deck.js";
import { reportNote, reportPanel } from "../report_panel.js";
import { homeCounts, continuePoint } from "../../core/queue.js";
import { reminderText } from "../../core/report.js";
import { deckNotice, noticeText } from "../../core/deck.js";
import { streak } from "../../core/stats.js";
import { logicalDay } from "../../core/day.js";

const READ_FAILED_HOME = "記録を読めませんでした。開き直してください（週の報告は止めています）";

function deckNoticeBox(app) {
  const n = deckNotice(app.record);
  if (n === null) {
    return null;
  }
  return el("div", { id: "home-deck-notice", className: "banner notice" }, [
    el("p", { id: "home-deck-notice-text", text: noticeText(n, DECK.editionNoun) }),
    el("button", { id: "home-deck-notice-close", text: "×", attrs: { "aria-label": "閉じる" }, on: { click: () => app.dismissDeckNotice() } }),
  ]);
}

function swUpdateBox(app) {
  if (!app.swUpdateReady) {
    return null;
  }
  return el("button", { id: "home-sw-update", className: "banner-button", text: "新しい版があります（押すと切り替え）", on: { click: () => app.applySwUpdate() } });
}

/** 今日の記録の数（論理日のキーの値。無ければ 0）。 */
function todayValue(map, today) {
  return Object.hasOwn(map, today) ? map[today] : 0;
}

/** 今日の進み具合（今日こなした枠 ÷ 今日の予定）と連続日数のバッジ。記録が無い・予定も連続も 0 なら出さない。 */
function todayRow(app, c) {
  if (!app.record) {
    return null;
  }
  const today = logicalDay(app.now());
  const done = todayValue(app.record.reviewsDone, today) + todayValue(app.record.newIntroduced, today);
  const plan = done + c.review + c.newCount;
  const days = streak(app.record.days, today);
  if (plan === 0 && days === 0) {
    return null;
  }
  return el("div", { id: "home-today", className: "today-row panel" }, [
    el("div", { className: "today-head" }, [
      plan > 0 ? el("p", { id: "home-progress-text", className: "progress-text", text: `今日の進み ${done}/${plan}` }) : null,
      days > 0 ? el("span", { id: "home-streak", className: "badge streak", text: `連続 ${days} 日` }) : null,
    ]),
    plan > 0 ? progressBar("home-progress", done, plan, "今日の進み") : null,
  ]);
}

/** 問題集のあるデッキ: 「いまやっている」と「切り替え」（§13.4）。問題集を選んでいる間は本編の待っている復習の数。 */
function modeRow(app) {
  if (DECK.packs.length === 0) {
    return null;
  }
  const pack = DECK.packs.find((pk) => pk.id === app.currentPack);
  return el("div", { id: "home-mode", className: "mode-row panel" }, [
    el("span", { className: "mode-text" }, [
      el("span", { className: "mode-label muted", text: "いまやっている" }),
      el("span", { id: "home-mode-name", className: "mode-name", text: pack ? pack.label : "本編" }),
    ]),
    el("button", { id: "home-switch", text: "切り替え", disabled: app.readFailed, on: { click: () => app.navigate("packs") } }),
  ]);
}

function waitingMain(app) {
  if (!app.record || app.currentPack === null) {
    return null;
  }
  const main = homeCounts(app.mainCards, { ...app.record, settings: { ...app.record.settings, pack: null } }, app.now(), app.queueOpts);
  const n = main.dueReviews + main.dueLearning; // 上限で切らない（§13.10）
  return n > 0 ? el("p", { id: "home-main-waiting", className: "muted", text: `本編の復習 ${n} 枚が待っています` }) : null;
}

/** 自分で進めるデッキの連続日数の札（「今日の進み」は出さない。§13.5）。 */
function streakRow(app) {
  const days = app.record ? streak(app.record.days, logicalDay(app.now())) : 0;
  return days > 0 ? el("div", { className: "streak-row" }, [el("span", { id: "home-streak", className: "badge streak", text: `連続 ${days} 日` })]) : null;
}

/** 自分で進めるデッキ（§13.5）: 「復習 N」と「復習する」、「新しく進める」（続きの文・続きから・章を選ぶ）。 */
function selfPacedBlocks(app, c) {
  const point = continuePoint(app.modeCards, app.record, app.queueOpts);
  const cont = point === null
    ? "新しいカードは全部やりました"
    : `続きは ${chapterName(point.chapter)} の ${point.k} 枚目から（残り ${point.total} 枚）`;
  const blockNew = app.readFailed && !app.record; // 読めなかった起動の間は記録を作らない（§13.10）
  return [
    el("div", { id: "home-review-box", className: "panel study-box" }, [
      el("div", { className: "study-box-head" }, [
        el("span", { className: "study-box-title", text: "復習" }),
        el("span", { id: "home-review-count", className: "study-box-num", text: String(c.review) }),
      ]),
      el("p", { className: "muted study-box-note", text: "期日の来たカードと、間違えたカード" }),
      el("button", {
        id: "home-review-start", className: "primary big", text: "復習する",
        disabled: !app.record || c.review === 0, on: { click: () => app.startFlow("review") },
      }),
    ]),
    el("div", { id: "home-new-box", className: "panel study-box" }, [
      el("span", { className: "study-box-title", text: "新しく進める" }),
      el("p", { id: "home-continue", className: "muted study-box-note", text: cont }),
      el("div", { className: "study-box-actions" }, [
        el("button", {
          id: "home-continue-start", className: "primary big", text: "続きから",
          disabled: point === null || blockNew, on: { click: () => app.startFlow("new") },
        }),
        el("button", { id: "home-chapters-open", className: "big", text: "章を選ぶ", disabled: blockNew, on: { click: () => app.navigate("chapters") } }),
      ]),
    ]),
  ];
}

export function render(app) {
  const c = homeCounts(app.modeCards, app.record, app.now(), app.queueOpts);
  const selfPaced = app.queueOpts.selfPaced;
  const packMode = app.currentPack !== null;
  const noChapters = c.chaptersOn === 0 && !packMode && !selfPaced;
  const canUndo = Boolean(app.record && app.record.undo);
  const remind = reminderText(app.record, app.now());
  return el("section", { id: "screen-home", className: "screen" }, [
    el("h1", { className: "app-title", text: DECK.appName }),
    modeRow(app),
    swUpdateBox(app),
    deckNoticeBox(app),
    app.readFailed
      ? el("p", { id: "home-read-failed", className: "error-text", text: READ_FAILED_HOME })
      : null,
    remind ? el("p", { id: "home-remind", className: "banner", text: remind }) : null,
    ...(selfPaced ? selfPacedBlocks(app, c) : [
      el("div", { className: "tiles" }, [
        el("p", { id: "home-review", className: "count tile tile-review" }, bigNumber("今日の復習", c.review)),
        el("p", { id: "home-new", className: "count tile tile-new" }, bigNumber("新しいカード", c.newCount)),
      ]),
    ]),
    waitingMain(app),
    selfPaced ? streakRow(app) : todayRow(app, c),
    c.backlog > 0
      ? el("p", { id: "home-backlog", text: `溜まり ${c.backlog} 枚（約 ${c.catchUpDays} 日で追いつく）` })
      : null,
    packMode || selfPaced ? null : el("p", { id: "home-chapters", text: `出す章 ${c.chaptersOn}/${c.chaptersTotal}` }),
    noChapters ? el("p", { id: "home-settings-hint", className: "hint", text: "設定で、読んだ章を『出す』にしてください" }) : null,
    el("p", { id: "home-edition", className: "muted", text: `${DECK.editionNoun}の版 ${app.edition}` }),
    el("div", { className: "actions" }, [
      selfPaced ? null : el("button", {
        id: "home-start", className: "primary", text: "始める",
        disabled: !app.record || noChapters, on: { click: () => app.startStudy() },
      }),
      canUndo ? el("button", { id: "home-undo", text: "1つ戻す", on: { click: () => app.undoFromHome() } }) : null,
      el("button", {
        id: "home-report", text: "週の報告",
        disabled: !app.record || app.readFailed, on: { click: () => app.weeklyReport() },
      }),
    ]),
    el("div", { className: "actions" }, [
      el("button", { id: "home-stats", text: "統計", disabled: !app.record, on: { click: () => app.navigate("stats") } }),
      el("button", { id: "home-settings", text: "設定", on: { click: () => app.navigate("settings") } }),
      el("button", { id: "home-help", text: "使い方", on: { click: () => app.navigate("help") } }),
    ]),
    reportNote(app),
    reportPanel(app),
  ]);
}

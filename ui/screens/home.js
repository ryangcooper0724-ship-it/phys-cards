/* 責務: ホームの画面。化学: 今日の復習・新しいカード・溜まり・出す章・冊子の版・始める・1つ戻す・週の報告と催促・統計・使い方・設定（SPEC §2.2・§2.5・§10・§11）。
   plan のデッキ（物理。§14.3・§14.4・§14.6）: 「本編」の段（今日の分の数・2周目・上限の知らせ・今日の分を始める）・「もっと解く（練習）」の2つ・問題集ごとの段。
   依存: ../dom.js、../report_panel.js、../../core/queue.js・plan.js・stats.js・report.js（催促）・deck.js（版の知らせ）。app（main.js の状態と操作）を受け取る。
   注意: 記録が無い間は「始める」（化学）「統計」「週の報告」を押せない（§2.0・§14.3）。「1つ戻す」は undo があるとき（plan のデッキは app.canUndoHome＝undo に p が無く undo.id が本編のカードのときだけ。§14.12・A231）。
   「新しい版があります」はホームにだけ出す（§2.7）。起動で記録を読めなかった（app.readFailed）間は週の報告と、記録を作る操作を押せない（A113・禁止パターン）。 */
import { el, bigNumber, progressBar, chapterName } from "../dom.js";
import { DECK } from "../../deck.js";
import { reportNote, reportPanel } from "../report_panel.js";
import { homeCounts } from "../../core/queue.js";
import { planCounts, planQueueOpts, mistakenIds, packView, rangeSummary, emptyRange } from "../../core/plan.js";
import { reminderText } from "../../core/report.js";
import { deckNotice, noticeText } from "../../core/deck.js";
import { streak, formatMD } from "../../core/stats.js";
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

function backlogLine(c) {
  return c.backlog > 0 ? el("p", { id: "home-backlog", text: `溜まり ${c.backlog} 枚（約 ${c.catchUpDays} 日で追いつく）` }) : null;
}

function editionLine(app) {
  return el("p", { id: "home-edition", className: "muted", text: `${DECK.editionNoun}の版 ${app.edition}` });
}

function topBanners(app) {
  const remind = reminderText(app.record, app.now());
  return [
    swUpdateBox(app),
    deckNoticeBox(app),
    app.readFailed ? el("p", { id: "home-read-failed", className: "error-text", text: READ_FAILED_HOME }) : null,
    remind ? el("p", { id: "home-remind", className: "banner", text: remind }) : null,
  ];
}

function renderChem(app) {
  const c = homeCounts(app.mainCards, app.record, app.now(), app.queueOpts);
  const noChapters = c.chaptersOn === 0;
  const canUndo = Boolean(app.record && app.record.undo);
  return el("section", { id: "screen-home", className: "screen" }, [
    el("h1", { className: "app-title", text: DECK.appName }),
    ...topBanners(app),
    el("div", { className: "tiles" }, [
      el("p", { id: "home-review", className: "count tile tile-review" }, bigNumber("今日の復習", c.review)),
      el("p", { id: "home-new", className: "count tile tile-new" }, bigNumber("新しいカード", c.newCount)),
    ]),
    todayRow(app, c),
    backlogLine(c),
    el("p", { id: "home-chapters", text: `出す章 ${c.chaptersOn}/${c.chaptersTotal}` }),
    noChapters ? el("p", { id: "home-settings-hint", className: "hint", text: "設定で、読んだ章を『出す』にしてください" }) : null,
    editionLine(app),
    el("div", { className: "actions" }, [
      el("button", {
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

// ---- plan のデッキ（§14.3・§14.4・§14.6。モック inject_v3.js の home()） ----

/** 「本編」の段の数の行（§14.3・§14.12）:「復習 N・新しい Q（1 周目 M/D までの日割り）」と、2周目の間は「・2 周目 Q2（M/D までの日割り）」。
    目標日が無いときは「新しい N（1 日 C 枚）」。1周目が終わって2周目が始まっていれば1周目の部分は出さない。 */
function planLine(c, p) {
  const parts = [`復習 ${c.review}`];
  const split = (goal, round) => (goal === null ? `1 日 ${p.cap} 枚` : `${round}${formatMD(goal)} までの日割り`);
  if (p.r1 > 0 || (!p.round2Active && !p.round2Waiting)) {
    parts.push(`新しい ${p.newLeft}（${split(p.goal1, "1 周目 ")}）`);
  }
  if (p.round2Active && !p.allDone) {
    parts.push(`2 周目 ${p.r2Left}（${split(p.goal2, "")}）`);
  }
  return parts.join("・");
}

function noticeBox(app, n) {
  const what = n.round === 1 ? "1 周目" : "2 周目";
  return el("div", { id: `home-plan-notice-${n.round}`, className: "banner notice plan-notice" }, [
    el("p", { className: "plan-notice-text", text: `上限 ${n.cap} 枚なので、${what}が終わるのは ${formatMD(n.finish)} ごろです（目標 ${formatMD(n.goal)}）` }),
    app.record
      ? el("button", { className: "plan-notice-close", text: "×", attrs: { "aria-label": "閉じる" }, on: { click: () => app.dismissPlanNotice(n.key) } })
      : null,
  ]);
}

/** 練習の押しボタン（題と下の小さな文と「›」）。 */
function pickButton(id, title, sub, disabled, onClick) {
  return el("button", { id, className: "pick", disabled, on: { click: onClick } }, [
    el("span", { className: "pick-text" }, [
      el("span", { className: "pick-title", text: title }),
      el("span", { id: `${id}-sub`, className: "pick-sub", text: sub }),
    ]),
    el("span", { className: "pick-arrow", attrs: { "aria-hidden": "true" }, text: "›" }),
  ]);
}

/** 「範囲を選んで解く」の下の文（§14.4。前回の範囲は settings.practice（記録が無い間は app.practicePending）、今のカードに無い章は除いて読む）。 */
function rangeText(app) {
  const saved = app.record ? app.record.settings.practice ?? null : app.practicePending;
  const range = saved ?? emptyRange();
  const r = rangeSummary(range, app.mainCards, DECK.fields);
  if (r.kind === "span") {
    const a = r.a - r.field.base;
    const b = r.b - r.field.base;
    return a === b ? `前回: ${r.field.label} 第${a}章` : `前回: ${r.field.label} 第${a}〜${b}章`;
  }
  if (r.kind === "many") {
    return `前回: ${chapterName(r.first)} ほか ${r.n} 章`;
  }
  return "章・札を選ぶ（テスト前などに）";
}

function mainBlock(app, c, p) {
  const blockCreate = app.readFailed && !app.record; // 読めなかった起動の間は記録を作る操作を止める（禁止パターン）
  const round2Left = p.round2Active ? p.r2Left : 0;
  const total = c.review + p.newLeft + round2Left;
  const minutes = Math.max(1, Math.round((c.review + p.newLeft * 3 + round2Left) * 7 / 60));
  const days = app.record ? streak(app.record.days, logicalDay(app.now())) : 0;
  const mistakes = app.record ? mistakenIds(app.mainCards, app.record).length : 0;
  return el("div", { id: "home-plan", className: "panel study-box" }, [
    el("div", { className: "study-box-head" }, [
      el("span", { className: "study-box-title", text: "本編" }),
      days > 0 ? el("span", { id: "home-streak", className: "badge streak", text: `連続 ${days} 日` }) : null,
    ]),
    el("p", { id: "home-plan-line", className: "muted study-box-note", text: planLine(c, p) }),
    p.round2Waiting && p.r1 === 0 && !p.round2Active
      ? el("p", { id: "home-plan-round2-wait", className: "muted study-box-note", text: "1 周目が終わりました。2 周目は明日から出ます" })
      : null,
    p.allDone ? el("p", { id: "home-plan-all-done", className: "study-box-note", text: "2 周目も終わりました。あとは復習だけ出ます" }) : null,
    p.capZero ? el("p", { id: "home-plan-cap-zero", className: "hint", text: "新しいカードの上限が 0 です（設定で変えられます）" }) : null,
    ...p.notices.map((n) => noticeBox(app, n)),
    el("button", {
      id: "home-today-start", className: "primary big",
      text: total > 0 ? `今日の分を始める（約 ${minutes} 分）` : "今日の分は終わり",
      disabled: total === 0 || blockCreate, on: { click: () => app.startStudy() },
    }),
    el("p", { className: "practice-head", text: "もっと解く（練習）" }),
    el("p", { className: "muted practice-note", text: "今日の分とは別に、好きなだけ。何周してもよい" }),
    pickButton("home-mistakes", "間違えた問題を解き直す", mistakes > 0 ? `本編で間違えたことがある ${mistakes} 問` : "まだありません",
      mistakes === 0, () => app.startMistakes()),
    pickButton("home-range", "範囲を選んで解く", rangeText(app), blockCreate, () => app.navigate("practice")),
  ]);
}

/** 問題集ごとの段（§14.6）。カードの無い問題集は出さない（A209）。 */
function packBlocks(app) {
  return DECK.packs.map((pk) => {
    const v = packView(app.cards, app.record, pk.id);
    if (v.total === 0) {
      return null;
    }
    return el("div", { id: `home-pack-${pk.id}`, className: "panel study-box pack-box", attrs: { "data-pack": pk.id } }, [
      el("div", { className: "study-box-head" }, [
        el("span", { className: "study-box-title", text: pk.label }),
        el("span", { className: "muted pack-kind", text: "問題集" }),
      ]),
      el("p", { className: "muted study-box-note pack-progress", text: `解いた ${v.done} / ${v.total}・間違い ${v.miss}` }),
      el("div", { className: "study-box-actions" }, [
        el("button", {
          className: "primary pack-next", text: v.nextIds.length > 0 ? "続きから解く" : "最初から解く",
          disabled: app.readFailed, on: { click: () => app.startPack(pk.id, "next") },
        }),
        el("button", {
          className: "pack-miss", text: `間違い ${v.miss} 問を解き直す`,
          disabled: app.readFailed || v.miss === 0, on: { click: () => app.startPack(pk.id, "miss") },
        }),
      ]),
    ]);
  });
}

function renderPlan(app) {
  const now = app.now();
  const opts = planQueueOpts(app.mainCards, app.record, now, app.planDeck);
  const c = homeCounts(app.mainCards, app.record, now, opts);
  const p = planCounts(app.mainCards, app.record, now, app.planDeck);
  const canUndo = app.canUndoHome(); // undo に p が無く、undo.id が本編のカードのときだけ（§14.12・A231）
  return el("section", { id: "screen-home", className: "screen" }, [
    el("h1", { className: "app-title", text: DECK.appName }),
    ...topBanners(app),
    mainBlock(app, c, p),
    ...packBlocks(app),
    backlogLine(c),
    editionLine(app),
    el("div", { className: "actions" }, [
      canUndo ? el("button", { id: "home-undo", text: "1つ戻す", on: { click: () => app.undoFromHome() } }) : null,
      el("button", {
        id: "home-report", text: "週の報告",
        disabled: !app.record || app.readFailed, on: { click: () => app.weeklyReport() },
      }),
      el("button", { id: "home-stats", text: "統計", disabled: !app.record, on: { click: () => app.navigate("stats") } }),
      el("button", { id: "home-settings", text: "設定", on: { click: () => app.navigate("settings") } }),
      el("button", { id: "home-help", text: "使い方", on: { click: () => app.navigate("help") } }),
    ]),
    reportNote(app),
    reportPanel(app),
  ]);
}

export function render(app) {
  return app.plan ? renderPlan(app) : renderChem(app);
}

/* 責務: plan のデッキ（物理）の統計の数（分野ごとの出した／覚えた／全数・1周目と2周目の残りと目標・今日の練習・問題集の解いた／間違い）と週の報告の要約の文（SPEC §14.10・§14.12）。
   依存: ./stats.js（化学と共通の数え: 今日の評価・連続日数・出した N/M・7日の数・最後の週の報告・M/D）、./plan.js（今日の分の数え・問題集）、./queue.js（項目・明日の復習）、./fields.js。
   注意: 時刻とデッキの値（fields・examDay・packs）は引数（core は DECK を読まない）。分野の行と「出した N/M」は本編のカードだけ。見込み・間に合うかは出さない。 */
import { todayNumbers, weekNumbers, sumDays, streak, shownCount, lastExportDay, formatMD, LEARNED_DAYS } from "./stats.js";
import { planCounts, packView } from "./plan.js";
import { entryOf, isNewEntry, tomorrowReviews } from "./queue.js";
import { fieldOfChapter } from "./fields.js";

/** 分野ごとの「出した／覚えた／全数」（§14.10）: 本編のカード（mainCards）のある分野だけを fields の順に。絞り込みの前の数。 */
export function fieldRows(mainCards, record, fields) {
  const rows = new Map((fields ?? []).map((f) => [f.id, { id: f.id, label: f.label, base: f.base, shown: 0, learned: 0, total: 0 }]));
  for (const c of mainCards) {
    const f = fieldOfChapter(fields, c.chapter);
    const row = f === null ? undefined : rows.get(f.id);
    if (row === undefined) {
      continue;
    }
    row.total += 1;
    const entry = entryOf(record, c.id);
    if (!isNewEntry(entry)) {
      row.shown += 1;
      if (entry.scheduled_days >= LEARNED_DAYS) {
        row.learned += 1;
      }
    }
  }
  return [...rows.values()].filter((r) => r.total > 0);
}

/** 問題集ごとの「解いた D/M・間違い K」（§14.10）: デッキの packs の順に、カードのある問題集だけ（ホームの段と同じ。A209）。 */
export function packRows(cards, record, packs) {
  return (packs ?? []).map((pk) => {
    const v = packView(cards, record, pk.id);
    return { id: pk.id, label: pk.label, done: v.done, total: v.total, miss: v.miss };
  }).filter((r) => r.total > 0);
}

/** 練習の回数（practiceDone）を days の日だけ足す。 */
function practiceIn(record, days) {
  return sumDays(record ? record.practiceDone : undefined, days);
}

/**
 * plan のデッキの統計の画面の数（§14.10・§14.12）。cards はデッキの全部（問題集を含む）、mainCards は本編のカード。
 * deck は {fields, examDay, packs}（デッキの値）、opts は queue.js の plan の口（明日の復習）。
 * round1: {left（R1）, goal（目標日。無ければ null）, today（Q1＝今日の日割り）}、round2: {started（2周目の始まった分野がある）, left（R2）, goal}。
 */
export function planStatsView(cards, mainCards, record, nowMs, deck, opts = {}) {
  const t = todayNumbers(record, nowMs);
  const { shown, total } = shownCount(mainCards, record);
  const p = planCounts(mainCards, record, nowMs, deck);
  return {
    today: t.today,
    todayCount: t.count,
    todayRate: t.rate,
    streak: streak(record.days, t.today),
    fields: fieldRows(mainCards, record, deck.fields),
    shown,
    total,
    round1: { left: p.r1, goal: p.goal1, today: p.q1 },
    round2: { started: p.round2Active, left: p.r2, goal: p.goal2 },
    practiceToday: practiceIn(record, [t.today]),
    packs: packRows(cards, record, deck.packs),
    tomorrow: tomorrowReviews(mainCards, record, nowMs, opts),
    lastExport: lastExportDay(record, nowMs),
  };
}

/** 統計の「1 周目 残り {R1}（目標 {M/D}・今日 {Q1}）」（目標日も試験日も無ければ「（今日 {Q1}）」。A224）。 */
export function round1Text(r) {
  return `1 周目 残り ${r.left}（${r.goal === null ? "" : `目標 ${formatMD(r.goal)}・`}今日 ${r.today}）`;
}

/** 統計の「2 周目 残り {R2}（目標 {M/D}）」。始まる前は「2 周目 1 周目の後」（目標日も試験日も無ければ括弧を付けない。A224）。 */
export function round2Text(r) {
  if (!r.started) {
    return "2 周目 1 周目の後";
  }
  return r.goal === null ? `2 周目 残り ${r.left}` : `2 周目 残り ${r.left}（目標 ${formatMD(r.goal)}）`;
}

/** 要約の文の周の部分（「1周目 残り {R}（目標 {M/D}）」。目標日も試験日も無ければ括弧を付けない。A224）。 */
function roundPart(n, left, goal) {
  return goal === null ? `${n}周目 残り ${left}` : `${n}周目 残り ${left}（目標 ${formatMD(goal)}）`;
}

/**
 * 週の報告の要約の文（§14.10。plan のデッキだけ §11 の物を置き換える）:
 * 「{M/D}まで7日 復習 {7日の reviewsDone}・評価 {7日の log}回・正答 {N}%・練習 {7日の practiceDone}回・連続 {N}日・出した {N}/{M}・1周目 残り {R1}（目標 {M/D}）」、
 * 2周目の間は「・2周目 残り {R2}（目標 {M/D}）」、カードのある問題集があれば「・問題集 解いた {D の合計}・間違い {K の合計}」。出した N/M は本編だけ（§14.12）。
 */
export function planWeekSummary(cards, mainCards, record, nowMs, deck) {
  const w = weekNumbers(record, nowMs);
  const { shown, total } = shownCount(mainCards, record);
  const p = planCounts(mainCards, record, nowMs, deck);
  const parts = [
    `${formatMD(w.today)}まで7日 復習 ${w.reviews}・評価 ${w.count}回・正答 ${w.rate}・練習 ${practiceIn(record, w.week)}回・連続 ${w.streak}日・出した ${shown}/${total}`,
    roundPart(1, p.r1, p.goal1),
  ];
  if (p.round2Active) {
    parts.push(roundPart(2, p.r2, p.goal2));
  }
  const packs = packRows(cards, record, deck.packs);
  if (packs.length > 0) {
    const done = packs.reduce((n, r) => n + r.done, 0);
    const miss = packs.reduce((n, r) => n + r.miss, 0);
    parts.push(`問題集 解いた ${done}・間違い ${miss}`);
  }
  return parts.join("・");
}

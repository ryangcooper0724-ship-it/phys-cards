/* 責務: 統計の数（今日の評価と正答率・連続日数 §4.5・章ごとの数・出した N/M §2.4・出し終える見込みと間に合うか §11・最後の週の報告）と週の報告の要約の文（§11）。
   依存: ./day.js、./queue.js（項目の引き当て・章の一覧・明日の復習）。
   注意: 時刻は引数。未来の日のキー・log は数えない（§11）。統計の画面（S16〜S18）と要約の文は同じ関数で数える。 */
import { logicalDay, addDays } from "./day.js";
import { entryOf, isNewEntry, chapterList, tomorrowReviews } from "./queue.js";

export const WEEK_DAYS = 7;
/** 二次の日付（§2.4「設定の固定値」。化学のデッキの値で既定。ほかのデッキは画面が DECK.examDay を渡す。null なら間に合うかを出さない。§12.1）。 */
export const EXAM_DAY = "2027-02-25";
/** 覚えた＝出したうち scheduled_days がこれ以上（§2.4）。 */
export const LEARNED_DAYS = 21;
const DAY_MS = 86400 * 1000;

/** "2026-11-20" → "11/20"。 */
export function formatMD(dayKey) {
  const [, m, d] = dayKey.split("-").map(Number);
  return `${m}/${d}`;
}

/** 連続日数（§4.5）: 今日を含めて days に連続して入っている日の数。今日まだ無ければ昨日から。昨日も無ければ 0。 */
export function streak(days, today) {
  const set = new Set(days);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** 出した N/M（§2.4）: N＝今の cards.json にあり記録があって state が 0 でない数、M＝今の cards.json の枚数。 */
export function shownCount(cards, record) {
  let shown = 0;
  for (const c of cards) {
    if (!isNewEntry(entryOf(record, c.id))) {
      shown += 1;
    }
  }
  return { shown, total: cards.length };
}

/** 出し終える見込み（§11）: {kind: "done"}（未出 0）／{kind: "none"}（newPerDay 0）／{kind: "date", day}。 */
export function finishEstimate(cards, record, nowMs) {
  const unseen = cards.filter((c) => isNewEntry(entryOf(record, c.id))).length;
  if (unseen === 0) {
    return { kind: "done" };
  }
  const perDay = record ? record.settings.newPerDay : 10;
  if (perDay === 0) {
    return { kind: "none" };
  }
  const today = logicalDay(nowMs);
  const used = record && Object.hasOwn(record.newIntroduced, today) ? record.newIntroduced[today] : 0;
  const todayLeft = Math.max(0, perDay - used);
  if (unseen <= todayLeft) {
    return { kind: "date", day: today };
  }
  return { kind: "date", day: addDays(today, Math.ceil((unseen - todayLeft) / perDay)) };
}

/** 間に合うか（§2.4・§11）: 見込みが二次の当日以前なら true、後なら false。「—」（上限 0）と「出し終えた」は null（出さない。A69）。 */
export function onTime(est, examDay = EXAM_DAY) {
  return est.kind === "date" && examDay !== null ? est.day <= examDay : null;
}

export function estimateText(est) {
  if (est.kind === "done") {
    return "出し終えた";
  }
  return est.kind === "none" ? "—" : formatMD(est.day);
}

/** 正答率の文: 評価 0 回は「—」、それ以外は もう一度 以外の割合を四捨五入した「N%」。 */
export function rateText(count, correct) {
  return count === 0 ? "—" : `${Math.round((100 * correct) / count)}%`;
}

/** log のうち days（論理日の集まり）に入る評価の数と正答の数（もう一度の出し直しも数える）。 */
function countLog(log, daySet) {
  let count = 0;
  let correct = 0;
  for (const x of log) {
    if (daySet.has(logicalDay(x.t))) {
      count += 1;
      if (x.r !== 1) {
        correct += 1;
      }
    }
  }
  return { count, correct };
}

/** 章ごとの「出した／覚えた／全数」（§2.4）: cards.json にある章を全部、章の番号の順に。絞り込みの前の数。 */
export function chapterRows(cards, record) {
  const rows = new Map(chapterList(cards).map((ch) => [ch, { chapter: ch, shown: 0, learned: 0, total: 0 }]));
  for (const c of cards) {
    const row = rows.get(c.chapter);
    row.total += 1;
    const entry = entryOf(record, c.id);
    if (!isNewEntry(entry)) {
      row.shown += 1;
      if (entry.scheduled_days >= LEARNED_DAYS) {
        row.learned += 1;
      }
    }
  }
  return [...rows.values()];
}

/** 最後の週の報告として扱う時刻（ms）。無い・今より1日以上先（時計が戻った。§11）なら null。催促と同じ判定。 */
export function effectiveLastExport(record, nowMs) {
  if (!record || record.lastExportAt === null) {
    return null;
  }
  const last = Date.parse(record.lastExportAt);
  return last - nowMs >= DAY_MS ? null : last;
}

/** 最後の週の報告の論理日（YYYY-MM-DD）。無ければ null（画面は「まだ」）。 */
export function lastExportDay(record, nowMs) {
  const last = effectiveLastExport(record, nowMs);
  return last === null ? null : logicalDay(last);
}

/** 統計の画面の数を全部まとめる（§2.4・§11）。 */
export function statsView(cards, record, nowMs, examDay = EXAM_DAY, opts = {}) {
  const today = logicalDay(nowMs);
  const { count, correct } = countLog(record.log, new Set([today]));
  const { shown, total } = shownCount(cards, record);
  const est = finishEstimate(cards, record, nowMs);
  return {
    today,
    todayCount: count,
    todayRate: rateText(count, correct),
    streak: streak(record.days, today),
    chapters: chapterRows(cards, record),
    shown,
    total,
    estimate: estimateText(est),
    onTime: onTime(est, examDay),
    tomorrow: tomorrowReviews(cards, record, nowMs, opts),
    lastExport: lastExportDay(record, nowMs),
  };
}

/** 週の報告の要約の文（§11）:「{M/D}まで7日 復習 {7日の reviewsDone}・評価 {7日の log}回・正答 {N}%・連続 {N}日・出した {N}/{M}・見込み {…}」。 */
export function weekSummary(cards, record, nowMs, opts = {}) {
  const today = logicalDay(nowMs);
  const week = new Set();
  for (let k = 0; k < WEEK_DAYS; k += 1) {
    week.add(addDays(today, -k));
  }
  let reviews = 0;
  for (const d of week) {
    if (Object.hasOwn(record.reviewsDone, d)) {
      reviews += record.reviewsDone[d];
    }
  }
  const { count, correct } = countLog(record.log, week);
  const rate = rateText(count, correct);
  const { shown, total } = shownCount(cards, record);
  const head = `${formatMD(today)}まで7日 復習 ${reviews}・評価 ${count}回・正答 ${rate}・連続 ${streak(record.days, today)}日・出した ${shown}/${total}`;
  if (opts.selfPaced) {
    return head; // 自分で進めるデッキは見込みを出さない（§13.10）
  }
  return `${head}・見込み ${estimateText(finishEstimate(cards, record, nowMs))}`;
}

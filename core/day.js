/* 責務: 論理日（端末の時間帯の午前4時で区切る日。SPEC §4.5・§11）と日付の計算。
   依存: なし（時刻は引数のエポックのミリ秒で受け取る。端末の時間帯は Date のローカルの計算で使う）。
   注意: 04:00:00.000 ちょうどは新しい日。夏時間は考えない（§11）。 */

export const DAY_START_HOUR = 4;
const HOUR_MS = 3600 * 1000;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** ローカルの Date を YYYY-MM-DD にする。 */
export function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 論理日: 今から4時間引いた時刻の、端末の時間帯の日付（YYYY-MM-DD）。 */
export function logicalDay(nowMs) {
  return localDateKey(new Date(nowMs - DAY_START_HOUR * HOUR_MS));
}

/** 次の論理日の始まり（次の午前4時）のエポックのミリ秒。 */
export function nextDayStart(nowMs) {
  const base = new Date(nowMs - DAY_START_HOUR * HOUR_MS);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, DAY_START_HOUR, 0, 0, 0).getTime();
}

/** YYYY-MM-DD に日数を足す（暦の計算。時間帯に依らない）。 */
export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

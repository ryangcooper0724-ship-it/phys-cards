/* 責務: 間隔の書式（SPEC §2.2.1・§11 の丸め。秒 → 「N分」「N時間」「N日」）と終わりの表示の時刻「HH:MM」と統計の今の日時（§2.4）。
   依存: なし。
   注意: 四捨五入は半分を切り上げ（Math.round）。59.5 分以上は時間、23.5 時間以上は日に繰り上げる。「か月」は使わない。 */

export function formatInterval(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "—";
  }
  const s = Math.max(0, seconds);
  const minutes = s / 60;
  if (minutes < 59.5) {
    return `${Math.max(1, Math.round(minutes))}分`;
  }
  const hours = s / 3600;
  if (hours < 23.5) {
    return `${Math.max(1, Math.round(hours))}時間`;
  }
  return `${Math.max(1, Math.round(s / 86400))}日`;
}

/** 端末の時間帯の「HH:MM」（終わりの表示。分への切り上げは呼ぶ側 queue.endState が済ませる）。 */
export function formatClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 統計の今の日時（§2.4）:「2026/11/20(金) 21:05」。端末の時間帯の暦の日付（論理日ではない）、月日と時分は 0 で埋める（A71）。 */
export function formatDateTime(ms) {
  const d = new Date(ms);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}(${WEEKDAYS[d.getDay()]}) ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

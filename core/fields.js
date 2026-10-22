/* 責務: 分野と章の番号（SPEC §14.1・§14.2）: chapter の入る分野・カードの chapter の範囲・記録の章のキーの上限。純粋な関数。
   依存: なし。
   注意: fields はデッキの値（deck.json の fields。core は DECK を読まないので引数で受け取る）。空の配列なら化学と同じ 0〜30。 */

/** 1つの分野の章の番号の幅（base〜base+99。§14.2）。 */
export const FIELD_SPAN = 100;
/** 分野の無いデッキ（化学）の章の番号と記録の章のキーの上限（§3・§4.8）。 */
export const CHAPTER_MAX_PLAIN = 30;
/** 分野のあるデッキの記録の章のキーの上限（§14.2）。 */
export const CHAPTER_MAX_FIELDS = 999;

/** chapter の入る分野（{id, label, base}）。分野が無い・どの分野にも入らなければ null。 */
export function fieldOfChapter(fields, ch) {
  if (!Array.isArray(fields) || !Number.isInteger(ch)) {
    return null;
  }
  return fields.find((f) => f.base <= ch && ch < f.base + FIELD_SPAN) ?? null;
}

/** カードの chapter の範囲（§14.2）: 分野が無ければ 0〜30、あればどれかの分野の base〜base+99 の整数。 */
export function chapterInRange(fields, ch) {
  if (!Number.isInteger(ch)) {
    return false;
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return ch >= 0 && ch <= CHAPTER_MAX_PLAIN;
  }
  return fieldOfChapter(fields, ch) !== null;
}

/** 記録の章のキーの上限（§14.12。validateRecord に渡す）: 分野が無ければ 30、あれば 999。 */
export function chapterKeyMax(fields) {
  return Array.isArray(fields) && fields.length > 0 ? CHAPTER_MAX_FIELDS : CHAPTER_MAX_PLAIN;
}

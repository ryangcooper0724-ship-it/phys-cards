/* 責務: カードのハッシュ（SPEC §4.3: JSON.stringify([star, yoyu, chapter, q, a, how]) の UTF-8 の SHA-256 の先頭8桁）。
   依存: crypto.subtle（http://127.0.0.1・localhost・https で使える）。引数で差し替えられる。
   注意: 値は cards.json のそのまま（消毒の前）。crypto.subtle が無ければ例外（呼ぶ側が「この場所では動きません」にする）。 */

function subtleOrThrow(subtle) {
  const s = subtle ?? globalThis.crypto?.subtle;
  if (!s) {
    throw new Error("crypto.subtle がありません");
  }
  return s;
}

export async function cardHash(card, subtle) {
  const text = JSON.stringify([card.star, card.yoyu, card.chapter, card.q, card.a, card.how]);
  const digest = await subtleOrThrow(subtle).digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 全カードのハッシュ {id: 8桁}。 */
export async function deckHashes(cards, subtle) {
  const s = subtleOrThrow(subtle);
  const pairs = await Promise.all(cards.map(async (c) => [c.id, await cardHash(c, s)]));
  const out = {};
  for (const [id, h] of pairs) {
    out[id] = h;
  }
  return out;
}

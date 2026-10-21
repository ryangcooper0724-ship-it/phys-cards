/* 責務: 冊子の版の更新（SPEC §2.6・§11）: deck と今の cards.json（edition・ハッシュ）の比べ方、noticeBase の扱い、知らせの差（増えた・変わった・減った）。純粋な関数。
   依存: なし（ハッシュは core/hash.js で作った {id: 8桁} を受け取る）。
   注意: 引き当ては Object.hasOwn（id が constructor などでも誤らない。§4.1）。版の更新（黙った更新も）では undo を null にする（§2.6・§11）。 */

function sameHash(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) {
    return false;
  }
  return ka.every((k) => Object.hasOwn(b, k) && b[k] === a[k]);
}

/** base（noticeBase）と今の deck の差。増えた＝今だけにある id、減った＝base だけにある id、変わった＝両方にあってハッシュが違う id。 */
export function deckDiff(baseHash, nowHash) {
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const id of Object.keys(nowHash)) {
    if (!Object.hasOwn(baseHash, id)) {
      added += 1;
    } else if (baseHash[id] !== nowHash[id]) {
      changed += 1;
    }
  }
  for (const id of Object.keys(baseHash)) {
    if (!Object.hasOwn(nowHash, id)) {
      removed += 1;
    }
  }
  return { added, changed, removed };
}

function isZero(d) {
  return d.added === 0 && d.changed === 0 && d.removed === 0;
}

/** noticeBase があり差が 0・0・0 なら消した deck を返す（§11）。 */
function settleNotice(deck) {
  if (deck.noticeBase !== null && isZero(deckDiff(deck.noticeBase.hash, deck.hash))) {
    return { ...deck, noticeBase: null };
  }
  return deck;
}

/**
 * 起動時・読み込みの時の版の判定（§2.6）。record.deck が null でないこと（null は呼ぶ側が今の cards.json から作る）。
 * 返り値: {record, changed}。changed が偽なら record はそのまま（同じ物）。
 */
export function applyDeckUpdate(record, edition, hashes) {
  const deck = record.deck;
  if (deck.edition !== edition) {
    const noticeBase = deck.noticeBase ?? { edition: deck.edition, hash: { ...deck.hash } }; // 閉じる前の2回目は最初の物のまま
    const next = settleNotice({ edition, hash: { ...hashes }, noticeBase });
    return { record: { ...record, deck: next, undo: null }, changed: true };
  }
  if (!sameHash(deck.hash, hashes)) {
    const next = settleNotice({ ...deck, hash: { ...hashes } }); // 黙って新しくする（知らせの差は数え直す）
    return { record: { ...record, deck: next, undo: null }, changed: true };
  }
  return { record, changed: false };
}

/** ホームに出す知らせ（無ければ null）: {edition, added, changed, removed}。 */
export function deckNotice(record) {
  if (!record || !record.deck || record.deck.noticeBase === null) {
    return null;
  }
  const d = deckDiff(record.deck.noticeBase.hash, record.deck.hash);
  if (isZero(d)) {
    return null;
  }
  return { edition: record.deck.edition, ...d };
}

export function noticeText(n, noun = "冊子") {
  return `${noun}が ${n.edition} になりました（増えた ${n.added}・変わった ${n.changed}・減った ${n.removed}）`;
}

/** × を押した: noticeBase を消す（以後出ない）。 */
export function dismissNotice(record) {
  return { ...record, deck: { ...record.deck, noticeBase: null } };
}

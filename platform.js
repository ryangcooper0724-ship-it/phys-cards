/* 責務: iOS とホーム画面アプリの判定（SPEC §2.1・§11）・保存の保護の依頼（persist）と表示（persisted）・週の報告の共有ファイルの選択とダウンロード（§2.5）。
   依存: navigator・matchMedia・File・Blob・URL（引数で差し替えられる。テストは初期スクリプトで standalone・share を差し替える。本番に切り替えは置かない）。
   注意: API が無い・例外のときは安全側（iOS でない／standalone でない／persist は頼まない／共有できなければダウンロード）に倒す。 */

/** iOS か（UA に iPhone・iPad・iPod、または iPadOS＝platform が MacIntel でタッチが2点以上）。 */
export function isIOS(nav = globalThis.navigator) {
  if (!nav) {
    return false;
  }
  const ua = String(nav.userAgent || "");
  if (/iPhone|iPad|iPod/.test(ua)) {
    return true;
  }
  return nav.platform === "MacIntel" && Number(nav.maxTouchPoints) > 1;
}

/** ホーム画面アプリとして開いたか（navigator.standalone が true か display-mode: standalone）。 */
export function isStandalone(nav = globalThis.navigator, matchMediaFn = globalThis.matchMedia) {
  if (nav && nav.standalone === true) {
    return true;
  }
  try {
    return typeof matchMediaFn === "function" && matchMediaFn.call(globalThis, "(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

/** iOS でホーム画面アプリでないなら #install にする（§2.1）。 */
export function needsInstall(nav = globalThis.navigator, matchMediaFn = globalThis.matchMedia) {
  return isIOS(nav) && !isStandalone(nav, matchMediaFn);
}

/** 記録を作ったときに1回 persist() を頼む（§4.7）。結果は true・false・null（API が無い・例外）。 */
export async function requestPersist(nav = globalThis.navigator) {
  try {
    if (!nav || !nav.storage || typeof nav.storage.persist !== "function") {
      return null;
    }
    return await nav.storage.persist();
  } catch {
    return null;
  }
}

/** 読み込みの後に persist() を頼む（未許可なら。§11）。persisted() が真なら頼まない。 */
export async function requestPersistIfNeeded(nav = globalThis.navigator) {
  try {
    if (nav && nav.storage && typeof nav.storage.persisted === "function" && (await nav.storage.persisted()) === true) {
      return true;
    }
  } catch {
    // persisted() が無い・例外 → そのまま頼む
  }
  return requestPersist(nav);
}

/** 設定の「保存の保護」（§2.3）: persisted() が true →「あり」、false →「なし」、API が無い・例外・拒否・真偽でない →「不明」。 */
export async function persistedLabel(nav = globalThis.navigator) {
  try {
    if (!nav || !nav.storage || typeof nav.storage.persisted !== "function") {
      return "不明";
    }
    const v = await nav.storage.persisted();
    if (v === true) {
      return "あり";
    }
    return v === false ? "なし" : "不明";
  } catch {
    return "不明";
  }
}

/**
 * 週の報告で共有するファイルを選ぶ（§2.5）: canShare が json（application/json）を受ければ .json、だめで txt（text/plain）を受ければ .txt、
 * どちらもだめ・share か canShare が無い → null（呼ぶ側がダウンロードにする）。同期の関数（share を await なしで呼ぶため。§11）。
 */
export function pickShareFile(json, jsonName, txtName, nav = globalThis.navigator) {
  if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return null;
  }
  try {
    const jsonFile = new File([json], jsonName, { type: "application/json" });
    if (nav.canShare({ files: [jsonFile] })) {
      return jsonFile;
    }
    const txtFile = new File([json], txtName, { type: "text/plain" });
    if (nav.canShare({ files: [txtFile] })) {
      return txtFile;
    }
  } catch {
    // canShare が例外 → ダウンロード
  }
  return null;
}

/** ファイルをダウンロードさせる（共有できないとき。§2.5）。失敗は例外のまま返す（呼ぶ側がエラーの記録に残す）。 */
export function downloadFile(content, name, type, doc = globalThis.document) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* 責務: service worker の登録・更新の確認・新しい版の知らせと切り替え（SPEC §2.7・§11）。
   依存: navigator.serviceWorker（無ければ何もしない）。画面には触らず、知らせは onUpdateReady、失敗は onError で呼ぶ側へ返す。
   注意: 登録の失敗だけ onError（kind sw）。update() の失敗（オフライン等）は書かない（§11）。初回の controllerchange（初回の claim）では再読み込みしない。 */

let registration = null;
let started = false;

function swContainer(nav) {
  return nav && "serviceWorker" in nav ? nav.serviceWorker : null;
}

/** 更新を確かめる（起動時・visibilitychange・もう一度読むの後）。失敗は黙る。 */
export function checkForUpdate() {
  if (registration === null) {
    return Promise.resolve(false);
  }
  try {
    return Promise.resolve(registration.update()).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** waiting の SW に切り替えを頼む（controllerchange で再読み込み）。waiting が無ければ偽。 */
export function applyUpdate() {
  if (registration === null || !registration.waiting) {
    return false;
  }
  registration.waiting.postMessage("skipWaiting");
  return true;
}

/**
 * 登録する（1つのページで1回だけ）。opts: {onUpdateReady(), onError(msg), reload(), nav, doc}
 * 返り値: 登録を始めたか（SW が使えなければ偽）。
 */
export function startServiceWorker({ onUpdateReady, onError, reload = () => location.reload(), nav = globalThis.navigator, doc = globalThis.document }) {
  const sw = swContainer(nav);
  if (started || sw === null) {
    return false;
  }
  started = true;
  let hadController = Boolean(sw.controller);
  sw.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true; // 初回の claim（§11）
      return;
    }
    reload();
  });
  const watchInstalling = (worker) => {
    if (!worker) {
      return;
    }
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && sw.controller) {
        onUpdateReady();
      }
    });
  };
  Promise.resolve()
    .then(() => sw.register("sw.js"))
    .then((reg) => {
      registration = reg;
      if (reg.waiting && sw.controller) {
        onUpdateReady();
      }
      watchInstalling(reg.installing);
      reg.addEventListener("updatefound", () => watchInstalling(reg.installing));
      checkForUpdate(); // 起動時（§2.7）
    })
    .catch((e) => {
      onError(`service worker を登録できない: ${e && e.name ? `${e.name}: ${e.message}` : String(e)}`);
    });
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "visible") {
      checkForUpdate();
    }
  });
  return true;
}

/* 責務: service worker のひな形（classic script）。build_dist.py が版・キャッシュの一覧・cards.json のハッシュを差し込んで dist/sw.js にする（SPEC §2.7・§11）。
   依存: なし（DOM・localStorage に触らない）。cards.json の正規の中身とハッシュは tools/version.py の canonical_cards・cards_hash と同じ計算を別に書いた物（テストで突き合わせる）。
   注意: install で skipWaiting しない。clients.claim は初回（古いキャッシュが無いとき）だけ。cache:"reload" の cards.json はハッシュが一致するときだけキャッシュを置き換える。 */
"use strict";
const APP_VERSION = "e0d00619";
const CACHE_FILES = ["./", "./anim/catalog.json", "./anim/pendulum.js", "./cards.json", "./core/allow.js", "./core/cards.js", "./core/day.js", "./core/deck.js", "./core/fields.js", "./core/format.js", "./core/hash.js", "./core/plan.js", "./core/plan_stats.js", "./core/queue.js", "./core/record.js", "./core/report.js", "./core/review.js", "./core/scheduler.js", "./core/stats.js", "./deck.js", "./figs.json", "./figs/p04-06.svg", "./figs/p04-08.svg", "./figs/p05-05.svg", "./figs/p05-13.svg", "./figs/p05-13_ans.svg", "./figs/p06-01.svg", "./figs/p06-02.svg", "./figs/p06-03.svg", "./figs/p07-03.svg", "./figs/p07-04.svg", "./figs/p07-04_ans.svg", "./figs/p08-04.svg", "./figs/p08-04_ans.svg", "./figs/p09-05.svg", "./figs/p11-03.svg", "./figs/p11-05.svg", "./figs/p11-05_ans.svg", "./figs/p13-02.svg", "./figs/p14-04.svg", "./figs/p17-01.svg", "./figs/p17-03.svg", "./figs/p17-03_ans.svg", "./figs/p18-08.svg", "./figs/p18-08_ans.svg", "./figs/p18-11.svg", "./figs/p19-05.svg", "./figs/p19-05_ans.svg", "./figs/p19-09.svg", "./figs/p20-04.svg", "./figs/p20-13.svg", "./figs/p20-17.svg", "./figs/p20-17_ans.svg", "./figs/p20-18.svg", "./figs/p21-01.svg", "./figs/p22-04.svg", "./figs/p22-06.svg", "./figs/p22-07.svg", "./figs/p22-07_ans.svg", "./figs/p22-08.svg", "./figs/p22-10.svg", "./figs/p22-11.svg", "./figs/p22-11_ans.svg", "./figs/p23-03.svg", "./figs/p23-05.svg", "./figs/p23-05_ans.svg", "./figs/p23-06.svg", "./figs/p23-06_ans.svg", "./figs/p23-11.svg", "./figs/p23-12.svg", "./figs/p23-12_ans.svg", "./icons/apple-touch-icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./index.html", "./main.js", "./manifest.webmanifest", "./platform.js", "./robots.txt", "./router.js", "./storage.js", "./styles.css", "./sw-client.js", "./ui/anim_box.js", "./ui/dom.js", "./ui/figure.js", "./ui/keys.js", "./ui/report_panel.js", "./ui/screens/broken.js", "./ui/screens/cards.js", "./ui/screens/errors.js", "./ui/screens/help.js", "./ui/screens/home.js", "./ui/screens/import.js", "./ui/screens/install.js", "./ui/screens/newer.js", "./ui/screens/nocards.js", "./ui/screens/practice.js", "./ui/screens/range.js", "./ui/screens/reset.js", "./ui/screens/settings.js", "./ui/screens/stats.js", "./ui/screens/study.js", "./vendor/katex-0.16.47/fonts/KaTeX_AMS-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Caligraphic-Bold.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Caligraphic-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Fraktur-Bold.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Fraktur-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Main-Bold.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Main-BoldItalic.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Main-Italic.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Main-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Math-BoldItalic.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Math-Italic.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_SansSerif-Bold.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_SansSerif-Italic.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_SansSerif-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Script-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Size1-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Size2-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Size3-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Size4-Regular.woff2", "./vendor/katex-0.16.47/fonts/KaTeX_Typewriter-Regular.woff2", "./vendor/katex-0.16.47/katex.min.css", "./vendor/katex-0.16.47/katex.mjs", "./vendor/ts-fsrs-5.4.2.mjs", "./version.js"];
const CARDS_HASH = "b2c81d38";
const CACHE_PREFIX = "phys-cards-"; // デッキの cachePrefix（build_dist.py が差し込む。消すのはこの接頭辞の古いキャッシュだけ。SPEC §12.4）
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;
const CARDS_FILE = "cards.json";

/** Python の json.dumps(sort_keys=True, ensure_ascii=False, separators=(",", ":")) と同じ文字列（キーは ASCII の前提で sort()）。 */
function canonicalJson(v) {
  if (Array.isArray(v)) {
    return "[" + v.map(canonicalJson).join(",") + "]";
  }
  if (v !== null && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

/** cards.json の正規の中身（generated を除く）。 */
function canonicalCards(text) {
  const obj = JSON.parse(text);
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("cards.json の最上位がオブジェクトでない");
  }
  const rest = {};
  for (const k of Object.keys(obj)) {
    if (k !== "generated") {
      rest[k] = obj[k];
    }
  }
  return canonicalJson(rest);
}

/** 版と同じ計算を cards.json だけに当てた物: sha256("cards.json" + \0 + 正規の中身 + \0) の先頭8桁。 */
async function cardsHash(text) {
  const enc = new TextEncoder();
  const parts = [enc.encode(CARDS_FILE), new Uint8Array([0]), enc.encode(canonicalCards(text)), new Uint8Array([0])];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", all);
  return [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cardsUrl() {
  return new URL(CARDS_FILE, self.registration.scope).href;
}

function isCardsRequest(request) {
  const u = new URL(request.url);
  return u.origin + u.pathname === cardsUrl();
}

self.addEventListener("install", (event) => {
  // ネットを先に取る（置き場所の HTTP のキャッシュに残った前の版の中身を、新しい版のキャッシュに入れない）
  const requests = CACHE_FILES.map((u) => new Request(u, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const old = names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME);
    await Promise.all(old.map((n) => caches.delete(n)));
    if (old.length === 0) {
      await self.clients.claim(); // 初回だけ（§11）
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

/** 自分の版のキャッシュ（CACHE_NAME）だけから引く。caches.match は同じ origin の全部のキャッシュを探すので、同じアカウントの
    別の Pages が別名のキャッシュに入れた物を返しうる（security-review S-1・A145）。 */
function ownMatch(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(request, { ignoreSearch: true }));
}

/** cache:"reload" の取得:ネットを先に。cards.json はハッシュが一致するときだけキャッシュを置き換える。ネットが無ければキャッシュ。 */
async function reloadFirst(request) {
  let res;
  try {
    res = await fetch(request);
  } catch (e) {
    const hit = await ownMatch(request);
    return hit || Response.error();
  }
  if (res.ok && isCardsRequest(request)) {
    try {
      if (await cardsHash(await res.clone().text()) === CARDS_HASH) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cardsUrl(), res.clone());
      }
    } catch (e) {
      // 読めない・合わない cards.json はキャッシュしない（そのまま返す。ページが判定する）
    }
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  if (request.cache === "reload") {
    event.respondWith(reloadFirst(request));
    return;
  }
  event.respondWith(
    ownMatch(request).then((hit) => hit || fetch(request))
  );
});

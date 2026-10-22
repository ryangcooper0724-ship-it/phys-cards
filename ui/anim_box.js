/* 責務: 動きの印（sanitize の {t: "anim", template, params}）を動きの箱にする: canvas・再生・止める・最初から・名前ごとのつまみ・測った値（SPEC §13.3・§13.10）。
   依存: ../anim/catalog.json（値の範囲の正）と ../anim/<ひな形>.js（create(canvas, params) → {reset, step, draw, readouts}）を必要になった時に読む。
   注意: 自動で動かさない。ループは requestAnimationFrame で、箱が画面から外れた・見えない（解説の段が閉じた）・動きが終わった（probe().done）・stopAll（画面の移動・アプリが隠れた）で必ず止める。dt は 1/30 秒で切る。 */

const TEMPLATE_RE = /^[a-z][a-z0-9-]{0,30}$/;
const DT_MAX = 1 / 30;
let catalogPromise = null;
let onError = () => {};
const running = new Set(); // 再生中の箱の止める関数

/** main.js が起動の時に渡す: 失敗をエラーの記録に残す関数（文を受け取る）。 */
export function setAnimErrorSink(sink) {
  onError = typeof sink === "function" ? sink : () => {};
}

function loadCatalog() {
  catalogPromise ??= fetch(new URL("../anim/catalog.json", import.meta.url)).then((res) => {
    if (!res.ok) {
      throw new Error(`catalog.json の取得 HTTP ${res.status}`);
    }
    return res.json();
  }).catch((e) => {
    catalogPromise = null; // 取れなかったら次の箱でもう一度取りに行く
    throw e;
  });
  return catalogPromise;
}

/** catalog の決まりで値を確かめ、書いていない名前は default で埋めた値（合わなければ null。§13.10 の step の判定）。 */
export function resolveParams(spec, given) {
  if (spec === null || typeof spec !== "object" || typeof spec.params !== "object") {
    return null;
  }
  const out = {};
  for (const k of Object.keys(given)) {
    if (!Object.hasOwn(spec.params, k)) {
      return null;
    }
  }
  for (const [k, p] of Object.entries(spec.params)) {
    const v = Object.hasOwn(given, k) ? given[k] : p.default;
    const n = (v - p.min) / p.step;
    if (!(typeof v === "number" && v >= p.min && v <= p.max && Math.abs(n - Math.round(n)) <= 1e-9)) {
      return null;
    }
    out[k] = v;
  }
  return out;
}

/** 再生中の動きを全部止める（画面の移動・visibilitychange で main.js が呼ぶ）。 */
export function stopAll() {
  for (const stop of [...running]) {
    stop();
  }
}

function failNode(box, template, e) {
  const span = document.createElement("span");
  span.className = "anim-missing";
  span.textContent = "（動きを出せません）";
  box.replaceChildren(span);
  onError(`動きを出せません: ${template}`); // §13.3 の文のまま（理由を足すと §2.8 のまとめで1件にならない）
  if (e) {
    console.warn("動きを出せません", template, e); // 理由は開発のときの確かめ用
  }
}

function fmt(v, step) {
  const digits = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  return v.toFixed(digits);
}

function button(text, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (cls) {
    b.className = cls;
  }
  return b;
}

/**
 * 動きのトークン → 動きの箱（div.anim）。中身はひな形を読んだ後に組む。
 * opts.lazy（カードの一覧）は「動きを見る」のボタンだけを出し、押した時に箱を組む（canvas を作る。印の多い一覧で canvas を並べない）。
 */
export function animBox(tok, opts = {}) {
  const box = document.createElement("div");
  box.className = "anim";
  box.dataset.anim = tok.template;
  if (opts.lazy === true) {
    const open = button("動きを見る", "anim-open");
    open.addEventListener("click", () => fill(box, tok), { once: true });
    box.replaceChildren(open);
    return box;
  }
  fill(box, tok);
  return box;
}

function fill(box, tok) {
  if (!TEMPLATE_RE.test(tok.template)) {
    failNode(box, tok.template, null);
    return;
  }
  loadCatalog()
    .then((catalog) => {
      const spec = Object.hasOwn(catalog, tok.template) ? catalog[tok.template] : null;
      const params = resolveParams(spec, tok.params);
      if (params === null) {
        throw new Error("ひな形の表と合わない"); // 表に無いひな形のモジュールは読まない
      }
      return import(new URL(`../anim/${tok.template}.js`, import.meta.url).href).then((mod) => {
        if (typeof mod.create !== "function") {
          throw new Error("create が無い");
        }
        build(box, spec, params, mod);
      });
    })
    .catch((e) => failNode(box, tok.template, e));
}

/** 箱が見えているか（画面に付いていて、箱か祖先が hidden・display:none でない）。 */
function shown(box) {
  return box.isConnected && box.getClientRects().length > 0;
}

/** ひな形が終わりを知らせる口（probe().done）があれば、その値（無ければ偽）。 */
function ended(sim) {
  return typeof sim.probe === "function" && sim.probe().done === true;
}

function build(box, spec, initial, mod) {
  const params = { ...initial };
  const title = document.createElement("span");
  title.className = "anim-title";
  title.textContent = `動き: ${spec.label}`;
  const canvas = document.createElement("canvas");
  canvas.className = "anim-canvas";
  const play = button("▶ 再生", "primary anim-play");
  const pause = button("止める", "anim-pause");
  const restart = button("最初から", "anim-restart");
  const controls = document.createElement("span");
  controls.className = "anim-controls";
  controls.append(play, pause, restart);
  const sliders = document.createElement("span");
  sliders.className = "anim-sliders";
  const out = document.createElement("span");
  out.className = "anim-readouts";
  box.replaceChildren(title, canvas, controls, sliders, out);

  let sim = mod.create(canvas, params);
  let frame = null;
  let last = null;
  let finished = false; // 再生のまま終わりに着いてループを止めた（最初から・つまみで続けて再生する）

  function showReadouts() {
    out.replaceChildren(...sim.readouts().map((r) => {
      const row = document.createElement("span");
      row.className = "anim-readout";
      const k = document.createElement("span");
      k.textContent = r.label;
      const v = document.createElement("span");
      v.className = "anim-value";
      v.textContent = r.value;
      row.append(k, v);
      return row;
    }));
  }

  function stop() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    last = null;
    running.delete(stop);
  }

  function tick(now) {
    frame = null;
    if (!shown(box)) {
      stop(); // 画面から外れた（次のカード・ほかの画面）か、解説の段が閉じた。開き直しても自動で再開しない（§13.10）
      return;
    }
    if (last !== null) {
      sim.step(Math.min(DT_MAX, Math.max(0, (now - last) / 1000)));
    }
    last = now;
    sim.draw();
    showReadouts();
    if (ended(sim)) {
      stop(); // 終わりのある動きが終わった（最後の絵と値は描いた。requestAnimationFrame を残さない）
      finished = true;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function start() {
    finished = false;
    if (frame === null) {
      running.add(stop);
      frame = requestAnimationFrame(tick);
    }
  }

  for (const [k, p] of Object.entries(spec.params)) {
    const row = document.createElement("label");
    row.className = "anim-slider";
    const name = document.createElement("span");
    name.textContent = p.label;
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(p.min);
    range.max = String(p.max);
    range.step = String(p.step);
    range.value = String(params[k]);
    range.dataset.param = k;
    const value = document.createElement("span");
    value.className = "anim-value";
    value.textContent = `${fmt(params[k], p.step)} ${p.unit}`;
    range.addEventListener("input", () => {
      params[k] = Number(range.value);
      value.textContent = `${fmt(params[k], p.step)} ${p.unit}`;
      sim = mod.create(canvas, params); // 最初からに戻して描き直す（再生中なら続ける）
      last = null;
      sim.draw();
      showReadouts();
      if (finished) {
        start();
      }
    });
    row.append(name, range, value);
    sliders.append(row);
  }
  play.addEventListener("click", start);
  pause.addEventListener("click", () => {
    finished = false;
    stop();
  });
  restart.addEventListener("click", () => {
    sim.reset();
    last = null;
    sim.draw();
    showReadouts();
    if (finished) {
      start(); // 再生のまま終わった後の最初からは、前と同じく続けて動かす
    }
  });
  requestAnimationFrame(() => {
    sim.draw(); // 止まった最初の絵（自動で動かさない）
    showReadouts();
  });
}

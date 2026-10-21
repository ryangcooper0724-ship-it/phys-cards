/* 責務: 図の印（sanitize の {t: "fig", name, back}）を img の図にする・答えを見たら裏の図に差し替える・押すと画面いっぱいに拡大（SPEC §13.2・§13.10）。
   依存: なし（figs.json の中身と失敗の記録の受け手は main.js が setFigures で渡す）。
   注意: 図は必ず <img>（SVG の中のスクリプトと外の読み込みは動かない）。見た目は styles.css の .fig・.fig-zoom（style 属性は使わない）。 */

let figs = Object.create(null);
let onError = () => {};
let runtimeReported = false;
let zoomLayer = null;

const FILE_RE = /^figs\/[a-z0-9_-]{1,40}\.(svg|png|jpg|webp)$/;

function validInfo(v) {
  return v !== null && typeof v === "object" && typeof v.file === "string" && FILE_RE.test(v.file) &&
    Number.isFinite(v.w) && v.w > 0 && Number.isFinite(v.h) && v.h > 0;
}

/** main.js が起動の時に渡す: figs.json の中身（{名前: {file, w, h}}）と、失敗をエラーの記録に残す関数（文を受け取る）。
    形の違う項目（file が figs/ の名前でない・幅と高さが正の数でない）は無い物として捨てる（「（図を読み込めません）」になる）。 */
export function setFigures(map, errorSink) {
  figs = Object.create(null);
  if (map !== null && typeof map === "object") {
    for (const [name, v] of Object.entries(map)) {
      if (validInfo(v)) {
        figs[name] = v;
      }
    }
  }
  onError = typeof errorSink === "function" ? errorSink : () => {};
  runtimeReported = false;
}

/** figs.json に名前があるか（起動の時の「図を読めません（N 件）」の数え）。 */
export function hasFigure(name) {
  return Object.hasOwn(figs, name);
}

function missingNode() {
  const span = document.createElement("span");
  span.className = "fig-missing";
  span.textContent = "（図を読み込めません）";
  return span;
}

function reportRuntime(name) {
  if (!runtimeReported) {
    runtimeReported = true; // 起動ごとに1件（§13.10）
    onError(`図を読めません（1 件。最初: ${name}）`);
  }
}

/** 図の img（読めなければ、包んでいる要素ごと「（図を読み込めません）」の文字に替え、起動ごとに1件だけ記録する）。 */
function imgFor(name, lazy) {
  const info = figs[name];
  const img = document.createElement("img");
  img.addEventListener("error", () => {
    (img.parentElement ?? img).replaceWith(missingNode());
    reportRuntime(name);
  });
  img.alt = "図";
  img.decoding = "async";
  if (lazy) {
    img.loading = "lazy"; // カードの一覧（§13.10）
  }
  img.width = Math.max(1, Math.round(info.w));
  img.height = Math.max(1, Math.round(info.h));
  img.src = info.file;
  return img;
}

/**
 * 図のトークン → 図の要素（span.fig の中に img。p の中にも置けるよう span にして、見た目でブロックにする）。
 * opts.back: 答えを見た後（裏の名前があればそちらを出す）。opts.list: カードの一覧（裏の図を小さく後ろに並べる・lazy）。
 */
export function figureNode(tok, opts = {}) {
  const name = opts.back && tok.back ? tok.back : tok.name;
  if (!hasFigure(name)) {
    return missingNode();
  }
  const wrap = document.createElement("span");
  wrap.className = "fig";
  const img = imgFor(name, opts.list === true);
  wrap.dataset.fig = name;
  wrap.append(img);
  wrap.addEventListener("click", () => openZoom(name));
  if (opts.list === true && tok.back && hasFigure(tok.back)) {
    const back = document.createElement("span");
    back.className = "fig fig-back";
    back.dataset.fig = tok.back;
    back.append(imgFor(tok.back, true));
    back.addEventListener("click", () => openZoom(tok.back));
    const frag = document.createDocumentFragment();
    frag.append(wrap, back);
    return frag;
  }
  return wrap;
}

/** 図を画面いっぱいに出す（暗い背景・縦横の比を保つ）。押す・「閉じる」・Escape（main.js）で戻る。 */
export function openZoom(name) {
  if (zoomLayer !== null || !hasFigure(name)) {
    return;
  }
  const layer = document.createElement("div");
  layer.className = "fig-zoom";
  layer.id = "fig-zoom";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "図の拡大");
  const frame = document.createElement("span");
  frame.className = "fig-zoom-frame";
  frame.append(imgFor(name, false));
  const close = document.createElement("button");
  close.className = "fig-zoom-close";
  close.id = "fig-zoom-close";
  close.type = "button";
  close.textContent = "閉じる";
  layer.append(frame, close);
  layer.addEventListener("click", () => closeZoom());
  document.body.append(layer);
  zoomLayer = layer;
  close.focus();
}

export function closeZoom() {
  if (zoomLayer !== null) {
    zoomLayer.remove();
    zoomLayer = null;
  }
}

export function isZoomOpen() {
  return zoomLayer !== null;
}

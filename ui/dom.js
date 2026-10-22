/* 責務: DOM を作る共通の部品（el・大きな数字・横棒）と、カードの HTML をトークンの列から組み立てる（htmlField。SPEC §7）。
   依存: ../core/allow.js（sanitize が返す消毒済みのトークンの列。§11）、../core/fields.js（章の入る分野。§14.2）、../deck.js（章の名前・分野。dist にだけある）。
   注意: innerHTML を使わない。文字は textContent（createTextNode）だけで入れる。数式（§12.2）は main.js が setMathRenderer で渡す描き手（KaTeX）が要素を組む。図（§13.2）は ./figure.js、動き（§13.3）は ./anim_box.js。要素は sanitize が出したタグ（b i sub sup small br）だけ・属性なし。 */
import { sanitize } from "../core/allow.js";
import { figureNode } from "./figure.js";
import { animBox } from "./anim_box.js";
import { DECK } from "../deck.js";
import { fieldOfChapter } from "../core/fields.js";

/**
 * el("button", {id, className, text, attrs: {...}, on: {click: fn}, disabled}, [子...])
 */
export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.id) {
    node.id = opts.id;
  }
  if (opts.className) {
    node.className = opts.className;
  }
  if (opts.text !== undefined) {
    node.textContent = String(opts.text);
  }
  for (const [k, v] of Object.entries(opts.attrs ?? {})) {
    node.setAttribute(k, String(v));
  }
  for (const [k, fn] of Object.entries(opts.on ?? {})) {
    node.addEventListener(k, fn);
  }
  if (opts.disabled) {
    node.disabled = true;
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

let mathRenderer = null; // (tex, display, node) => void。KaTeX を読めなかったら null のまま（区間は文字で出す）
let mathError = () => {};

/** 数式の描き手と、描けなかったときの知らせ先を決める（main.js が起動の時に1回。§12.2・§12.8）。 */
export function setMathRenderer(render, onError) {
  mathRenderer = render;
  mathError = onError;
}

/** 数式のトークンを要素にする。描けなければ（描き手が無い・例外）区切りを含む元の文字を textContent で出し、知らせる。 */
function mathNode(tok, cardId) {
  const node = document.createElement("span");
  node.className = tok.display ? "math math-display" : "math";
  const raw = tok.display ? `\\[${tok.tex}\\]` : `\\(${tok.tex}\\)`;
  if (mathRenderer === null) {
    node.textContent = raw;
    return node;
  }
  try {
    mathRenderer(tok.tex, tok.display, node);
  } catch (e) {
    node.textContent = raw; // 描きかけを捨てる（§12.8）
    mathError(cardId, e);
  }
  return node;
}

/** カードの欄の HTML を DocumentFragment にする（許可したタグだけ要素にする。数式のデッキでは数式の区間を描く）。cardId はエラーの記録用。 */
/**
 * カードの欄の HTML → DOM の断片。opts.field は q・a・how（図の |裏: は q だけ。§13.10）、opts.back は答えを見た後（q の図を裏の図にする）、
 * opts.list はカードの一覧（図を lazy にし、裏の図を後ろに小さく並べる。動きは「動きを見る」のボタンにする）。
 */
export function htmlField(html, cardId = "", opts = {}) {
  const frag = document.createDocumentFragment();
  const stack = [frag];
  const field = opts.field ?? "a";
  for (const tok of sanitize(html, { math: DECK.features.math, figures: DECK.features.figures, anim: DECK.features.anim, field })) {
    const top = stack[stack.length - 1];
    if (tok.t === "anim") {
      const budget = opts.animBudget; // 1枚のカードで合わせて 3 個まで（§13.10。q・how・a で同じ物を渡す）
      if (budget && budget.n <= 0) {
        top.append(document.createTextNode(tok.raw));
      } else {
        if (budget) {
          budget.n -= 1;
        }
        top.append(animBox(tok, { lazy: opts.list === true })); // 一覧は「動きを見る」のボタンだけ（押した時に箱を組む）
      }
    } else if (tok.t === "fig") {
      top.append(figureNode(tok, { back: opts.back === true, list: opts.list === true }));
    } else if (tok.t === "math") {
      top.append(mathNode(tok, cardId));
    } else if (tok.t === "text") {
      top.append(document.createTextNode(tok.v));
    } else if (tok.t === "br") {
      top.append(document.createElement("br"));
    } else if (tok.t === "open") {
      const child = document.createElement(tok.tag);
      top.append(child);
      stack.push(child);
    } else if (tok.t === "close" && stack.length > 1) {
      stack.pop();
    }
  }
  return frag;
}

/**
 * 「見出し 数」を大きな数字のタイルの中身にする: [見出し, 空白, 数]。
 * 空白は white-space: pre の span（.gap）にして、数（.num、inline-block で次の行に回る）の前でも消えないようにする
 * （innerText・textContent が「見出し 数」のまま。テストと読み上げが同じ文を読む）。
 */
export function bigNumber(label, value) {
  return [label, el("span", { className: "gap", text: " " }), el("span", { className: "num", text: value })];
}

/**
 * 横棒（value ÷ max）。幅は CSSOM の style.width で入れる（CSP の style-src は style 属性の文字列だけを止め、CSSOM は止めない）。
 * max が 0 以下なら幅 0。読み上げは role="progressbar" と aria-valuenow・aria-valuemax。
 */
export function progressBar(id, value, max, label) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const fill = el("div", { className: "bar-fill" });
  fill.style.width = `${(ratio * 100).toFixed(1)}%`;
  return el("div", {
    id, className: "bar",
    attrs: { role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": Math.max(0, max), "aria-valuenow": value },
  }, [fill]);
}

/** 問題集のカードの印（§13.4。pack が null・省略・デッキに無い id なら null）。 */
export function packBadge(card) {
  const pack = card.pack ? DECK.packs.find((pk) => pk.id === card.pack) : null;
  return pack ? el("span", { className: "pack-badge", text: pack.label }) : null;
}

/** カードの札の印（§12.3。tag が null・省略・デッキに無い id なら null）。 */
export function tagBadge(card) {
  const t = DECK.tags.find((x) => x.id === (card.tag ?? null));
  return t === undefined ? null : el("span", { className: "tag-badge", text: t.label });
}

/** 章ごとの色の番号（12 色の表を回す。styles.css の .chc-0〜.chc-11）。 */
export function chapterColorClass(ch) {
  return `chc-${((ch % 12) + 12) % 12}`;
}

/** 章の番号だけ（「序章」「第N章」。分野のあるデッキは分野の中の番号 chapter − base で、分野の label は付けない。§14.2）。
    統計の表はこれ（23 章でも 390×750 に収める。§12.8。分野の label を付けると 2 列の表が 390 の幅をはみ出す。統計は分野ごとの行に変える予定。A197）。 */
export function chapterLabel(ch) {
  const f = fieldOfChapter(DECK.fields, ch);
  const n = f === null ? ch : ch - f.base;
  return n === 0 ? "序章" : `第${n}章`;
}

/** 分野の label を付けた章の番号（「熱力学 第1章」。分野の無いデッキは chapterLabel と同じ。§14.2）。 */
function fieldLabel(ch) {
  const f = fieldOfChapter(DECK.fields, ch);
  return f === null ? chapterLabel(ch) : `${f.label} ${chapterLabel(ch)}`;
}

function withName(label, ch) {
  const names = DECK.chapterNames;
  const key = String(ch);
  return Object.hasOwn(names, key) ? `${label} ${names[key]}` : label;
}

/** 章の名前（デッキの chapterNames にあれば「第16章 単振り子」。無ければ chapterLabel と同じ。§12.1）。
    分野のあるデッキは「{分野の label} 第{chapter − base}章 {名前}」（0 なら「{label} 序章」、名前が無ければ名前なし。§14.2）。 */
export function chapterName(ch) {
  return withName(fieldLabel(ch), ch);
}

/** 分野の label を省いた章の名前（「第1章 {名前}」。分野が1つしかない画面＝範囲のたたみの中・練習の章の札で使う。§14.2）。化学は chapterName と同じ。 */
export function chapterShortName(ch) {
  return withName(chapterLabel(ch), ch);
}

/* 責務: カードの HTML（q・a・how）の文法の判定 checkHtml（SPEC §3。opts.math が真なら §12.2・§12.8 の数式の区間、opts.figures が真なら §13.2 の図の印も）と、消毒して「トークンの列」を返す sanitize（§7・§11。ui/dom.js が createElement と textContent で組む。数式の区間は {t: "math"}）。
   依存: なし。Python の tools/allow.py は別実装（表を共有しない。tests/fixtures/allow_cases.json で一致を確かめる。T8）。
   注意: 文字の判定は charCodeAt の数で書く（エスケープの書き方が道具で生の文字に化けた前例がある）。名前の小文字化に toLowerCase を全体へ当てない（長さが変わる文字がある）。 */

const MAX_LEN = 2000;
const GRAMMAR_TAG = /<(\/?)(br|b|i|sub|sup|small)>/y;
const GRAMMAR_REF = /&(amp|lt|gt|quot|nbsp|#[1-9][0-9]*);/y;
const TEX_LEFT = "\\$^_{}";
const PAIR_TAGS = new Set(["b", "i", "sub", "sup", "small"]);
const DANGER_TAGS = new Set(["script", "style", "iframe", "object", "embed", "template", "svg", "math"]);
const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", nbsp: String.fromCharCode(160) };
const SANITIZE_REF = /&(amp|lt|gt|quot|nbsp|#[1-9][0-9]{0,6});/y;
// 名前の参照か TeX の取り残しのすり抜けになる 10 進（§3）と、生では違反の U+2028・U+2029（対称にする。A97）
const BANNED_DEC = new Set([60, 62, 38, 92, 36, 94, 95, 123, 125, 8232, 8233]);

function hex4(c) {
  return "U+" + c.toString(16).toUpperCase().padStart(4, "0");
}

/** 生で置けない符号単位（制御文字・U+2028/2029・U+FFFE/FFFF・surrogate＝基本面の外と対でない物）。 */
function badCode(c) {
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ||
    c === 0xfffe || c === 0xffff || (c >= 0xd800 && c <= 0xdfff);
}

function decimalOk(n) {
  if (!Number.isSafeInteger(n) || BANNED_DEC.has(n)) {
    return false;
  }
  return (n >= 32 && n <= 126) || (n >= 160 && n <= 55295) || (n >= 57344 && n <= 65533);
}


// ---- 数式の区間（SPEC §12.2・§12.8。opts.math が真のデッキだけ）。tools/allow_math.py とは別実装（表も書き方も共有しない。T8） ----
const MATH_SEG_MAX = 500;
const MATH_SEGS_MAX = 30;
// 許す命令（清書の力学の実物＋物理で使う安全な命令。\href・\url・\html…・\def 類・\begin・\char・\verb は入れない）
const MATH_COMMANDS = new Set([
  // ギリシャ文字
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "iota", "kappa",
  "lambda", "mu", "nu", "xi", "pi", "varpi", "rho", "varrho", "sigma", "varsigma", "tau", "upsilon", "phi", "varphi",
  "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
  // 形
  // \vec は入れない（KaTeX が SVG に style 属性を付け CSP に違反する。ベクトルは \bm。安全のレビューの L1）
  "frac", "dfrac", "tfrac", "sqrt", "bm", "boldsymbol", "dot", "ddot", "hat", "bar", "overline", "underline",
  "underbrace", "overbrace", "underset", "overset", "mathrm", "mathbf", "mathit", "mathcal", "mathbin", "mathrel",
  "boxed", "phantom", "displaystyle", "textstyle", "left", "right", "big", "Big", "bigl", "bigr", "Bigl", "Bigr",
  "bigg", "Bigg", "biggl", "biggr", "Biggl", "Biggr", "limits", "nolimits", "xrightarrow", "xleftarrow", "text",
  // 演算子
  "sum", "int", "iint", "oint", "prod", "lim", "max", "min", "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln",
  "exp", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "det", "deg",
  // 関係・矢印
  "le", "leq", "ge", "geq", "neq", "ne", "approx", "simeq", "sim", "propto", "equiv", "ll", "gg", "fallingdotseq",
  "doteqdot", "risingdotseq", "perp", "parallel", "mid", "to", "rightarrow", "leftarrow", "Rightarrow", "Leftarrow",
  "leftrightarrow", "Leftrightarrow", "longrightarrow", "Longrightarrow", "longleftrightarrow", "Longleftrightarrow",
  "iff", "mapsto", "uparrow", "downarrow", "nearrow", "searrow", "in", "notin", "subset", "subseteq", "cup", "cap",
  // 記号・空白
  "times", "cdot", "cdotp", "cdots", "ldots", "dots", "vdots", "ddots", "pm", "mp", "div", "circ", "infty", "partial",
  "nabla", "ell", "hbar", "angle", "triangle", "square", "bigstar", "star", "bullet", "therefore", "because", "prime",
  "quad", "qquad",
]);
const MATH_SYMBOL_COMMANDS = ",;!{}|"; // \, \; \! \{ \} \|（\\ は違反）
const MATH_ASCII = /^[A-Za-z0-9 +\-*/=()[\]|,.;:!?'<>^_{}]$/;
const MATH_TEXT_BAD = "\\{}$%#&~^_";
const MATH_TOKEN = /\\([A-Za-z]+)|\\([\s\S])|\\$|([\s\S])/y;

/** 1区間の中身（区切りを除き、文字参照を戻した後）の違反の理由（合法なら null）。 */
export function mathProblem(tex) {
  if (tex.length === 0) {
    return "空の数式";
  }
  if (tex.length > MATH_SEG_MAX) {
    return `数式が ${MATH_SEG_MAX} 文字を超える`;
  }
  const toks = [];
  MATH_TOKEN.lastIndex = 0;
  while (MATH_TOKEN.lastIndex < tex.length) {
    const m = MATH_TOKEN.exec(tex);
    if (m[1] !== undefined) {
      toks.push({ cmd: m[1] });
    } else if (m[2] !== undefined) {
      toks.push({ sym: m[2] });
    } else if (m[3] !== undefined) {
      toks.push({ ch: m[3] });
    } else {
      return "数式の終わりに \\ だけ";
    }
  }
  let braces = 0;
  let lefts = 0;
  for (let k = 0; k < toks.length; k += 1) {
    const t = toks[k];
    if (t.cmd !== undefined) {
      if (!MATH_COMMANDS.has(t.cmd)) {
        return `数式で許していない命令 \\${t.cmd}`;
      }
      if (t.cmd === "left") {
        lefts += 1;
      } else if (t.cmd === "right") {
        lefts -= 1;
        if (lefts < 0) {
          return "\\right に対の \\left が無い";
        }
      } else if (t.cmd === "text") {
        let m = k + 1;
        while (m < toks.length && toks[m].ch === " ") {
          m += 1;
        }
        if (m >= toks.length || toks[m].ch !== "{") {
          return "\\text の後に { が無い";
        }
        for (m += 1; m < toks.length && toks[m].ch !== "}"; m += 1) {
          if (toks[m].ch === undefined || MATH_TEXT_BAD.includes(toks[m].ch)) {
            return "\\text の中に使えない文字";
          }
        }
        if (m >= toks.length) {
          return "\\text の { の閉じ忘れ";
        }
        k = m;
      }
    } else if (t.sym !== undefined) {
      if (!MATH_SYMBOL_COMMANDS.includes(t.sym)) {
        return `数式で許していない記号の命令 \\${t.sym}`;
      }
    } else {
      if (t.ch.charCodeAt(0) > 0x7e) {
        return "数式の中の ASCII でない文字（\\text{…} の中だけ使える）";
      }
      if (!MATH_ASCII.test(t.ch)) {
        return `数式で使えない文字 ${t.ch}`;
      }
      if (t.ch === "{") {
        braces += 1;
      } else if (t.ch === "}") {
        braces -= 1;
        if (braces < 0) {
          return "数式の } が多い";
        }
      }
    }
  }
  if (braces !== 0) {
    return "数式の { の閉じ忘れ";
  }
  return lefts === 0 ? null : "\\left に対の \\right が無い";
}

// ---- 図の印（SPEC §13.2・§13.10。opts.figures が真のデッキだけ）。tools/allow.py とは別実装 ----
const FIG_OPEN = "[[図:";
const FIG_MAX = 6; // 1欄の図の印（|裏: は1個と数える）
const FIG_BODY = /^([a-z0-9_-]{1,40})(\|裏:([a-z0-9_-]{1,40}))?$/;

/** s[i] から始まる図の印の閉じ "]]" の位置（タグ・参照の文字 < > & をまたぐ前に無ければ -1）。 */
function figEnd(s, i) {
  for (let j = i; j < s.length; j += 1) {
    const c = s.charCodeAt(j);
    if (c === 0x3c || c === 0x3e || c === 0x26) {
      return -1;
    }
    if (c === 0x5d && s.charCodeAt(j + 1) === 0x5d) {
      return j;
    }
  }
  return -1;
}

/** 図の印の中身（[[図: と ]] の間）の違反の理由（合法なら null）。field は q・a・how（|裏: は q だけ）。 */
function figureProblem(body, field) {
  const m = FIG_BODY.exec(body);
  if (m === null) {
    return "図の印の形が違う（[[図:名前]] か [[図:名前|裏:名前]]、名前は小文字の英数字と _ - の 1〜40 文字）";
  }
  return m[2] !== undefined && field !== "q" ? "裏の差し替え（|裏:）は問いの欄だけ" : null;
}

// ---- 動きの印（SPEC §13.3・§13.10。opts.anim が真のデッキだけ。形だけを見る。ひな形・名前・範囲は sync_cards.py と ui/anim_box.js） ----
const ANIM_OPEN = "[[動き:";
const ANIM_MAX = 2;
const ANIM_TEMPLATE = /^[a-z][a-z0-9-]{0,30}$/;
const ANIM_ARG = /^([A-Za-z][A-Za-z0-9]{0,15})=(-?[0-9]{1,6}(?:\.[0-9]{1,6})?)$/;

/** 動きの印の中身を読む: {template, params} か、形の違反の理由の文字列。 */
function readAnim(body) {
  if (body === "" || body[0] === " " || body[body.length - 1] === " ") {
    return "動きの印の形が違う（[[動き:ひな形 名前=値 …]]、前後に空白を入れない）";
  }
  const parts = body.split(/ +/);
  if (!ANIM_TEMPLATE.test(parts[0])) {
    return "動きのひな形の名前の形が違う（小文字の英字で始まる英数字と - の 1〜31 文字）";
  }
  const params = {};
  for (const a of parts.slice(1)) {
    const m = ANIM_ARG.exec(a);
    if (m === null) {
      return `動きの値の書き方が違う（名前=10 進の数）: ${a.slice(0, 20)}`;
    }
    if (Object.hasOwn(params, m[1])) {
      return `動きの値の名前 ${m[1]} が重複`;
    }
    params[m[1]] = Number(m[2]);
  }
  return { template: parts[0], params };
}

/** 文字参照を1つ戻した文字（§3 で許す物だけ。許さない物は null）。 */
function decodeRef(name) {
  if (Object.hasOwn(NAMED, name)) {
    return NAMED[name];
  }
  const n = Number(name.slice(1));
  return name[0] === "#" && decimalOk(n) ? String.fromCharCode(n) : null;
}

/** §3 の文法の違反の理由（合法なら null）。opts.math が真なら数式の区間を見る（§12.8）。opts.figures が真なら図の印を見る（opts.field は q・a・how。§13.10）。 */
export function checkHtml(s, opts = {}) {
  const math = opts.math === true;
  const figures = opts.figures === true;
  const anim = opts.anim === true;
  const field = opts.field ?? "a";
  if (typeof s !== "string") {
    return "文字列でない";
  }
  if (s.length > MAX_LEN) {
    return `${MAX_LEN.toLocaleString("en-US")} 文字を超える（${s.length} 文字）`;
  }
  for (let k = 0; k < s.length; k += 1) {
    const c = s.charCodeAt(k);
    if (badCode(c)) {
      return `使えない文字 ${hex4(c)}`;
    }
  }
  const stack = [];
  let open = null; // 開いている数式の区間の閉じ（")" か "]"）
  let tex = "";
  let segs = 0;
  let figs = 0;
  let anims = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "<") {
      GRAMMAR_TAG.lastIndex = i;
      const m = GRAMMAR_TAG.exec(s);
      if (m === null) {
        return "許可していないタグか単独の <";
      }
      if (open !== null) {
        return "数式の区間がタグをまたぐ";
      }
      const tag = m[2];
      if (tag === "br") {
        if (m[1] === "/") {
          return "</br>";
        }
      } else if (m[1] === "") {
        if (stack.includes(tag)) {
          return `<${tag}> の祖先に同じタグ`;
        }
        stack.push(tag);
      } else {
        if (stack[stack.length - 1] !== tag) {
          return `</${tag}> が開きと合わない`;
        }
        stack.pop();
      }
      i += m[0].length;
      continue;
    }
    if (ch === ">") {
      return "単独の >";
    }
    if (ch === "&") {
      GRAMMAR_REF.lastIndex = i;
      const m = GRAMMAR_REF.exec(s);
      if (m === null) {
        return "許可していない文字参照か単独の &";
      }
      if (m[1][0] === "#" && !decimalOk(Number(m[1].slice(1)))) {
        return `範囲外か除外の文字参照 ${m[0]}`;
      }
      if (open !== null) {
        tex += decodeRef(m[1]);
      }
      i += m[0].length;
      continue;
    }
    if (figures && s.startsWith(FIG_OPEN, i)) {
      if (open !== null) {
        return "数式の区間の中の図の印";
      }
      const end = figEnd(s, i);
      if (end < 0) {
        return "図の印の閉じ忘れ";
      }
      const why = figureProblem(s.slice(i + FIG_OPEN.length, end), field);
      if (why !== null) {
        return why;
      }
      if (stack.length > 0) {
        return "図の印がタグの中";
      }
      figs += 1;
      if (figs > FIG_MAX) {
        return `図の印が ${FIG_MAX} 個を超える`;
      }
      i = end + 2;
      continue;
    }
    if (anim && s.startsWith(ANIM_OPEN, i)) {
      if (open !== null) {
        return "数式の区間の中の動きの印";
      }
      const end = figEnd(s, i);
      if (end < 0) {
        return "動きの印の閉じ忘れ";
      }
      const got = readAnim(s.slice(i + ANIM_OPEN.length, end));
      if (typeof got === "string") {
        return got;
      }
      if (stack.length > 0) {
        return "動きの印がタグの中";
      }
      anims += 1;
      if (anims > ANIM_MAX) {
        return `動きの印が ${ANIM_MAX} 個を超える`;
      }
      i = end + 2;
      continue;
    }
    if (math && open === null && ch === "\\" && (s[i + 1] === "(" || s[i + 1] === "[")) {
      open = s[i + 1] === "(" ? ")" : "]";
      tex = "";
      i += 2;
      continue;
    }
    if (open !== null) {
      if (ch === "\\" && s[i + 1] === "\\") {
        tex += "\\\\";
        i += 2;
      } else if (ch === "\\" && s[i + 1] === open) {
        const why = mathProblem(tex);
        if (why !== null) {
          return why;
        }
        segs += 1;
        if (segs > MATH_SEGS_MAX) {
          return `数式の区間が ${MATH_SEGS_MAX} を超える`;
        }
        open = null;
        i += 2;
      } else {
        tex += ch;
        i += 1;
      }
      continue;
    }
    if (TEX_LEFT.includes(ch)) {
      return `TeX の取り残し ${ch}`;
    }
    i += 1;
  }
  if (open !== null) {
    return "数式の閉じ忘れ";
  }
  if (stack.length > 0) {
    return `<${stack[stack.length - 1]}> の閉じ忘れ`;
  }
  return null;
}

export function isLegal(s, opts = {}) {
  return checkHtml(s, opts) === null;
}

function isAsciiLetter(ch) {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isNameChar(ch) {
  return isAsciiLetter(ch) || (ch >= "0" && ch <= "9") || ch === "-";
}

/** s[i] === "<" から始まるタグを読む。タグの形でなければ null（その "<" は文字）。 */
function readTag(s, i) {
  let j = i + 1;
  const close = s[j] === "/";
  if (close) {
    j += 1;
  }
  if (!isAsciiLetter(s[j] ?? "")) {
    return null;
  }
  const nameStart = j;
  while (j < s.length && isNameChar(s[j])) {
    j += 1;
  }
  const rawName = s.slice(nameStart, j);
  let quote = null;
  let k = j;
  for (; k < s.length; k += 1) {
    const ch = s[k];
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === "\"" || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      break;
    }
  }
  if (k >= s.length) {
    return null;
  }
  const rest = s.slice(j, k).trim();
  let name = "";
  for (const ch of rawName) {
    name += ch >= "A" && ch <= "Z" ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch;
  }
  return { close, rawName, name, selfClose: rest.endsWith("/"), end: k + 1 };
}

/** 危ない要素の閉じのタグの後ろの位置（無ければ欄の終わり）。 */
function afterDangerClose(s, from, name) {
  const re = new RegExp(`</${name}(?:[\\s/][^>]*)?>`, "ig");
  re.lastIndex = from;
  const m = re.exec(s);
  return m === null ? s.length : m.index + m[0].length;
}

/**
 * 数式の区間を読む（s[i] が "\\"、s[i+1] が "(" か "["）。閉じまで（タグの "<" の前まで）に文字参照を戻した中身を作る。
 * 閉じが無ければ null。{tex, raw（区切りを含む戻した文字）, display, end}。
 */
function readMath(s, i) {
  const close = s[i + 1] === "(" ? ")" : "]";
  let tex = "";
  let j = i + 2;
  while (j < s.length && s[j] !== "<") {
    if (s[j] === "\\" && s[j + 1] === "\\") {
      tex += "\\\\";
      j += 2;
      continue;
    }
    if (s[j] === "\\" && s[j + 1] === close) {
      return { tex, raw: `\\${s[i + 1]}${tex}\\${close}`, display: close === "]", end: j + 2 };
    }
    if (s[j] === "&") {
      SANITIZE_REF.lastIndex = j;
      const m = SANITIZE_REF.exec(s);
      const dec = m === null ? null : decodeRef(m[1]);
      if (dec !== null) {
        tex += dec;
        j += m[0].length;
        continue;
      }
    }
    tex += s[j];
    j += 1;
  }
  return null;
}

/**
 * §11 の消毒。トークン: {t: "text", v} / {t: "open", tag} / {t: "close", tag} / {t: "br"} / {t: "math", tex, display}（opts.math のときだけ）/
 * {t: "fig", name, back}（opts.figures のときだけ。タグの外の正しい印を 6 個まで。|裏: は opts.field が q のときだけ。ほかは元の文字）/
 * {t: "anim", template, params}（opts.anim のときだけ。タグの外の形の正しい印を 2 個まで）。開きと閉じは必ず対になる。
 * 数式の区間は §12.8 の判定に通る物だけ {t: "math"} にし、通らない物は区切りを含む元の文字を {t: "text"} で出す（KaTeX に渡さない）。
 * 危ない要素は中身ごと消す、許可していない要素はタグだけ消す、許可した要素の属性は消す、許可タグの大文字・自己終了・合わない開き閉じはタグだけ捨てる、
 * 単独の < > & と許可していない文字参照は文字として出す。
 */
export function sanitize(html, opts = {}) {
  const math = opts.math === true;
  const figures = opts.figures === true;
  const anim = opts.anim === true;
  const field = opts.field ?? "a";
  let figs = 0;
  let anims = 0;
  const s = String(html ?? "");
  const tokens = [];
  const stack = [];
  let text = "";
  const flush = () => {
    if (text !== "") {
      tokens.push({ t: "text", v: text });
      text = "";
    }
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "<") {
      if (s.startsWith("<!--", i)) {
        const end = s.indexOf("-->", i + 4);
        if (end >= 0) {
          i = end + 3; // コメントは消す（A98）
          continue;
        }
      } else {
        const tag = readTag(s, i);
        if (tag !== null) {
          i = tag.end;
          if (DANGER_TAGS.has(tag.name)) {
            if (!tag.close) {
              i = afterDangerClose(s, i, tag.name);
            }
            continue;
          }
          if (tag.rawName !== tag.name || tag.selfClose) {
            continue; // 大文字・<br/> などはタグだけ捨てる
          }
          if (tag.name === "br" && !tag.close) {
            flush();
            tokens.push({ t: "br" });
          } else if (PAIR_TAGS.has(tag.name)) {
            if (!tag.close && !stack.includes(tag.name)) {
              flush();
              stack.push(tag.name);
              tokens.push({ t: "open", tag: tag.name });
            } else if (tag.close && stack[stack.length - 1] === tag.name) {
              flush();
              stack.pop();
              tokens.push({ t: "close", tag: tag.name });
            }
          }
          continue; // 許可していない要素・合わない開き閉じはタグだけ捨てる
        }
      }
    } else if (math && ch === "\\" && (s[i + 1] === "(" || s[i + 1] === "[")) {
      const seg = readMath(s, i);
      if (seg !== null) {
        if (mathProblem(seg.tex) === null) {
          flush();
          tokens.push({ t: "math", tex: seg.tex, display: seg.display });
        } else {
          text += seg.raw; // 違反の区間は文字で出す（§12.8）
        }
        i = seg.end;
        continue;
      }
    } else if (anim && stack.length === 0 && anims < ANIM_MAX && s.startsWith(ANIM_OPEN, i)) {
      const end = figEnd(s, i);
      const got = end < 0 ? null : readAnim(s.slice(i + ANIM_OPEN.length, end));
      if (got !== null && typeof got !== "string") {
        flush();
        tokens.push({ t: "anim", template: got.template, params: got.params, raw: s.slice(i, end + 2) }); // raw: 1枚 3 個を超えたら文字で出す
        anims += 1;
        i = end + 2;
        continue;
      }
    } else if (figures && stack.length === 0 && figs < FIG_MAX && s.startsWith(FIG_OPEN, i)) {
      const end = figEnd(s, i);
      const m = end < 0 ? null : FIG_BODY.exec(s.slice(i + FIG_OPEN.length, end));
      if (m !== null && (m[2] === undefined || field === "q")) {
        flush();
        tokens.push({ t: "fig", name: m[1], back: m[3] ?? null });
        figs += 1;
        i = end + 2;
        continue;
      }
    } else if (ch === "&") {
      SANITIZE_REF.lastIndex = i;
      const m = SANITIZE_REF.exec(s);
      if (m !== null) {
        if (m[1][0] !== "#") {
          text += NAMED[m[1]];
          i += m[0].length;
          continue;
        }
        const n = Number(m[1].slice(1));
        if (decimalOk(n)) {
          text += String.fromCharCode(n);
          i += m[0].length;
          continue;
        }
      }
    }
    text += ch;
    i += 1;
  }
  flush();
  while (stack.length > 0) {
    tokens.push({ t: "close", tag: stack.pop() });
  }
  return tokens;
}

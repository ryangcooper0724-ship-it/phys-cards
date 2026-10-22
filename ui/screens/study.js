/* 責務: 学習の画面（表 → 答えを見る → 裏と4つの評価のボタン・間隔。SPEC §2.2・§2.2.1・§11）。plan のデッキの練習（上に「練習 i / N」。§14.4）と
   問題集（上に「{label} i / N」、裏に「間違えた」「できた」の2つ。§14.6）も同じ画面の形で出す（app.study.kind が "today"・"practice"・"pack"）。
   依存: ../dom.js、../../core/format.js・queue.js。app.study と app.reveal・app.rate・app.answerPack・app.undo・app.canUndoStudy・app.practiceAgain・app.navigate・
   app.moreKind・app.studyMore（今日の分の終わりの「もう少し進める」。S81）。
   解説（exp。§14.13）は裏の答えの下のたためる段で、最初は閉じ、押した時に中身を組む。開いた状態は表を描くたびに捨てる（次のカード・出し直しでは閉じる）。開いている間はカードの下にボタンの段の高さ分の余白（.exp-open）。
   注意: 裏でも表（q）を上に残す。「1つ戻す」は左上で、戻せる答えがあるときだけ押せる（§2.2・§14.12）。終わりの表示は自動で更新しない（§11）。「答えを見る」と評価のボタンは下に寄せて高さ 56px 以上（§10・S47）。キーボードは main.js と ui/keys.js。
   見た目: 表と裏は1枚のパネル（.card-panel、章ごとの色 .chc-N）。今日の分は残り枚数（ホームの「今日の復習」＋「新しいカード」（＋2周目）と同じ数）を上に小さく出す。 */
import { el, htmlField, chapterColorClass, tagBadge, packBadge } from "../dom.js";
import { DECK } from "../../deck.js";
import { formatInterval, formatClock } from "../../core/format.js";
import { homeCounts } from "../../core/queue.js";
import { ANIM_PER_CARD } from "../../core/cards.js";

const BUTTONS = [
  [1, "もう一度"],
  [2, "難しい"],
  [3, "正解"],
  [4, "簡単"],
];

function front(card, revealed, budget) {
  return el("div", { id: "study-front", className: "card-face" }, [
    el("p", { id: "study-q", className: "card-text" }, [
      packBadge(card),
      tagBadge(card),
      card.star ? el("span", { className: "star", text: "★" }) : null,
      htmlField(card.q, card.id, { field: "q", back: revealed, animBudget: budget }), // 答えを見たら |裏: の図に差し替える（§13.2）
      card.yoyu ? el("span", { className: "yoyu", text: `（${DECK.yoyuLabel}）` }) : null,
    ]),
    card.star ? el("p", { id: "study-say-how", className: "card-note", text: "（出し方も言え）" }) : null,
    el("p", { className: "sec sec-badge", text: card.sec }),
  ]);
}

let expOpenId = null; // 解説を開いているカードの id（表を描いたら null に戻す。開いた状態を次のカードに持ち越さない。§14.13）

/** 解説を開いている間だけ、カードの下に評価のボタンの段の高さ分の余白を取る（開いた長い解説を最後まで送ってもボタンに隠れない。A236）。
    閉じている間・解説の無いカード（化学）は余白なし。段の高さは測って --bar-h に入れる（測れなければ CSS の既定）。 */
function reserveBar(toggle, open) {
  const screen = toggle.closest(".study");
  if (!screen) {
    return; // 次のカードに移った後（古い段）
  }
  const bar = screen.querySelector(".bottom");
  if (open && bar) {
    screen.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
  }
  screen.classList.toggle("exp-open", open);
}

/** 解説のたためる段（exp が null なら無し）。閉じた見出しは1行の小さな押しボタン。中身は最初に開いた時に組む（7 秒の流れで開かないカードの数式・図を描かない）。 */
function expBox(card, budget) {
  if (typeof card.exp !== "string") {
    return null;
  }
  const body = el("div", { id: "study-exp-body", className: "card-text exp-body" });
  const arrow = el("span", { className: "exp-arrow", attrs: { "aria-hidden": "true" } });
  const toggle = el("button", { id: "study-exp-toggle", className: "exp-toggle", attrs: { "aria-controls": "study-exp-body" } }, [arrow, "解説"]);
  let built = false;
  const show = (open) => {
    if (open && !built) {
      built = true;
      body.append(htmlField(card.exp, card.id, { field: "exp", animBudget: budget })); // 動きの印は q・how・a の残りの数まで（§13.10）
    }
    body.hidden = !open;
    arrow.textContent = open ? "▼" : "▶";
    toggle.setAttribute("aria-expanded", String(open));
    expOpenId = open ? card.id : null;
    requestAnimationFrame(() => reserveBar(toggle, open)); // 描き直しの最中は画面に付く前なので、次の描画で測る
  };
  toggle.addEventListener("click", () => show(body.hidden));
  show(expOpenId === card.id); // 同じカードの裏を描き直したときは開いたまま
  return el("div", { id: "study-exp", className: "exp-box" }, [toggle, body]);
}

function back(card, budget) {
  return el("div", { id: "study-back", className: "card-face back" }, [
    card.star ? el("p", { id: "study-how", className: "card-text how-box" }, ["出し方: ", htmlField(card.how, card.id, { field: "how", animBudget: budget })]) : null,
    el("p", { id: "study-answer", className: "card-text" }, [htmlField(card.a, card.id, { field: "a", animBudget: budget })]),
    expBox(card, budget),
    el("p", { className: "sec", text: card.sec }),
  ]);
}

function homeButton(app) {
  return el("button", { id: "study-home", className: "primary", text: "ホームへ", on: { click: () => app.navigate("home") } });
}

/** 練習・問題集の終わり（§14.4・§14.6）。 */
function flowEndLines(end, app) {
  if (end.kind === "practice-done") {
    return [
      el("p", { id: "study-practice-done", className: "hint", text: `練習は終わり（${end.n} 問）` }),
      el("div", { className: "actions" }, [
        el("button", { id: "study-practice-again", text: "同じ範囲でもう一度", on: { click: () => app.practiceAgain() } }),
        homeButton(app),
      ]),
    ];
  }
  const text = end.mode === "miss" ? `解き直しは終わり（残りの間違い ${end.miss} 問）` : `最後まで解きました（間違い ${end.miss} 問）`; // A210
  return [
    el("p", { id: "study-pack-done", className: "hint", text }),
    el("div", { className: "actions" }, [homeButton(app)]),
  ];
}

/** 今日の分の終わりの「もう少し進める」（S81。plan のデッキで足せる物があるときだけ。化学は app.moreKind が null）。 */
function moreButton(app) {
  const kind = app.moreKind ? app.moreKind() : null;
  if (kind === null) {
    return null;
  }
  return el("div", { className: "actions" }, [
    el("button", {
      id: "study-more", className: "primary", attrs: { "data-more": kind },
      text: kind === "new" ? "もう少し進める（+10）" : "もう少し進める（2 周目 +10）",
      disabled: app.readFailed, on: { click: () => app.studyMore() },
    }),
  ]);
}

function endLines(end, app) {
  if (end && end.kind === "later") {
    return [el("p", { id: "study-later", text: `${formatClock(end.at)} ごろにもう一度開くと ${end.count} 枚` })];
  }
  const tomorrow = end && end.kind === "done" ? end.tomorrow : 0;
  return [el("p", { id: "study-tomorrow", text: `明日の復習 ${tomorrow}` })];
}

/** 上の小さな数（今日の分は「残り N」、練習は「練習 i / N」、問題集は「{label} i / N」）。 */
function topCount(app, s) {
  if (s.kind === "practice") {
    return `練習 ${s.practice.pos + 1} / ${s.practice.queue.length}`;
  }
  if (s.kind === "pack") {
    const pk = DECK.packs.find((x) => x.id === s.pack.id);
    return `${pk ? pk.label : s.pack.id} ${s.pack.pos + 1} / ${s.pack.ids.length}`;
  }
  const opts = app.queueOpts;
  const c = homeCounts(app.mainCards, app.record, app.now(), opts);
  const round2 = Array.isArray(opts.round2Ids) ? opts.round2Ids.length : 0; // plan のデッキの (4) 2周目（§14.3）
  return `残り ${Math.max(1, c.review + c.newCount + round2)}`;
}

/** 問題集の裏の2つのボタン（§14.6。キーボードは 1＝間違えた、3＝できた）。 */
function packAnswers(app) {
  return el("div", { className: "bottom" }, [
    el("div", { id: "study-ratings", className: "ratings ratings-2" }, [
      el("button", { className: "rating rating-1", attrs: { "data-answer": "miss" }, on: { click: () => app.answerPack(false) } }, [
        el("span", { className: "rating-label", text: "間違えた" }),
      ]),
      el("button", { className: "rating rating-3", attrs: { "data-answer": "ok" }, on: { click: () => app.answerPack(true) } }, [
        el("span", { className: "rating-label", text: "できた" }),
      ]),
    ]),
  ]);
}

export function render(app) {
  const s = app.study;
  const top = el("div", { className: "topbar" }, [
    el("button", {
      id: "study-undo", text: "1つ戻す",
      disabled: !app.canUndoStudy(), on: { click: () => app.undo() },
    }),
    el("button", { id: "study-quit", text: "やめる", on: { click: () => app.navigate("home") } }),
  ]);
  const band = s && s.kind === "pack" ? el("p", { id: "study-pack-band", className: "pack-band", text: "問題集（予定に入らない・間違いだけ残す）" }) : null;
  if (!s || s.currentId === null) {
    const flowEnd = s && s.end && (s.end.kind === "practice-done" || s.end.kind === "pack-done");
    return el("section", { id: "screen-study", className: "screen" }, [
      top,
      ...(flowEnd ? flowEndLines(s.end, app) : [
        el("p", { id: "study-done", className: "hint", text: "今日の分は終わり" }),
        ...endLines(s ? s.end : null, app),
        moreButton(app),
      ]),
    ]);
  }
  const card = app.cardsById.get(s.currentId);
  const budget = { n: ANIM_PER_CARD }; // 動きの印は1枚で合わせて 3 個まで（§13.10）
  const revealed = s.revealedAt !== null;
  if (!revealed) {
    expOpenId = null; // 表を出した＝次のカードか出し直し（解説は閉じて始める。§14.13）
  }
  top.insertBefore(el("span", { id: "study-left", className: "left-count", text: topCount(app, s) }), top.lastChild);
  const bottom = revealed && s.kind === "pack" ? packAnswers(app) : revealed
    ? el("div", { className: "bottom" }, [
      card.star ? el("p", { id: "study-star-hint", className: "hint", text: "出し方を言えなければ『もう一度』" }) : null,
      el("div", { id: "study-ratings", className: "ratings" }, BUTTONS.map(([r, label]) => el("button", {
        className: `rating rating-${r}`, attrs: { "data-rating": r },
        on: { click: () => app.rate(r) },
      }, [
        el("span", { className: "rating-label", text: label }),
        el("span", { className: "interval", text: formatInterval(s.preview[r]) }),
      ]))),
    ])
    : el("div", { className: "bottom" }, [
      el("button", { id: "study-reveal", className: "primary big", text: "答えを見る", on: { click: () => app.reveal() } }),
    ]);
  return el("section", { id: "screen-study", className: "screen study", attrs: { "data-card": card.id, "data-kind": s.kind } }, [
    top,
    band,
    el("div", { className: `card-panel ${chapterColorClass(card.chapter)}` }, [
      front(card, revealed, budget),
      revealed ? back(card, budget) : null,
    ]),
    bottom,
  ]);
}

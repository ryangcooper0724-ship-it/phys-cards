/* 責務: 学習の画面（表 → 答えを見る → 裏と4つの評価のボタン・間隔。SPEC §2.2・§2.2.1・§11）。
   依存: ../dom.js、../../core/format.js。app.study（session・currentId・revealedAt・preview・end）と app.reveal・app.rate・app.undo・app.navigate。
   注意: 裏でも表（q）を上に残す。「1つ戻す」は左上で、直前の評価があるときだけ押せる（§2.2）。終わりの表示は自動で更新しない（§11）。「答えを見る」と評価のボタンは下に寄せて高さ 56px 以上（§10・S47）。キーボードは main.js と ui/keys.js。
   見た目: 表と裏は1枚のパネル（.card-panel、章ごとの色 .chc-N）。残り枚数（ホームの「今日の復習」＋「新しいカード」と同じ数）を上に小さく出す。 */
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

function back(card, budget) {
  return el("div", { id: "study-back", className: "card-face back" }, [
    card.star ? el("p", { id: "study-how", className: "card-text how-box" }, ["出し方: ", htmlField(card.how, card.id, { field: "how", animBudget: budget })]) : null,
    el("p", { id: "study-answer", className: "card-text" }, [htmlField(card.a, card.id, { field: "a", animBudget: budget })]),
    el("p", { className: "sec", text: card.sec }),
  ]);
}

function endLines(end, app) {
  if (end && end.kind === "new-done") {
    const text = end.chapter === null ? "新しいカードは全部やりました" : "この章は全部やりました"; // §13.5
    return [
      el("p", { id: "study-new-done", text }),
      el("div", { className: "actions" }, [
        el("button", { id: "study-home", className: "primary", text: "ホームへ", on: { click: () => app.navigate("home") } }),
      ]),
    ];
  }
  if (end && end.kind === "later") {
    return [el("p", { id: "study-later", text: `${formatClock(end.at)} ごろにもう一度開くと ${end.count} 枚` })];
  }
  const tomorrow = end && end.kind === "done" ? end.tomorrow : 0;
  return [el("p", { id: "study-tomorrow", text: `明日の復習 ${tomorrow}` })];
}

export function render(app) {
  const s = app.study;
  const top = el("div", { className: "topbar" }, [
    el("button", {
      id: "study-undo", text: "1つ戻す",
      disabled: !(app.record && app.record.undo), on: { click: () => app.undo() },
    }),
    el("button", { id: "study-quit", text: "やめる", on: { click: () => app.navigate("home") } }),
  ]);
  if (!s || s.currentId === null) {
    return el("section", { id: "screen-study", className: "screen" }, [
      top,
      s && s.end && s.end.kind === "new-done" ? null : el("p", { id: "study-done", className: "hint", text: "今日の分は終わり" }),
      ...endLines(s ? s.end : null, app),
    ]);
  }
  const card = app.cardsById.get(s.currentId);
  const budget = { n: ANIM_PER_CARD }; // 動きの印は1枚で合わせて 3 個まで（§13.10）
  const revealed = s.revealedAt !== null;
  const c = homeCounts(app.modeCards, app.record, app.now(), app.queueOpts);
  // 残りは流れごと（§13.5）: 復習する＝今日の復習の数、新しく進める＝この流れに残る新しいカード、今までの「始める」＝復習＋新しい
  const flow = s.session.flow ?? "mixed";
  const frontId = s.session.front ?? null;
  const fresh = s.session.fixed.length + (frontId !== null && !s.session.fixed.includes(frontId) ? 1 : 0); // 1つ戻したカード（front）も数える
  const left = flow === "review" ? c.review : flow === "new" ? fresh : c.review + c.newCount;
  top.insertBefore(el("span", { id: "study-left", className: "left-count", text: `残り ${Math.max(1, left)}` }), top.lastChild);
  const bottom = revealed
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
  return el("section", { id: "screen-study", className: "screen study", attrs: { "data-card": card.id } }, [
    top,
    el("div", { className: `card-panel ${chapterColorClass(card.chapter)}` }, [
      front(card, revealed, budget),
      revealed ? back(card, budget) : null,
    ]),
    bottom,
  ]);
}

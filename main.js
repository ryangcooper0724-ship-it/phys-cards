/* 責務: 起動の順番（SPEC §2.0 の (1) #install → (2) cards.json → (3) 記録の読み取り・#newer・退避と #broken（§4.9）→ (4) #settings → (5) #home）と、状態・操作（評価・設定・週の報告・読み込み・新しく始める・別のタブ）・画面の振り分け。
   依存: core/*（純ロジック）、storage.js・platform.js・sw-client.js（外部資源）、router.js、ui/screens/*・ui/keys.js、version.js（build_dist.py が dist に作る）。
   注意: innerHTML を使わない（§7）。#install では localStorage に触らずエラーの記録も書かず SW も登録しない。版の更新と読み込みでは undo を null（§2.6。core/deck.js）。記録を書く・消すのは commitRecord・読み込み・新しく始める・起動の退避だけ（読み込み・新しく始める・週の報告は readFailed の間は止める。A79・A113）。共有は押した処理の中で await なしで呼ぶ（§11）。 */
import { APP_VERSION } from "./version.js";
import { DECK } from "./deck.js";
import { checkCardsStructure, htmlViolations, CARDS_MAX_BYTES } from "./core/cards.js";
import { deckHashes } from "./core/hash.js";
import { applyDeckUpdate, dismissNotice } from "./core/deck.js";
import {
  createRecord, parseStoredRecord, prepareForSave, checkForSave, parseLimitInput, LIMITS,
  makeBrokenStash, parseBrokenStash, countRated,
} from "./core/record.js";
import { homeCounts, buildSession, refreshSession, nextCardId, markRated, withFront, endState, entryOf, isNewEntry } from "./core/queue.js";
import { previewSeconds } from "./core/scheduler.js";
import { applyRating, undoLast } from "./core/review.js";
import { buildReport, reportFileName, parseImport, IMPORT_MAX_BYTES, MSG_NOT_JSON } from "./core/report.js";
import { weekSummary } from "./core/stats.js";
import {
  readRecordRaw, writeRecord, removeRecord, readBrokenRaw, writeBroken, addError, readErrors, RECORD_KEY, setKeyPrefix,
} from "./storage.js";
import { needsInstall, requestPersist, requestPersistIfNeeded, persistedLabel, pickShareFile, downloadFile } from "./platform.js";
import { resolveRoute, hashName } from "./router.js";
import { startServiceWorker, checkForUpdate, applyUpdate } from "./sw-client.js";
import { el, setMathRenderer } from "./ui/dom.js";
import { setFigures, hasFigure, isZoomOpen, closeZoom } from "./ui/figure.js";
import { setAnimErrorSink, stopAll as stopAnimations } from "./ui/anim_box.js";
import { sanitize } from "./core/allow.js";
import { studyKeyAction } from "./ui/keys.js";
import * as homeScreen from "./ui/screens/home.js";
import * as settingsScreen from "./ui/screens/settings.js";
import * as studyScreen from "./ui/screens/study.js";
import * as installScreen from "./ui/screens/install.js";
import * as nocardsScreen from "./ui/screens/nocards.js";
import * as newerScreen from "./ui/screens/newer.js";
import * as brokenScreen from "./ui/screens/broken.js";
import * as importScreen from "./ui/screens/import.js";
import * as resetScreen from "./ui/screens/reset.js";
import * as errorsScreen from "./ui/screens/errors.js";
import * as statsScreen from "./ui/screens/stats.js";
import * as helpScreen from "./ui/screens/help.js";
import * as cardsScreen from "./ui/screens/cards.js";
import * as packsScreen from "./ui/screens/packs.js";
import * as chaptersScreen from "./ui/screens/chapters.js";

const SCREEN_MODULES = {
  home: homeScreen,
  settings: settingsScreen,
  study: studyScreen,
  install: installScreen,
  nocards: nocardsScreen,
  newer: newerScreen,
  broken: brokenScreen,
  import: importScreen,
  reset: resetScreen,
  errors: errorsScreen,
  stats: statsScreen,
  help: helpScreen,
  cards: cardsScreen,
  packs: packsScreen,
  chapters: chaptersScreen,
};

// 保存のキーの頭はデッキの値（どの読み書きよりも前。化学は osakaCards のまま。SPEC §12.4）
setKeyPrefix(DECK.keyPrefix);
/** 読み込みで自分の物と見なす報告の kind と記録の教科（§12.8）。 */
const IMPORT_OPTS = Object.freeze({ kind: DECK.reportKind, deckId: DECK.id, bare: DECK.bareRecord });
/** 記録に書く教科の印（bareRecord が偽のデッキだけ。化学は書かない。§12.8）。 */
const OWN_DECK_ID = DECK.bareRecord ? null : DECK.id;

/** 保存する記録に教科の印を付ける（物理は保存のたびに deckId を書く。§12.8）。 */
function stampDeck(record) {
  return OWN_DECK_ID === null || record.deckId === OWN_DECK_ID ? record : { ...record, deckId: OWN_DECK_ID };
}

const root = document.getElementById("app");

const app = {
  gate: null, // "install"・"nocards"・"newer"・"broken" のとき、その画面で止まる
  cards: [],
  cardsById: new Map(),
  edition: "",
  hashes: {},
  record: null,
  saveFailed: false,
  saveLocked: false, // 真の間は記録の保存を一切しない（getItem が例外 A47・退避が書けない §4.9）
  brokenLocked: false, // 退避が書けず osakaCards.v1 に触らずにいる（#broken に「保存を止めています」）
  readFailed: false, // 起動で osakaCards.v1 の getItem が例外（A47）。その起動の間は読み込み・新しく始める・週の報告も止める（A79・A113）
  otherTab: false, // 別のタブで記録が書かれた（§11）。評価と保存を止める
  fromBroken: false, // #broken のボタンから #import・#reset へ来た
  importState: null, // {stage: "pick"|"confirm", message, record, current}
  resetStep: 0, // 新しく始めるの確認（0→1→消す）
  resetMessage: null,
  reportText: null, // ダウンロードにしたときに画面に出す要約の文
  reportNote: null,
  study: null, // {session, currentId, revealedAt, preview, end}
  undoResume: false, // ホームの「1つ戻す」から #study へ行く間（出す章が 0 でも開ける。§11）
  studyFlow: null, // 自分で進めるデッキの学習の流れ（{flow: "review"|"new", chapter}。# に持たない。§13.5）
  nocardsMessage: null,
  persistLabel: null, // 設定の「保存の保護」（開くたびに persisted() を調べる。§2.3）
  swUpdateReady: false, // 新しい SW が waiting（ホームにだけ「新しい版があります」を出す。§2.7）
  screen: null,
  appVersion: APP_VERSION,
  now: () => Date.now(),
};

function errorText(e) {
  if (e && typeof e === "object") {
    return `${e.name || "Error"}: ${e.message || String(e)}`;
  }
  return String(e);
}

/** 選んでいる問題集の id（今のデッキに無い id・無い・null は本編＝null。§13.4・§13.10）。 */
function currentPack() {
  const id = app.record ? app.record.settings.pack ?? null : null;
  return id !== null && DECK.packs.some((pk) => pk.id === id) ? id : null;
}

/** 選んでいる物のカード（本編か、その問題集。数え方の母数。§13.4・§13.10）。 */
Object.defineProperty(app, "modeCards", {
  get() {
    const pack = currentPack();
    return app.cards.filter((c) => (c.pack ?? null) === pack);
  },
});
/** 本編のカード（設定の章の一覧・本編の数え方。§13.10）。 */
Object.defineProperty(app, "mainCards", {
  get() {
    return app.cards.filter((c) => (c.pack ?? null) === null);
  },
});
Object.defineProperty(app, "currentPack", { get: currentPack });
/** core の queue・統計に渡す口（§13.5。新しいカードは自分で決めるデッキか）。 */
const QOPTS = Object.freeze({ selfPaced: DECK.features.selfPaced === true });
app.queueOpts = QOPTS;

/** 今のデッキに無い問題集の id は、メモリの上だけ本編（null）にする。保存はしない（次の保存で null が書かれる。§13.10）。 */
function forgetUnknownPack(rec) {
  const id = rec && Object.hasOwn(rec.settings, "pack") ? rec.settings.pack : null;
  if (id === null || DECK.packs.some((pk) => pk.id === id)) {
    return rec;
  }
  return { ...rec, settings: { ...rec.settings, pack: null } };
}

function routeContext() {
  const counts = app.record ? homeCounts(app.modeCards, app.record, app.now(), QOPTS) : null;
  return {
    gate: app.gate,
    hasRecord: app.record !== null,
    chaptersOn: counts ? counts.chaptersOn : 0,
    fromBroken: app.fromBroken,
    undoResume: app.undoResume,
    readFailed: app.readFailed,
    hasPacks: DECK.packs.length > 0,
    packMode: currentPack() !== null,
    selfPaced: QOPTS.selfPaced,
    flowChosen: app.studyFlow !== null,
  };
}

function render() {
  stopAnimations(); // 描き直すと前の動きの箱は外れる（requestAnimationFrame を残さない。§13.3）
  const mod = SCREEN_MODULES[app.screen] ?? homeScreen;
  const children = [];
  if (app.otherTab) {
    children.push(el("div", { id: "other-tab-banner", className: "banner" }, [
      el("p", { text: "別のタブで更新されました（再読み込み）" }),
      el("button", { id: "other-tab-reload", text: "再読み込み", on: { click: () => location.reload() } }),
    ]));
  }
  if (app.saveFailed) {
    // 読めなかった起動の間は週の報告を止めている（A113）ので、週の報告を勧めない（self-review の提案2・A148）
    const text = app.readFailed ? "記録を読めませんでした。開き直してください（直らなければ指導者に連絡）" : "保存できませんでした。週の報告で記録を送ってください";
    children.push(el("p", { id: "save-banner", className: "banner", text }));
  }
  children.push(mod.render(app));
  root.replaceChildren(...children);
}

function route() {
  const name = resolveRoute(location.hash, routeContext());
  if (hashName(location.hash) !== name) {
    history.replaceState(null, "", `#${name}`);
  }
  if (name === "study") {
    if (app.study === null) {
      beginSession();
    }
  } else {
    app.study = null;
    app.undoResume = false;
    app.studyFlow = null;
  }
  if (name !== "import" && name !== "reset") {
    app.fromBroken = false;
  }
  if (name !== "import") {
    app.importState = null;
  }
  if (name !== "reset") {
    app.resetStep = 0;
    app.resetMessage = null;
  }
  const entering = app.screen !== name;
  app.screen = name;
  if (name === "settings" && entering) {
    checkPersisted();
  }
  render();
}

/** 設定の画面を開くたびに「保存の保護」を調べる（§2.3）。結果は表示の欄だけを書き換える（入力中の数字の欄を作り直さない）。 */
function checkPersisted() {
  app.persistLabel = null;
  persistedLabel().then((label) => {
    app.persistLabel = label;
    const node = document.getElementById("settings-persist");
    if (node) {
      node.textContent = label;
    }
  });
}

app.navigate = (name) => {
  if (hashName(location.hash) === name) {
    route();
  } else {
    location.hash = name; // hashchange で route()
  }
};

function commitRecord(next) {
  if (app.otherTab) {
    return; // 別のタブの保存を上書きしない（§11）
  }
  const prepared = prepareForSave(stampDeck(next), app.now());
  const bad = checkForSave(prepared);
  app.record = prepared; // 保存できなくてもメモリで続ける（§2.8・§4.2）
  if (app.saveLocked) {
    app.saveFailed = true; // 読めなかった・退避できなかった記録を上書きしない（A47・§4.9）
    return;
  }
  if (bad !== null) {
    addError("save", `保存の前の検査に通らない（場所: ${bad}）`);
    app.saveFailed = true;
    return;
  }
  app.saveFailed = !writeRecord(prepared);
}

function freshDeck() {
  return { edition: app.edition, hash: { ...app.hashes }, noticeBase: null };
}

/** 未解決の退避を resolved にする（§4.9）。失敗しても次の起動で直る。 */
function resolvePendingStash() {
  const { pending, stash } = parseBrokenStash(readBrokenRaw());
  if (pending) {
    writeBroken({ ...stash, resolved: true });
  }
}

/** 設定を変えて保存する。記録が無ければ作る（§4.7: 初めて設定が変わったとき）。change は今の設定を受けて新しい設定を返す。 */
function updateSettings(change) {
  if (app.otherTab) {
    return;
  }
  let rec = app.record;
  const creating = rec === null;
  if (creating) {
    rec = createRecord({ cards: app.mainCards, edition: app.edition, hashes: app.hashes, nowMs: app.now(), deckId: OWN_DECK_ID }); // 章は本編だけ（§13.10）
  }
  commitRecord({ ...rec, settings: change(rec.settings) });
  if (creating) {
    requestPersist(); // 記録を作ったときに1回（§4.7）。結果は待たない
  }
}

app.toggleChapter = (ch) => {
  const key = String(ch);
  updateSettings((s) => {
    const on = Object.hasOwn(s.chapters, key) && s.chapters[key] === true;
    return { ...s, chapters: { ...s.chapters, [key]: !on } };
  });
  render();
};

/** 札の「出す・出さない」の切り替え（押した時点で保存。無い札は「出す」。§12.3）。 */
app.toggleTag = (id) => {
  if (!DECK.tags.some((t) => t.id === id)) {
    return;
  }
  updateSettings((s) => {
    const tags = { ...(s.tags ?? {}) };
    tags[id] = Object.hasOwn(tags, id) && tags[id] === false;
    return { ...s, tags };
  });
  render();
};

/** 問題集の切り替え（§13.4）: id は問題集の id か null（本編）。押した時点で保存してホームへ。読めなかった起動の間は止める。 */
app.selectPack = (id) => {
  if (app.readFailed || (id !== null && !DECK.packs.some((pk) => pk.id === id))) {
    return;
  }
  updateSettings((s) => ({ ...s, pack: id }));
  app.study = null;
  app.navigate("home");
};

/** 「★だけ」「余裕ありを除く」の切り替え（押した時点で保存。§11）。 */
app.toggleFilter = (name) => {
  if (name !== "starOnly" && name !== "excludeYoyu") {
    return;
  }
  updateSettings((s) => ({ ...s, [name]: !s[name] }));
  render();
};

/** 数字の欄を2つまとめて保存（§2.3・§11）。どちらかが違反なら何も保存せず {ok: false, errors} を返す。 */
app.saveLimits = (newText, reviewText) => {
  const n = parseLimitInput(newText, LIMITS.newPerDay.min, LIMITS.newPerDay.max);
  const r = parseLimitInput(reviewText, LIMITS.reviewPerDay.min, LIMITS.reviewPerDay.max);
  const errors = [];
  if (n === null) {
    errors.push(`新しいカードは ${LIMITS.newPerDay.min}〜${LIMITS.newPerDay.max} の整数で`);
  }
  if (r === null) {
    errors.push(`復習は ${LIMITS.reviewPerDay.min}〜${LIMITS.reviewPerDay.max} の整数で`);
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  updateSettings((s) => ({ ...s, newPerDay: n, reviewPerDay: r }));
  render();
  return { ok: true, errors: [] };
};

function showNext() {
  const s = app.study;
  const now = app.now();
  s.session = refreshSession(s.session, app.modeCards, app.record, now, QOPTS); // 午前4時をまたいだら並べ直す（§11）
  s.currentId = nextCardId(s.session, app.modeCards, app.record, now, QOPTS);
  s.revealedAt = null;
  s.preview = null;
  if (s.currentId !== null) {
    s.end = null;
  } else if (s.session.flow === "new") {
    s.end = { kind: "new-done", chapter: s.session.chapter }; // 「新しいカードは全部やりました」「この章は全部やりました」（§13.5）
  } else {
    s.end = endState(app.modeCards, app.record, now, QOPTS);
  }
}

function beginSession(front = null) {
  const now = app.now();
  const flow = app.studyFlow ?? { flow: "mixed", chapter: null };
  const session = buildSession(app.modeCards, app.record, now, { ...QOPTS, ...flow });
  app.study = {
    session: front !== null && app.cardsById.has(front) ? withFront(session, front, app.cards, app.record, now, QOPTS) : session,
    currentId: null, revealedAt: null, preview: null, end: null,
  };
  showNext();
}

app.startStudy = () => {
  app.study = null;
  app.studyFlow = null;
  app.navigate("study");
};

/** 自分で進めるデッキの学習の入口（§13.5）: kind は "review"（復習する）か "new"（続きから。chapter を渡すとその章だけ）。 */
app.startFlow = (kind, chapter = null) => {
  if (!QOPTS.selfPaced || (kind !== "review" && kind !== "new")) {
    return;
  }
  if (kind === "review" && !app.record) {
    return;
  }
  if (!app.record && app.readFailed) {
    return; // 読めなかった起動の間は記録を作らない（禁止パターン・§13.10）
  }
  app.study = null;
  app.studyFlow = { flow: kind, chapter: kind === "new" && Number.isInteger(chapter) ? chapter : null };
  app.navigate("study");
};

app.reveal = () => {
  const s = app.study;
  if (!s || s.currentId === null || s.revealedAt !== null) {
    return;
  }
  const t = app.now(); // 評価の時刻＝答えを見た時刻（§11）
  s.revealedAt = t;
  s.preview = previewSeconds(entryOf(app.record, s.currentId), t);
  render();
};

app.rate = (rating) => {
  const s = app.study;
  if (app.otherTab || !s || s.currentId === null || s.revealedAt === null) {
    return;
  }
  const id = s.currentId;
  let base = app.record;
  const creating = base === null;
  if (creating) {
    if (!QOPTS.selfPaced || app.readFailed) {
      return; // 記録を作ってよいのは自分で進めるデッキの最初の評価だけ。読めなかった起動の間は作らない（§13.5・§13.10）
    }
    base = createRecord({ cards: app.mainCards, edition: app.edition, hashes: app.hashes, nowMs: app.now(), deckId: OWN_DECK_ID });
  }
  commitRecord(applyRating(base, id, rating, s.revealedAt)); // 最初の評価で作るときは、その評価を入れて1回で保存する
  if (creating) {
    requestPersist(); // 記録を作ったときに1回（§4.7）
  }
  s.session = markRated(s.session, id);
  showNext();
  render();
};

/** 学習の画面の「1つ戻す」（§4.6）: 直前の評価を取り消し、そのカードを表から出し直す（今の章の設定で出ないカードでも）。 */
app.undo = () => {
  const s = app.study;
  if (app.otherTab || !s || !app.record || !app.record.undo) {
    return;
  }
  const id = app.record.undo.id;
  commitRecord(undoLast(app.record));
  if (app.cardsById.has(id)) {
    s.session = withFront(s.session, id, app.modeCards, app.record, app.now(), QOPTS);
  }
  showNext();
  render();
};

/** ホームの「1つ戻す」（§11）: 戻して、学習の画面でそのカードの表から始める（出す章が 0 でも開ける）。 */
app.undoFromHome = () => {
  if (app.otherTab || !app.record || !app.record.undo) {
    return;
  }
  const id = app.record.undo.id;
  commitRecord(undoLast(app.record));
  if (QOPTS.selfPaced) {
    // 戻したカードを出し、続けて、新しいカードなら「続きから」、そうでなければ「復習する」の流れ（§13.10）
    app.studyFlow = { flow: isNewEntry(entryOf(app.record, id)) ? "new" : "review", chapter: null };
  }
  beginSession(id);
  app.undoResume = true;
  app.navigate("study");
};

// ---- 週の報告（§2.5・§4.8・§11） ----

function markExported(at) {
  if (app.record) {
    commitRecord({ ...app.record, lastExportAt: at });
  }
}

/** 「週の報告」: ファイルの JSON と要約の文を押した処理の中で同期に作り、await を挟まずに share を呼ぶ（§11）。 */
app.weeklyReport = () => {
  if (!app.record || app.readFailed) {
    return; // 読めなかった起動の記録はメモリで作った空の記録。控えとして送らない（A113。ボタンも押せなくする）
  }
  const now = app.now();
  const exportedAt = new Date(now).toISOString(); // ファイルと記録の両方に使う（§2.5）
  const json = JSON.stringify(buildReport({ record: app.record, appVersion: APP_VERSION, errors: readErrors(), exportedAt, kind: DECK.reportKind }));
  const text = weekSummary(app.cards, app.record, now, QOPTS);
  const jsonName = reportFileName(now, "json", DECK.fileStem);
  const file = pickShareFile(json, jsonName, reportFileName(now, "txt", DECK.fileStem));
  app.reportNote = null;
  const download = () => {
    markExported(exportedAt); // ダウンロードは始めた時点で更新（§2.5）
    try {
      downloadFile(json, jsonName, "application/json");
    } catch (e) {
      addError("js", `週の報告のダウンロードに失敗: ${errorText(e)}`);
    }
    app.reportText = text;
    render();
  };
  if (file === null) {
    download();
    return;
  }
  let p;
  try {
    p = navigator.share({ files: [file], text });
  } catch (e) {
    p = Promise.reject(e);
  }
  Promise.resolve(p).then(() => {
    markExported(exportedAt); // 共有の Promise が成功したときだけ（§2.5）
    app.reportNote = "送りました";
    render();
  }, (e) => {
    if (e && e.name === "NotAllowedError") {
      download(); // §11
      return;
    }
    if (e && e.name === "AbortError") {
      return; // 取り消し: 更新しない
    }
    addError("js", `週の報告の共有に失敗: ${errorText(e)}`);
    app.reportNote = "送れませんでした";
    render();
  });
};

app.closeReportText = () => {
  app.reportText = null;
  render();
};

// ---- 読み込み（§2.5・§4.8）と新しく始める（§2.3・§4.9） ----

app.openImport = () => {
  if (app.readFailed) {
    return; // 保存されている記録を読めないまま上書きしない（A79。router も #settings に戻す）
  }
  app.fromBroken = app.gate === "broken";
  app.navigate("import");
};

/** ファイルを選んだ: 大きさ → 読み取り → §4.8 の検査 → 確認の画面。違反は文を出し、エラーの記録（kind import）。今の記録は変えない。 */
app.importFile = async (file) => {
  let result;
  if (!file || app.readFailed) {
    return;
  }
  if (file.size > IMPORT_MAX_BYTES) {
    result = parseImport("", file.size, IMPORT_OPTS);
  } else {
    try {
      result = parseImport(await file.text(), file.size, IMPORT_OPTS);
    } catch (e) {
      addError("import", `ファイルを読めない: ${errorText(e)}`);
      result = { ok: false, message: MSG_NOT_JSON };
    }
  }
  if (!result.ok) {
    addError("import", result.message);
    app.importState = { stage: "pick", message: result.message };
  } else {
    app.importState = { stage: "confirm", record: result.record, current: countRated(app.record, new Set(app.cardsById.keys())) };
  }
  render();
};

/** 置き換える: 先に osakaCards.v1 を書き、次に退避を resolved にする（§4.9）。書けなければ「保存できませんでした（容量）」で状態は変えない（§11）。 */
app.confirmImport = () => {
  const st = app.importState;
  if (app.otherTab || app.readFailed || !st || st.stage !== "confirm") {
    return; // 読めなかった記録は上書きしない（A79）
  }
  // deck が null ならその場で作る（知らせなし）。版が違えばその場で §2.6 の差分の知らせを作る（A54）
  const rec = st.record.deck === null
    ? { ...st.record, deck: freshDeck() }
    : applyDeckUpdate(st.record, app.edition, app.hashes).record;
  if (!writeRecord(rec)) {
    app.importState = { ...st, message: "保存できませんでした（容量）" };
    render();
    return;
  }
  app.record = forgetUnknownPack(rec);
  app.saveLocked = false;
  app.brokenLocked = false;
  app.saveFailed = false;
  app.study = null;
  resolvePendingStash();
  requestPersistIfNeeded(); // 読み込みの後に頼む（§11）。結果は待たない
  app.gate = null;
  app.fromBroken = false;
  app.navigate("home");
};

app.cancelImport = () => {
  app.navigate(app.fromBroken ? "broken" : "settings");
};

app.openReset = () => {
  if (app.readFailed) {
    return; // 保存されている記録を読めないまま消さない（A79。router も #settings に戻す）
  }
  app.fromBroken = app.gate === "broken";
  app.navigate("reset");
};

/** 新しく始める（確認2回）: 1回目で確認を出し、2回目で osakaCards.v1 だけを消す（§11）→ 退避を resolved（§4.9）→ 記録が無い状態（#settings）。 */
app.resetNext = () => {
  if (app.otherTab || app.readFailed) {
    return; // 読めなかった記録は消さない（A79）
  }
  if (app.resetStep === 0) {
    app.resetStep = 1;
    render();
    return;
  }
  if (!removeRecord()) {
    app.resetMessage = "消せませんでした";
    render();
    return;
  }
  app.record = null;
  app.saveLocked = false;
  app.brokenLocked = false;
  app.saveFailed = false;
  app.study = null;
  resolvePendingStash();
  app.gate = null;
  app.fromBroken = false;
  app.navigate(QOPTS.selfPaced ? "home" : "settings"); // 自分で進めるデッキは新しく始めた後も #home（§13.10）
};

app.cancelReset = () => {
  app.navigate(app.fromBroken ? "broken" : "settings");
};

// ---- 起動 ----

async function loadCards(reload) {
  const res = await fetch("cards.json", reload ? { cache: "reload" } : {});
  if (!res.ok) {
    throw new Error(`cards.json の取得 HTTP ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > CARDS_MAX_BYTES) {
    throw new Error(`cards.json が大きすぎる（${bytes.byteLength} バイト）`); // §3・§11: 構造の違反
  }
  const obj = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const bad = checkCardsStructure(obj, { tagIds: DECK.tags.map((t) => t.id), packIds: DECK.packs.map((pk) => pk.id) });
  if (bad !== null) {
    throw new Error(`cards.json の構造の違反: ${bad}`);
  }
  return obj;
}

function stopAt(gate) {
  app.gate = gate;
  app.study = null;
  history.replaceState(null, "", `#${gate}`);
  app.screen = gate;
  render();
}

/** 起動時に記録が壊れていた（§4.9）: 退避を書き、書けたら osakaCards.v1 を消す。書けなければ触らず保存を止める。 */
function stashBrokenRecord(raw, where) {
  addError("record", `記録が壊れている（場所: ${where}）`);
  if (writeBroken(makeBrokenStash(raw, app.now()))) {
    removeRecord();
  } else {
    app.saveLocked = true;
    app.brokenLocked = true;
  }
  stopAt("broken");
}

/** KaTeX のオプション（§12.2。trust を切り、strict は違反で例外、展開と大きさに上限）。 */
const KATEX_OPTIONS = Object.freeze({ throwOnError: true, trust: false, strict: "error", maxExpand: 100, maxSize: 10,
  output: "htmlAndMathml" });
let mathLoaded = false;

/** 数式のデッキで KaTeX を動的 import する（場所は index.html の KaTeX の CSS の link から。build_dist.py が数式のデッキにだけ入れる）。
    読めなければエラーの記録に1件残し、数式は文字で出したまま続ける（§12.8・Q5）。 */
async function loadMath() {
  if (mathLoaded) {
    return;
  }
  mathLoaded = true;
  try {
    const link = document.querySelector('link[rel="stylesheet"][href$="/katex.min.css"]');
    if (link === null) {
      throw new Error("KaTeX の CSS の link がありません");
    }
    const url = new URL(link.getAttribute("href").replace(/katex\.min\.css$/, "katex.mjs"), document.baseURI);
    const katex = (await import(url.href)).default;
    setMathRenderer(
      // katex.render は要素を createElement で作り、位置は CSSOM で付ける（katex.mjs:1015・1019。innerHTML を使わない。CSP のまま動く）
      (tex, display, node) => katex.render(tex, node, { ...KATEX_OPTIONS, displayMode: display }),
      (cardId, e) => addError("cards", `数式を描けません: ${cardId}（${errorText(e)}）`),
    );
  } catch (e) {
    addError("cards", `数式の部品を読めません: ${errorText(e)}`);
  }
}

/** 図のデッキで figs.json（名前 → file・w・h）を読む（§13.2）。読めなければ空にして、図は「（図を読み込めません）」の文字で出す。
    カードの印に figs.json に無い名前があれば、起動ごとに「図を読めません（N 件。最初: …）」の1件を残す（§13.10・A182）。 */
async function loadFigures(cards) {
  let map = {};
  let listError = null;
  try {
    const res = await fetch("figs.json");
    if (!res.ok) {
      throw new Error(`figs.json の取得 HTTP ${res.status}`);
    }
    map = await res.json();
  } catch (e) {
    listError = errorText(e); // 下の「図を読めません」の1件に含める（起動ごとに1件。§13.10）
  }
  let reported = false;
  setFigures(map, (msg) => {
    if (!reported) {
      reported = true; // 起動の時の1件と合わせて、起動ごとに1件（§13.10）
      addError("cards", msg);
    }
  });
  const missing = [];
  for (const c of cards) {
    for (const field of ["q", "a", "how"]) {
      if (typeof c[field] !== "string") {
        continue;
      }
      for (const tok of sanitize(c[field], { math: DECK.features.math, figures: true, field })) {
        for (const name of tok.t === "fig" ? [tok.name, tok.back] : []) {
          if (name !== null && !hasFigure(name) && !missing.includes(name)) {
            missing.push(name);
          }
        }
      }
    }
  }
  if (missing.length > 0 || listError !== null) {
    reported = true;
    const why = listError === null ? "" : `。図の一覧を読めません: ${listError}`;
    addError("cards", `図を読めません（${missing.length} 件。最初: ${missing[0] ?? "—"}${why}）`);
  }
}

async function boot({ reload = false } = {}) {
  app.gate = null;
  // (1) iOS でホーム画面アプリでない → #install（localStorage に触らない）
  if (needsInstall()) {
    stopAt("install");
    return;
  }
  startServiceWorker({ onUpdateReady: swUpdateReady, onError: (msg) => addError("sw", msg) }); // 1ページで1回（§2.7）
  // (2) cards.json を読む
  let deck;
  try {
    deck = await loadCards(reload);
  } catch (e) {
    addError("cards", errorText(e));
    app.nocardsMessage = null;
    stopAt("nocards");
    return;
  }
  try {
    app.hashes = await deckHashes(deck.cards);
  } catch (e) {
    addError("cards", errorText(e));
    app.nocardsMessage = "この場所では動きません（https か http://127.0.0.1 で開いてください）";
    stopAt("nocards");
    return;
  }
  app.cards = deck.cards;
  app.cardsById = new Map(deck.cards.map((c) => [c.id, c]));
  app.edition = deck.edition;
  if (DECK.features.math) {
    await loadMath(); // 学習の画面を描く前に（失敗しても続ける。§12.8）
  }
  if (DECK.features.figures) {
    await loadFigures(deck.cards); // 図の幅と高さを先に知る（失敗しても続ける。§13.2）
  }
  if (DECK.features.anim) {
    setAnimErrorSink((msg) => addError("cards", msg)); // 動きを出せないとき（§13.3）
  }
  const htmlBad = htmlViolations(deck.cards, { math: DECK.features.math, figures: DECK.features.figures, anim: DECK.features.anim }); // §2.7: 文法の違反は致命にせず消毒して出し、1件だけ残す（続けば count が増える）
  if (htmlBad !== null) {
    addError("cards", htmlBad);
  }
  // (3) 記録を読む（§2.0・§4.8・§4.9）
  const { raw, error } = readRecordRaw();
  app.saveLocked = error !== null;
  app.readFailed = error !== null;
  app.brokenLocked = false;
  app.record = null;
  if (error !== null) {
    addError("record", `記録を読めない（保存を止める）: ${error}`); // A47: 記録なしとして進み、保存はしない
  } else if (raw !== null) {
    const parsed = parseStoredRecord(raw);
    if (parsed.kind === "newer") {
      stopAt("newer");
      return;
    }
    if (parsed.kind === "bad") {
      stashBrokenRecord(raw, parsed.where);
      return;
    }
    resolvePendingStash(); // 有効な記録があれば退避は解決済み（§4.9）
    let rec = parsed.record;
    let repaired = parsed.repaired;
    if (rec.deck === null) {
      rec = { ...rec, deck: freshDeck() }; // 黙って今の cards.json から作る（§4.8）
      repaired = true;
    } else {
      const upd = applyDeckUpdate(rec, app.edition, app.hashes); // (5) 版の更新の判定（§2.6）
      rec = upd.record;
      repaired = repaired || upd.changed;
    }
    app.record = forgetUnknownPack(rec);
    if (repaired) {
      commitRecord(app.record); // 直した物は起動時に1回書き戻す（§4.8）
    }
  } else if (parseBrokenStash(readBrokenRaw()).pending) {
    stopAt("broken"); // 未解決の退避があり osakaCards.v1 が無い（§4.9）
    return;
  }
  // (4) 記録が無い → #settings、(5) → #home
  history.replaceState(null, "", app.record || QOPTS.selfPaced ? "#home" : "#settings"); // 自分で進めるデッキは記録が無くても #home（§13.10）
  app.study = null;
  route();
}

/** #nocards の「もう一度読む」（§11）: ネットを先に取り（cache: "reload"。SW がハッシュの一致で置き換える）、起動をやり直す。新しい版は SW の更新の道で入れる。 */
app.retryCards = () => {
  boot({ reload: true }).then(() => checkForUpdate());
};

function swUpdateReady() {
  app.swUpdateReady = true;
  if (app.screen === "home" && app.gate === null) {
    render(); // 学習の画面にいる間は出さず、ホームに戻ったら出す（§2.7）
  }
}

/** 「新しい版があります」を押した: waiting に skipWaiting → controllerchange で再読み込み（sw-client.js）。 */
app.applySwUpdate = () => {
  if (!applyUpdate()) {
    app.swUpdateReady = false;
    render();
  }
};

/** 版の知らせの ×（§2.6）: noticeBase を消す。 */
app.dismissDeckNotice = () => {
  if (app.otherTab || !app.record) {
    return;
  }
  commitRecord(dismissNotice(app.record));
  render();
};

function installGlobalHandlers() {
  window.addEventListener("error", (ev) => {
    if (app.gate !== "install") {
      addError("js", `${ev.message} (${ev.filename}:${ev.lineno})`);
    }
  });
  window.addEventListener("unhandledrejection", (ev) => {
    if (app.gate !== "install") {
      addError("js", `unhandledrejection: ${errorText(ev.reason)}`);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopAnimations(); // アプリが隠れたら動きを止める（戻っても自動で再開しない。§13.10）
    }
  });
  window.addEventListener("hashchange", () => {
    closeZoom();
    route();
  });
  // PC のキーボード（§10）: 学習の画面だけ。評価・1つ戻すの可否は app.rate・app.undo が判定する
  window.addEventListener("keydown", (ev) => {
    if (isZoomOpen()) {
      ev.preventDefault(); // 拡大の間は学習のキーを全部受けない（§13.10）。Escape で戻る
      if (ev.key === "Escape") {
        closeZoom();
      }
      return;
    }
    if (app.screen !== "study" || app.gate !== null) {
      return;
    }
    if (ev.target instanceof Element && ev.target.closest(".anim") !== null) {
      return; // 動きのつまみ・ボタンに焦点があるときは学習のキーを受けない（§13.3）
    }
    const action = studyKeyAction(ev);
    if (action === null) {
      return;
    }
    ev.preventDefault(); // スペースでページが動く・フォーカスのあるボタンが押されるのを止める
    if (action.kind === "reveal") {
      app.reveal();
    } else if (action.kind === "rate") {
      app.rate(action.rating);
    } else {
      app.undo();
    }
  });
  // 別のタブの保存を検知したら評価を止める（§11。osakaCards.v1 の storage イベントだけを見る）
  window.addEventListener("storage", (ev) => {
    if (ev.key === RECORD_KEY && app.gate !== "install" && !app.otherTab) {
      app.otherTab = true;
      render();
    }
  });
}

installGlobalHandlers();
boot();

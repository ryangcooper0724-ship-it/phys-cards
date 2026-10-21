/* 責務: 週の報告の結果の表示（「送りました」等の一言と、ダウンロードにしたときの要約の文のコピー欄。SPEC §2.5）。ホームと統計の画面で同じ物を出す。
   依存: ./dom.js。app.reportText・app.reportNote・app.closeReportText。
   注意: 文は textarea の value（textContent 相当）で入れる。クリップボードが無い端末は選択だけ（手でコピー）。 */
import { el } from "./dom.js";

export function reportNote(app) {
  return app.reportNote ? el("p", { id: "report-note", className: "muted", text: app.reportNote }) : null;
}

export function reportPanel(app) {
  if (app.reportText === null) {
    return null;
  }
  const area = el("textarea", { id: "report-text", attrs: { readonly: "readonly", rows: "4", "aria-label": "週の報告の文" } });
  area.value = app.reportText;
  const copy = () => {
    area.select();
    try {
      navigator.clipboard.writeText(app.reportText).catch(() => {});
    } catch {
      // クリップボードが無い端末は選択だけ（手でコピー）
    }
  };
  return el("div", { id: "report-panel", className: "report-panel" }, [
    el("p", { className: "hint", text: "ファイルを保存しました。下の文をコピーして、ファイルと一緒に送ってください" }),
    area,
    el("div", { className: "actions" }, [
      el("button", { id: "report-copy", text: "文をコピー", on: { click: copy } }),
      el("button", { id: "report-close", text: "閉じる", on: { click: () => app.closeReportText() } }),
    ]),
  ]);
}

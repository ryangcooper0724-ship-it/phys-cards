/* 責務: 動きのひな形「鉛直面内の円運動」（ANIM_DESIGN §3.10）。最下点で速さ k√(gR) の玉: 円の上は θ'' = −(g/R) sinθ（θ は鉛直下から）を RK4 で、n/m = v²/R + g cosθ が負になったら離れて放物運動（解析）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。R=1 m・g=9.8 固定。kind=1 は糸（n を T に読み替える）。
   注意: 離れる点・引き返す点・最高点は刻みの中で線形に補う。一周・引き返しは止めない。離れた後は円に再び着いたら止まる。 */
import { C, G, H, RAD, prep, view, clock, frac, rk4, trail, fx, pair } from "./_kit.js";

export function create(canvas, p) {
  const k = p.v0;
  const f = (t, y) => [y[1], -G * Math.sin(y[0])];
  const nOf = (th, om) => (om * om + G * Math.cos(th)) / G;
  const cL = (2 - k * k) / 3;
  const eLeave = k * k > 2 && cL >= -1 ? Math.acos(cL) / RAD : null;
  const eTurn = k * k <= 2 ? Math.acos(1 - (k * k) / 2) / RAD : null;
  const nTop = k * k + 1;
  const T = p.kind === 1 ? "T" : "n";
  let s;
  let tr;
  let clk;
  const fpos = (t) => {
    const q = s.free;
    const u = t - q.t0;
    return [q.x + q.vx * u, q.y + q.vy * u - (G * u * u) / 2];
  };

  function reset() {
    s = { t: 0, th: 0, om: k * Math.sqrt(G), n: nOf(0, k * Math.sqrt(G)), nMin: Infinity, free: null, armed: false, leave: null, turn: null, top: null, done: false };
    tr = trail();
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    if (s.free !== null) {
      const r0 = Math.hypot(...fpos(t0)) - 1;
      const r1 = Math.hypot(...fpos(s.t)) - 1;
      s.armed ||= r1 < -1e-4;
      if (s.armed && r1 >= 0) {
        s.t = t0 + H * frac(r0, r1);
        s.done = true;
      }
      if (Math.round(s.t / H) % 2 === 0 || s.done) {
        tr.push(...fpos(s.t));
      }
      return s.done;
    }
    const [th, om] = rk4(f, [s.th, s.om], 0, H);
    const n = nOf(th, om);
    const at = (a) => [s.th + a * (th - s.th), s.om + a * (om - s.om)];
    if (s.turn === null && s.om * om < 0) {
      s.turn = Math.abs(at(frac(s.om, om))[0]) / RAD;
    }
    const c0 = Math.floor((s.th - Math.PI) / (2 * Math.PI));
    if (c0 !== Math.floor((th - Math.PI) / (2 * Math.PI))) {
      s.top = Math.abs(at(frac(s.th - Math.PI * (2 * c0 + 3), th - Math.PI * (2 * c0 + 3)))[1]) / Math.sqrt(G);
    }
    if (n < 0) {
      const a = frac(s.n, n);
      const [lt, lo] = at(a);
      s.leave = lt / RAD;
      s.free = { t0: t0 + a * H, x: Math.sin(lt), y: -Math.cos(lt), vx: lo * Math.cos(lt), vy: lo * Math.sin(lt) };
      s.th = lt;
      s.n = 0;
      tr.push(s.free.x, s.free.y);
      return false;
    }
    s.th = th;
    s.om = om;
    s.n = n;
    s.nMin = Math.min(s.nMin, n);
    return false;
  }

  function step(dt) {
    if (!s.done) {
      clk.run(dt);
    }
  }

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const v = view(-1.3, 1.3, -1.3, 1.3, [60, 8, d.w - 8, d.h - 8]);
    const [cx, cy] = v.p(0, 0);
    const R = v.s;
    const { ctx } = d;
    ctx.beginPath();
    ctx.arc(cx, cy, R + (p.kind === 1 ? 0 : 13), 0, 2 * Math.PI);
    ctx.strokeStyle = p.kind === 1 ? C.sub : "#c8ccd1";
    ctx.lineWidth = p.kind === 1 ? 1 : 8;
    ctx.setLineDash(p.kind === 1 ? [3, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    d.line([[cx + R - 6, cy], [cx + R + 2, cy]], C.line, 1.5);
    d.text("90°", cx + R - 10, cy + 4, C.text, "right");
    d.line([[cx, cy - R + 6], [cx, cy - R - 2]], C.line, 1.5);
    d.text("180°", cx, cy - R + 20, C.text, "center");
    const [bx, by] = s.free ? v.p(...fpos(s.t)) : v.p(Math.sin(s.th), -Math.cos(s.th));
    if (s.free) {
      d.line(tr.a.map(([x, y]) => v.p(x, y)), C.body, 1.5, [5, 4]);
      const [lx, ly] = v.p(s.free.x, s.free.y);
      d.text("× 離れた", lx - 4, ly + 4, C.force);
    }
    d.dot(cx, cy, 3, C.line);
    d.line([[cx, cy], [bx, by]], p.kind === 1 ? C.line : C.sub, p.kind === 1 && !s.free ? 1.5 : 0.8, s.free || p.kind !== 1 ? [2, 4] : null);
    const u = Math.min(0.25, 1.6 / nTop) * R;
    if (!s.free) {
      d.arrow(bx, by, -Math.sin(s.th) * s.n * u, -Math.cos(s.th) * s.n * u, C.force, 2.5);
    }
    d.dot(bx, by, 9, C.body);
    d.arrow(bx, by, 0, u + 9, C.alt, 2);
    const bu = (d.h / 2 - 24) / nTop;
    d.line([[14, d.h / 2], [44, d.h / 2]], C.sub, 1);
    d.bar(29, d.h / 2, s.n * bu, 14, C.force);
    d.text(`${T}/mg`, 29, 16, C.text, "center");
    d.time(s.t);
  }

  function readouts() {
    let top = "—";
    if (s.top !== null) {
      top = `${fx(s.top)}（下限 1）`;
    } else if (s.leave !== null || s.turn !== null) {
      top = "届かない";
    }
    return [
      { label: `${p.kind === 1 ? "張力 T" : "垂直抗力 n"} ÷ mg`, value: s.free ? `0（${p.kind === 1 ? "たるんだ" : "離れた"}）` : fx(s.n) },
      { label: "離れた角（式 cosθ=(2−k²)/3）", value: s.leave === null && eLeave === null ? "離れない" : pair(s.leave, eLeave, "°", 1) },
      { label: "引き返した角（式 cosθ=1−k²/2）", value: s.turn === null && eTurn === null ? "引き返さない" : pair(s.turn, eTurn, "°", 1) },
      { label: "最高点の速さ ÷ √(gR)", value: top },
    ];
  }

  function probe() {
    return { t: s.t, theta: s.th / RAD, n: s.n, nMin: s.nMin, free: s.free !== null, leave: s.leave, turn: s.turn, top: s.top, done: s.done };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

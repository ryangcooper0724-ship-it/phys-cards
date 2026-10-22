/* 責務: 動きのひな形「粘性抵抗のある落下」（ANIM_DESIGN §3.14）。v=v_f+(v₀−v_f)e^(−t/τ)（解析解）。大きさ r（基準との比）で τ=0.5r² s・v_f=gτ（k∝r・m∝r³）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定。左 3 割に落ちる雨粒（背景の縞が上へ流れる）、右 7 割に v–t のグラフ。
   注意: t=τ の速さは刻みの前後で線形に補う。t=5τ で止まる。 */
import { C, G, H, prep, clock, frac, fx, pair } from "./_kit.js";

export function create(canvas, p) {
  const tau = 0.5 * p.r * p.r;
  const vf = G * tau;
  const v0 = p.v0 * vf;
  const V = (t) => vf + (v0 - vf) * Math.exp(-t / tau);
  const Y = (t) => vf * t + (v0 - vf) * tau * (1 - Math.exp(-t / tau));
  const eR = 1 - (1 - p.v0) / Math.E;
  const tEnd = 5 * tau;
  let s;
  let clk;

  function reset() {
    s = { t: 0, v: v0, vf, tau, rTau: null, a0: null, dec: true, inc: true, done: false };
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    const t1 = Math.min(t0 + H, tEnd);
    const v1 = V(t1);
    s.a0 ??= (v1 - s.v) / (t1 - t0);
    if (s.rTau === null && t1 >= tau) {
      s.rTau = (s.v + (v1 - s.v) * frac(t0 - tau, t1 - tau)) / vf;
    }
    s.dec &&= v1 < s.v;
    s.inc &&= v1 > s.v;
    s.t = t1;
    s.v = v1;
    s.done = t1 >= tEnd;
    return s.done;
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
    const lw = Math.round(d.w * 0.3);
    const off = (Y(s.t) * 8) % 20;
    for (let y = 20 - off; y < d.h - 20; y += 20) {
      d.line([[6, y], [lw - 6, y]], "#dfe3e8", 1);
    }
    d.line([[lw, 6], [lw, d.h - 6]], C.sub, 1);
    const cx = lw / 2;
    const cy = d.h * 0.45;
    const rr = 3 + 4 * p.r;
    d.arrow(cx, cy + rr, 0, 30, C.force, 2);
    d.arrow(cx, cy - rr, 0, (-30 * s.v) / vf, C.alt, 2);
    d.dot(cx, cy, rr, C.body);
    d.text("mg", cx + 6, cy + rr + 26, C.force);
    d.text("kv", cx + 6, cy - rr - 10, C.alt);
    const L = lw + 30;
    const R = d.w - 10;
    const T = 12;
    const B = d.h - 26;
    const vm = Math.max(vf, v0) * 1.15;
    const gx = (t) => L + ((R - L) * t) / tEnd;
    const gy = (u) => B - ((B - T) * u) / vm;
    d.line([[L, T], [L, B], [R, B]], C.line, 1);
    d.line([[L, gy(vf)], [R, gy(vf)]], C.sub, 1, [4, 4]);
    d.text("v_f", L - 4, gy(vf) + 4, C.text, "right");
    d.line([[gx(tau), T], [gx(tau), B]], C.sub, 1, [4, 4]);
    d.text("τ", gx(tau), B + 14, C.text, "center");
    d.text("t", R, B + 14, C.text, "right");
    d.text("v", L - 4, T + 6, C.text, "right");
    const q = [];
    for (let i = 0; i <= 60; i += 1) {
      const t = (s.t * i) / 60;
      q.push([gx(t), gy(V(t))]);
    }
    d.line(q, C.body, 2);
    if (s.rTau !== null) {
      d.dot(gx(tau), gy(s.rTau * vf), 3.5, C.force);
    }
    d.time(s.t);
  }

  function readouts() {
    return [
      { label: "速さ v", value: `${fx(s.v)} m/s` },
      { label: "終端速度 v_f=mg/k", value: `${fx(vf)} m/s` },
      { label: "τ=m/k", value: `${fx(tau)} s` },
      { label: "t=τ での v ÷ v_f", value: pair(s.rTau, eR) },
    ];
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

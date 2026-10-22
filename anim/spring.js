/* 責務: 動きのひな形「鉛直ばね振り子」（ANIM_DESIGN §3.15）。自然長から下向きの x=x_c+(x₀−x_c)cosωt（x_c=mg/k・ω=√(k/m)、解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。描くばねの自然長は 0.3 m（縮み切る値のときだけ長く描く）。
   注意: 周期は x−x_c が負から正へ通る時刻の間隔。中心を通る速さ・折り返しの位置は刻みの中で線形に補った時刻の解析の値。止めない。 */
import { C, H, prep, view, clock, frac, fx, pair } from "./_kit.js";

const cross = (a, b) => (a < 0 && b >= 0) || (a > 0 && b <= 0);

export function create(canvas, p) {
  const om = Math.sqrt(p.k / p.m);
  const xc = (p.m * p.g) / p.k;
  const A0 = p.x0 - xc;
  const still = Math.abs(A0) < 1e-9;
  const X = (t) => xc + A0 * Math.cos(om * t);
  const V = (t) => -A0 * om * Math.sin(om * t);
  const eT = (2 * Math.PI) / om;
  const hi = Math.max(p.x0, 2 * xc - p.x0);
  const L0 = Math.max(0.3, 0.1 - Math.min(p.x0, 2 * xc - p.x0));
  let s;
  let clk;

  function reset() {
    s = { t: 0, x: p.x0, v: 0, up: null, period: null, low: p.x0, top: p.x0, center: null, vc: null };
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    if (!still) {
      const u0 = X(t0) - xc;
      const u1 = X(s.t) - xc;
      if (cross(u0, u1)) {
        const tc = t0 + H * frac(u0, u1);
        s.vc = Math.abs(V(tc));
        if (u0 < 0) {
          s.period = s.up === null ? null : tc - s.up;
          s.up = tc;
        }
      }
      const w0 = V(t0);
      const w1 = V(s.t);
      if (cross(w0, w1)) {
        const xz = X(t0 + H * frac(w0, w1));
        s.low = Math.max(s.low, xz);
        s.top = Math.min(s.top, xz);
        s.center = (s.low + s.top) / 2;
      }
    }
    s.x = X(s.t);
    s.v = V(s.t);
    s.low = Math.max(s.low, s.x);
    s.top = Math.min(s.top, s.x);
    return false;
  }

  function step(dt) {
    clk.run(dt);
  }

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const z = Math.max(1, (L0 + hi + 0.05) / 0.88);
    const bh = 0.12 * z;
    const bw = 0.08 * z;
    const v = view(-0.45 * z, 0.4 * z, -z, 0.04 * z, [8, 8, d.w - 8, d.h - 22], 0.6, 0);
    const ly = (x) => v.y(-(L0 + x));
    const x0 = v.x(-0.13 * z);
    const x1 = v.x(0.25 * z);
    d.line([v.p(-0.2 * z, 0), v.p(0.2 * z, 0)], C.line, 3);
    d.line([[x0, ly(0)], [x1, ly(0)]], C.sub, 1);
    d.text("自然長", x0 - 4, ly(0) + 4, C.text, "right");
    for (const e of [p.x0, 2 * xc - p.x0]) {
      d.line([[x0, ly(e)], [x1, ly(e)]], C.sub, 1, [2, 3]);
    }
    d.line([[x0, ly(xc)], [x1, ly(xc)]], C.body, 1.5, [5, 4]);
    d.text("中心", x0 - 4, ly(xc) + (Math.abs(xc) * v.s < 14 ? 16 : 4), C.body, "right");
    const y1 = -(L0 + s.x);
    const q = [v.p(0, 0)];
    for (let i = 1; i < 12; i += 1) {
      const [sx, sy] = v.p(0, (y1 * i) / 12);
      q.push([sx + (i % 2 ? 6 : -6), sy]);
    }
    q.push(v.p(0, y1));
    d.line(q, C.line, 1.2);
    d.poly([v.p(-bw, y1), v.p(bw, y1), v.p(bw, y1 - bh), v.p(-bw, y1 - bh)], C.body);
    if (!still) {
      const [ax, ay] = v.p(1.75 * bw, y1 - bh / 2);
      const k = 34 / Math.abs(A0);
      d.arrow(ax, ay, 0, (s.v * k) / om, C.body, 2);
      d.arrow(ax + 12, ay, 0, -(s.x - xc) * k, C.force, 2);
    }
    d.time(s.t);
  }

  function readouts() {
    return [
      { label: "周期（式 2π√(m/k)）", value: still ? "—（動かない）" : pair(s.period, eT, "s") },
      { label: "振動の中心（式 mg/k）", value: pair(still ? p.x0 : s.center, xc, "m") },
      { label: "振幅", value: still ? "0.00 m" : s.center === null ? "—" : `${fx((s.low - s.top) / 2)} m` },
      { label: "最も下（自然長から）", value: `${fx(s.low)} m` },
    ];
  }

  function probe() {
    return { t: s.t, x: s.x, v: s.v, period: s.period, center: s.center, amp: s.center === null ? null : (s.low - s.top) / 2, low: s.low, vc: s.vc };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

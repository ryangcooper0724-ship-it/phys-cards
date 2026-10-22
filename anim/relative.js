/* 責務: 動きのひな形「2つの物体の放物運動」（ANIM_DESIGN §3.2）。同じ点 (0, h) から t=0 に投げた 2 つの玉の放物運動（解析解）と、1 から見た 2（等速直線運動）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定、小窓の点は 0.2 秒ごと。
   注意: 着いた時刻は刻みの中で線形に補い、着いた玉はそこで止まる。相対速度・加速度と小窓の点は先に 1 つが着くまで。両方が着くと止まる。 */
import { C, G, H, RAD, prep, view, clock, frac, fx, pair } from "./_kit.js";

export function create(canvas, p) {
  const h0 = p.h;
  const bs = [[p.v1, p.th1], [p.v2, p.th2]].map(([v0, th]) => {
    const vx = v0 * Math.cos(th * RAD);
    const vy = v0 * Math.sin(th * RAD);
    return { vx, vy, T: (vy + Math.sqrt(vy * vy + 2 * G * h0)) / G, top: h0 + (vy > 0 ? (vy * vy) / (2 * G) : 0) };
  });
  const at = (b, t) => [b.vx * t, h0 + b.vy * t - (G * t * t) / 2];
  const pos = (i, t) => at(bs[i], Math.min(t, s.T[i] ?? Infinity));
  const rel = (t) => [at(bs[1], t)[0] - at(bs[0], t)[0], at(bs[1], t)[1] - at(bs[0], t)[1]];
  const eRel = Math.hypot(bs[1].vx - bs[0].vx, bs[1].vy - bs[0].vy);
  const xr = Math.max(0.2, ...bs.map((b) => b.vx * b.T));
  const yr = Math.max(0.2, ...bs.map((b) => b.top));
  const tF = Math.min(bs[0].T, bs[1].T);
  const rr = Math.max(eRel * tF, 0.05);
  let s;
  let clk;

  function reset() {
    s = { t: 0, done: false, T: [null, null], vRel: null, dvMax: 0, aRel: null, pts: [[0, 0]], first: false, off: 0 };
    clk = clock(tick);
    bs.forEach((b, i) => {
      if (h0 === 0 && b.vy <= 0) {
        s.T[i] = 0;
      }
    });
    s.first = s.T[0] !== null || s.T[1] !== null;
    s.done = s.T[0] !== null && s.T[1] !== null;
  }

  function tick() {
    const t0 = s.t;
    const t1 = t0 + H;
    s.t = t1;
    if (!s.first) {
      const r0 = rel(t0);
      const r1 = rel(t1);
      const v = [(r1[0] - r0[0]) / H, (r1[1] - r0[1]) / H];
      s.vRel = Math.hypot(...v);
      s.dvMax = Math.max(s.dvMax, Math.hypot(v[0] - bs[1].vx + bs[0].vx, v[1] - bs[1].vy + bs[0].vy));
      if (t0 > 0) {
        const rm = rel(t0 - H);
        s.aRel = Math.max(s.aRel ?? 0, Math.hypot(r1[0] - 2 * r0[0] + rm[0], r1[1] - 2 * r0[1] + rm[1]) / (H * H));
      }
    }
    bs.forEach((b, i) => {
      const y0 = at(b, t0)[1];
      const y1 = at(b, t1)[1];
      if (s.T[i] === null && y1 <= 0) {
        s.T[i] = t0 + H * frac(y0, y1);
      }
    });
    if (!s.first) {
      s.first = s.T[0] !== null || s.T[1] !== null;
      if (!s.first && Math.round(t1 / H) % 48 === 0) {
        const q = rel(t1);
        s.pts.push(q);
        const [lx, ly] = q;
        const L = Math.hypot(lx, ly);
        s.off = L > 0 ? Math.max(...s.pts.map(([x, y]) => Math.abs(x * ly - y * lx) / L)) : 0;
      }
    }
    if (s.T[0] !== null && s.T[1] !== null) {
      s.done = true;
      s.t = Math.max(...s.T);
    }
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
    const iw = Math.round(d.w * 0.35);
    const v = view(0, xr, 0, yr, [18, 14, d.w - iw - 20, d.h - 36], 0, 1);
    const gy = v.y(0);
    d.line([[4, gy], [d.w - 4, gy]], C.line, 2);
    d.ticks(v, 0, (d.w - 18 - v.x(0)) / v.s, 0);
    const now = [];
    [C.body, C.two].forEach((col, i) => {
      const te = Math.min(s.t, s.T[i] ?? Infinity);
      const q = [];
      for (let k = 0; k <= 40; k += 1) {
        q.push(v.p(...pos(i, (te * k) / 40)));
      }
      d.line(q, col, 1.5);
      for (let k = 0; k * 0.2 <= te + 1e-9; k += 1) {
        d.dot(...v.p(...pos(i, k * 0.2)), 2, col);
      }
      now.push(v.p(...pos(i, s.t)));
    });
    d.arrow(...now[0], now[1][0] - now[0][0], now[1][1] - now[0][1], C.sub, 1.5);
    d.dot(...now[1], 6, C.two);
    d.dot(...now[0], 6, C.body);
    const x0 = d.w - iw - 6;
    const cx = x0 + iw / 2;
    const cy = 20 + iw / 2 - 6;
    const k = (iw / 2 - 8) / rr;
    d.poly([[x0, 20], [x0 + iw, 20], [x0 + iw, 20 + iw - 12], [x0, 20 + iw - 12]], "#ffffff", C.sub);
    d.text("1 から見た 2", d.w - 6, 14, C.text, "right");
    s.pts.forEach(([x, y]) => d.dot(cx + x * k, cy - y * k, 2.5, C.two));
    d.dot(cx, cy, 5, C.body);
    if (s.first) {
      d.text("着地で打ち切り", d.w - 6, 20 + iw + 2, C.text, "right");
    }
    d.time(s.t);
  }

  function readouts() {
    return [
      { label: "相対速度の大きさ（式 |v₂−v₁|）", value: pair(s.vRel, eRel, "m/s") },
      { label: "相対加速度の大きさ", value: s.aRel === null ? "—" : `${fx(s.aRel)} m/s²` },
      { label: "1 ／ 2 が着いた時刻", value: `${fx(s.T[0])} ／ ${fx(s.T[1])} s` },
    ];
  }

  function probe() {
    const { pts, T, ...o } = s;
    return { ...o, T1: T[0], T2: T[1], n: pts.length };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

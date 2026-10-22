/* 責務: 動きのひな形「万有引力の軌道」（ANIM_DESIGN §3.11）。a=−GM r/|r|³ を RK4（2 次元）で。r₀=1、r₀ の円軌道の周期 T₀=4 s（GM=(π/2)²）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。(0, r) から +x を外向きに angle 傾けて打ち出す（時計回り）。
   注意: 1 刻みを 1/min(1, r^1.5) に割る（最大 50）。近点・遠点・1 周・当たる・4r を越えるは線形に補う。束縛され遠点が 8r より内なら止めない。 */
import { C, H, RAD, prep, view, clock, frac, rk4, trail, fx, pair } from "./_kit.js";

const GM = (Math.PI / 2) ** 2;
const PI2 = 2 * Math.PI;
const f = (t, y) => {
  const q = GM / Math.hypot(y[0], y[1]) ** 3;
  return [y[2], y[3], -q * y[0], -q * y[1]];
};
const sp = (y) => Math.hypot(y[2], y[3]);
const lerp = (a, b, q) => a.map((v, i) => v + (b[i] - v) * q);
const COL = ["rgba(192,102,31,0.22)", "rgba(46,125,50,0.2)"];

export function create(canvas, p) {
  const r = p.r;
  const w = p.v * Math.sqrt(GM / r);
  const cs = Math.cos(p.angle * RAD);
  const sn = Math.sin(p.angle * RAD);
  const eN = p.v * p.v - 2;
  const pl = (r * w * cs) ** 2 / GM;
  const ex = (-r * w * w * sn * cs) / GM;
  const ey = (r * w * w * cs * cs) / GM - 1;
  const ecc = Math.hypot(ex, ey);
  const bound = eN < 0;
  const r1 = pl / (1 + ecc);
  const r2 = bound ? pl / (1 - ecc) : null;
  const eT = bound ? 4 * (r / -eN) ** 1.5 : null;
  const esc = !bound || r2 > 8 * r;
  const kk = esc ? 4 : Math.min(16, Math.max(2, Math.ceil((eT * 240) / 560)));
  const vmax = Math.max(w, (r * w * cs) / r1);
  let s;
  let tr;
  let secs;
  let pts;
  let clk;

  function reset() {
    const e0 = [r, w, 0, r];
    s = { t: 0, k: 0, y: [0, r, w * cs, w * sn], ang: 0, sa: 0, ext: [sn === 0 && p.v >= 1 ? e0 : null, sn === 0 && p.v <= 1 ? e0 : null], period: null, cur: 0, aMax: null, aMin: null, eDrift: 0, hit: false, out: false, done: false };
    tr = trail();
    tr.push(0, r);
    secs = [];
    pts = [[0, r]];
    clk = clock(tick);
  }

  function tick() {
    const n = Math.min(50, Math.ceil(1 / Math.min(1, Math.hypot(s.y[0], s.y[1]) ** 1.5)));
    const h = H / n;
    for (let i = 0; i < n; i += 1) {
      const a = s.y;
      const b = rk4(f, a, 0, h);
      const ra = Math.hypot(a[0], a[1]);
      const rb = Math.hypot(b[0], b[1]);
      const t0 = s.t;
      s.t += h;
      for (const [R, key] of [[0.08, "hit"], [esc ? 4 * r : Infinity, "out"]]) {
        if (key === "hit" ? rb <= R : rb >= R) {
          const q = frac(ra - R, rb - R);
          s.t = t0 + h * q;
          s.y = lerp(a, b, q);
          s[key] = s.done = true;
          tr.push(s.y[0], s.y[1]);
          return true;
        }
      }
      const u0 = a[0] * a[2] + a[1] * a[3];
      const u1 = b[0] * b[2] + b[1] * b[3];
      const ev = u0 < 0 && u1 >= 0 ? 0 : u0 > 0 && u1 <= 0 ? 1 : -1;
      if (ev >= 0) {
        const q = frac(u0, u1);
        s.ext[ev] = [ra + (rb - ra) * q, sp(a) + (sp(b) - sp(a)) * q, ...lerp(a, b, q)];
      }
      const cr = a[0] * b[1] - a[1] * b[0];
      const g0 = Math.abs(s.ang) - PI2;
      s.ang += Math.atan2(cr, a[0] * b[0] + a[1] * b[1]);
      const g1 = Math.abs(s.ang) - PI2;
      if (s.period === null && g0 < 0 && g1 >= 0) {
        s.period = t0 + h * frac(g0, g1);
      }
      s.cur += Math.abs(cr) / 2;
      s.eDrift = Math.max(s.eDrift, Math.abs(((sp(b) ** 2 / 2 - GM / rb) * 2 * r) / (eN * GM) - 1));
      s.y = b;
    }
    s.k += 1;
    s.t = s.k * H;
    if (s.k % kk === 0) {
      tr.push(s.y[0], s.y[1]);
    }
    if (s.k % 4 === 0) {
      pts.push([s.y[0], s.y[1]]);
    }
    if (s.k % 120 === 0) {
      secs.push([s.k / 120, pts, s.sa]);
      secs.splice(0, secs.length - 8);
      pts = [[s.y[0], s.y[1]]];
      s.sa = Math.abs(s.ang);
      s.aMax = Math.max(s.aMax ?? 0, s.cur);
      s.aMin = Math.min(s.aMin ?? Infinity, s.cur);
      s.cur = 0;
    }
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
    const b = [-1, 1, -1, 1];
    for (let i = 0; i < 64; i += 1) {
      const th = (i / 32) * Math.PI;
      const rr = esc ? 4 * r : pl / (1 + ecc * Math.cos(th - Math.atan2(ey, ex)));
      b.splice(0, 4, Math.min(b[0], rr * Math.cos(th)), Math.max(b[1], rr * Math.cos(th)), Math.min(b[2], rr * Math.sin(th)), Math.max(b[3], rr * Math.sin(th)));
    }
    const m = (b[1] - b[0]) * 0.04;
    const v = view(b[0] - m, b[1] + m, b[2] - m, b[3] + m, [8, 8, d.w - 8, d.h - 22]);
    const o = v.p(0, 0);
    const P = (q) => v.p(q[0], q[1]);
    secs.filter((q) => Math.abs(s.ang) - q[2] <= PI2).concat([[Math.ceil(s.k / 120 + 1e-9), pts]]).forEach(([n, q]) => d.poly([o, ...q.map(P)], COL[n % 2]));
    const ring = [];
    for (let i = 0; i <= 48; i += 1) {
      ring.push(v.p(Math.cos(i / 7.64), Math.sin(i / 7.64)));
    }
    d.line(ring, C.sub, 1, [3, 4]);
    d.line(tr.a.map(P).concat([P(s.y)]), C.line, 1);
    d.dot(o[0], o[1], Math.max(3, 0.08 * v.s), C.sub);
    const [pe, ap] = s.ext;
    if (!(pe && ap && ap[0] - pe[0] < 0.01)) {
      [[pe, "近点"], [ap, "遠点"]].forEach(([q, nm]) => {
        if (q) {
          const [x, y] = v.p(q[2], q[3]);
          d.dot(x, y, 3, C.alt);
          d.text(nm, x + 6, y + 4, C.alt);
        }
      });
    }
    const [bx, by] = P(s.y);
    const k = 36 / vmax;
    d.arrow(bx, by, s.y[2] * k, -s.y[3] * k, C.line, 2);
    d.dot(bx, by, 6, C.body);
    if (s.hit) {
      d.text("当たった", o[0] + 8, o[1] - 8, C.force);
    }
    d.time(s.t);
  }

  function readouts() {
    const E = ((sp(s.y) ** 2 / 2 - GM / Math.hypot(s.y[0], s.y[1])) * 2 * r) / GM;
    const [pe, ap] = s.ext;
    return [
      { label: "E ÷ |円軌道の E|（式 v²−2）", value: `${fx(E)}（${bound ? (ecc < 1e-9 ? "負: 円" : "負: 楕円") : "正: 戻らない"}）` },
      { label: "周期（式 T₀(a/r₀)^1.5）", value: bound ? pair(s.period, eT, "s") : "—" },
      { label: "近点 ／ 遠点 ÷ r₀", value: `${fx(pe?.[0] ?? null)} ／ ${fx(ap?.[0] ?? null)}` },
      { label: "近点 ÷ 遠点の速さ（式 r₂/r₁）", value: bound ? pair(pe && ap ? pe[1] / ap[1] : null, r2 / r1) : "—" },
      { label: "速さ ÷ r₀ の円軌道の速さ", value: s.hit ? "当たった" : fx(sp(s.y) / Math.sqrt(GM)) },
    ];
  }

  function probe() {
    const { y, ext, ...o } = s;
    const [pe, ap] = ext;
    return { ...o, x: y[0], y: y[1], speed: sp(y) / Math.sqrt(GM), peri: pe?.[0] ?? null, apo: ap?.[0] ?? null, vp: pe?.[1] ?? null, va: ap?.[1] ?? null, E: eN, r1, r2, eT };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

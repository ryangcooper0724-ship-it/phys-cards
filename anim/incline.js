/* 責務: 動きのひな形「あらい斜面と摩擦」（ANIM_DESIGN §3.8）。長さ 2 m の板の上の箱: つり合い（静止摩擦 f=mg sinθ ≦ μn）と、滑ると a=g(sinθ−μ′cosθ) の等加速度（解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定。tilt=1 は板を 0° から 3°/s で θ まで傾け、滑り出したらそこで板を止める。μ′>μ は μ′=μ。
   注意: 滑り出す時刻は tanφ−μ の 0 を刻みの中で線形に補う。下端に着くと止まる。滑らない（a≒0 も）ときは板が止まってから 2 秒で止まる。 */
import { C, G, H, RAD, prep, view, clock, frac, fx, pair } from "./_kit.js";

const L = 2;
const W = 3 * RAD;
const B = 0.12;

export function create(canvas, p) {
  const th = p.theta * RAD;
  const mu = p.mu;
  const m2 = Math.min(p.mu2, mu);
  const tilt = p.tilt === 1;
  const acc = (f) => G * (Math.sin(f) - m2 * Math.cos(f));
  const ang = (t) => (tilt ? Math.min(W * t, th) : th);
  const eSlip = Math.atan(mu) / RAD;
  const will = Math.tan(th) > mu;
  const eA = will ? Math.max(0, acc(tilt ? Math.atan(mu) : th)) : 0;
  const tRest = (tilt ? th / W : 0) + 2;
  let s;
  let clk;

  function start(t) {
    s.ts = t;
    s.phi = ang(t);
    s.slip = s.phi / RAD;
    s.a = acc(s.phi) < 1e-3 ? 0 : acc(s.phi);
    s.tEnd = t + (s.a > 0 ? Math.sqrt((2 * L) / s.a) : 2);
  }

  function move(t) {
    const u = t - s.ts;
    s.x = (s.a * u * u) / 2;
    s.v = s.a * u;
  }

  function reset() {
    s = { t: 0, phi: ang(0), ts: null, slip: null, a: null, tEnd: null, x: 0, v: 0, done: false };
    clk = clock(tick);
    if (Math.tan(s.phi) > mu) {
      start(0);
    }
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    if (s.ts === null) {
      const f0 = Math.tan(ang(t0)) - mu;
      const f1 = Math.tan(ang(s.t)) - mu;
      if (f1 > 0) {
        start(t0 + H * frac(f0, f1));
      } else {
        s.phi = ang(s.t);
        if (s.t >= tRest) {
          s.t = tRest;
          s.done = true;
        }
        return s.done;
      }
    }
    if (s.t >= s.tEnd) {
      s.t = s.tEnd;
      s.done = true;
    }
    move(s.t);
    return s.done;
  }

  function step(dt) {
    if (!s.done) {
      clk.run(dt);
    }
  }

  const fr = () => (s.ts === null ? Math.sin(s.phi) : m2 * Math.cos(s.phi));

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const Lb = L + 2 * B;
    const v = view(-Lb - 0.05, 0.1, 0, Lb * Math.sin(th) + 0.4, [10, 10, d.w - 64, d.h - 24], 0.5, 1);
    const cs = Math.cos(s.phi);
    const sn = Math.sin(s.phi);
    const [px, py] = v.p(0, 0);
    d.line([[4, py], [d.w - 64, py]], C.sub, 1);
    d.line([[px, py], v.p(-Lb * cs, Lb * sn)], C.line, 3);
    const { ctx } = d;
    ctx.beginPath();
    ctx.arc(px, py, 26, Math.PI, Math.PI + s.phi);
    ctx.strokeStyle = C.sub;
    ctx.lineWidth = 1;
    ctx.stroke();
    d.text("θ", px - 40, py - 4);
    const al = B + Math.min(s.x, L);
    const c = [-Lb * cs + al * cs + B * sn, Lb * sn - al * sn + B * cs];
    const q = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => v.p(c[0] + B * (i * cs + j * sn), c[1] + B * (-i * sn + j * cs)));
    d.poly(q, C.body);
    const [bx, by] = v.p(...c);
    const [cx, cy] = v.p(c[0] - B * sn, c[1] - B * cs);
    const u = 44;
    d.arrow(bx, by, 0, u, C.force, 2);
    d.arrow(cx, cy, sn * cs * u, -cs * cs * u, C.alt, 2);
    d.arrow(cx, cy, -cs * fr() * u, -sn * fr() * u, C.two, 2.5);
    const base = d.h - 24;
    const bs = d.h - 56;
    const lim = s.ts === null ? mu * cs : m2 * cs;
    d.line([[d.w - 52, base], [d.w - 16, base]], C.sub, 1);
    d.bar(d.w - 34, base, fr() * bs, 14, C.two);
    d.line([[d.w - 46, base - lim * bs], [d.w - 22, base - lim * bs]], C.line, 2);
    d.text("f/mg", d.w - 34, 16, C.text, "center");
    d.time(s.t);
  }

  function readouts() {
    let sl = pair(s.slip, eSlip, "°", 1);
    if (!tilt) {
      sl = s.ts === null ? pair(null, eSlip, "°", 1) : `初めから（式 ${fx(eSlip, 1)}）`;
    }
    const lim = fx(mu * Math.cos(s.phi));
    const r = [
      { label: "今の傾き θ", value: `${fx(s.phi / RAD, 1)} °` },
      { label: "摩擦力 f ÷ mg", value: s.ts === null ? `${fx(fr())}（静止摩擦。上限 ${lim}）` : `${fx(fr())}（動摩擦 μ′n）` },
      { label: "滑り出した角（式 arctan μ）", value: sl },
      { label: "加速度 a（式 g(sinθ−μ′cosθ)）", value: will ? pair(s.ts !== null && s.t > s.ts ? s.v / (s.t - s.ts) : null, eA, "m/s²") : "0（滑らない）" },
    ];
    if (p.mu2 > mu) {
      r.push({ label: "動摩擦係数", value: "μ′ を μ に合わせた" });
    }
    return r;
  }

  function probe() {
    return { t: s.t, phi: s.phi / RAD, slip: s.slip, a: s.a, x: s.x, v: s.v, f: fr(), done: s.done };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

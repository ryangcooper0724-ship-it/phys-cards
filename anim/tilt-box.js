/* 責務: 動きのひな形「傾ける斜面の上の箱」（ANIM_DESIGN §3.16）。板を 3°/s で傾け、Q は中心から下りへ H_G tanθ。tanθ が μ か L/H_G に着いたら板を止め、滑る（a=g(sinθ−μ′cosθ)、μ′=0.8μ）か下の角のまわりに倒れる（RK4）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。H_G=0.3 m（箱は高さ 0.6 m の一様な直方体）、板 1.6 m、箱の中心は蝶番から 1.1 m。同じ角なら転倒とする。
   注意: 限界の角・端に着く・横たわる（90°）は刻みの中で線形に補う。倒れ始めの回る速さは板の 3°/s を持ち越す（角は滑らない）。 */
import { C, G, H, RAD, prep, view, clock, frac, rk4, fx } from "./_kit.js";

const HG = 0.3;
const LB = 1.6;
const S0 = 1.1;
const W = 3 * RAD;
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

export function create(canvas, p) {
  const L = p.lh * HG;
  const thS = Math.atan(p.mu);
  const thT = Math.atan(p.lh);
  const top = thT <= thS;
  const thC = Math.min(thS, thT);
  const mu2 = 0.8 * p.mu;
  const acc = G * (Math.sin(thC) - mu2 * Math.cos(thC));
  const I = (4 / 3) * (L * L + HG * HG);
  const fr = (t, y) => [y[1], (-G * rot([L, HG], thC + y[0])[0]) / I];
  const box = (x, th, ps) => {
    const P = rot([x - L, 0], th);
    return [[0, 0], [2 * L, 0], [2 * L, 2 * HG], [0, 2 * HG]].map((c) => add(P, rot(c, th + ps)));
  };
  let s;
  let clk;

  function reset() {
    s = { t: 0, th: 0, q: 0, at: null, tc: null, topple: null, x: S0, psi: 0, om: 0, done: false };
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    if (s.topple === null) {
      const a = t0 * W - thC;
      const b = s.t * W - thC;
      if (b < 0) {
        s.th = s.t * W;
        s.q = Math.tan(s.th) / p.lh;
        return false;
      }
      s.tc = t0 + H * frac(a, b);
      s.th = thC;
      s.at = thC / RAD;
      s.topple = top;
      s.q = top ? 1 : mu2 / p.lh;
      s.om = W;
    }
    const h = Math.min(H, s.t - s.tc);
    if (s.topple) {
      const [ps, om] = rk4(fr, [s.psi, s.om], 0, h);
      if (ps >= Math.PI / 2) {
        s.t = s.t - h + h * frac(s.psi - Math.PI / 2, ps - Math.PI / 2);
        s.psi = Math.PI / 2;
        s.done = true;
      } else {
        [s.psi, s.om] = [ps, om];
      }
      return s.done;
    }
    const x0 = s.x;
    s.x = S0 - (acc * (s.t - s.tc) ** 2) / 2;
    if (s.x <= L) {
      s.t = s.t - h + h * frac(x0 - L, s.x - L);
      s.x = L;
      s.done = true;
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
    const pts = [[0, 0], [LB, 0], rot([LB, 0], thC), ...box(S0, 0, 0), ...box(S0, thC, 0), ...(top ? [...box(S0, thC, 0.8), ...box(S0, thC, Math.PI / 2)] : [])];
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const v = view(Math.min(...xs) - 0.05, Math.max(...xs) + 0.05, 0, Math.max(...ys) + 0.05, [14, 10, d.w - 10, d.h - 26], 0.5, 1);
    const gy = v.y(0);
    d.line([[4, gy], [d.w - 4, gy]], C.sub, 1);
    const arc = [];
    for (let i = 0; i <= 12; i += 1) {
      arc.push(v.p(...rot([0.3, 0], (s.th * i) / 12)));
    }
    d.line(arc, C.sub, 1);
    const tp = v.p(...rot([0.4, 0], s.th / 2));
    d.text("θ", tp[0] + 4, tp[1] + 5, C.text);
    d.line([v.p(0, 0), v.p(...rot([LB, 0], s.th))], C.line, 4);
    const bx = box(s.x, s.th, s.psi);
    d.poly(bx.map((q) => v.p(...q)), C.body);
    const g = v.p(...add(bx[0], rot([L, HG], s.th + s.psi)));
    d.line([g, [g[0], gy]], C.sub, 1, [4, 4]);
    d.dot(g[0], g[1], 4, "#fff", C.line);
    const Q = v.p(...rot([s.x - s.q * L, 0], s.th));
    if (!s.topple) {
      const k = 45;
      const c = Math.cos(s.th);
      const sn = Math.sin(s.th);
      const fN = s.topple === false ? mu2 * c : sn;
      d.arrow(Q[0], Q[1], -sn * c * k, -c * c * k, C.force, 2);
      d.arrow(Q[0], Q[1], c * fN * k, -sn * fN * k, C.alt, 2);
    }
    d.dot(Q[0], Q[1], 4, C.force);
    d.time(s.t);
  }

  function readouts() {
    return [
      { label: "傾き θ", value: `${fx(s.th / RAD, 1)}°` },
      { label: "Q の位置 ÷ L（1 で角）", value: fx(s.q) },
      { label: "限界: 滑り ／ 転倒", value: `${fx(thS / RAD, 1)}° ／ ${fx(thT / RAD, 1)}°` },
      { label: "先に起きた方", value: s.topple === null ? "—" : `${s.topple ? "転倒" : "滑り"}（${fx(s.at, 1)}°）` },
    ];
  }

  function probe() {
    return { ...s, th: s.th / RAD, psi: s.psi / RAD };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

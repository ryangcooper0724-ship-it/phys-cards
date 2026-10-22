/* 責務: 動きのひな形「ゴムひもと摩擦の斜面」（ANIM_DESIGN §3.9）。自然長の位置から斜面に沿って下向き正の x で ẍ=g sinθ−sgn(ẋ)μ′g cosθ−k_m max(x,0) を RK4 で（1 kg あたり）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定。静止摩擦係数は μ′ と同じとみなす。重力の位置エネルギーは最初の折り返しの高さを 0 に。
   注意: ẋ=0 の折り返しは刻みの中で線形に補い、そこで |g sinθ−k_m x| ≦ μ′g cosθ なら止まる。初めに g sinθ ≦ μ′g cosθ なら動き出さない。 */
import { C, G, H, RAD, prep, view, clock, frac, rk4, fx, pair } from "./_kit.js";

const L0 = 0.5;

export function create(canvas, p) {
  const th = p.theta * RAD;
  const km = p.km;
  const gs = G * Math.sin(th);
  const gf = p.mu2 * G * Math.cos(th);
  const go = gs > gf;
  const x1 = go ? (2 * (gs - gf)) / km : 0;
  const U = (x) => gs * (x1 - x) + (km * Math.max(x, 0) ** 2) / 2;
  const E0 = U(0);
  let s;
  let clk;

  function reset() {
    s = { t: 0, x: 0, v: 0, dir: 1, path: 0, turns: 0, first: null, done: !go };
    clk = clock(tick);
  }

  function tick() {
    const f = (t, y) => [y[1], gs - s.dir * gf - km * Math.max(y[0], 0)];
    const [x, v] = rk4(f, [s.x, s.v], 0, H);
    if (v * s.dir <= 0) {
      const a = frac(s.v, v);
      const xt = s.x + a * (x - s.x);
      s.t += a * H;
      s.path += Math.abs(xt - s.x);
      s.x = xt;
      s.v = 0;
      s.first ??= xt;
      if (Math.abs(gs - km * Math.max(xt, 0)) <= gf) {
        s.done = true;
        return true;
      }
      s.turns += 1;
      s.dir = -s.dir;
      return false;
    }
    s.t += H;
    s.path += Math.abs(x - s.x);
    s.x = x;
    s.v = v;
    return false;
  }

  function step(dt) {
    if (!s.done) {
      clk.run(dt);
    }
  }

  const dE = () => (s.v * s.v) / 2 + U(s.x) - E0;

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const b = 0.06 * (L0 + x1) + 0.04;
    const Lt = L0 + x1 + 2 * b + 0.15;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const v = view(-0.1, Lt * cs + 0.05, -Lt * sn, 2.4 * b, [10, 10, d.w - 100, d.h - 24], 0.5, 1);
    d.poly([v.p(0, 0), v.p(Lt * cs, -Lt * sn), v.p(0, -Lt * sn)], "#eceef1", C.line);
    const al = L0 + s.x;
    const [ex, ey] = v.p(al * cs, -al * sn);
    d.line([v.p(0, 0), [ex, ey]], C.two, 2);
    d.dot(...v.p(0, 0), 4, C.line);
    const c = [(al + b) * cs + b * sn, -(al + b) * sn + b * cs];
    const q = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => v.p(c[0] + b * (i * cs + j * sn), c[1] + b * (-i * sn + j * cs)));
    d.poly(q, C.body);
    const base = d.h - 24;
    const bs = (d.h - 50) / Math.max(E0, 1e-9);
    const vals = [(s.v * s.v) / 2, U(s.x), dE() + E0, gf * s.path];
    const col = [C.body, C.alt, C.line, C.force];
    ["K", "U", "E", "損"].forEach((n, i) => {
      const x = d.w - 82 + i * 22;
      d.bar(x, base - (i === 3 ? vals[2] * bs : 0), Math.max(0, vals[i]) * bs, 14, col[i]);
      d.text(n, x, base + 14, C.text, "center");
    });
    d.line([[d.w - 94, base - E0 * bs], [d.w - 4, base - E0 * bs]], C.sub, 1, [4, 4]);
    d.line([[d.w - 94, base], [d.w - 4, base]], C.sub, 1);
    d.time(s.t);
  }

  function readouts() {
    let st = `${s.turns} 回・摩擦は${s.dir > 0 ? "上" : "下"}向き`;
    if (!go) {
      st = "動き出さない（tanθ≦μ′）";
    } else if (s.done) {
      st = `止まった（${s.turns} 回折り返した）`;
    }
    return [
      { label: "位置 x（自然長から）", value: `${fx(s.x)} m` },
      { label: "ΔE（式 摩擦の仕事 W_f）", value: pair(dE(), -gf * s.path, "J/kg") },
      { label: "折り返し・摩擦の向き", value: st },
      { label: "最初の折り返し x₁", value: go ? pair(s.first, x1, "m") : "—" },
    ];
  }

  function probe() {
    return { t: s.t, x: s.x, v: s.v, dir: s.dir, turns: s.turns, first: s.first, dE: dE(), wf: -gf * s.path, done: s.done };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

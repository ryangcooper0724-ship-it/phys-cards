/* 責務: 動きのひな形「動く天井の滑車」（ANIM_DESIGN §3.4）。天井が ẍ₀ で動く系の 2 つの箱: 天井に対して a=(m₁−m₂)(g−ẍ₀)/(m₁+m₂)、ẍ₀≧g は糸がたるみ 2 つとも上へ ẍ₀−g（解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。m₂=1・g=9.8 固定、箱は滑車の軸から 0.6 m の深さで静止から。
   注意: 天井と共に動く見方（左の床の目盛りが流れる）。箱が深さ 0.05 m か 1.15 m に着いた時刻は刻みの中で線形に補って止まる。a=0 は 5 秒で止まる。 */
import { C, G, H, prep, view, clock, frac, fx, pair } from "./_kit.js";

const D0 = 0.6;

export function create(canvas, p) {
  const m1 = p.ratio;
  const M = m1 + 1;
  const acc = p.acc;
  const slack = acc >= G;
  const aF = slack ? 0 : ((m1 - 1) / M) * (G - acc);
  const as = slack ? [G - acc, G - acc] : [aF, -aF];
  const tF = slack ? 0 : (2 * m1 * (G - acc)) / (M * G);
  const still = as[0] === 0 && as[1] === 0;
  const mx = Math.max(m1, 1);
  const side = [0.24 * Math.cbrt(m1 / mx), 0.24 * Math.cbrt(1 / mx)];
  let s;
  let clk;
  const dep = (i, t) => D0 + (as[i] * t * t) / 2;

  function reset() {
    s = { t: 0, done: false, slack, d1: D0, d2: D0, a1: null, a2: null, T: null };
    clk = clock(tick);
  }

  function hitAt(t) {
    return Math.max(...[0, 1].map((i) => Math.max(0.05 - dep(i, t), dep(i, t) - 1.15)));
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    if (hitAt(s.t) >= 0) {
      s.t = t0 + H * frac(hitAt(t0), hitAt(s.t));
      s.done = true;
    } else if (still && s.t >= 5 - 1e-9) {
      s.done = true;
    }
    s.d1 = dep(0, s.t);
    s.d2 = dep(1, s.t);
    s.a1 = (2 * (s.d1 - D0)) / (s.t * s.t);
    s.a2 = (2 * (s.d2 - D0)) / (s.t * s.t);
    s.T = (G - acc - s.a2) / G;
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
    const v = view(-0.8, 0.8, -1.45, 0.25, [8, 8, d.w - 8, d.h - 22]);
    const k = 50 / Math.max(Math.abs(acc), Math.abs(G - acc), 1);
    d.poly([v.p(-0.4, 0.25), v.p(0.4, 0.25), v.p(0.4, 0.19), v.p(-0.4, 0.19)], "#c8ccd1");
    d.line([v.p(0, 0.19), v.p(0, 0)], C.line, 1.5);
    const [px, py] = v.p(0, 0);
    d.dot(px, py, 0.15 * v.s, "#ffffff", C.line);
    d.arrow(v.x(0.5), v.y(-0.35), 0, acc * k, C.force, 2);
    d.text("ẍ₀", v.x(0.56), v.y(-0.35) + 4, C.force);
    const rx = v.x(-0.6);
    d.line([[rx, v.y(0.2)], [rx, v.y(-1.4)]], C.sub, 1);
    const sh = (acc * s.t * s.t) / 2;
    for (let i = Math.ceil((-1.4 - sh) / 0.1); (i * 0.1 + sh) <= 0.2; i += 1) {
      const y = v.y(i * 0.1 + sh);
      d.line([[rx - (i % 5 === 0 ? 8 : 4), y], [rx, y]], C.sub, 1);
    }
    d.text("床", rx, v.y(-1.4) + 14, C.text, "center");
    [s.d1, s.d2].forEach((dd, i) => {
      const x = (i ? 0.15 : -0.15);
      const top = v.y(-dd);
      if (slack) {
        const q = [];
        for (let j = 0; j <= 12; j += 1) {
          q.push([v.x(x) + (j % 2 ? 3 : -3), py + ((top - py) * j) / 12]);
        }
        d.line(q, C.sub, 1);
      } else {
        d.line([[v.x(x), py], [v.x(x), top]], C.line, 1.5);
      }
      const l = v.x(x - side[i] / 2);
      const r = v.x(x + side[i] / 2);
      const b = v.y(-dd - side[i]);
      d.poly([[l, top], [r, top], [r, b], [l, b]], i ? C.two : C.body);
      d.arrow((l + r) / 2 + (i ? 1 : -1) * (side[i] * v.s / 2 + 6), (top + b) / 2, 0, as[i] * k, C.alt, 2);
    });
    const gx = d.w - 24;
    d.arrow(gx, d.h - 75, 0, (G - acc) * k, C.line, 2);
    d.text("g−ẍ₀", gx, d.h - 6, C.text, "center");
    d.time(s.t);
  }

  function readouts() {
    return [
      slack
        ? { label: "2 つとも上へ（式 ẍ₀−g）", value: pair(s.a1 === null ? null : -s.a1, acc - G, "m/s²") }
        : { label: "天井に対する a（1 が下がる向き正）", value: pair(s.a1, aF, "m/s²") },
      { label: "張力 T ÷ m₂g", value: slack ? "0（たるんでいる）" : pair(s.T, tF) },
      { label: "見かけの重力 g−ẍ₀", value: `${fx(G - acc)} m/s²` },
    ];
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

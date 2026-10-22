/* 責務: 動きのひな形「動く台と物体」（ANIM_DESIGN §3.5）。なめらかな床の台（斜面か曲面）を物体が滑り降りる: 台に対する位置 u で (μ+mf′²)ü+mf′f″u̇²=−mgf′ を RK4、台は X=−mu/(m+M)。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。m=1・高さ ℓ=1 m・g=9.8 固定。曲面は下端で水平・上端の傾き θ の円弧。
   注意: 下端に着いた時刻と状態は刻みの中で線形に補って止まる。view=1 は台と共に動く見方（台を止め、床の目盛りが流れ、重力と慣性力の矢印）。 */
import { C, G, H, RAD, prep, view, clock, frac, rk4, fx, pair } from "./_kit.js";

export function create(canvas, p) {
  const M = p.ratio;
  const mu = M / (1 + M);
  const th = p.theta * RAD;
  const tn = Math.tan(th);
  const R = 1 / (1 - Math.cos(th));
  const W = p.curve === 1 ? R * Math.sin(th) : 1 / tn;
  const f = p.curve === 1 ? (u) => R - Math.sqrt(R * R - (u - W) ** 2) : (u) => 1 - u * tn;
  const f1 = p.curve === 1 ? (u) => (u - W) / Math.sqrt(R * R - (u - W) ** 2) : () => -tn;
  const f2 = p.curve === 1 ? (u) => (R * R) / (R * R - (u - W) ** 2) ** 1.5 : () => 0;
  const ode = (t, [u, w]) => [w, (-G * f1(u) - f1(u) * f2(u) * w * w) / (mu + f1(u) ** 2)];
  const kX = -1 / (1 + M);
  let ax = 0;
  let ay = 0;
  let ar = 0;
  for (let i = 0; i < 40; i += 1) {
    const u = ((i + 0.5) / 40) * W;
    ar += f(u);
    ax += u * f(u);
    ay += f(u) ** 2 / 2;
  }
  const cx = ax / ar;
  const cy = ay / ar;
  const comX = (u) => (u + kX * u + M * (kX * u + cx)) / (1 + M);
  const eA = (G * Math.sin(th) * Math.cos(th)) / (M + Math.sin(th) ** 2);
  const eN = M / (M + Math.sin(th) ** 2);
  const v1 = p.view === 1;
  const xa = v1 ? 0 : kX * W;
  const xb = v1 ? W : Math.max(W, (1 + kX) * W);
  let s;
  let clk;
  let tr;

  function reset() {
    s = { t: 0, done: false, u: 0, w: 0, X: 0, x1: 0, dev: 0, A: null, n: null, r: null, v1: null, V1: null };
    tr = [[0, 1]];
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    let [u, w] = rk4(ode, [s.u, s.w], t0, H);
    s.t += H;
    if (u >= W) {
      const a = frac(s.u - W, u - W);
      s.t = t0 + H * a;
      w = s.w + a * (w - s.w);
      u = W;
      s.done = true;
    }
    s.u = u;
    s.w = w;
    s.X = kX * u;
    s.x1 = s.X + u;
    s.dev = Math.max(s.dev, Math.abs(comX(u) - comX(0)));
    if (p.curve !== 1) {
      s.A = Math.abs((2 * s.X) / (s.t * s.t));
      s.n = (M * s.A) / (G * Math.sin(th) * Math.cos(th));
    }
    if (s.done) {
      s.r = s.x1 / W;
      s.v1 = (1 + kX) * w;
      s.V1 = kX * w;
    }
    if (s.done || Math.round(s.t / H) % 3 === 0) {
      tr.push([v1 ? u : s.x1, f(u)]);
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
    const v = view(xa - 0.1, xb + 0.1, 0, 1.15, [18, 14, d.w - 14, d.h - 36], 0.5, 1);
    const o = v1 ? 0 : s.X;
    const gy = v.y(0);
    d.line([[4, gy], [d.w - 4, gy]], C.line, 2);
    d.ticks(v, xa, xb, 0, v1 ? s.X : 0);
    const q = [v.p(o, 0)];
    for (let i = 0; i <= 30; i += 1) {
      q.push(v.p(o + (i / 30) * W, f((i / 30) * W)));
    }
    d.poly(q, "#dde3ea", C.sub);
    d.line(tr.map(([x, y]) => v.p(x, y)), C.body, 1, [3, 3]);
    const [bx, by] = v.p(o + s.u, f(s.u));
    const sl = f1(s.u);
    const L = Math.hypot(1, sl);
    const tx = 1 / L;
    const ty = -sl / L;
    const b = 11;
    const nx = ty;
    const ny = -tx;
    d.poly([[bx - tx * b / 2, by - ty * b / 2], [bx + tx * b / 2, by + ty * b / 2],
      [bx + tx * b / 2 + nx * b, by + ty * b / 2 + ny * b], [bx - tx * b / 2 + nx * b, by - ty * b / 2 + ny * b]], C.body);
    const gx = v.x(comX(s.u) - (v1 ? s.X : 0));
    const gyy = v.y((f(s.u) + M * cy) / (1 + M));
    d.line([[gx, gy], [gx, v.y(1.1)]], C.sub, 1, [4, 4]);
    d.line([[gx - 4, gyy - 4], [gx + 4, gyy + 4]], C.line, 2);
    d.line([[gx - 4, gyy + 4], [gx + 4, gyy - 4]], C.line, 2);
    if (v1) {
      const acc = -kX * ode(0, [s.u, s.w])[1];
      const cxp = bx + nx * b / 2;
      const cyp = by + ny * b / 2;
      d.arrow(cxp, cyp, 0, 40, C.force, 2);
      d.arrow(cxp, cyp, (acc / G) * 40, 0, C.two, 2.5);
      d.text("台から見る", d.w - 8, 18, C.text, "right");
    }
    d.time(s.t);
  }

  function readouts() {
    const r = [
      { label: "水平移動 物体 x₁ ／ 台 X₁", value: `${fx(s.x1)} ／ ${fx(s.X)} m` },
      { label: "x₁ ÷ 面の広がり（式 M/(m+M)）", value: pair(s.r, M / (1 + M)) },
      { label: "重心の水平のずれ", value: `${fx(s.dev, 3)} m` },
    ];
    if (p.curve === 1) {
      r.push({ label: "降りきった速さ v₁ ／ V₁", value: s.v1 === null ? "—" : `${fx(s.v1)} ／ ${fx(s.V1)} m/s` });
    } else {
      r.push({ label: "台の加速度 A", value: pair(s.A, eA, "m/s²") });
      r.push({ label: "垂直抗力 n ÷ mg cosθ", value: pair(s.n, eN) });
    }
    return r;
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

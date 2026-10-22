/* 責務: 動きのひな形「一直線の衝突」（ANIM_DESIGN §3.13）。2 つの箱が 1.5 m 離れて始まり、すき間が 0 になる時刻（刻みの中で線形に補う）に反発係数 e の式で速度を変える（解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。m₂=1、箱の幅は質量の 1/3 乗。
   注意: view=1 は重心と共に動く見方（重心を真ん中に止め、床の目盛りが流れる）。衝突の 3 秒後・箱が絵の端に着いた時・ぶつからないときは 3 秒で止まる。ぶつかる前に端に着いたら値の行で知らせる。 */
import { C, H, prep, view, clock, frac, fx, pair } from "./_kit.js";

const XR = 3.2;

export function create(canvas, p) {
  const m1 = p.ratio;
  const M = m1 + 1;
  const w1 = 0.4 * Math.cbrt(m1);
  const w2 = 0.4;
  const vG = (m1 * p.v1 + p.v2) / M;
  const u1 = vG - p.e * (p.v1 - vG);
  const u2 = vG - p.e * (p.v2 - vG);
  const hit = p.v1 > p.v2;
  const K0 = m1 * p.v1 * p.v1 + p.v2 * p.v2;
  const eLoss = K0 > 0 ? ((1 - p.e * p.e) * (m1 / M) * (p.v1 - p.v2) ** 2) / K0 : 0;
  const xG0 = (m1 * (-0.75 - w1 / 2) + (0.75 + w2 / 2)) / M;
  let s;
  let clk;
  const gap = () => s.x2 - w2 / 2 - s.x1 - w1 / 2;
  const off = () => (p.view === 1 ? xG0 + vG * s.t : 0);

  function reset() {
    s = { t: 0, x1: -0.75 - w1 / 2, x2: 0.75 + w2 / 2, a: p.v1, b: p.v2, tc: null, vGa: null, loss: null, gone: false, done: false };
    clk = clock(tick);
  }

  function tick() {
    const g0 = gap();
    s.x1 += s.a * H;
    s.x2 += s.b * H;
    s.t += H;
    const g1 = gap();
    if (s.tc === null && g1 <= 0) {
      const r = (1 - frac(g0, g1)) * H;
      s.tc = s.t - r;
      s.x1 += (u1 - s.a) * r;
      s.x2 += (u2 - s.b) * r;
      s.a = u1;
      s.b = u2;
      s.vGa = (m1 * u1 + u2) / M;
      s.loss = 1 - (m1 * u1 * u1 + u2 * u2) / K0;
    }
    const o = off();
    const out = Math.abs(s.x1 - o) + w1 / 2 > XR || Math.abs(s.x2 - o) + w2 / 2 > XR;
    s.gone = out && hit && s.tc === null; // ぶつかる前に絵の外へ出た
    s.done = out || s.t >= (s.tc !== null ? s.tc + 3 : hit ? Infinity : 3) - 1e-9;
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
    const v = view(-XR, XR, -0.1, 1.6, [10, 10, d.w - 10, d.h - 36], 0.5, 1);
    const o = off();
    const gy = v.y(0);
    d.line([[4, gy], [d.w - 4, gy]], C.line, 2);
    d.ticks(v, -XR, XR, 0, o);
    const k = 9;
    const vo = p.view === 1 ? vG : 0;
    for (const [x, w, u, col, n] of [[s.x1, w1, s.a, C.body, "1"], [s.x2, w2, s.b, C.two, "2"]]) {
      const [l, t] = v.p(x - o - w / 2, w);
      const r = v.x(x - o + w / 2);
      d.poly([[l, t], [r, t], [r, gy], [l, gy]], col);
      d.text(n, (l + r) / 2, (t + gy) / 2 + 5, "#ffffff", "center");
      d.arrow((l + r) / 2, t - 8, (u - vo) * k, 0, C.line, 2);
    }
    const gx = v.x(xG0 + vG * s.t - o);
    d.line([[gx, gy], [gx, v.y(1.4)]], C.sub, 1, [4, 4]);
    d.poly([[gx, gy + 1], [gx - 6, gy + 10], [gx + 6, gy + 10]], C.line);
    d.text(p.view === 1 ? "重心から見る" : "床から見る", d.w - 8, 18, C.text, "right");
    d.time(s.t);
  }

  function readouts() {
    const a = s.tc !== null;
    const r1 = Math.abs(s.a - vG);
    return [
      { label: "衝突後の v₁′ ／ v₂′", value: !hit ? "ぶつからない" : a ? `${fx(s.a)} ／ ${fx(s.b)} m/s` : s.gone ? "ぶつかる前に画面の外へ（速さを変えて）" : "—" },
      { label: "重心速度 前 ／ 後", value: `${fx(vG)} ／ ${a ? fx(s.vGa) : "—"} m/s` },
      { label: "失った運動エネルギー ÷ 初め（式 (1−e²)μ(v₁−v₂)²/Σmv²）", value: hit ? pair(s.loss, eLoss) : "—" },
      { label: "重心から見た速さの比 1 : 2（式 1 : m₁/m₂）", value: r1 > 1e-9 ? `1 : ${fx(Math.abs(s.b - vG) / r1)}（式 1 : ${fx(m1)}）` : "—" },
    ];
  }

  function probe() {
    return { ...s, vG };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

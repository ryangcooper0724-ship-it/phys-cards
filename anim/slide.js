/* 責務: 動きのひな形「なめらかな面を滑り降りる」（ANIM_DESIGN §3.7）。高さ h・幅 2h の 3 つの面 y=f(x) に束縛された玉 (1+f′²)ẍ+f′f″ẋ²=−gf′ を RK4 で。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定。A 直線・B 下に凸（急に落ちる）・C 上に凸（ゆるく始まる）。
   注意: 下端（x=2h）に着いた時刻と速さは刻みの中で線形に補う。3 つとも着いたら止まる。 */
import { C, G, H, prep, view, clock, frac, rk4, fx, pair } from "./_kit.js";

const N = ["A", "B", "C"];
const COL = [C.body, C.two, C.alt];

export function create(canvas, p) {
  const h = p.h;
  const w = 2 * h;
  // s=x/w の [f, df/dx, d²f/dx²]
  const F = [
    (s) => [h * (1 - s), -0.5, 0],
    (s) => [h * (1 - s) ** 2, -(1 - s), 1 / (2 * h)],
    (s) => [h * (1 - 0.2 * s - 0.8 * s * s), -(0.1 + 0.8 * s), -0.4 / h],
  ];
  const fs = F.map((Fi) => (t, y) => {
    const [, a, b] = Fi(y[0] / w);
    return [y[1], -(G * a + a * b * y[1] * y[1]) / (1 + a * a)];
  });
  const eV = Math.sqrt(2 * G * h);
  const eA = Math.sqrt((10 * h) / G);
  let s;
  let clk;

  function reset() {
    s = { t: 0, done: false, x: [0, 0, 0], u: [0, 0, 0], tA: null, tB: null, tC: null, vA: null, vB: null, vC: null };
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    let all = true;
    N.forEach((n, i) => {
      if (s[`t${n}`] !== null) {
        return;
      }
      const [x, u] = rk4(fs[i], [s.x[i], s.u[i]], 0, H);
      if (x >= w) {
        const q = frac(s.x[i] - w, x - w);
        s[`t${n}`] = t0 + H * q;
        s[`v${n}`] = (s.u[i] + q * (u - s.u[i])) * Math.hypot(1, F[i](1)[1]);
        s.x[i] = w;
      } else {
        s.x[i] = x;
        s.u[i] = u;
        all = false;
      }
    });
    if (all) {
      s.t = Math.max(s.tA, s.tB, s.tC);
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
    const v = view(0, w, 0, h, [18, 22, d.w - 14, d.h - 36], 0.5, 1);
    const gy = v.y(0);
    d.line([[4, gy], [d.w - 4, gy]], C.line, 2);
    d.ticks(v, 0, w, 0);
    F.forEach((Fi, i) => {
      const q = [];
      for (let j = 0; j <= 40; j += 1) {
        q.push(v.p((w * j) / 40, Fi(j / 40)[0]));
      }
      d.line(q, COL[i], 2);
      const [lx, ly] = v.p(w * 0.5, Fi(0.5)[0]);
      d.text(N[i], lx + 5, ly - 5, COL[i]);
    });
    F.forEach((Fi, i) => {
      const [y, a] = Fi(s.x[i] / w);
      const k = 6 / Math.hypot(1, a);
      const [bx, by] = v.p(s.x[i], y);
      d.dot(bx - a * k, by - k, 6, COL[i]);
    });
    const order = N.filter((n) => s[`t${n}`] !== null).sort((a, b) => s[`t${a}`] - s[`t${b}`]);
    if (order.length) {
      d.text(`着いた順 ${order.join(" → ")}`, d.w - 8, 16, C.text, "right");
    }
    d.time(s.t);
  }

  function readouts() {
    const tri = (k, u) => `${N.map((n) => fx(s[k + n])).join(" ／ ")} ${u}`;
    return [
      { label: "下端の速さ A／B／C", value: tri("v", "m/s") },
      { label: "下端の速さの式 √(2gh)", value: `${fx(eV)} m/s` },
      { label: "かかった時間 A／B／C", value: tri("t", "s") },
      { label: "A の時間（式 √(10h/g)）", value: pair(s.tA, eA, "s") },
    ];
  }

  function probe() {
    return { t: s.t, done: s.done, tA: s.tA, tB: s.tB, tC: s.tC, vA: s.vA, vB: s.vB, vC: s.vC };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

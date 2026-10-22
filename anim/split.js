/* 責務: 動きのひな形「放物運動の途中の分裂」（ANIM_DESIGN §3.3）。60° で投げた物が時刻 ts に 2 片に割れ、重心から見て 30° 上の向きに相対速さ kick で分かれる（運動量が保存する解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。m₂=1、片の半径は質量の 1/3 乗。
   注意: 片が地面に着いた時刻は刻みの中で線形に補って止まる（割れる前に着けばそこで止まる）。g=0 は地面を見ず ts+3 秒で止まる（縮尺はそこまでの全体）。 */
import { C, H, RAD, prep, view, clock, frac, fx } from "./_kit.js";

export function create(canvas, p) {
  const g = p.g;
  const m1 = p.ratio;
  const M = m1 + 1;
  const vx = p.v0 * Math.cos(60 * RAD);
  const vy = p.v0 * Math.sin(60 * RAD);
  const ts = p.ts;
  const G = (t) => [vx * t, vy * t - (g * t * t) / 2];
  const Tg = g > 0 ? (2 * vy) / g : Infinity;
  const early = Tg < ts;
  const [gx, gy] = G(ts);
  const dv = [p.kick * Math.cos(30 * RAD), p.kick * Math.sin(30 * RAD)];
  const vs = [[vx + dv[0] / M, vy - g * ts + dv[1] / M], [vx - (m1 * dv[0]) / M, vy - g * ts - (m1 * dv[1]) / M]];
  const P = (i, t) => {
    const u = t - ts;
    return [gx + vs[i][0] * u, gy + vs[i][1] * u - (g * u * u) / 2];
  };
  const land = (i) => {
    const w = vs[i][1];
    return ts + (w + Math.sqrt(w * w + 2 * g * gy)) / g;
  };
  const tEnd = early ? Tg : g > 0 ? Math.min(land(0), land(1)) : ts + 3;
  const box = [0, 0, 0, 0];
  for (let k = 0; k <= 40; k += 1) {
    const t = (k / 40) * Math.max(tEnd, Tg === Infinity ? 0 : Tg);
    const q = [G(Math.min(t, early ? Tg : t))];
    if (!early && t > ts) {
      q.push(P(0, Math.min(t, tEnd)), P(1, Math.min(t, tEnd)));
    }
    q.forEach(([x, y]) => {
      box[0] = Math.min(box[0], x);
      box[1] = Math.max(box[1], x);
      box[2] = Math.min(box[2], y);
      box[3] = Math.max(box[3], y);
    });
  }
  const span = Math.max(box[1] - box[0], box[3] - box[2]) * 0.05 + 0.2;
  let s;
  let clk;

  function reset() {
    s = { t: 0, done: false, split: false, early, v1: null, v2: null, rel: null, dev: 0, dp: null };
    clk = clock(tick);
    if (early && vy <= 0) {
      s.done = true;
    }
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    if (!s.split) {
      if (early && G(s.t)[1] <= 0) {
        s.t = t0 + H * frac(G(t0)[1], G(s.t)[1]);
        s.done = true;
        return true;
      }
      if (s.t < ts - 1e-9) {
        return false;
      }
      s.split = true;
      s.v1 = Math.hypot(...vs[0]);
      s.v2 = Math.hypot(...vs[1]);
      s.dp = Math.hypot(m1 * vs[0][0] + vs[1][0] - M * vx, m1 * vs[0][1] + vs[1][1] - M * (vy - g * ts));
    }
    if (g > 0) {
      const ta = Math.max(t0, ts);
      const t1 = s.t;
      for (const i of [0, 1]) {
        const y1 = P(i, t1)[1];
        if (y1 <= 0) {
          s.t = Math.min(s.t, ta + (t1 - ta) * frac(P(i, ta)[1], y1));
          s.done = true;
        }
      }
    } else if (s.t >= ts + 3 - 1e-9) {
      s.done = true;
    }
    const a = P(0, s.t);
    const b = P(1, s.t);
    const c = G(s.t);
    s.dev = Math.max(s.dev, Math.hypot((m1 * a[0] + b[0]) / M - c[0], (m1 * a[1] + b[1]) / M - c[1]));
    const r1 = Math.hypot(a[0] - c[0], a[1] - c[1]);
    s.rel = r1 > 1e-9 ? Math.hypot(b[0] - c[0], b[1] - c[1]) / r1 : null;
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
    const v = view(box[0] - span, box[1] + span, box[2], box[3] + span, [18, 14, d.w - 14, d.h - 36], 0.5, 1);
    if (g > 0) {
      d.line([[4, v.y(0)], [d.w - 4, v.y(0)]], C.line, 2);
    }
    d.ticks(v, box[0], box[1], box[2]);
    const curve = (f, a, b) => {
      const q = [];
      for (let k = 0; k <= 30; k += 1) {
        q.push(v.p(...f(a + ((b - a) * k) / 30)));
      }
      return q;
    };
    d.line(curve(G, 0, Math.max(tEnd, Tg === Infinity ? 0 : Tg)), C.sub, 1, [4, 4]);
    const r = (m) => 4.5 * Math.cbrt(m);
    if (!s.split) {
      d.line(curve(G, 0, s.t), C.body, 1.5);
      d.dot(...v.p(...G(s.t)), r(M), C.body);
    } else {
      d.line(curve(G, 0, ts), C.sub, 1.5);
      d.line(curve((t) => P(0, t), ts, s.t), C.body, 1.5);
      d.line(curve((t) => P(1, t), ts, s.t), C.two, 1.5);
      const a = v.p(...P(0, s.t));
      const b = v.p(...P(1, s.t));
      d.line([a, b], C.sub, 0.8);
      d.dot(...v.p(...G(s.t)), 3.5, "#ffffff", C.line);
      d.dot(...b, r(1), C.two);
      d.dot(...a, r(m1), C.body);
    }
    d.time(s.t);
  }

  function readouts() {
    let first = "—";
    if (s.split) {
      first = `${fx(s.v1)} ／ ${fx(s.v2)} m/s`;
    } else if (early && s.done) {
      first = "割れる前に着いた";
    }
    return [
      { label: "割れた直後の速さ 1 片 ／ 2 片", value: first },
      { label: "重心から見た速さの比 1 : 2", value: s.rel === null ? "—" : `1 : ${fx(s.rel)}（式 1 : ${fx(m1)}）` },
      { label: "重心ともとの放物線のずれ", value: `${fx(s.dev, 3)} m` },
    ];
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

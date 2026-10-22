/* 責務: 動きのひな形「穴に通した糸で引き込む」（ANIM_DESIGN §3.12）。R=1 m・初めの周期 3 s。r=max(R/n, R−ut)、φ'=Rv₀/r²、引き込みの間 φ=(Rv₀/u)(1/r−1/R)、その後は等速円運動（解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。張力 T/m = rφ'² − r̈（r̈=0）、比はどれも初めの円運動に対して。
   注意: 止めない。面積速度は ½r²φ' を状態から測る。0.25 秒ごとの扇形は最後の 8 個を描く。slow=k は実時間 dt を dt/k の動きの時間で進める（測った値・t は動きの中の時間。A253）。 */
import { C, H, prep, view, clock, trail, fx, pair } from "./_kit.js";

const V0 = (2 * Math.PI) / 3;

export function create(canvas, p) {
  const n = p.shrink;
  const u = p.speed;
  const slow = p.slow ?? 1;
  const rf = 1 / n;
  const t1 = (1 - rf) / u;
  const kk = Math.min(8, Math.max(2, Math.ceil(((t1 + 3) * 240) / 580)));
  let s;
  let tr;
  let secs;
  let pts;
  let sa;
  let clk;

  function at(t) {
    const r = Math.max(rf, 1 - u * t);
    const ph = t < t1 ? (V0 / u) * (1 / r - 1) : (V0 / u) * (n - 1) + V0 * n * n * (t - t1);
    const w = V0 / (r * r);
    const dr = t < t1 ? -u : 0;
    const v2 = dr * dr + (r * w) ** 2;
    return { r, ph, w, dr, speed: Math.sqrt(v2) / V0, tension: (r * w * w) / (V0 * V0), ke: v2 / (V0 * V0), areal: (r * r * w) / V0 };
  }

  const xy = () => [s.r * Math.cos(s.ph), s.r * Math.sin(s.ph)];

  function reset() {
    s = { t: 0, k: 0, ...at(0), dev: 0, done: false };
    s.dev = Math.abs(s.areal - 1);
    tr = trail();
    tr.push(1, 0);
    secs = [];
    pts = [[1, 0]];
    sa = 0;
    clk = clock(tick);
  }

  function tick() {
    s.k += 1;
    s.t = s.k * H;
    Object.assign(s, at(s.t));
    s.dev = Math.max(s.dev, Math.abs(s.areal - 1));
    if (s.k % kk === 0) {
      tr.push(...xy());
    }
    if (s.k % 3 === 0) {
      pts.push(xy());
    }
    if (s.k % 60 === 0) {
      secs.push([s.k / 60, pts, sa]);
      secs.splice(0, secs.length - 8);
      pts = [xy()];
      sa = s.ph;
    }
    return false;
  }

  function step(dt) {
    clk.run(dt / slow);
  }

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const v = view(-1.15, 1.15, -1.15, 1.15, [8, 8, d.w - 8, d.h - 22]);
    const o = v.p(0, 0);
    const disk = [];
    for (let i = 0; i < 48; i += 1) {
      disk.push(v.p(1.12 * Math.cos(i / 7.64), 1.12 * Math.sin(i / 7.64)));
    }
    d.poly(disk, "#eef0f2", C.sub);
    secs.filter((q) => s.ph - q[2] <= 2 * Math.PI).concat([[Math.ceil(s.k / 60 + 1e-9), pts]]).forEach(([m, q]) => d.poly([o, ...q.map(([x, y]) => v.p(x, y))], m % 2 ? "rgba(46,125,50,0.2)" : "rgba(192,102,31,0.22)"));
    d.line(tr.a.map(([x, y]) => v.p(x, y)).concat([v.p(...xy())]), C.line, 1);
    const [bx, by] = v.p(...xy());
    d.line([o, [bx, by]], C.line, 1.5);
    d.dot(o[0], o[1], 4, C.line);
    const c = Math.cos(s.ph);
    const sn = Math.sin(s.ph);
    const k = 40 / (V0 * n);
    d.arrow(bx, by, (s.dr * c - s.r * s.w * sn) * k, -(s.dr * sn + s.r * s.w * c) * k, C.line, 2);
    d.dot(bx, by, 7, C.body);
    d.time(s.t);
    if (slow > 1) {
      d.ctx.font = "11px sans-serif";
      d.text(`スロー ×1/${slow}`, d.w - 8, 14, C.sub, "right");
      d.ctx.font = "13px sans-serif";
    }
  }

  function readouts() {
    return [
      { label: "半径 r ÷ R", value: fx(s.r) },
      { label: "速さ ÷ v₀（式 R/r）", value: pair(s.speed, 1 / s.r) },
      { label: "張力 ÷ 初め（式 (R/r)³）", value: pair(s.tension, s.r ** -3) },
      { label: "運動エネルギー ÷ 初め", value: fx(s.ke) },
      { label: "面積速度 ÷ 初め", value: fx(s.areal) },
    ];
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

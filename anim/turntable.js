/* 責務: 動きのひな形「回転台の上の物体」（ANIM_DESIGN §3.17）。ω=rate·t、要る摩擦力（質量あたり）は中心向き rω² と接線 r·rate、r√(ω⁴+rate²) が μg を越えたら滑り出す（解析解）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定。view=1 は台と共に回る系（台を止めて描き、遠心力を足す）。
   注意: 滑り出す時刻は刻みの中で線形に補い、そこで止まる。初めから接線の分だけで越える（r·rate>μg）ときは t=0 で止まる。 */
import { C, G, H, prep, view, clock, frac, fx, pair } from "./_kit.js";

export function create(canvas, p) {
  const { r, mu, rate } = p;
  const lim = mu * G;
  const need = (t) => r * Math.hypot((rate * t) ** 2, rate) - lim;
  const eW = Math.sqrt(lim / r);
  let s;
  let clk;

  function reset() {
    s = { t: 0, omega: 0, f: 0, wSlip: null, done: false };
    clk = clock(tick);
    if (need(0) > 0) {
      s.wSlip = 0;
      s.done = true;
    }
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    const b = need(s.t);
    if (b > 0) {
      s.t = t0 + H * frac(need(t0), b);
      s.done = true;
    }
    s.omega = rate * s.t;
    s.f = (r * s.omega ** 2) / G;
    if (s.done) {
      s.wSlip = s.omega;
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
    const v = view(-1.15, 1.15, -1.15, 1.15, [8, 8, d.w - 64, d.h - 24]);
    const o = v.p(0, 0);
    const ph = p.view === 1 ? 0 : (rate * s.t * s.t) / 2;
    const disk = [];
    for (let i = 0; i < 48; i += 1) {
      disk.push(v.p(1.1 * Math.cos(i / 7.64), 1.1 * Math.sin(i / 7.64)));
    }
    d.poly(disk, "#eef0f2", C.sub);
    for (let i = 0; i < 6; i += 1) {
      d.line([o, v.p(1.1 * Math.cos(ph + i / 0.955), 1.1 * Math.sin(ph + i / 0.955))], C.sub, 1);
    }
    const c = Math.cos(ph);
    const sn = Math.sin(ph);
    const [bx, by] = v.p(r * c, r * sn);
    const k = (Math.max(24, Math.min(45, 0.95 * r * v.s)) / lim) * r * s.omega ** 2;
    d.arrow(bx, by, -c * k, sn * k, C.force, 2.5);
    if (p.view === 1) {
      d.arrow(bx, by, c * k, -sn * k, C.two, 2.5);
    }
    d.dot(bx, by, 7, C.body);
    if (s.done) {
      const [a, b] = p.view === 1 ? [r * s.omega ** 2, -r * rate] : [0, 1];
      const n = 40 / Math.hypot(a, b);
      const [ux, uy] = [(a * c - b * sn) * n, -(a * sn + b * c) * n];
      d.arrow(bx - uy / 5, by + ux / 5, ux, uy, C.alt, 2);
      d.text("緑: この向きへ滑り出す", d.w - 4, d.h - 6, C.alt, "right");
    }
    const x = d.w - 30;
    const base = d.h - 30;
    const u = (base - 22) / (1.25 * mu);
    d.bar(x, base, s.f * u, 16, C.force);
    d.line([[x - 18, base], [x + 18, base]], C.sub, 1);
    d.line([[x - 18, base - mu * u], [x + 18, base - mu * u]], C.line, 1.5);
    d.text("μmg", x, base - mu * u - 4, C.text, "center");
    d.text("mrω²", x, 14, C.force, "center");
    d.time(s.t);
  }

  function readouts() {
    return [
      { label: "角速度 ω", value: `${fx(s.omega)} rad/s` },
      { label: "要る摩擦力 mrω² ÷ mg", value: `${fx(s.f)}（上限 μ ${fx(mu)}）` },
      { label: "滑り出した ω（式 √(μg/r)）", value: pair(s.wSlip, eW, "rad/s") },
    ];
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

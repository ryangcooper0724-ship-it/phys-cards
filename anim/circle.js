/* 責務: 動きのひな形「円運動の速度と加速度」（ANIM_DESIGN §3.6）。φ=ω₀t+αt²/2 の円運動（解析解）の速度・加速度の矢印と、Δt 前の速度との差 Δv の作図。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。速さ・接線加速度は位置の差から測る（刻み H をはさむ差）。
   注意: 一周の時刻は刻みの中で線形に補う。α=0 は止めない。α>0 は ω が 10 rad/s か 8 秒で止まる。Δv は t≧Δt から。 */
import { C, H, RAD, prep, view, clock, frac, fx, pair } from "./_kit.js";

export function create(canvas, p) {
  const { r, omega: w0, alpha: al, dt } = p;
  const phi = (t) => w0 * t + (al * t * t) / 2;
  const om = (t) => w0 + al * t;
  const pos = (t) => [r * Math.cos(phi(t)), r * Math.sin(phi(t))];
  const vel = (t) => [-r * om(t) * Math.sin(phi(t)), r * om(t) * Math.cos(phi(t))];
  const sp = (t) => Math.hypot(pos(t + H / 2)[0] - pos(t - H / 2)[0], pos(t + H / 2)[1] - pos(t - H / 2)[1]) / H;
  const wM = al > 0 ? Math.min(10, w0 + 8 * al) : w0;
  const vM = r * wM;
  const aM = Math.hypot(r * wM * wM, r * al);
  let s;
  let clk;

  function reset() {
    s = { t: 0, done: false, phi: 0, v: null, an: null, at: null, dvdt: null, T: null, tilt: null };
    clk = clock(tick);
  }

  function tick() {
    const t0 = s.t;
    s.t += H;
    const t = s.t;
    s.phi = phi(t);
    const v0 = sp(t0);
    s.v = sp(t);
    s.an = (s.v * s.v) / r;
    s.at = (s.v - v0) / H;
    s.tilt = Math.atan2(s.at, s.an) / RAD;
    if (t >= dt - 1e-9) {
      const [a, b] = vel(t);
      const [c, e] = vel(t - dt);
      s.dvdt = Math.hypot(a - c, b - e) / dt;
    }
    const P = 2 * Math.PI;
    if (al === 0 && s.T === null && phi(t) >= P) {
      s.T = t0 + H * frac(phi(t0) - P, phi(t) - P);
    }
    s.done = al > 0 && (om(t) >= 10 - 1e-9 || t >= 8 - 1e-9);
    return s.done;
  }

  function step(dt2) {
    if (!s.done) {
      clk.run(dt2);
    }
  }

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const v = view(-1.35, 1.35, -1.35, 1.35, [8, 8, d.w * 0.62, d.h - 22]);
    const R = v.s;
    const { ctx } = d;
    const [cx, cy] = v.p(0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = C.sub;
    ctx.lineWidth = 1;
    ctx.stroke();
    d.dot(cx, cy, 3, C.line);
    const t = s.t;
    const f = phi(t);
    const c = Math.cos(f);
    const sn = Math.sin(f);
    const [bx, by] = v.p(c, sn);
    const kv = (0.7 * R) / vM;
    const ka = (0.7 * R) / aM;
    const an = r * om(t) ** 2;
    const at = r * al;
    d.line([[cx, cy], [bx, by]], C.sub, 0.8, [2, 4]);
    if (t >= dt - 1e-9) {
      d.dot(...v.p(Math.cos(phi(t - dt)), Math.sin(phi(t - dt))), 3, C.sub);
    }
    d.arrow(bx, by, (-c * an - sn * at) * ka, (sn * an - c * at) * ka, C.line, 3);
    d.arrow(bx, by, -c * an * ka, sn * an * ka, C.force, 1.5);
    d.arrow(bx, by, -sn * at * ka, -c * at * ka, C.alt, 1.5);
    d.arrow(bx, by, -sn * r * om(t) * kv, -c * r * om(t) * kv, C.body, 2.5);
    d.dot(bx, by, 7, C.body);
    const x0 = Math.round(d.w * 0.64);
    const z = Math.min(d.w - 6 - x0, d.h - 30);
    d.poly([[x0, 22], [x0 + z, 22], [x0 + z, 22 + z], [x0, 22 + z]], "#ffffff", C.sub);
    d.text("Δv の作図", x0 + z / 2, 16, C.text, "center");
    const ox = x0 + z / 2;
    const oy = 22 + z / 2;
    const ki = (z / 2 - 6) / vM;
    const [a, b] = vel(t);
    if (t >= dt - 1e-9) {
      const [pa, pb] = vel(t - dt);
      d.arrow(ox, oy, pa * ki, -pb * ki, C.sub, 1.5);
      d.arrow(ox + pa * ki, oy - pb * ki, (a - pa) * ki, -(b - pb) * ki, C.force, 2);
    }
    d.arrow(ox, oy, a * ki, -b * ki, C.body, 2);
    d.time(t);
  }

  function readouts() {
    const w = om(s.t);
    return [
      { label: "速さ v（式 rω）", value: pair(s.v, r * w, "m/s") },
      { label: "向心加速度 v²/r", value: s.an === null ? "—" : `${fx(s.an)} m/s²` },
      { label: "作図の |Δv|/Δt", value: s.dvdt === null ? "—" : `${fx(s.dvdt)} m/s²` },
      { label: "接線加速度（式 rα）", value: pair(s.at, r * al, "m/s²") },
      al === 0
        ? { label: "周期（式 2π/ω）", value: pair(s.T, (2 * Math.PI) / w0, "s") }
        : { label: "加速度の傾き（式 arctan(α/ω²)）", value: pair(s.tilt, Math.atan(al / (w * w)) / RAD, "°", 1) },
    ];
  }

  function probe() {
    return { ...s };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

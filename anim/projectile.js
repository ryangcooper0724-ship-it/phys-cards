/* 責務: 動きのひな形「斜方投射」（ANIM_DESIGN §3.1）。高さ h から角 θ で投げた玉の放物運動（解析解）と、標的（target=1）の自由落下（モンキーハンティング）。
   依存: ./_kit.js。値の範囲は app/anim/catalog.json が正。g=9.8 固定、標的は水平 10 m。
   注意: 刻み 1/240 秒で進め、最高点・着地・出会いの時刻は刻みの中で線形に補う。玉が着く（標的があれば両方が着くか出会う）と止まる。 */
import { C, G, H, RAD, prep, view, clock, frac, trail, fx, pair } from "./_kit.js";

const A = 10;

export function create(canvas, p) {
  const th = p.theta * RAD;
  const vx = p.v0 * Math.cos(th);
  const vy = p.v0 * Math.sin(th);
  const h0 = p.h;
  const tgt = p.target === 1 && p.theta >= 0 && p.theta < 90;
  const ty0 = h0 + A * Math.tan(th);
  const pos = (t) => [vx * t, h0 + vy * t - (G * t * t) / 2];
  const ty = (t) => ty0 - (G * t * t) / 2;
  const eH = h0 + (vy * vy) / (2 * G);
  const eLand = (vy + Math.sqrt(vy * vy + 2 * G * h0)) / G;
  const eV = Math.sqrt(p.v0 * p.v0 + 2 * G * h0);
  let m;
  let tr;
  let clk;

  function stop() {
    m.done = true;
    m.t = Math.max(m.tLand ?? 0, m.tgtLand ?? 0, m.meetT ?? 0);
    return true;
  }

  function land(t) {
    m.tLand = t;
    m.range = vx * t;
    m.vLand = Math.hypot(vx, vy - G * t);
  }

  function reset() {
    m = { t: 0, done: false, tTop: null, H: null, vTop: null, tLand: null, range: null, vLand: null, tgtLand: null, meetT: null, meetDist: null };
    tr = trail();
    tr.push(0, h0);
    clk = clock(tick);
    if (h0 === 0 && vy <= 0) {
      land(0);
    }
    if (tgt && ty0 <= 0) {
      m.tgtLand = 0;
    }
    if (m.tLand !== null && (!tgt || m.tgtLand !== null)) {
      stop();
    }
  }

  function tick() {
    const t0 = m.t;
    const t1 = t0 + H;
    m.t = t1;
    if (m.tLand === null) {
      const w0 = vy - G * t0;
      const w1 = vy - G * t1;
      if (m.tTop === null && w0 > 0 && w1 <= 0) {
        m.tTop = t0 + H * frac(w0, w1);
        m.H = pos(m.tTop)[1];
        m.vTop = Math.hypot(vx, vy - G * m.tTop);
      }
      if (tgt && m.meetT === null && m.tgtLand === null && vx * t0 < A && vx * t1 >= A) {
        const tc = t0 + H * frac(vx * t0 - A, vx * t1 - A);
        const [bx, by] = pos(tc);
        if (by >= 0 && ty(tc) >= 0) {
          m.meetT = tc;
          m.meetDist = Math.hypot(bx - A, by - ty(tc));
          return stop();
        }
      }
      const y0 = pos(t0)[1];
      const y1 = pos(t1)[1];
      if (y1 <= 0) {
        land(t0 + H * frac(y0, y1));
      } else if (Math.round(t1 / H) % 4 === 0) {
        tr.push(...pos(t1));
      }
    }
    if (tgt && m.tgtLand === null && ty(t1) <= 0) {
      m.tgtLand = t0 + H * frac(ty(t0), ty(t1));
    }
    return m.tLand !== null && (!tgt || m.tgtLand !== null) ? stop() : false;
  }

  function step(dt) {
    if (!m.done) {
      clk.run(dt);
    }
  }

  function draw() {
    const d = prep(canvas);
    if (d === null) {
      return;
    }
    const xr = Math.max(tgt ? A * 1.08 : 0, (p.v0 / G) * eV, 0.2);
    const yr = Math.max(h0 + (p.v0 * p.v0) / (2 * G), tgt ? ty0 : 0, 0.1);
    const v = view(0, xr, 0, yr, [18, 14, d.w - 14, d.h - 36], 0, 1);
    const gy = v.y(0);
    d.line([[4, gy], [d.w - 4, gy]], C.line, 2);
    d.ticks(v, 0, (d.w - 18 - v.x(0)) / v.s, 0);
    if (h0 > 0) {
      d.line([v.p(0, 0), v.p(0, h0)], C.sub, 3);
    } else {
      const q = [];
      for (let i = 0; i <= 40; i += 1) {
        const t = (i / 40) * ((p.v0 * Math.SQRT2) / G);
        q.push(v.p((p.v0 / Math.SQRT2) * t, (p.v0 / Math.SQRT2) * t - (G * t * t) / 2));
      }
      d.line(q, C.sub, 1, [4, 4]);
    }
    const tb = Math.min(m.t, m.tLand ?? Infinity);
    if (tgt) {
      d.line([v.p(0, h0), v.p(A, ty0)], C.force, 1, [3, 4]);
      const [sx, sy] = v.p(A, Math.max(0, ty(Math.min(m.t, m.tgtLand ?? Infinity))));
      d.poly([[sx - 7, sy - 14], [sx + 7, sy - 14], [sx + 7, sy], [sx - 7, sy]], C.force);
    }
    d.line(tr.a.map(([x, y]) => v.p(x, y)).concat([v.p(...pos(tb))]), C.body, 1.5);
    if (m.tTop !== null) {
      const [tx, tyy] = v.p(...pos(m.tTop));
      d.dot(tx, tyy, 3, C.alt);
      d.arrow(tx, tyy - 8, Math.min(40, vx * 3), 0, C.alt, 1.5);
    }
    if (m.tLand !== null && h0 === 0) {
      d.line([v.p(0, 0), v.p(m.range, 0)], C.alt, 3);
      d.text(`ℓ = ${fx(m.range)} m`, v.x(m.range / 2), gy - 6, C.alt, "center");
    }
    const [bx, by] = v.p(...pos(tb));
    const k = Math.min(d.w, d.h) * 0.3 / Math.max(eV, 1);
    const wy = vy - G * tb;
    d.arrow(bx, by, vx * k, 0, C.sub, 1.5);
    d.arrow(bx, by, 0, -wy * k, C.sub, 1.5);
    d.arrow(bx, by, vx * k, -wy * k, C.line, 2);
    d.dot(bx, by, 7, C.body);
    d.time(m.t);
  }

  function readouts() {
    const r = [
      { label: "最高点の時刻", value: vy > 0 && m.tTop !== null ? `${fx(m.tTop)} s` : "—" },
      { label: "最高点の高さ（式 h+v₀²sin²θ/2g）", value: vy > 0 ? pair(m.H, eH, "m") : "—" },
      { label: "着いた時刻", value: pair(m.tLand, eLand, "s") },
    ];
    if (p.target === 1) {
      let s = "標的は 0°〜89° で";
      if (tgt) {
        s = m.meetT !== null ? pair(m.meetT, A / vx, "s") : m.tLand !== null || m.tgtLand !== null ? "出会う前に地面に着いた" : pair(null, A / vx);
      }
      r.push({ label: "出会った時刻（式 a/(v₀cosθ)）", value: s });
    } else if (h0 === 0) {
      r.push({ label: "到達距離 ℓ（式 v₀²sin2θ/g）", value: pair(m.range, Math.max(0, (p.v0 * p.v0 * Math.sin(2 * th)) / G), "m") });
    } else {
      r.push({ label: "着く速さ（式 √(v₀²+2gh)）", value: pair(m.vLand, eV, "m/s") });
    }
    return r;
  }

  function probe() {
    return { ...m };
  }

  reset();
  return { reset, step, draw, readouts, probe };
}

/* 責務: 動きのひな形の共通の部品（canvas の準備と描く道具・世界→画面の変換・RK4・刻みを貯めて回す・線形の補い・数の書き方）。ANIM_DESIGN §2。
   依存: なし（各ひな形が import する。名前が _ で始まり catalog.json に無いので、印から読まれるひな形ではない）。
   注意: 時計を読まない。描く道具は画面の座標（CSS px）で受け、矢印の先は canvas の中に切る。軌跡は点の数に上限（600）。 */

export const C = { line: "#1a1d21", sub: "#8a929b", body: "#1f5f8b", text: "#565d66", two: "#c0661f", force: "#b3261e", alt: "#2e7d32" };
export const G = 9.8;
export const H = 1 / 240;
export const RAD = Math.PI / 180;

const nice = [1, 2, 5];

/** canvas を CSS の大きさと dpr に合わせて白で消し、描く道具 d（ctx・w・h と下の関数）を返す。2d が無ければ null。 */
export function prep(canvas) {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return null;
  }
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "13px sans-serif";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const d = {
    ctx, w, h,
    line(pts, color = C.line, width = 1.5, dash = null) {
      if (pts.length < 2) {
        return;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
    },
    poly(pts, fill, stroke = null) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    },
    dot(x, y, r, color = C.body, edge = null) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    },
    /** (x, y) から (dx, dy) の矢印（px）。先が canvas の外に出るなら同じ向きのまま縮める。 */
    arrow(x, y, dx, dy, color = C.line, width = 2) {
      let f = 1;
      for (const [p, q, hi] of [[x, dx, w], [y, dy, h]]) {
        if (p + q > hi - 2) {
          f = Math.min(f, (hi - 2 - p) / q);
        }
        if (p + q < 2) {
          f = Math.min(f, (2 - p) / q);
        }
      }
      f = Math.max(0, f);
      const ex = x + dx * f;
      const ey = y + dy * f;
      const len = Math.hypot(ex - x, ey - y);
      if (len < 1) {
        return;
      }
      const hd = Math.min(8, len / 2);
      const ux = (ex - x) / len;
      const uy = (ey - y) / len;
      d.line([[x, y], [ex - ux * hd * 0.6, ey - uy * hd * 0.6]], color, width);
      d.poly([[ex, ey], [ex - ux * hd - uy * hd * 0.5, ey - uy * hd + ux * hd * 0.5], [ex - ux * hd + uy * hd * 0.5, ey - uy * hd - ux * hd * 0.5]], color);
    },
    text(s, x, y, color = C.text, align = "left") {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(s, x, y);
      ctx.textAlign = "left";
    },
    /** 左下の t = 0.00 s。 */
    time(t) {
      d.text(`t = ${t.toFixed(2)} s`, 8, h - 6);
    },
    /** 世界の水平線 y の上の a〜b（m）に目盛りと数（最後に m）。shift は目盛りを流す量（世界の X を X−shift に描く）。 */
    ticks(v, a, b, y, shift = 0) {
      const span = Math.max(b - a, 1e-9);
      let st = 1;
      for (let e = -2; e < 4; e += 1) {
        st = nice.map((n) => n * 10 ** e).find((s) => span / s <= 7);
        if (st) {
          break;
        }
      }
      const sy = v.y(y);
      const dg = st < 1 ? String(st).split(".")[1].length : 0;
      const first = Math.ceil((a + shift) / st - 1e-9);
      const last = Math.floor((b + shift) / st + 1e-9);
      for (let i = first; i <= last; i += 1) {
        const sx = v.x(i * st - shift);
        d.line([[sx, sy], [sx, sy + 5]], C.sub, 1);
        d.text((i * st).toFixed(dg) + (i === last ? " m" : ""), sx, sy + 17, C.text, "center");
      }
    },
    /** 下の端 (x, base) から上へ高さ hgt（負なら下へ）の棒。 */
    bar(x, base, hgt, wid, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x - wid / 2, Math.min(base, base - hgt), wid, Math.abs(hgt));
    },
  };
  return d;
}

/** 世界の範囲 [x0,x1]×[y0,y1]（m、y 上向き）を画面の矩形 r=[左,上,右,下] に縦横同じ倍率で入れる。余りは ax・ay（0 左・上、1 右・下）で振る。 */
export function view(x0, x1, y0, y1, r, ax = 0.5, ay = 0.5) {
  const s = Math.min((r[2] - r[0]) / Math.max(x1 - x0, 1e-9), (r[3] - r[1]) / Math.max(y1 - y0, 1e-9));
  const ox = r[0] + ax * (r[2] - r[0] - s * (x1 - x0)) - s * x0;
  const oy = r[1] + ay * (r[3] - r[1] - s * (y1 - y0)) + s * y1;
  return { s, x: (x) => ox + s * x, y: (y) => oy - s * y, p: (x, y) => [ox + s * x, oy - s * y] };
}

/** 汎用の RK4（状態は数の配列。f(t, y) は微分の配列）。 */
export function rk4(f, y, t, h) {
  const add = (k, c) => y.map((v, i) => v + c * k[i]);
  const k1 = f(t, y);
  const k2 = f(t + h / 2, add(k1, h / 2));
  const k3 = f(t + h / 2, add(k2, h / 2));
  const k4 = f(t + h, add(k3, h));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** dt を貯めて刻み h ごとに tick() を呼ぶ。回数は貯めた合計の時刻から決める（dt の分け方によらない）。tick が true を返したら止まる。 */
export function clock(tick, h = H) {
  let total = 0;
  let n = 0;
  let stopped = false;
  return {
    run(dt) {
      if (stopped) {
        return;
      }
      total += dt;
      const want = Math.floor(total / h + 1e-6);
      while (n < want && !stopped) {
        n += 1;
        stopped = tick() === true;
      }
    },
  };
}

/** 刻みの前 a・後 b で符号が変わった（0 を通った）ときの刻みの中の割合（線形で補う。0〜1）。 */
export const frac = (a, b) => (a === b ? 1 : a / (a - b));

/** 軌跡（点の数は max まで。古い点から捨てる）。 */
export function trail(max = 600) {
  const a = [];
  return { a, push(x, y) {
    a.push([x, y]);
    if (a.length > max) {
      a.shift();
    }
  } };
}

/** 数を桁 dg で（null・NaN・無限は「—」。−0.00 は 0.00）。 */
export function fx(v, dg = 2) {
  if (v === null || !Number.isFinite(v)) {
    return "—";
  }
  const s = v.toFixed(dg);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** 「測った値 単位（式 式の値）」の1行。測る前（m が null）は「—（式 式の値）」。 */
export function pair(m, e, unit = "", dg = 2) {
  return m === null ? `—（式 ${fx(e, dg)}）` : `${fx(m, dg)}${unit ? ` ${unit}` : ""}（式 ${fx(e, dg)}）`;
}

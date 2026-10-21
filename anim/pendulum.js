/* 責務: 動きのひな形「単振り子」（SPEC §13.3）。近似しない θ'' = −(g/L) sin θ を RK4（内部の刻み 1/240 秒）で解き、canvas に描く。
   依存: なし（ui/anim_box.js が import して create を呼ぶ。値の範囲は app/anim/catalog.json が正）。
   注意: 時刻は step(dt) で受け取る（自分で時計を読まない。テストで止めて回せるように）。測った周期は θ が負から正へ 0 を通る時刻の間隔（2 回通るまでは null）。 */

const H = 1 / 240; // 内部の刻み（秒）

/** 単振り子を作る。params は {L（m）, theta0（度）, g（m/s²）}。 */
export function create(canvas, params) {
  const L = params.L;
  const g = params.g;
  const th0 = (params.theta0 * Math.PI) / 180;
  let th = th0;
  let om = 0;
  let t = 0;
  let acc = 0; // 刻みに満たない残りの時間
  let lastCross = null; // 最後に負から正へ 0 を通った時刻
  let period = null;

  const f = (x) => -(g / L) * Math.sin(x);

  function rk4() {
    const k1t = om;
    const k1o = f(th);
    const k2t = om + (H / 2) * k1o;
    const k2o = f(th + (H / 2) * k1t);
    const k3t = om + (H / 2) * k2o;
    const k3o = f(th + (H / 2) * k2t);
    const k4t = om + H * k3o;
    const k4o = f(th + H * k3t);
    const prev = th;
    th += (H / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    om += (H / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    t += H;
    if (prev < 0 && th >= 0) {
      const at = t - H + (H * -prev) / (th - prev); // 刻みの中で 0 を通った時刻（線形で補う）
      if (lastCross !== null) {
        period = at - lastCross;
      }
      lastCross = at;
    }
  }

  function reset() {
    th = th0;
    om = 0;
    t = 0;
    acc = 0;
    lastCross = null;
    period = null;
  }

  function step(dt) {
    acc += dt;
    while (acc >= H) {
      rk4();
      acc -= H;
    }
  }

  function draw() {
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 200;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    const px = w / 2;
    const py = 16;
    const maxLen = h - py - 18; // 玉（半径 12）が下で切れない長さ
    const len = maxLen * (0.35 + (0.65 * (L - 0.1)) / 2.9); // 長さに合わせて糸を伸ばす（0.1 m〜3 m を maxLen の 35%〜100% に）
    ctx.strokeStyle = "#1a1d21";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px - 60, py);
    ctx.lineTo(px + 60, py);
    ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#8a929b";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, Math.min(h - 4, py + len + 16));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, len, Math.PI / 2 - th0, Math.PI / 2 + th0);
    ctx.stroke();
    ctx.setLineDash([]);
    const bx = px + len * Math.sin(th);
    const by = py + len * Math.cos(th);
    ctx.strokeStyle = "#1a1d21";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = "#1f5f8b";
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#565d66";
    ctx.font = "13px sans-serif";
    ctx.fillText(`t = ${t.toFixed(2)} s`, 10, h - 10);
  }

  function readouts() {
    const small = 2 * Math.PI * Math.sqrt(L / g);
    return [
      { label: "周期（測った値）", value: period === null ? "—" : `${period.toFixed(2)} s` },
      { label: "小さい角の近似 2π√(L/g)", value: `${small.toFixed(2)} s` },
    ];
  }

  /** テスト用: 測った周期の数（null なら 2 回通っていない）。 */
  function measuredPeriod() {
    return period;
  }

  return { reset, step, draw, readouts, measuredPeriod };
}

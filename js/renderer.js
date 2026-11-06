// renderer.js —— 胶带渲染
// 层次：柔和投影 → 连续纹理网格 → 折痕（轻皱/揉皱/单斜翘）→ 端头微翘 → 凹凸 → 边缘厚度 → 轮廓

import { buildTape } from './geometry.js';
import { drawCreases } from './creases.js';

const supportsFilter = (() => {
  const c = document.createElement('canvas').getContext('2d');
  c.filter = 'blur(2px)';
  return c.filter === 'blur(2px)';
})();

export function renderTape(ctx, W, H, params, texture) {
  const tape = buildTape({ ...params, centerX: W / 2, centerY: H / 2 });

  ctx.clearRect(0, 0, W, H);

  const path = new Path2D();
  const o = tape.outline;
  path.moveTo(o[0].x, o[0].y);
  for (let i = 1; i < o.length; i++) path.lineTo(o[i].x, o[i].y);
  path.closePath();

  drawShadow(ctx, path);
  drawEndLiftShadow(ctx, tape, path);

  ctx.save();
  ctx.clip(path);
  drawMeshTexture(ctx, tape, texture);
  drawSurfaceShading(ctx, tape);
  drawCreases(ctx, tape, params.crease);
  drawEndLiftLight(ctx, tape);
  drawBump(ctx, tape, params.bump, texture);
  drawEdgeBevel(ctx, tape);
  ctx.restore();

  // 外轮廓：只留一丝极淡的线，勒住边缘不脏
  ctx.save();
  ctx.strokeStyle = 'rgba(43, 35, 24, 0.09)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();

  return tape;
}

// ---- 投影：两层，远影大而淡 + 近影小而实，胶带才是「浮」而不是「印」 ----
function drawShadow(ctx, path) {
  if (supportsFilter) {
    // 远影：偏移一点、模糊大、透明度低
    ctx.save();
    ctx.filter = 'blur(20px)';
    ctx.fillStyle = 'rgba(46, 38, 26, 0.15)';
    ctx.translate(3, 7);
    ctx.fill(path);
    ctx.restore();

    // 接触影：贴着边的一圈近距离暗影
    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = 'rgba(46, 38, 26, 0.15)';
    ctx.translate(1, 2);
    ctx.fill(path);
    ctx.restore();
    return;
  }

  // 退化方案：多层轻微偏移的实心投影近似模糊
  ctx.save();
  ctx.fillStyle = 'rgba(43, 35, 24, 0.09)';
  for (let i = 3; i >= 1; i--) {
    ctx.save();
    ctx.translate(1 + i * 0.8, 2 + i * 1.2);
    ctx.fill(path);
    ctx.restore();
  }
  ctx.restore();
}

// ---- 端头微翘：翘起处离纸更远，影子更浓、更偏外 ----
function drawEndLiftShadow(ctx, tape, path) {
  if (!supportsFilter) return;

  const cols = tape.cols;
  const ends = [
    { col: cols[0], dir: -1 },
    { col: cols[cols.length - 1], dir: 1 },
  ];
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // 画布减去胶带本身：影子只落在胶带之外
  const outside = new Path2D();
  outside.rect(0, 0, W, H);
  const o = tape.outline;
  outside.moveTo(o[0].x, o[0].y);
  for (let i = 1; i < o.length; i++) outside.lineTo(o[i].x, o[i].y);
  outside.closePath();

  for (const e of ends) {
    ctx.save();
    ctx.clip(outside, 'evenodd');
    // 只在端头附近生效
    ctx.beginPath();
    ctx.arc(e.col.c.x, e.col.c.y, tape.widthPx * 1.5, 0, Math.PI * 2);
    ctx.clip();

    ctx.filter = 'blur(9px)';
    ctx.fillStyle = 'rgba(42, 34, 23, 0.32)';
    ctx.translate(e.dir * 3, 8);
    ctx.fill(path);
    ctx.restore();
  }
}

// ---- 表面光影：只留上缘一点点迎光提亮；底部暗带已取消（读成脏影） ----
function drawSurfaceShading(ctx, tape) {
  const mid = tape.cols[Math.floor(tape.cols.length / 2)] || tape.cols[0];
  const g = ctx.createLinearGradient(mid.top.x, mid.top.y, mid.bot.x, mid.bot.y);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
  g.addColorStop(0.16, 'rgba(255, 255, 255, 0.07)');
  g.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// ---- 端头微翘：翘起的地方迎光，端边一道细高光 ----
function drawEndLiftLight(ctx, tape) {
  const cols = tape.cols;

  for (const col of [cols[0], cols[cols.length - 1]]) {
    // 端边高光
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.lineWidth = Math.max(1, tape.widthPx * 0.012);
    ctx.beginPath();
    ctx.moveTo(col.top.x, col.top.y);
    ctx.lineTo(col.bot.x, col.bot.y);
    ctx.stroke();
    ctx.restore();
  }

  // 端头 ~6% 内轻微提亮，越靠端头越亮（不再有暗折痕线，避免读成脏带）
  for (const side of [-1, 1]) {
    const from = side < 0 ? cols[0] : cols[cols.length - 1];
    const to = cols.find(c => Math.abs(c.s - from.s) >= tape.total * 0.06) || from;
    const g = ctx.createLinearGradient(from.top.x + (from.bot.x - from.top.x) * 0.5, from.top.y + (from.bot.y - from.top.y) * 0.5,
      to.top.x + (to.bot.x - to.top.x) * 0.5, to.top.y + (to.bot.y - to.top.y) * 0.5);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

// ---- 边缘厚度：纸厚是物理常量，一律 1~2px 绝对像素。
// 下缘暗带、上缘细亮线、左右端头纸断面各自独立绘制，不连成一圈闭合描边。
function drawEdgeBevel(ctx, tape) {
  const strokeEdge = (pts, width, color, blur) => {
    if (pts.length < 2) return;
    ctx.save();
    if (supportsFilter) ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  };

  // 下缘暗带：描边 2px，被胶带裁剪后内侧露出约 1px
  strokeEdge(tape.bot, 2, 'rgba(52, 40, 26, 0.18)', 0.7);
  // 上缘 0.5px 细亮线
  strokeEdge(tape.top, 1, 'rgba(255, 255, 255, 0.06)', 0.6);
  // 左右端头：独立的纸断面，不与上下缘相连
  strokeEdge(tape.leftEnd, 2, 'rgba(52, 40, 26, 0.14)', 0.5);
  strokeEdge(tape.rightEnd, 2, 'rgba(52, 40, 26, 0.14)', 0.5);
}

// ---- 纹理：逐三角形仿射贴图，u 只由弧长决定，所以折点处接缝为零 ----
function drawMeshTexture(ctx, tape, texture) {
  const pattern = ctx.createPattern(texture.image, 'repeat');
  if (!pattern) return;

  const tw = texture.image.naturalWidth || texture.image.width;
  const th = texture.image.naturalHeight || texture.image.height;
  const perPx = th / tape.widthPx; // 纹理像素 / 画布像素
  const cols = tape.cols;

  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i];
    const b = cols[i + 1];
    const ua = a.s * perPx;
    const ub = b.s * perPx;

    const A = { x: a.top.x, y: a.top.y, u: ua, v: 0 };
    const B = { x: b.top.x, y: b.top.y, u: ub, v: 0 };
    const C = { x: b.bot.x, y: b.bot.y, u: ub, v: 1 };
    const D = { x: a.bot.x, y: a.bot.y, u: ua, v: 1 };

    texturedTriangle(ctx, pattern, tw, th, A, B, D);
    texturedTriangle(ctx, pattern, tw, th, B, C, D);
  }
}

function texturedTriangle(ctx, pattern, tw, th, p0, p1, p2) {
  const den = p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y);
  if (Math.abs(den) < 0.5) return; // 画布空间退化，跳过

  const x0 = p0.u * tw;
  const y0 = p0.v * th;
  const x1 = p1.u * tw;
  const y1 = p1.v * th;
  const x2 = p2.u * tw;
  const y2 = p2.v * th;

  const texDet = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(texDet) < 0.5) return;

  // 纹理空间 → 画布空间的 affine
  const a = (p0.x * (y1 - y2) + p1.x * (y2 - y0) + p2.x * (y0 - y1)) / texDet;
  const b = (p0.y * (y1 - y2) + p1.y * (y2 - y0) + p2.y * (y0 - y1)) / texDet;
  const c = (p0.x * (x2 - x1) + p1.x * (x0 - x2) + p2.x * (x1 - x0)) / texDet;
  const d = (p0.y * (x2 - x1) + p1.y * (x0 - x2) + p2.y * (x1 - x0)) / texDet;
  const e = (p0.x * (x1 * y2 - x2 * y1) + p1.x * (x2 * y0 - x0 * y2) + p2.x * (x0 * y1 - x1 * y0)) / texDet;
  const f = (p0.y * (x1 * y2 - x2 * y1) + p1.y * (x2 * y0 - x0 * y2) + p2.y * (x0 * y1 - x1 * y0)) / texDet;

  // 裁剪多边形沿每条边的外法线扩 1.2px，盖住相邻三角形的抗锯齿边
  const clipTri = inflateTriangle(p0, p1, p2, 1.2);

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    if (i === 0) ctx.moveTo(clipTri[i].x, clipTri[i].y);
    else ctx.lineTo(clipTri[i].x, clipTri[i].y);
  }
  ctx.closePath();
  ctx.clip();

  ctx.setTransform(a, b, c, d, e, f);
  ctx.fillStyle = pattern;
  // 填充范围要比三角形本身多扩几像素：裁剪多边形已外扩 1.2px（约 3 个纹理像素），
  // 填充必须盖满外扩后的区域，否则边界处会漏出底色形成发丝缝。
  const pad = 4;
  const minX = Math.min(x0, x1, x2) - pad;
  const maxX = Math.max(x0, x1, x2) + pad;
  const minY = Math.min(y0, y1, y2) - pad;
  const maxY = Math.max(y0, y1, y2) + pad;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
}

// 三角形沿三条边的外法线各自外扩 dist，再求相邻偏移线的交点。
// 不能按「重心放射」扩：列三角形很细长，长边的方向几乎与重心连线平行，
// 放射扩会让那条边几乎不动，列与列之间就留下 1px 的 AA 缝。
function inflateTriangle(p0, p1, p2, dist) {
  const pts = [p0, p1, p2];
  const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
  const sgn = area >= 0 ? 1 : -1;

  const lines = [];
  for (let i = 0; i < 3; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 3];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    const nx = (sgn * ey) / len;
    const ny = (-sgn * ex) / len;
    lines.push({ px: a.x + nx * dist, py: a.y + ny * dist, ex, ey });
  }

  const out = [];
  const maxLen = dist * 6;
  for (let i = 0; i < 3; i++) {
    const l1 = lines[(i + 2) % 3];
    const l2 = lines[i];
    const det = l1.ex * l2.ey - l1.ey * l2.ex;
    if (Math.abs(det) < 1e-6) {
      out.push(pts[i]);
      continue;
    }
    const t = ((l2.px - l1.px) * l2.ey - (l2.py - l1.py) * l2.ex) / det;
    const x = l1.px + l1.ex * t;
    const y = l1.py + l1.ey * t;
    const dx = x - pts[i].x;
    const dy = y - pts[i].y;
    const l = Math.hypot(dx, dy);
    if (l > maxLen) {
      out.push({ x: pts[i].x + (dx / l) * maxLen, y: pts[i].y + (dy / l) * maxLen });
    } else {
      out.push({ x, y });
    }
  }
  return out;
}

// ---- 凹凸：把 (s, v) 比例转成画布坐标 ----
// s 是弧长比例 [0,1]，v 是宽度方向比例 [0=上边,1=下边]。
function colAt(tape, s) {
  const cols = tape.cols;
  if (s <= cols[0].s) return { top: cols[0].top, bot: cols[0].bot };
  const last = cols[cols.length - 1];
  if (s >= last.s) return { top: last.top, bot: last.bot };

  let lo = 0, hi = cols.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cols[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = cols[lo], b = cols[hi];
  const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return {
    top: { x: a.top.x + (b.top.x - a.top.x) * f, y: a.top.y + (b.top.y - a.top.y) * f },
    bot: { x: a.bot.x + (b.bot.x - a.bot.x) * f, y: a.bot.y + (b.bot.y - a.bot.y) * f },
  };
}

function pointAt(tape, sFrac, vFrac) {
  const { top, bot } = colAt(tape, sFrac * tape.total);
  return {
    x: top.x + (bot.x - top.x) * vFrac,
    y: top.y + (bot.y - top.y) * vFrac,
  };
}

// ---- 凹凸光影：纯代码模拟凸起，无需法线贴图 ----
// 凸起不是硬纸板，光影要柔：落影用大模糊、低透明度的柔和投影，
// 边缘受光/背光用模糊描边（而不是硬边带），整体只提亮一点点。
// 光源方向：左上（与胶带自身的上下边高光方向一致）。

// 角的形状沿胶带参数空间生成（s 沿长度、v 横跨），两条边按「屏幕像素上 45°」的
// 斜率逐步推进：每一步都用当下的 1 个单位 v 折算成多少单位 s（localK），
// 所以顶点在屏幕上确实是 90°，折弯处也能跟着胶带走。
function localK(tape, s) {
  const p = Math.max(0.01, Math.min(0.99, s));
  const a = colAt(tape, (p - 0.01) * tape.total);
  const b = colAt(tape, (p + 0.01) * tape.total);
  const su = Math.hypot(
    (b.top.x + b.bot.x - a.top.x - a.bot.x) / 2,
    (b.top.y + b.bot.y - a.top.y - a.bot.y) / 2,
  ) / 0.02;
  const f = colAt(tape, p * tape.total);
  const vu = Math.hypot(f.bot.x - f.top.x, f.bot.y - f.top.y);
  return su > 0.001 ? vu / su : 0;
}

function bumpPoints(tape, bump) {
  if (bump.kind !== 'corner') {
    if (!bump.poly) return [];
    return jitterPts(bump.poly.map(p => pointAt(tape, p.s, p.v)), 0.5, 2.9);
  }

  const STEPS = 12;
  const dv = 3 / STEPS;
  const legs = [[], []];
  for (let side = 0; side < 2; side++) {
    let s = bump.apex.s;
    let v = bump.apex.v;
    for (let i = 0; i < STEPS; i++) {
      s += (side ? 1 : -1) * localK(tape, s) * dv;
      v += dv;
      legs[side].push({ s, v });
    }
  }
  const poly = [{ s: bump.apex.s, v: bump.apex.v }, ...legs[0], ...legs[1].reverse()];
  return jitterPts(poly.map(p => pointAt(tape, p.s, p.v)), 0.5, 1.3);
}

// 轮廓点沿法线加 ±amp 的低频平滑抖动（非逐点随机），去掉完美多边形的塑料感
function jitterPts(pts, amp, seed) {
  const m = pts.length;
  if (m < 3) return pts;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + m) % m];
    const next = pts[(i + 1) % m];
    let nx = -(next.y - prev.y);
    let ny = next.x - prev.x;
    const l = Math.hypot(nx, ny) || 1;
    const j = (Math.sin(i * 0.9 + seed) * 0.6 + Math.sin(i * 0.37 + seed * 2.7 + 1.1) * 0.4) * amp;
    return { x: p.x + (nx / l) * j, y: p.y + (ny / l) * j };
  });
}

// 方向性窄带：描边被裁剪后只留轮廓内侧一半，再用「左上→右下」的线性渐变
// 做 destination-in 遮罩 —— 暗带只在背光（右下）侧显示，亮线只在受光（左上）侧显示，
// 转角处自然过渡，不会在四个方向同时长侧壁。
let bandCanvas = null;
function directionalBand(ctx, path, bbox, { width, color, blur, flip }) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (!bandCanvas) bandCanvas = document.createElement('canvas');
  if (bandCanvas.width !== W || bandCanvas.height !== H) {
    bandCanvas.width = W;
    bandCanvas.height = H;
  }
  const o = bandCanvas.getContext('2d');
  o.clearRect(0, 0, W, H);

  o.save();
  o.clip(path);
  if (supportsFilter && blur) o.filter = `blur(${blur}px)`;
  o.strokeStyle = color;
  o.lineWidth = width;
  o.lineJoin = 'round';
  o.stroke(path);
  o.restore();

  o.globalCompositeOperation = 'destination-in';
  const g = o.createLinearGradient(bbox.x0, bbox.y0, bbox.x1, bbox.y1);
  if (flip) {
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(0.45, 'rgba(0, 0, 0, 0.3)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)');
    g.addColorStop(1, 'rgba(0, 0, 0, 1)');
  }
  o.fillStyle = g;
  o.fillRect(0, 0, W, H);

  ctx.drawImage(bandCanvas, 0, 0);
}

// ---- 凹凸光影：凸起 = 胶带被底下的东西垫起，同纸同色。
// 标准图层顺序：胶带平面 → 凸起的落影 → 凸起面（盖住落影内缘） → 接缝 AO → 方向性侧壁。
// 顶面不提亮（最多 0.04 平铺白），立体感全交给影子和窄带，光源统一左上。
function drawBump(ctx, tape, bump, texture) {
  if (!bump) return;
  const pts = bumpPoints(tape, bump);
  if (!pts || pts.length < 3) return;

  const raised = new Path2D();
  raised.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) raised.lineTo(pts[i].x, pts[i].y);
  raised.closePath();

  // 1) 接触影：极短、极淡，只朝右下溢出一点点
  ctx.save();
  if (supportsFilter) {
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = 'rgba(42, 34, 23, 0.07)';
    ctx.translate(1, 1.5);
    ctx.fill(raised);
    ctx.filter = 'none';
  } else {
    ctx.shadowColor = 'rgba(42, 34, 23, 0.09)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.001)';
    ctx.fill(raised);
  }
  ctx.restore();

  // 2) 凸起面：同纸同色，原样重铺纹理（同时盖住落影内缘），
  //    平铺 0.05 白——只比周围亮 2~3 级灰度，不要渐变
  ctx.save();
  ctx.clip(raised);
  drawMeshTexture(ctx, tape, texture);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  // 3) 接缝 AO：轮廓内侧一整圈约 1.5px 的窄暗带，「纸贴实了」的关键证据
  ctx.save();
  ctx.clip(raised);
  if (supportsFilter) ctx.filter = 'blur(0.8px)';
  ctx.strokeStyle = 'rgba(52, 42, 30, 0.13)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke(raised);
  ctx.restore();

  // 4) 侧壁：只在右下侧 1px 暗带（alpha 0.12），左上侧不加任何东西
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  directionalBand(ctx, raised, { x0, y0, x1, y1 }, {
    width: 2, color: 'rgba(48, 38, 26, 0.12)', blur: 0.6, flip: false,
  });
}

// renderer.js —— 胶带渲染
// 层次：柔和投影 → 连续纹理网格 → 折痕明暗 → 上下边缘的高光/暗线 → 轮廓

import { buildTape } from './geometry.js';

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

  ctx.save();
  ctx.clip(path);
  drawMeshTexture(ctx, tape, texture);
  drawFoldShading(ctx, tape, params, W, H);
  drawEndShading(ctx, tape, params);
  drawBump(ctx, tape, params.bump);
  drawEdgeLight(ctx, tape);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(43, 35, 24, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();

  return tape;
}

// ---- 投影：贴纸式阴影，贴着纸面，几乎不外扩 ----
// 之前的 18px 模糊 + 16px 偏移会让胶带看起来悬在半空，
// 这里收紧成「近距离接触影」：偏移 2~4px、模糊 8px 以内、透明度更低。
function drawShadow(ctx, path) {
  if (supportsFilter) {
    ctx.save();
    ctx.filter = 'blur(8px)';
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#2b2318';
    ctx.translate(3, 4);
    ctx.fill(path);
    ctx.restore();

    ctx.save();
    ctx.filter = 'blur(2.5px)';
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#2b2318';
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

// ---- 折痕：跨过胶带的暗带 + 折线上一道亮檐 ----
function drawFoldShading(ctx, tape, params, W, H) {
  const w = params.widthPx;

  for (const f of tape.folds) {
    const gx0 = f.x - f.t.x * w * 0.55;
    const gy0 = f.y - f.t.y * w * 0.55;
    const gx1 = f.x + f.t.x * w * 0.55;
    const gy1 = f.y + f.t.y * w * 0.55;

    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, 'rgba(52, 42, 30, 0)');
    g.addColorStop(0.38, 'rgba(52, 42, 30, 0.14)');
    g.addColorStop(0.5, 'rgba(52, 42, 30, 0.2)');
    g.addColorStop(0.62, 'rgba(52, 42, 30, 0.08)');
    g.addColorStop(1, 'rgba(52, 42, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(f.x - f.n.x * w, f.y - f.n.y * w);
    ctx.lineTo(f.x + f.n.x * w, f.y + f.n.y * w);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- 卷边 / 翘起：末端一段加暗或提亮 ----
function drawEndShading(ctx, tape, params) {
  const style = params.foldStyle;
  if (style !== 'curl' && style !== 'lift') return;

  const cols = tape.cols;
  const total = tape.total;
  const from = style === 'curl' ? 0.82 : 0.72;
  let start = cols[cols.length - 1];
  for (const col of cols) {
    if (col.s / total >= from) { start = col; break; }
  }
  const end = cols[cols.length - 1];

  const g = ctx.createLinearGradient(start.cR.x, start.cR.y, end.cR.x, end.cR.y);
  if (style === 'curl') {
    g.addColorStop(0, 'rgba(38, 30, 20, 0)');
    g.addColorStop(1, 'rgba(38, 30, 20, 0.42)');
  } else {
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.34)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 末端边缘：卷边压一道暗线，翘起加一条亮边
  ctx.save();
  ctx.lineWidth = Math.max(1, params.widthPx * 0.012);
  ctx.strokeStyle = style === 'curl' ? 'rgba(30, 24, 16, 0.5)' : 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.moveTo(end.top.x, end.top.y);
  ctx.lineTo(end.bot.x, end.bot.y);
  ctx.stroke();
  ctx.restore();
}

// ---- 上边高光、下边暗线：一条胶带卷起来的立体感 ----
function drawEdgeLight(ctx, tape) {
  ctx.save();
  ctx.lineWidth = 1.2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.beginPath();
  ctx.moveTo(tape.top[0].x, tape.top[0].y);
  for (let i = 1; i < tape.top.length; i++) ctx.lineTo(tape.top[i].x, tape.top[i].y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(43, 35, 24, 0.14)';
  ctx.beginPath();
  ctx.moveTo(tape.bot[0].x, tape.bot[0].y);
  for (let i = 1; i < tape.bot.length; i++) ctx.lineTo(tape.bot[i].x, tape.bot[i].y);
  ctx.stroke();

  ctx.restore();
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
// 思路：凸起多边形 = 顶面。用三段画法骗出立体感：
//   1) 投影：把凸起多边形沿「光的反方向」平移，画在凸起之外的平面上 → 落影
//   2) 内高光：凸起面整体提亮，左上边缘再叠亮 → 顶面受光
//   3) 内阴影：右下边缘叠暗 → 立壁背光
// 光源方向：左上（与胶带自身的上下边高光方向一致）。
function drawBump(ctx, tape, bump) {
  if (!bump || !bump.poly || bump.poly.length < 3) return;

  const pts = bump.poly.map(p => pointAt(tape, p.s, p.v));
  const raised = new Path2D();
  raised.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) raised.lineTo(pts[i].x, pts[i].y);
  raised.closePath();

  const outline = tape.outline;
  const off = 4;

  // 把路径整体平移 dx/dy，用来做边缘差集
  function translatedPath(p, dx, dy) {
    const out = new Path2D();
    out.addPath(p, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    return out;
  }

  // 1) 投影：凸起在平面上的落影（只出现在凸起之外）
  //    用 evenodd 把凸起多边形从胶带轮廓里抠掉，再给凸起加右下投影，
  //    凸起本身被 clip 掉，只有影子落到平面上。
  ctx.save();
  const tapeWithHole = new Path2D();
  tapeWithHole.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) tapeWithHole.lineTo(outline[i].x, outline[i].y);
  tapeWithHole.closePath();
  tapeWithHole.addPath(raised);
  ctx.clip(tapeWithHole, 'evenodd');

  ctx.shadowColor = 'rgba(40, 32, 22, 0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#000';
  ctx.fill(raised);
  ctx.restore();

  // 2) 凸起面整体提亮 + 边缘高光/阴影
  ctx.save();
  ctx.clip(raised);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 左上内高光：凸起外轮廓 减去 向右下偏移后的凸起 = 左上边缘带
  const hlRim = new Path2D();
  hlRim.addPath(raised);
  hlRim.addPath(translatedPath(raised, off, off));
  ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill(hlRim, 'evenodd');

  // 右下内阴影：凸起外轮廓 减去 向左上偏移后的凸起 = 右下边缘带
  const shRim = new Path2D();
  shRim.addPath(raised);
  shRim.addPath(translatedPath(raised, -off, -off));
  ctx.shadowColor = 'rgba(40, 32, 22, 0.5)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(40, 32, 22, 0.45)';
  ctx.fill(shRim, 'evenodd');

  ctx.restore();
}

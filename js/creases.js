// creases.js —— 折痕：轻皱 / 揉皱 / 单斜翘
// 全局约定：
//   光源固定在左上；每条折痕 = 暗线 + 亮线一对，
//   暗线在折痕右下侧、亮线在左上侧，间距约 1px；
//   折痕形状为带轻微弯曲的二次贝塞尔，全部画在胶带裁剪区内，到边自动截断。
// 揉皱不程序生成曲线（密集随机曲线会假），用预烘焙的透明底 PNG 叠加。

import { DEG } from './geometry.js';

const supportsFilter = (() => {
  try {
    const c = document.createElement('canvas').getContext('2d');
    c.filter = 'blur(1px)';
    return c.filter === 'blur(1px)';
  } catch (e) {
    return false;
  }
})();

// 确定性随机数（每次生成胶带换种子 → 两次不出一样的褶）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 胶带是水平直线，直接由上下边缘端点插值取 (s,v) 参数坐标
function mapper(tape) {
  const n = tape.top.length - 1;
  const t0 = tape.top[0], t1 = tape.top[n];
  const b0 = tape.bot[0], b1 = tape.bot[n];
  return (s, v) => ({
    x: (t0.x + (t1.x - t0.x) * s) * (1 - v) + (b0.x + (b1.x - b0.x) * s) * v,
    y: (t0.y + (t1.y - t0.y) * s) * (1 - v) + (b0.y + (b1.y - b0.y) * s) * v,
  });
}

function quadPath(p0, p1, p2) {
  const path = new Path2D();
  path.moveTo(p0.x, p0.y);
  path.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
  return path;
}

// 画一条折痕对：暗线偏右下、亮线偏左上
function strokePair(ctx, path, darkAlpha, brightAlpha, darkW = 1, brightW = 1) {
  ctx.save();
  ctx.translate(0.4, 0.6);
  if (supportsFilter) ctx.filter = 'blur(0.4px)';
  ctx.strokeStyle = `rgba(42, 34, 23, ${darkAlpha})`;
  ctx.lineWidth = darkW;
  ctx.stroke(path);
  ctx.restore();

  ctx.save();
  ctx.translate(-0.4, -0.6);
  if (supportsFilter) ctx.filter = 'blur(0.4px)';
  ctx.strokeStyle = `rgba(255, 255, 255, ${brightAlpha})`;
  ctx.lineWidth = brightW;
  ctx.stroke(path);
  ctx.restore();
}

// ---- 轻皱：2~4 条稀疏大折痕，随机散布 ----
function drawLight(ctx, tape, rng) {
  const map = mapper(tape);
  const W = tape.widthPx;
  const count = 2 + Math.floor(rng() * 3); // 2~4 条
  for (let i = 0; i < count; i++) {
    const sC = 0.12 + rng() * 0.76;             // 散布整个表面，不集中在两端
    const vC = 0.30 + rng() * 0.40;
    const aDeg = 30 + rng() * 30 + (rng() - 0.5) * 10; // 与长边 30°~60°，微差 10°
    const a = aDeg * DEG * (rng() < 0.5 ? 1 : -1);
    const len = W * (1 / 3 + rng() / 3);        // 宽度的 1/3~2/3
    const c = map(sC, vC);
    const dx = Math.cos(a), dy = Math.sin(a);
    const p0 = { x: c.x - dx * len / 2, y: c.y - dy * len / 2 };
    const p2 = { x: c.x + dx * len / 2, y: c.y + dy * len / 2 };
    const bend = (5 + rng() * 5) * (rng() < 0.5 ? 1 : -1); // 控制点偏移 5~10px
    const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
    strokePair(ctx, quadPath(p0, p1, p2), 0.08 + rng() * 0.04, 0.05 + rng() * 0.03);
  }
}

// ---- 单斜翘：一条主折痕横贯胶带 + 随机一端翘起投影 ----
function drawSkew(ctx, tape, rng) {
  const map = mapper(tape);
  const W = tape.widthPx;
  const sC = 0.25 + rng() * 0.5;                // 位置随机，不固定中间
  const a = (30 + rng() * 15) * DEG;            // 斜 30°~45°
  // 左下到右上：y 随 x 增大而减小
  const dx = Math.cos(a), dy = -Math.sin(a);
  const len = (W * 1.2) / Math.sin(a);          // 横贯整条胶带，出头被裁掉
  const c = map(sC, 0.5);
  const p0 = { x: c.x - dx * len / 2, y: c.y - dy * len / 2 };
  const p2 = { x: c.x + dx * len / 2, y: c.y + dy * len / 2 };
  const bend = (2 + rng() * 3) * (rng() < 0.5 ? 1 : -1); // 接近直线，轻微弧度
  const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
  strokePair(ctx, quadPath(p0, p1, p2), 0.15 + rng() * 0.05, 0.10 + rng() * 0.05);

  // 翘起投影：随机选折痕一端，影子落在折痕右下侧的半平面内
  const end = rng() < 0.5 ? p0 : p2;
  const inX = end === p0 ? dx : -dx;            // 从端点向里的方向
  const inY = end === p0 ? dy : -dy;
  const nx = -dy, ny = dx;                      // 右下法线（本角度范围内恒指向右下）
  const big = tape.total;
  const hp = new Path2D();
  hp.moveTo(p0.x, p0.y);
  hp.lineTo(p2.x, p2.y);
  hp.lineTo(p2.x + nx * big, p2.y + ny * big);
  hp.lineTo(p0.x + nx * big, p0.y + ny * big);
  hp.closePath();

  ctx.save();
  ctx.clip(hp);
  ctx.translate(1.5, 2);
  if (supportsFilter) ctx.filter = 'blur(5px)';
  ctx.strokeStyle = 'rgba(42, 34, 23, 0.09)';
  ctx.lineWidth = W * 0.22;
  ctx.lineCap = 'round';
  const seg = len * 0.20;
  ctx.beginPath();
  ctx.moveTo(end.x + inX * seg * 0.1, end.y + inY * seg * 0.1);
  ctx.lineTo(end.x + inX * seg * 0.8, end.y + inY * seg * 0.8);
  ctx.stroke();
  ctx.restore();
}

// ---- 揉皱：叠预烘焙纹理。按「纹理高 ≈ 2.2× 胶带宽度」等比缩放并居中，
// 水平方向超出部分交给胶带裁剪——线宽和深浅不被压缩，碎痕保持烘焙时的粗细。
function drawCrumple(ctx, tape, img) {
  const n = tape.top.length - 1;
  const x0 = tape.top[0].x;
  const x1 = tape.top[n].x;
  const y0 = tape.top[0].y;
  const y1 = tape.bot[n].y;
  const scale = (tape.widthPx * 2.2) / img.height;
  const w = img.width * scale;
  const h = img.height * scale;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

export function drawCreases(ctx, tape, crease) {
  if (!crease || !crease.style || crease.style === 'smooth') return;
  const rng = mulberry32(crease.seed || 1);
  if (crease.style === 'light') drawLight(ctx, tape, rng);
  else if (crease.style === 'skew') drawSkew(ctx, tape, rng);
  else if (crease.style === 'crumple' && crease.img) drawCrumple(ctx, tape, crease.img);
}

// ---- 烘焙用：在 W×H 透明画布上画一张揉皱纹理 ----
// 短碎痕、随机多方向、互不相交；暗 0.05~0.10、亮 0.03~0.06（密集会叠加，单条要浅）
export function bakeCrumplePattern(ctx, W, H, seed) {
  const rng = mulberry32(seed);
  const pts = [];
  const COUNT = 78;
  let guard = 0;
  while (pts.length < COUNT && guard++ < 8000) {
    const len = 30 + rng() * 90;                // 30~120px 短痕（运行时约缩到一半）
    const x = 50 + rng() * (W - 100);
    const y = 40 + rng() * (H - 80);
    // 与其他痕保持最小距离，避免相交、端点相碰
    const ok = pts.every(p => Math.hypot(p.x - x, p.y - y) > (p.len + len) / 2 + 46);
    if (!ok) continue;
    pts.push({ x, y, len, a: rng() * Math.PI });
  }
  for (const p of pts) {
    const dx = Math.cos(p.a), dy = Math.sin(p.a);
    const p0 = { x: p.x - dx * p.len / 2, y: p.y - dy * p.len / 2 };
    const p2 = { x: p.x + dx * p.len / 2, y: p.y + dy * p.len / 2 };
    const bend = p.len * (0.15 + rng() * 0.25) * (rng() < 0.5 ? 1 : -1); // 短而急
    const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
    // 烘焙尺寸 2048×512，运行时约缩到 0.4~1 倍，线宽和 alpha 都按偏深给
    strokePair(ctx, quadPath(p0, p1, p2), 0.06 + rng() * 0.06, 0.04 + rng() * 0.04, 2.6, 2);
  }
}

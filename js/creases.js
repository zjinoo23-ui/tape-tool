// creases.js —— 折痕：轻皱 / 揉皱 / 单斜翘
// 轻皱、揉皱：素材叠加（透明底长条 PNG，随机横向切片，不拉伸不平铺，素材自带明暗不再画线）
// 单斜翘：程序画的柔边折痕带（fill 渐变带，不用 stroke），三层叠加：
//   中心暗线 2px blur2 · 左上亮边 1.5px blur2 · 右下投影 3~5px 渐隐 blur3
// 光源统一左上：亮边在左上，暗线和投影在右下。所有折痕由调用方 clip 在胶带内。

import { DEG } from './geometry.js';
import { textureBaseColor } from './renderer.js';

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

// ---- 素材叠加：等比缩放（宽度对齐带宽，胶带更长时按长度对齐并垂直居中裁剪），
// 随机取横向切片位置，不拉伸不平铺。
// 素材是白底 AO 明暗图，用「明度」混合叠加：只把素材的明暗搬到胶带上，
// 保留胶带本身的色相/饱和度，不会像 multiply 那样整体压暗发脏。
// 但明度混合会整体替换亮度——深色胶带会被素材的亮底洗白。
// 所以素材先按「胶带均色亮度」归一化：平均亮度对齐到胶带，折痕的相对明暗不变。
function drawSlice(ctx, tape, img, rng, texture) {
  const n = tape.top.length - 1;
  const x0 = tape.top[0].x;
  const x1 = tape.top[n].x;
  const y0 = tape.top[0].y;
  const y1 = tape.bot[n].y;
  const tapeLen = x1 - x0;
  const scale = Math.max(tape.widthPx / img.height, tapeLen / img.width);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const offX = rng() * Math.max(0, drawW - tapeLen);
  const cy = (y0 + y1) / 2;
  const normalized = texture ? normalizeLum(img, tapeLum(texture)) : img;
  ctx.save();
  ctx.globalCompositeOperation = 'luminosity';
  ctx.drawImage(normalized, x0 - offX, cy - drawH / 2, drawW, drawH);
  ctx.restore();
}

// 胶带均色的相对亮度（0~1）
function tapeLum(texture) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(textureBaseColor(texture));
  if (!m) return 0.9;
  return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
}

// 把素材的平均亮度缩放到 targetLum，折痕的相对明暗差保持不变。结果按素材+目标亮度分档缓存。
const normCache = new WeakMap();
function normalizeLum(img, targetLum) {
  const bucket = Math.round(targetLum * 20) / 20; // 5% 一档，避免无谓重算
  let entry = normCache.get(img);
  if (entry && entry.bucket === bucket) return entry.canvas;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const m = c.getContext('2d', { willReadFrequently: true });
  m.drawImage(img, 0, 0);
  const d = m.getImageData(0, 0, w, h);
  const px = d.data;

  let sum = 0;
  const count = w * h;
  for (let i = 0; i < px.length; i += 4) {
    sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  }
  const mean = sum / count / 255 || 1;
  const k = bucket / mean;

  for (let i = 0; i < px.length; i += 4) {
    px[i] = Math.min(255, px[i] * k);
    px[i + 1] = Math.min(255, px[i + 1] * k);
    px[i + 2] = Math.min(255, px[i + 2] * k);
  }
  m.putImageData(d, 0, 0);

  normCache.set(img, { bucket, canvas: c });
  return c;
}

// ================= 单斜翘：柔边折痕带 =================

// 二次贝塞尔采样：返回 [{p, t(切线), n(右下法线)}]
function sampleQuad(p0, p1, p2, count) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
    let tx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    let ty = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    // 右下法线
    let nx = -ty, ny = tx;
    if (nx + ny < 0) { nx = -nx; ny = -ny; }
    pts.push({ t, x, y, nx, ny });
  }
  return pts;
}

// 画一条柔边带：沿路径、左右两侧各有宽度剖面，颜色/alpha 可沿长度渐变，整体 blur
// leftW(t)/rightW(t) 是沿法线两侧（负侧=左上，正侧=右下）的宽度剖面函数
// alphaFn(t) 返回该处的整体透明度系数（含两端渐隐）
function softRibbon(ctx, tape, pts, { leftW, rightW, color, alphaFn, blur }) {
  // 胶带包围盒 + blur 余量
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of tape.outline) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const pad = 20;
  const c = document.createElement('canvas');
  c.width = Math.ceil(x1 - x0) + pad * 2;
  c.height = Math.ceil(y1 - y0) + pad * 2;
  const m = c.getContext('2d');
  m.translate(-x0 + pad, -y0 + pad);

  // 带的轮廓：左边界正向 + 右边界反向
  const path = new Path2D();
  path.moveTo(pts[0].x - pts[0].nx * leftW(pts[0].t), pts[0].y - pts[0].ny * leftW(pts[0].t));
  for (const s of pts) path.lineTo(s.x - s.nx * leftW(s.t), s.y - s.ny * leftW(s.t));
  for (let i = pts.length - 1; i >= 0; i--) {
    const s = pts[i];
    path.lineTo(s.x + s.nx * rightW(s.t), s.y + s.ny * rightW(s.t));
  }
  path.closePath();
  m.fillStyle = '#fff';
  m.fill(path);

  // 沿路径方向的 alpha 剖面：用线性渐变近似（折痕接近直线）。
  // 注意先复位变换，否则 destination-in 的填充矩形盖不满画布，会把右半截蒙版清零。
  m.setTransform(1, 0, 0, 1, 0, 0);
  const pA = pts[0];
  const pB = pts[pts.length - 1];
  const g = m.createLinearGradient(pA.x - x0 + pad, pA.y - y0 + pad, pB.x - x0 + pad, pB.y - y0 + pad);
  const STOPS = 24;
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    g.addColorStop(t, `rgba(255,255,255,${alphaFn(t)})`);
  }
  m.globalCompositeOperation = 'destination-in';
  m.fillStyle = g;
  m.fillRect(0, 0, c.width, c.height);

  // 上色
  m.globalCompositeOperation = 'source-in';
  m.fillStyle = color;
  m.fillRect(0, 0, c.width, c.height);

  ctx.save();
  if (supportsFilter) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(c, x0 - pad, y0 - pad);
  ctx.restore();
}

function drawSkew(ctx, tape, rng) {
  const W = tape.widthPx;
  const n = tape.top.length - 1;
  const tx0 = tape.top[0], tx1 = tape.top[n];
  const bx0 = tape.bot[0], bx1 = tape.bot[n];
  const map = (s, v) => ({
    x: (tx0.x + (tx1.x - tx0.x) * s) * (1 - v) + (bx0.x + (bx1.x - bx0.x) * s) * v,
    y: (tx0.y + (tx1.y - tx0.y) * s) * (1 - v) + (bx0.y + (bx1.y - bx0.y) * s) * v,
  });

  const a = (25 + rng() * 25) * DEG;              // 25°~50°
  const dx = Math.cos(a), dy = -Math.sin(a);      // 左下 → 右上
  const len = (W * 0.86) / Math.sin(a);           // 两端留在胶带内部，不顶到边缘
  const sC = 0.22 + rng() * 0.56;                 // 纵向位置随机
  const vC = 0.40 + rng() * 0.20;
  const c = map(sC, vC);
  const p0 = { x: c.x - dx * len / 2, y: c.y - dy * len / 2 };
  const p2 = { x: c.x + dx * len / 2, y: c.y + dy * len / 2 };
  const bend = (3 + rng() * 2) * (rng() < 0.5 ? 1 : -1);  // 控制点偏移 3~5px
  const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
  const pts = sampleQuad(p0, p1, p2, 48);

  const liftRight = rng() < 0.5;                  // 翘起端：左或右
  const liftT = t => (liftRight ? t : 1 - t);     // 越靠近翘起端越大
  const endFade = t => Math.min(1, Math.min(t, 1 - t) / 0.12); // 两端 12% 渐隐到 0
  const mid = t => Math.sin(Math.PI * t);         // 中点 1、两端 0

  // alpha 先定好（blur 会把峰值摊薄约 2/3，源值给足，画出来才是 0.15~0.20 的观感）
  const projA = 0.10 + rng() * 0.03;
  const darkA = 0.26 + rng() * 0.05;
  const liteA = 0.13 + rng() * 0.04;

  // 1) 右下投影：从中点向翘起端逐渐变宽变深，非翘起端很弱
  softRibbon(ctx, tape, pts, {
    leftW: () => -1.2,                            // 从暗线外侧（右下 1.2px 处）起
    rightW: t => -1.2 + (2.2 + 2.8 * liftT(t)) * (0.35 + 0.65 * mid(t)),
    color: 'rgb(42, 34, 23)',
    alphaFn: t => projA * (0.30 + 0.70 * liftT(t)) * endFade(t),
    blur: 2.5,
  });

  // 2) 中心暗线：宽 2px，中点最宽、两端渐窄到 1px 消失
  softRibbon(ctx, tape, pts, {
    leftW: t => (0.5 + 0.7 * mid(t)),
    rightW: t => (0.5 + 0.7 * mid(t)),
    color: 'rgb(42, 34, 23)',
    alphaFn: t => darkA * endFade(t),
    blur: 1.6,
  });

  // 3) 左上亮边：紧邻暗线上侧，宽 1.5px
  softRibbon(ctx, tape, pts, {
    leftW: t => (0.5 + 0.7 * mid(t)) + (0.35 + 0.4 * mid(t)),
    rightW: t => (0.5 + 0.7 * mid(t)),
    color: 'rgb(255, 255, 255)',
    alphaFn: t => liteA * endFade(t),
    blur: 1.6,
  });
}

export function drawCreases(ctx, tape, crease, texture) {
  if (!crease || !crease.style || crease.style === 'smooth') return;
  const rng = mulberry32(crease.seed || 1);
  if (crease.style === 'light') {
    if (crease.lightImg) drawSlice(ctx, tape, crease.lightImg, rng, texture);
  } else if (crease.style === 'crumple') {
    const imgs = crease.crumpleImgs || [];
    if (imgs.length) drawSlice(ctx, tape, imgs[Math.floor(rng() * imgs.length)], rng, texture);
  } else if (crease.style === 'skew') {
    drawSkew(ctx, tape, rng);
  }
}

// ================= 烘焙（tools/ 下的烘焙页使用，产物是透明底 PNG） =================

function strokePair(ctx, path, dir, darkAlpha, brightAlpha, darkW) {
  let nx = -dir.y, ny = dir.x;
  const l = Math.hypot(nx, ny) || 1;
  nx /= l; ny /= l;
  if (nx + ny < 0) { nx = -nx; ny = -ny; }
  ctx.save();
  ctx.translate(nx * 0.8, ny * 0.8);
  ctx.filter = 'blur(0.8px)';
  ctx.strokeStyle = `rgba(42, 34, 23, ${darkAlpha})`;
  ctx.lineWidth = darkW;
  ctx.stroke(path);
  ctx.restore();
  ctx.save();
  ctx.translate(-nx * 0.8, -ny * 0.8);
  ctx.filter = 'blur(0.8px)';
  ctx.strokeStyle = `rgba(255, 255, 255, ${brightAlpha})`;
  ctx.lineWidth = darkW * 0.7;
  ctx.stroke(path);
  ctx.restore();
}

// 轻皱素材：2000×300，2~4 条稀疏大折痕，接近直线、自然微弯
export function bakeLightPattern(ctx, W, H, seed) {
  const rng = mulberry32(seed);
  const count = 2 + Math.floor(rng() * 3);        // 2~4 条
  const baseA = 20 + rng() * 25;
  for (let i = 0; i < count; i++) {
    const aDeg = baseA + (rng() - 0.5) * 16;
    const sign = rng() < 0.75 ? 1 : -1;
    const a = aDeg * DEG * sign;
    const len = H * (0.5 + rng() * 0.25);         // 1/2~3/4 带宽
    const cx = 60 + rng() * (W - 120);
    const cy = H * (0.2 + rng() * 0.6);
    const dx = Math.cos(a), dy = Math.sin(a);
    const p0 = { x: cx - dx * len / 2, y: cy - dy * len / 2 };
    const p2 = { x: cx + dx * len / 2, y: cy + dy * len / 2 };
    const bend = (4 + rng() * 4) * (rng() < 0.5 ? 1 : -1);
    const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
    const path = new Path2D();
    path.moveTo(p0.x, p0.y);
    path.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    strokePair(ctx, path, { x: dx, y: dy }, 0.13 + rng() * 0.05, 0.08 + rng() * 0.04, 2.2);
  }
}

// 揉皱素材：2000×300，折线折痕（2~4 段），细密不规则，允许交叉
export function bakeCrumplePattern(ctx, W, H, seed) {
  const rng = mulberry32(seed);
  const COUNT = 34;
  const margin = 16;
  for (let i = 0; i < COUNT; i++) {
    const total = H * (1 / 6 + rng() / 6);        // 1/6~1/3 带宽
    const segs = 2 + Math.floor(rng() * 3);
    let a = rng() * Math.PI * 2;
    let x = margin + rng() * (W - margin * 2);
    let y = margin + rng() * (H - margin * 2);
    const path = new Path2D();
    path.moveTo(x, y);
    const segLen = total / segs;
    for (let k = 0; k < segs; k++) {
      a += (rng() - 0.5) * 80 * DEG;
      x += Math.cos(a) * segLen;
      y += Math.sin(a) * segLen;
      path.lineTo(x, y);
    }
    strokePair(ctx, path, { x: Math.cos(a), y: Math.sin(a) },
      0.10 + rng() * 0.05, 0.06 + rng() * 0.04, 1.8);
  }
}

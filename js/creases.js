// creases.js —— 折痕：轻皱 / 揉皱 / 斜痕
// 三种效果统一为素材叠加：每张素材是白底 AO 明暗图（2000×500），渲染时
//   · 按胶带宽度等比缩放（胶带更长时按长度对齐、垂直居中裁剪）
//   · 随机取一个横向切片位置，不拉伸、不平铺
//   · 用「明度」混合叠加，只把素材的明暗搬到胶带上，保留胶带本身的色相/饱和度
// 素材自带折痕明暗，不再额外画折痕线。所有折痕由调用方 clip 在胶带内。

import { textureBaseColor } from './assets.js';

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

// 明度混合会整体替换亮度——深色胶带会被素材的亮底洗白。
// 所以素材先按「胶带均色亮度」归一化：平均亮度对齐到胶带，折痕的相对明暗不变。
function drawSlice(ctx, tape, img, rng, texture) {
  // 覆盖范围用胶带轮廓的包围盒，而不是首末列之间的矩形：
  // 波浪/手撕的端面会凸出首末列若干像素，用矩形贴会把端头空出来。
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of tape.outline) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const scale = Math.max(boxH / img.height, boxW / img.width);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const offX = rng() * Math.max(0, drawW - boxW);
  const normalized = texture ? normalizeLum(img, tapeLum(texture)) : img;
  ctx.save();
  ctx.globalCompositeOperation = 'luminosity';
  ctx.drawImage(normalized, x0 - offX, (y0 + y1) / 2 - drawH / 2, drawW, drawH);
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
  const entry = normCache.get(img);
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

export function drawCreases(ctx, tape, crease, texture) {
  if (!crease || !crease.style || crease.style === 'smooth') return;
  const imgs = (crease.imgs || {})[crease.style] || [];
  if (!imgs.length) return;
  const rng = mulberry32(crease.seed || 1);
  drawSlice(ctx, tape, imgs[Math.floor(rng() * imgs.length)], rng, texture);
}

// creases.js —— 折痕：轻皱 / 揉皱 / 单斜翘
// 全局约定（光源固定在左上）：
//   每条折痕 = 暗线 + 亮线成对；暗线在右下侧、亮线在左上侧，中心间距 1px，各宽 1px，blur 0.3~0.5。
//   远看两条线合成一条「有宽度的折痕带」，这是折痕能被读出来的关键。
//   折痕全部 clip 在胶带内（由调用方裁剪），到边自动截断。
// 揉皱不程序随机曲线（密集随机曲线会假），用预烘焙的透明底 PNG 叠加；
// 烘焙内容同样是「折线 + 成对明暗线」。

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

// 折痕的「右下法线」：nx > 0、ny > 0。暗线沿它偏移、亮线沿反向偏移。
function rightDownNormal(dx, dy) {
  let nx = -dy;
  let ny = dx;
  const l = Math.hypot(nx, ny) || 1;
  nx /= l; ny /= l;
  if (nx + ny < 0) { nx = -nx; ny = -ny; }
  return { x: nx, y: ny };
}

function quad(p0, p1, p2) {
  const path = new Path2D();
  path.moveTo(p0.x, p0.y);
  path.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
  return { path, dir: { x: p2.x - p0.x, y: p2.y - p0.y } };
}

function polyline(pts) {
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  const dir = { x: pts[pts.length - 1].x - pts[0].x, y: pts[pts.length - 1].y - pts[0].y };
  return { path, dir };
}

// 一对折痕线：暗线偏右下、亮线偏左上，中心距约 1.6px，叠成一条 2~3px 的折痕带。
// 暗线略粗（1.5px）以在浅色纹理上也读得出，亮线 1.1px 只在深浅交界处提一点光。
function strokePair(ctx, path, dir, darkAlpha, brightAlpha, width = 1) {
  const n = rightDownNormal(dir.x, dir.y);

  ctx.save();
  ctx.translate(n.x * 0.8, n.y * 0.8);
  if (supportsFilter) ctx.filter = 'blur(0.45px)';
  ctx.strokeStyle = `rgba(42, 34, 23, ${darkAlpha})`;
  ctx.lineWidth = width * 1.5;
  ctx.stroke(path);
  ctx.restore();

  ctx.save();
  ctx.translate(-n.x * 0.8, -n.y * 0.8);
  if (supportsFilter) ctx.filter = 'blur(0.4px)';
  ctx.strokeStyle = `rgba(255, 255, 255, ${brightAlpha})`;
  ctx.lineWidth = width * 1.1;
  ctx.stroke(path);
  ctx.restore();
}

// ---- 轻皱：3~5 条长折痕，接近直线（只允许一个轻微弧度），多数同向 ----
function drawLight(ctx, tape, rng) {
  const map = mapper(tape);
  const W = tape.widthPx;
  const count = 3 + Math.floor(rng() * 3);        // 3~5 条
  const baseA = 20 + rng() * 30;                  // 基准 20°~50°
  const baseSign = rng() < 0.5 ? 1 : -1;

  for (let i = 0; i < count; i++) {
    const aDeg = baseA + (rng() - 0.5) * 16;      // 同向微差 ±8°
    const sign = rng() < 0.78 ? baseSign : -baseSign;
    const a = aDeg * DEG * sign;
    const len = W * (0.5 + rng() * 0.25);         // 1/2~3/4 带宽
    const sC = 0.14 + rng() * 0.72;
    const vC = 0.16 + rng() * 0.68;
    const c = map(sC, vC);
    const dx = Math.cos(a), dy = Math.sin(a);
    const p0 = { x: c.x - dx * len / 2, y: c.y - dy * len / 2 };
    const p2 = { x: c.x + dx * len / 2, y: c.y + dy * len / 2 };
    // 只允许一个轻微弧度：控制点偏移 3~6px
    const bend = (3 + rng() * 3) * (rng() < 0.5 ? 1 : -1);
    const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
    const { path, dir } = quad(p0, p1, p2);
    strokePair(ctx, path, dir, 0.14 + rng() * 0.04, 0.10 + rng() * 0.02);
  }
}

// ---- 单斜翘：一条主折痕横贯胶带，整条右下侧有一层连续淡投影 ----
function drawSkew(ctx, tape, rng) {
  const map = mapper(tape);
  const W = tape.widthPx;
  const sC = 0.28 + rng() * 0.44;                 // 位置随机，不固定中间
  const a = (30 + rng() * 15) * DEG;               // 斜 30°~45°
  const dx = Math.cos(a), dy = -Math.sin(a);       // 左下 → 右上
  const len = (W * 1.25) / Math.sin(a);            // 横贯整条胶带，出头被裁掉
  const c = map(sC, 0.5);
  const p0 = { x: c.x - dx * len / 2, y: c.y - dy * len / 2 };
  const p2 = { x: c.x + dx * len / 2, y: c.y + dy * len / 2 };
  const bend = (2 + rng() * 2.5) * (rng() < 0.5 ? 1 : -1); // 接近直线，微弧
  const p1 = { x: (p0.x + p2.x) / 2 - dy * bend, y: (p0.y + p2.y) / 2 + dx * bend };
  const { path, dir } = quad(p0, p1, p2);

  // 投影：沿整条折痕的右下侧铺 4~6px 并逐渐变淡（不是孤立小三角）
  projectAlong(ctx, p0, p1, p2, dir, 4.5 + rng() * 1.5, 0.16);

  // 主折痕本身：比其他效果深
  strokePair(ctx, path, dir, 0.24 + rng() * 0.04, 0.14 + rng() * 0.04);
}

// 沿折痕右下侧铺一条渐变带：宽度 bandW，越远离折痕越淡
function projectAlong(ctx, p0, p1, p2, dir, bandW, alpha) {
  const n = rightDownNormal(dir.x, dir.y);
  const STEPS = 18;
  const pts = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }

  const band = new Path2D();
  band.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) band.lineTo(pts[i].x, pts[i].y);
  for (let i = pts.length - 1; i >= 0; i--) {
    band.lineTo(pts[i].x + n.x * bandW, pts[i].y + n.y * bandW);
  }
  band.closePath();

  const mid = pts[Math.floor(pts.length / 2)];
  const g = ctx.createLinearGradient(mid.x, mid.y, mid.x + n.x * bandW, mid.y + n.y * bandW);
  g.addColorStop(0, `rgba(42, 34, 23, ${alpha})`);
  g.addColorStop(0.35, `rgba(42, 34, 23, ${alpha * 0.55})`);
  g.addColorStop(1, 'rgba(42, 34, 23, 0)');

  ctx.save();
  ctx.translate(1.5, 2);
  if (supportsFilter) ctx.filter = 'blur(1.8px)';
  ctx.fillStyle = g;
  ctx.fill(band);
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

// ---- 烘焙用：一张揉皱纹理（2048×512 透明底） ----
// 折线折痕：2~4 段短直线首尾相连，有转折角；方向完全随机，允许交叉、端点相接。
// 数量按「一条胶带上能看到 8~12 条」倒推：纹理高 = 2.2 倍带宽，可视区约为纹理的 23%。
export function bakeCrumplePattern(ctx, W, H, seed) {
  const rng = mulberry32(seed);
  const tapeW = H / 2.2;          // 与 drawCrumple 的缩放约定保持一致
  const COUNT = 54;               // 约 12 条落在一条胶带上
  const margin = 20;

  for (let i = 0; i < COUNT; i++) {
    const total = tapeW * (1 / 6 + rng() / 6);      // 总长 1/6~1/3 带宽
    const segs = 2 + Math.floor(rng() * 3);         // 2~4 段
    let a = rng() * Math.PI * 2;                    // 完全随机方向
    let x = margin + rng() * (W - margin * 2);
    let y = margin + rng() * (H - margin * 2);
    const pts = [{ x, y }];
    const segLen = total / segs;
    for (let k = 0; k < segs; k++) {
      a += (rng() - 0.5) * 80 * DEG;                // 转折角
      x += Math.cos(a) * segLen;
      y += Math.sin(a) * segLen;
      pts.push({ x, y });
    }
    const { path, dir } = polyline(pts);
    // 烘焙时纹理会被缩到 0.77 倍左右，线宽给 1.8 时才约合显示 1.4px
    strokePair(ctx, path, dir, 0.11 + rng() * 0.05, 0.06 + rng() * 0.04, 1.8);
  }
}

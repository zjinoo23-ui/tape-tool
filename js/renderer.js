// renderer.js —— 胶带渲染
// 层次：柔和投影 → 连续纹理网格 → 折痕（轻皱/揉皱/斜痕）→ 端头微翘 → 凹凸 → 边缘厚度 → 轮廓

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

  const opacity = params.opacity == null ? 1 : params.opacity;

  // 影子也跟着透明度变淡：半透明胶带不该投出实心胶带那么重的影
  ctx.save();
  ctx.globalAlpha = opacity;
  drawShadow(ctx, path);
  drawEndLiftShadow(ctx, tape, path);
  ctx.restore();

  // 胶带本体先画到离屏层，再整层按透明度合成。
  // 直接在主画布逐层画的话，半透明时纹理、光影、折痕会各自叠一次 alpha，
  // 边缘和接缝处会发花；整层合成才是「一张半透明胶带」。
  if (!layerCanvas) layerCanvas = document.createElement('canvas');
  if (layerCanvas.width !== W || layerCanvas.height !== H) {
    layerCanvas.width = W;
    layerCanvas.height = H;
  }
  const lctx = layerCanvas.getContext('2d');
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, W, H);

  lctx.save();
  lctx.clip(path);
  drawMeshTexture(lctx, tape, texture);
  drawCreases(lctx, tape, params.crease, texture);
  drawSurfaceShading(lctx, tape);
  drawEndLiftLight(lctx, tape);
  drawBump(lctx, tape, params.bump, texture, params.crease);
  drawEdgeBevel(lctx, tape);
  lctx.restore();

  // 外轮廓：只留一丝极淡的线，勒住边缘不脏
  lctx.save();
  lctx.strokeStyle = 'rgba(43, 35, 24, 0.09)';
  lctx.lineWidth = 1;
  lctx.stroke(path);
  lctx.restore();

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(layerCanvas, 0, 0);
  ctx.restore();

  return tape;
}

let layerCanvas = null;

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

// ---- 纹理：整块仿射填充 ----
// 胶带是直的，整条只需一次 pattern 变换就能精确铺满：
// 纹理空间 (texX 沿长度、texY 横跨宽度) → 画布空间。
// 逐三角形贴图在 alpha < 1 时，外扩的重叠区会把 alpha 叠两次，出现接缝；
// 单次填充没有这个问题，也能原样保留素材自带的透明度。
function drawMeshTexture(ctx, tape, texture) {
  const pattern = ctx.createPattern(texture.image, 'repeat');
  if (!pattern) return;

  const th = texture.image.naturalHeight || texture.image.height;
  const pxPerTexel = tape.widthPx / th; // 画布像素 / 纹理像素
  const col0 = tape.cols[0];

  ctx.save();
  ctx.setTransform(
    pxPerTexel * col0.tR.x, pxPerTexel * col0.tR.y,
    pxPerTexel * col0.nR.x, pxPerTexel * col0.nR.y,
    col0.top.x, col0.top.y,
  );
  ctx.fillStyle = pattern;
  // 纹理空间的覆盖范围：长度方向多留 64 texel，包住波浪/手撕的端头剪边
  const pad = 64;
  ctx.fillRect(-pad, -pad, tape.total / pxPerTexel + pad * 2, th + pad * 2);
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
    return jitterPts(bump.poly.map(p => pointAt(tape, p.s, p.v)), 0.8, 2.9);
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
  return jitterPts(poly.map(p => pointAt(tape, p.s, p.v)), 0.8, 1.3);
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
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    g.addColorStop(1, 'rgba(0, 0, 0, 1)');
  }
  o.fillStyle = g;
  o.fillRect(0, 0, W, H);

  ctx.drawImage(bandCanvas, 0, 0);
}

// ---- 凹凸光影：凸起 = 胶带被底下的东西垫起，同纸同色。
// 标准图层顺序：胶带平面 → 凸起的落影 → 凸起面（盖住落影内缘） → 接缝 AO → 方向性侧壁。
// 顶面不提亮（最多 0.04 平铺白），立体感全交给影子和窄带，光源统一左上。
function drawBump(ctx, tape, bump, texture, crease) {
  if (!bump) return;
  const pts = bumpPoints(tape, bump);
  if (!pts || pts.length < 3) return;

  const raised = new Path2D();
  raised.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) raised.lineTo(pts[i].x, pts[i].y);
  raised.closePath();

  // 1) 接触影：柔和地朝右下溢出
  ctx.save();
  if (supportsFilter) {
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = 'rgba(42, 34, 23, 0.10)';
    ctx.translate(2, 2.5);
    ctx.fill(raised);
    ctx.filter = 'none';
  } else {
    ctx.shadowColor = 'rgba(42, 34, 23, 0.10)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2.5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.001)';
    ctx.fill(raised);
  }
  ctx.restore();

  // 2) 凸起面：同纸同色，原样重铺纹理与折痕（重铺是为了盖住落影内缘），
  //    再平铺 0.05 白——只比周围亮 2~3 级灰度，不要渐变。
  //    折痕必须一起重铺：否则凸起面会把已经画过的折痕整片盖掉，凹凸和褶皱不能同时出现。
  ctx.save();
  ctx.clip(raised);
  drawMeshTexture(ctx, tape, texture);
  drawCreases(ctx, tape, crease, texture);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  // 3) 接缝 AO：轮廓内侧约 1.5px 的窄暗带，若隐若现，不形成明显一圈线
  ctx.save();
  ctx.clip(raised);
  if (supportsFilter) ctx.filter = 'blur(2px)';
  ctx.strokeStyle = 'rgba(52, 42, 30, 0.10)';
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
    width: 2, color: 'rgba(48, 38, 26, 0.12)', blur: 2, flip: false,
  });
}

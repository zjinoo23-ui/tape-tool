// geometry.js —— 胶带路径与网格
// 胶带是一条水平直线：折痕效果全部为表面绘制，不再弯折路径。
// 沿路径取等距列，每列给出中心点 c、切线 t、法线 n、半宽 half，
// 相邻两列组成四边形，纹理坐标 u 只由累计弧长决定。

export const DEG = Math.PI / 180;

// 端头轮廓：d 是「从上边缘到下边缘」的比例，返回端面沿路径方向的偏移量
function endOffset(style, d, w, salt) {
  if (style === 'straight') return 0;
  if (style === 'wave') {
    // 零振幅收在两端，和上下边缘自然接上；3.5 个波峰，像锯齿波浪剪
    return 0.045 * w * Math.sin(d * Math.PI * 7);
  }
  // 手撕：包络 + 不规则抖动
  const env = Math.sin(Math.PI * d);
  const r = hash(d * 6.3 + salt);
  return w * 0.11 * env * (0.3 + 0.7 * r);
}

function hash(x) {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 生成一条胶带的几何数据（已按倾斜角旋转并居中到画布）。
 * @param {object} opts
 * @param {number} opts.widthPx 胶带宽度（像素）
 * @param {number} opts.lengthPx 胶带长度（像素）
 * @param {string} opts.endLeft 左端样式
 * @param {string} opts.endRight 右端样式
 * @param {number} opts.tiltDeg 倾斜角（度）
 * @param {number} opts.centerX 画布中心 x
 * @param {number} opts.centerY 画布中心 y
 * @param {number} opts.seed 手撕随机种子
 */
export function buildTape(opts) {
  const {
    widthPx, lengthPx, endLeft, endRight, tiltDeg,
    centerX, centerY, seed = 0, step = 16,
  } = opts;

  const total = lengthPx;
  const dir = { x: 1, y: 0 };
  const n = { x: 0, y: 1 };
  const halfBase = widthPx / 2;

  // ---- 取列（直线，等距） ----
  const cols = [];
  const count = Math.max(2, Math.ceil(total / step));
  for (let k = 0; k <= count; k++) {
    const s = (total * k) / count;
    cols.push({
      s,
      c: { x: s, y: 0 },
      t: dir,
      n,
      half: halfBase,
      top: { x: s, y: -halfBase },
      bot: { x: s, y: halfBase },
    });
  }

  // ---- 整条旋转 + 居中 ----
  const rot = tiltDeg * DEG;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const rotPt = p => ({ x: p.x * cs - p.y * sn, y: p.x * sn + p.y * cs });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const col of cols) {
    col.top = rotPt(col.top);
    col.bot = rotPt(col.bot);
    col.cR = rotPt(col.c);
    col.tR = rotPt(col.t);
    col.nR = rotPt(col.n);

    for (const p of [col.top, col.bot]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const dx = centerX - (minX + maxX) / 2;
  const dy = centerY - (minY + maxY) / 2;
  for (const col of cols) {
    col.top.x += dx; col.top.y += dy;
    col.bot.x += dx; col.bot.y += dy;
    col.cR.x += dx; col.cR.y += dy;
  }

  // ---- 端头轮廓 ----
  const N = 24;
  const first = cols[0];
  const last = cols[cols.length - 1];

  const rightEnd = [];
  for (let i = 0; i <= N; i++) {
    const d = i / N;
    const bx = last.top.x + (last.bot.x - last.top.x) * d;
    const by = last.top.y + (last.bot.y - last.top.y) * d;
    const off = endOffset(endRight, d, widthPx, seed + 1);
    rightEnd.push({ x: bx + last.tR.x * off, y: by + last.tR.y * off });
  }

  const leftEnd = [];
  for (let i = 0; i <= N; i++) {
    const d = i / N;
    const bx = first.bot.x + (first.top.x - first.bot.x) * d;
    const by = first.bot.y + (first.top.y - first.bot.y) * d;
    const off = endOffset(endLeft, d, widthPx, seed + 2);
    leftEnd.push({ x: bx - first.tR.x * off, y: by - first.tR.y * off });
  }

  const top = cols.map(c => c.top);
  const bot = cols.map(c => c.bot);
  const outline = [...top, ...rightEnd, ...bot.slice().reverse(), ...leftEnd];

  // ---- 轮廓微抖动：沿法线 ±0.9px 的低频平滑抖动（两个不同频率正弦叠加），
  // 去掉「数学生成的完美矩形」感。就地修改，outline / top / bot / 端头共享同一批点。
  const JITTER_AMP = 0.9;
  const m = outline.length;
  for (let i = 0; i < m; i++) {
    const prev = outline[(i - 1 + m) % m];
    const next = outline[(i + 1) % m];
    let nx = -(next.y - prev.y);
    let ny = next.x - prev.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const j = (Math.sin(i * 0.31 + seed * 1.7) * 0.6
      + Math.sin(i * 0.113 + seed * 3.1 + 2.4) * 0.4) * JITTER_AMP;
    outline[i].x += nx * j;
    outline[i].y += ny * j;
  }

  return {
    cols,
    top,
    bot,
    leftEnd,
    rightEnd,
    outline,
    total,
    widthPx,
  };
}

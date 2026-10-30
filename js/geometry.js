// geometry.js —— 胶带路径与网格
// 胶带 = 一条连续折线，不是分段拼接：
// 沿路径取等距列，每列给出中心点 c、切线 t、法线 n、半宽 half，
// 相邻两列组成四边形，纹理坐标 u 只由累计弧长决定 —— 所以折点处天然连续。

export const DEG = Math.PI / 180;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(t) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

function norm(v) {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

// 折痕样式 → 折线控制点（本地坐标，胶带沿 +x 从 0 排到 L）
function polylineFor(style, L) {
  switch (style) {
    case 'one': {
      const a = 16 * DEG;
      const p1 = { x: L * 0.5, y: 0 };
      return [
        { x: 0, y: 0 },
        p1,
        { x: p1.x + Math.cos(a) * L * 0.5, y: p1.y + Math.sin(a) * L * 0.5 },
      ];
    }
    case 'two': {
      const a = 14 * DEG;
      const p1 = { x: L * 0.32, y: 0 };
      const p2 = { x: p1.x + Math.cos(a) * L * 0.36, y: p1.y + Math.sin(a) * L * 0.36 };
      const p3 = { x: p2.x + Math.cos(-a * 0.8) * L * 0.32, y: p2.y + Math.sin(-a * 0.8) * L * 0.32 };
      return [{ x: 0, y: 0 }, p1, p2, p3];
    }
    case 'curl': {
      const a = 34 * DEG;
      const p1 = { x: L * 0.74, y: 0 };
      return [
        { x: 0, y: 0 },
        p1,
        { x: p1.x + Math.cos(a) * L * 0.26, y: p1.y + Math.sin(a) * L * 0.26 },
      ];
    }
    case 'lift': {
      const a = -20 * DEG;
      const p1 = { x: L * 0.66, y: 0 };
      return [
        { x: 0, y: 0 },
        p1,
        { x: p1.x + Math.cos(a) * L * 0.34, y: p1.y + Math.sin(a) * L * 0.34 },
      ];
    }
    default:
      return [{ x: 0, y: 0 }, { x: L, y: 0 }];
  }
}

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
 * @param {string} opts.foldStyle 折痕样式
 * @param {string} opts.endLeft 左端样式
 * @param {string} opts.endRight 右端样式
 * @param {number} opts.tiltDeg 倾斜角（度）
 * @param {number} opts.centerX 画布中心 x
 * @param {number} opts.centerY 画布中心 y
 * @param {number} opts.seed 手撕随机种子
 */
export function buildTape(opts) {
  const {
    widthPx, lengthPx, foldStyle, endLeft, endRight, tiltDeg,
    centerX, centerY, seed = 0, step = 16,
  } = opts;

  const L = lengthPx;
  const poly = polylineFor(foldStyle, L);

  const segs = [];
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segs.push({ a, b, len, dir: { x: dx / len, y: dy / len }, start: total });
    total += len;
  }

  // ---- 取列 ----
  const cols = [];
  const foldCols = [];
  const s0 = segs[0];
  cols.push({
    s: 0,
    c: { x: s0.a.x, y: s0.a.y },
    t: s0.dir,
    n: { x: -s0.dir.y, y: s0.dir.x },
    miter: 1,
  });

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const count = Math.max(2, Math.ceil(seg.len / step));
    for (let k = 1; k <= count; k++) {
      const f = k / count;
      const c = {
        x: seg.a.x + seg.dir.x * seg.len * f,
        y: seg.a.y + seg.dir.y * seg.len * f,
      };
      const s = seg.start + seg.len * f;

      if (k === count && i < segs.length - 1) {
        // 折点列：法线取两侧法线的角平分线，并按 1/cos 补长（斜接），
        // 这样内外两条边都贴着原直线延伸，不会裂开。
        const d2 = segs[i + 1].dir;
        const t = norm({ x: seg.dir.x + d2.x, y: seg.dir.y + d2.y });
        const n1 = { x: -seg.dir.y, y: seg.dir.x };
        const n2 = { x: -d2.y, y: d2.x };
        const bis = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
        const cosHalf = Math.max(0.4, n1.x * bis.x + n1.y * bis.y);
        cols.push({ s, c, t, n: bis, miter: 1 / cosHalf });
        foldCols.push(cols.length - 1);
      } else {
        const n = { x: -seg.dir.y, y: seg.dir.x };
        cols.push({ s, c, t: seg.dir, n, miter: 1 });
      }
    }
  }

  // ---- 宽度（卷边 / 翘起在末端收一点） ----
  const halfBase = widthPx / 2;
  for (const col of cols) {
    const u = col.s / total;
    let wmul = 1;
    if (foldStyle === 'curl' && u > 0.84) {
      wmul = 1 - 0.34 * smoothstep((u - 0.84) / 0.16);
    } else if (foldStyle === 'lift' && u > 0.88) {
      wmul = 1 - 0.2 * smoothstep((u - 0.88) / 0.12);
    }
    col.half = halfBase * wmul * col.miter;
    col.top = { x: col.c.x - col.n.x * col.half, y: col.c.y - col.n.y * col.half };
    col.bot = { x: col.c.x + col.n.x * col.half, y: col.c.y + col.n.y * col.half };
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

  const folds = foldCols.map(i => {
    const col = cols[i];
    return { x: col.cR.x, y: col.cR.y, t: col.tR, n: col.nR, s: col.s, u: col.s / total };
  });

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

  return {
    cols,
    top,
    bot,
    folds,
    outline,
    total,
    widthPx,
  };
}

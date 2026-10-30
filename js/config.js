// config.js —— 常量、素材清单与默认参数
// 版本号：后续升级只改这一处

export const VERSION = 'v0.4.0';

// 渲染画布（导出时按内容边缘再裁剪，这里的边距只影响取景）
export const CANVAS = { w: 1600, h: 1120 };

// 现实尺寸换算：1cm 约合 90 画布像素。
// 只做「手感示意」，不追求印刷级精确，导出尺寸随裁剪变化。
export const PX_PER_CM = 90;

// 长度滑块：4~14cm，现实里手帐常用的一截胶带长度
export const LENGTH = { min: 4, max: 14, step: 0.5, value: 9, digit: 1 };

// 宽度三档，按现实里的常见胶带宽度给出厘米数
export const WIDTHS = {
  thin:   { label: '细款', cm: 1.5, px: 135 },
  normal: { label: '常规', cm: 2.0, px: 180 },
  wide:   { label: '宽版', cm: 3.0, px: 270 },
};

export const END_STYLES = {
  straight: '直边',
  wave: '波浪剪边',
  tear: '手撕边',
};

export const FOLD_STYLES = {
  none: '无',
  one: '折一下',
  two: '折两下',
  curl: '卷边',
  lift: '翘起',
};

// 凹凸：胶带局部隆起的预设形状。
// poly 用 (s, v) 描述，s 为沿胶带长度方向的弧长比例 [0,1]，v 为宽度方向比例 [0=上边,1=下边]。
// 凸起面通过「投影 + 内高光 + 内阴影」三段画法实现，不需要法线贴图。
export const BUMP_STYLES = {
  none:          { name: '无',     poly: null },
  lowerHalf:     { name: '下半边', poly: [{ s: 0, v: 0.5 }, { s: 1, v: 0.5 }, { s: 1, v: 1 }, { s: 0, v: 1 }] },
  centerLower:   { name: '中下边', poly: [{ s: 0.12, v: 0.25 }, { s: 0.88, v: 0.25 }, { s: 0.88, v: 1 }, { s: 0.12, v: 1 }] },
  bottomPeak:    { name: '底三角', poly: [{ s: 0.5, v: 0.5 }, { s: 0.82, v: 1 }, { s: 0.18, v: 1 }] },
  centerDiamond: { name: '中心',   poly: [{ s: 0.5, v: 0.28 }, { s: 0.86, v: 0.5 }, { s: 0.5, v: 0.72 }, { s: 0.14, v: 0.5 }] },
};

// 纹理素材清单：文件放在 assets/textures/ 下，按 key.png 命名。
// 换素材只需替换同名 PNG（要求能无缝平铺，建议 256×256 以上）。
export const TEXTURES = [
  { key: 'cream',    name: '米白纸',   path: 'assets/textures/cream.png' },
  { key: 'kraft',    name: '牛皮纸',   path: 'assets/textures/kraft.png' },
  { key: 'blush',    name: '淡粉',     path: 'assets/textures/blush.png' },
  { key: 'indigo',   name: '靛蓝',     path: 'assets/textures/indigo.png' },
  { key: 'mint',     name: '薄荷',     path: 'assets/textures/mint.png' },
  { key: 'charcoal', name: '墨灰',     path: 'assets/textures/charcoal.png' },
];

// 端头件与折痕件目前全部由代码生成（程序化），
// 后续补图时可在 assets/ends/、assets/folds/ 放 PNG，再在渲染层接进来。
export const SEED = 7;

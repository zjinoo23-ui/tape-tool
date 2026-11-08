// config.js —— 常量、素材清单与默认参数
// 版本号：后续升级只改这一处

export const VERSION = 'v0.9.0';

// 渲染画布（导出时按内容边缘再裁剪，这里的边距只影响取景）
export const CANVAS = { w: 1600, h: 1120 };

// 现实尺寸换算：1cm 约合 90 画布像素。
// 只做「手感示意」，不追求印刷级精确，导出尺寸随裁剪变化。
export const PX_PER_CM = 90;

// 长度滑块：4~14cm，现实里手帐常用的一截胶带长度
export const LENGTH = { min: 4, max: 14, step: 0.5, value: 9, digit: 1 };

// 胶带整体透明度（%）：半透明胶带让底下的纸和格线透出来
export const OPACITY = { min: 15, max: 100, step: 5, value: 100 };

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
  smooth: '平滑',
  light: '轻皱',
  crumple: '揉皱',
  skew: '斜痕',
};

// 折痕素材：白底 AO 明暗 PNG（明度叠加），三种折痕各一张，数组内可放多张随机轮换
export const FOLD_TEXTURES = {
  light: ['assets/folds/crease_light.png'],
  crumple: ['assets/folds/crease_crumple.png'],
  skew: ['assets/folds/crease_skew.png'],
};

// 凹凸：胶带局部隆起的预设形状，模拟胶带压在纸上的别的东西（拍立得、卡片）上。
// poly 用 (s, v) 描述，s 为沿胶带长度方向的弧长比例，v 为宽度方向比例 [0=上边,1=下边]，
// 超出 0~1 的部分会被胶带轮廓裁掉。
// kind='corner' 表示「胶带盖住一个角」：apex 是角尖位置，两条边固定 90° 张开，
// 像素比例按胶带宽度/长度换算，所以屏幕上看到的确实是直角。
export const BUMP_STYLES = {
  none:        { name: '无',     poly: null },
  leftHalf:    { name: '左半边', poly: [{ s: 0, v: 0 }, { s: 0.5, v: 0 }, { s: 0.5, v: 1 }, { s: 0, v: 1 }] },
  lowerHalf:   { name: '下半边', poly: [{ s: 0, v: 0.5 }, { s: 1, v: 0.5 }, { s: 1, v: 1 }, { s: 0, v: 1 }] },
  centerLower: { name: '中下边', poly: [{ s: 0.12, v: 0.25 }, { s: 0.88, v: 0.25 }, { s: 0.88, v: 1.3 }, { s: 0.12, v: 1.3 }] },
  // 角尖在胶带内，被胶带完全盖住，两条直角边伸出下边缘
  bottomPeak:  { name: '底三角', kind: 'corner', apex: { s: 0.5, v: 0.30 } },
  // 角尖已经跑到上边缘之外，胶带里只剩被裁掉尖头的一块宽梯形
  cornerOut:   { name: '露角',   kind: 'corner', apex: { s: 0.5, v: -0.30 } },
};

// 纹理卡片主题：顺序固定；group 决定卡片下方的控件形态
//   pattern（纹样组）→ 图标墙 + 整套配色；real（真实胶带）→ 只有图标墙；solid（纯色）→ 取色盘
export const TAPE_THEMES = [
  { key: 'geo',    name: '几何基础', group: 'pattern' },
  { key: 'animal', name: '动物萌宠', group: 'pattern' },
  { key: 'food',   name: '食物甜品', group: 'pattern' },
  { key: 'nature', name: '自然天气', group: 'pattern' },
  { key: 'plant',  name: '植物枝叶', group: 'pattern' },
  { key: 'dream',  name: '梦幻少女', group: 'pattern' },
  { key: 'gothic', name: '暗黑哥特', group: 'pattern' },
  { key: 'real',   name: '真实胶带', group: 'real' },
  { key: 'solid',  name: '纯色',     group: 'solid' },
];

// 一期配色清单：纹样组整套预设；accent 为 null 表示双色方案
// 图案素材后续按套上传成品图；素材未到位时先用底色渲染
export const PALETTES = [
  { key: 'warm-red-blue', name: '暖白红蓝', base: '#F6EDDB', main: '#E92A24', accent: '#1234AA' },
  { key: 'wine-lime',     name: '暮酒紫柠', base: '#6A3332', main: '#A48BE8', accent: '#CCE961' },
  { key: 'night-rose',    name: '夜蓝玫粉', base: '#1A293A', main: '#EF559B', accent: '#F6EDDB' },
  { key: 'soft-pink',     name: '柔粉奶白', base: '#EF479F', main: '#F5EEDD', accent: null },
  { key: 'milk-blue-red', name: '奶白蓝朱', base: '#F6EDDB', main: '#1646C0', accent: '#CF3634' },
  { key: 'ink-mono',      name: '墨线黑白', base: '#F7F1E4', main: '#26261F', accent: null },
];

// 纯色主题的默认色
export const SOLID_DEFAULT = '#BF5158';

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

// 端头件全部由代码生成（程序化）；揉皱纹理在 assets/folds/ 下，烘焙工具见 tools/
export const SEED = 7;

// config.js —— 常量、素材清单与默认参数
// 版本号：后续升级只改这一处

export const VERSION = 'v0.1.0';

// 渲染画布（导出时按内容边缘再裁剪，这里的边距只影响取景）
export const CANVAS = { w: 1600, h: 1120 };

// 宽度三档，单位是画布像素（常规约合 300dpi 下的 15mm 胶带）
export const WIDTHS = {
  thin:   { label: '细款', px: 110 },
  normal: { label: '常规', px: 176 },
  wide:   { label: '宽版', px: 258 },
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

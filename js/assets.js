// assets.js —— 纹理素材加载
// 纹理图必须能无缝平铺；加载失败时该条目不参与选择，不静默替换成别的图。

const images = [];

function loadImage(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

export async function loadTextures(list) {
  const results = await Promise.all(list.map(t => loadImage(t.path)));
  images.length = 0;
  list.forEach((t, i) => {
    if (results[i]) images.push({ key: t.key, name: t.name, image: results[i] });
  });
  if (images.length === 0) throw new Error('纹理素材加载失败');
  return images;
}

export function getTextures() {
  return images;
}

export function getTexture(key) {
  return images.find(t => t.key === key) || images[0] || null;
}

// ---- 折痕素材（预烘焙 PNG，加载失败则对应效果退化为无折痕） ----
const folds = { light: [], crumple: [], skew: [] };

export async function loadFolds(paths) {
  for (const key of Object.keys(folds)) {
    const results = await Promise.all((paths[key] || []).map(loadImage));
    folds[key] = results.filter(Boolean);
  }
  return folds;
}

export function getFolds() {
  return folds;
}

// 纹理缩到 1×1 取均色：用作裁剪区的兜底底色、折痕明度归一化的基准（结果缓存在纹理对象上）
export function textureBaseColor(texture) {
  if (texture._baseColor) return texture._baseColor;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const m = c.getContext('2d', { willReadFrequently: true });
  m.drawImage(texture.image, 0, 0, 1, 1);
  const d = m.getImageData(0, 0, 1, 1).data;
  texture._baseColor = `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
  return texture._baseColor;
}

// ---- 纯色 / 配色底色的合成纹理 ----
// 256×256 纯色画布，按颜色缓存；与其他纹理走同一条贴图管线
const solidCache = new Map();
export function solidTexture(hex) {
  let t = solidCache.get(hex);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, 256, 256);
  t = { key: 'solid:' + hex, name: hex, image: c };
  solidCache.set(hex, t);
  return t;
}

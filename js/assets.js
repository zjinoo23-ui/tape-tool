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

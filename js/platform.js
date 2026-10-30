// platform.js —— 浏览器端的图片保存

/**
 * 把画布存成 PNG 文件（浏览器：触发下载）。
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 * @returns {Promise<void>}
 */
export function saveImage(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('导出失败'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

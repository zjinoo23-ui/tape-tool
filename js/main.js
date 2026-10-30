// main.js —— 入口：参数面板接线 + 预览与导出

import { VERSION, CANVAS, PX_PER_CM, LENGTH, WIDTHS, TEXTURES, SEED, BUMP_STYLES } from './config.js';
import { loadTextures, getTextures, getTexture } from './assets.js';
import { renderTape } from './renderer.js';
import { cropToContent } from './export.js';
import { saveImage } from './platform.js';

const previewCanvas = document.getElementById('previewCanvas');
const exportCanvas = document.getElementById('exportCanvas');
const exportCtx = exportCanvas.getContext('2d');
const textureGrid = document.getElementById('textureGrid');
const lengthSlider = document.getElementById('lengthSlider');
const lengthValue = document.getElementById('lengthValue');
const downloadBtn = document.getElementById('downloadBtn');
const appVersion = document.getElementById('appVersion');
const saveModal = document.getElementById('saveModal');
const saveModalImg = document.getElementById('saveModalImg');
const saveModalClose = document.getElementById('saveModalClose');

appVersion.textContent = VERSION;

exportCanvas.width = CANVAS.w;
exportCanvas.height = CANVAS.h;

const state = {
  texture: TEXTURES[0].key,
  lengthCm: LENGTH.value,
  width: 'normal',
  endLeft: 'wave',
  endRight: 'wave',
  fold: 'one',
  bump: 'none',
};

let renderTimeout = null;
let textures = [];

function scheduleRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(render, 150);
}

// ---- 纹理选择 ----
function buildTextureGrid() {
  textureGrid.innerHTML = '';
  for (const tex of getTextures()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'texture-item' + (tex.key === state.texture ? ' active' : '');
    btn.dataset.key = tex.key;

    const swatch = document.createElement('span');
    swatch.className = 'texture-swatch';
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    c.getContext('2d').drawImage(tex.image, 0, 0, 64, 64, 0, 0, 64, 64);
    swatch.appendChild(c);

    const name = document.createElement('span');
    name.className = 'texture-name';
    name.textContent = tex.name;

    btn.appendChild(swatch);
    btn.appendChild(name);

    btn.addEventListener('click', () => {
      state.texture = tex.key;
      textureGrid.querySelectorAll('.texture-item').forEach(el => {
        el.classList.toggle('active', el.dataset.key === tex.key);
      });
      scheduleRender();
    });

    textureGrid.appendChild(btn);
  }
}

// ---- 分段选择 ----
function syncSegIndicator(container) {
  if (!container || container.offsetWidth === 0) return;
  const indicator = container.querySelector('.seg-indicator');
  const active = container.querySelector('.seg-btn.active');
  if (!indicator || !active) return;
  indicator.style.width = active.offsetWidth + 'px';
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

document.querySelectorAll('.segmented-control[data-seg]').forEach(container => {
  const key = container.dataset.seg;
  container.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state[key] = btn.dataset.value;
      syncSegIndicator(container);
      scheduleRender();
    });
  });
});

// ---- 折痕标签 ----
document.querySelectorAll('.chip-group[data-chip]').forEach(group => {
  const key = group.dataset.chip;
  group.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state[key] = chip.dataset.value;
      scheduleRender();
    });
  });
});

// ---- 滑块 ----
function syncSliderFill(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--fill', pct + '%');
}

function formatLength(cm) {
  return cm.toFixed(LENGTH.digit) + ' cm';
}

lengthSlider.addEventListener('input', () => {
  state.lengthCm = parseFloat(lengthSlider.value);
  lengthValue.textContent = formatLength(state.lengthCm);
  syncSliderFill(lengthSlider);
  scheduleRender();
});

// ---- 纸片卡折叠 ----
document.querySelectorAll('.card-title').forEach(btn => {
  const card = btn.closest('.paper-card');
  if (!card.classList.contains('collapsed')) card.classList.add('card-open');

  btn.addEventListener('click', () => {
    const collapsed = card.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    clearTimeout(card.revealTimer);
    card.classList.remove('card-open');
    if (!collapsed) {
      card.revealTimer = setTimeout(() => card.classList.add('card-open'), 210);
    }
  });
});

// ---- 渲染 ----
function render() {
  const texture = getTexture(state.texture);
  if (!texture) return;

  const lengthPx = state.lengthCm * PX_PER_CM;

  renderTape(exportCtx, CANVAS.w, CANVAS.h, {
    lengthPx,
    widthPx: WIDTHS[state.width].px,
    foldStyle: state.fold,
    endLeft: state.endLeft,
    endRight: state.endRight,
    tiltDeg: 0, // 倾斜角功能已移除，胶带保持水平
    bump: BUMP_STYLES[state.bump],
    seed: SEED,
  }, texture);

  drawPreview();
}

function drawPreview() {
  const wrapper = previewCanvas.parentElement;
  const maxW = Math.max(1, wrapper.clientWidth);
  const maxH = Math.max(1, wrapper.clientHeight);
  const aspect = CANVAS.w / CANVAS.h;

  // wrapper 还没量出高度时按比例兜底
  const boxH = maxH > 40 ? maxH : maxW / aspect;

  let pw = maxW;
  let ph = pw / aspect;
  if (ph > boxH) {
    ph = boxH;
    pw = ph * aspect;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  previewCanvas.width = Math.max(1, Math.round(pw * dpr));
  previewCanvas.height = Math.max(1, Math.round(ph * dpr));
  previewCanvas.style.width = pw + 'px';
  previewCanvas.style.height = ph + 'px';

  const pctx = previewCanvas.getContext('2d');
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pctx.clearRect(0, 0, pw, ph);
  pctx.drawImage(exportCanvas, 0, 0, pw, ph);
}

// ---- 导出 ----
function isTouchUI() {
  return window.matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function closeModal() {
  saveModal.hidden = true;
  document.body.classList.remove('modal-open');
}

downloadBtn.addEventListener('click', async () => {
  const out = cropToContent(exportCanvas);
  const filename = `tape_${state.texture}_${Date.now()}.png`;

  if (isTouchUI()) {
    // 手机端：大图预览 + 长按保存
    saveModalImg.src = out.toDataURL('image/png');
    saveModal.hidden = false;
    document.body.classList.add('modal-open');
    return;
  }

  try {
    await saveImage(out, filename);
  } catch (err) {
    console.error(err);
    window.alert('导出失败，请重试');
  }
});

saveModal.addEventListener('click', e => {
  if (e.target === saveModal) closeModal();
});
saveModalClose.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

window.addEventListener('resize', () => {
  document.querySelectorAll('.segmented-control').forEach(syncSegIndicator);
  drawPreview();
});

// ---- 启动 ----
(async function init() {
  try {
    textures = await loadTextures(TEXTURES);
  } catch (err) {
    console.error(err);
    window.alert('纹理素材加载失败，请检查 assets/textures/ 下的图片');
    return;
  }
  buildTextureGrid();
  lengthSlider.min = String(LENGTH.min);
  lengthSlider.max = String(LENGTH.max);
  lengthSlider.step = String(LENGTH.step);
  lengthSlider.value = String(state.lengthCm);
  document.querySelectorAll('.segmented-control').forEach(syncSegIndicator);
  syncSliderFill(lengthSlider);
  lengthValue.textContent = formatLength(state.lengthCm);

  requestAnimationFrame(() => {
    document.querySelectorAll('.segmented-control').forEach(syncSegIndicator);
    render();
  });
})();

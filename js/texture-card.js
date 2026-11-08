// texture-card.js —— 纹理卡片
// 主题选项卡（横向拖动、无限循环）+ 3×3 图标墙 + 纹样组整套配色 + 纯色组 HSV 取色盘。
// 图案母题素材后续接入：纹样组图标墙先留空占位，配色先以「底色」整卷渲染。

import { TAPE_THEMES, PALETTES, SOLID_DEFAULT } from './config.js';
import { getTextures, getTexture, solidTexture } from './assets.js';

const themeOf = key => TAPE_THEMES.find(t => t.key === key);

// ---- HSV ↔ HEX ----
function hexToHsv(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return ('#' + to(r) + to(g) + to(b)).toUpperCase();
}

export function initTextureCard({ onChange }) {
  const tabsTrack = document.getElementById('themeTabsTrack');
  const motifWall = document.getElementById('motifWall');
  const paletteRow = document.getElementById('paletteRow');
  const colorPicker = document.getElementById('colorPicker');
  const svPanel = document.getElementById('svPanel');
  const hueBar = document.getElementById('hueBar');
  const hexInput = document.getElementById('hexInput');
  const hexPreview = document.getElementById('hexPreview');

  const state = {
    theme: 'real',
    textureKey: 'cream',
    paletteKey: PALETTES[0].key,
    color: SOLID_DEFAULT,
  };
  let hsv = hexToHsv(state.color);

  // ===== 主题选项卡：3 份拷贝拼成无限循环 =====
  const COPIES = 3;
  for (let c = 0; c < COPIES; c++) {
    for (const t of TAPE_THEMES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-tab' + (t.key === state.theme ? ' active' : '');
      b.dataset.key = t.key;
      b.textContent = t.name;
      tabsTrack.appendChild(b);
    }
  }

  const setWidth = () => tabsTrack.scrollWidth / COPIES;

  function normalizeScroll() {
    const w = setWidth();
    if (w <= 0) return;
    if (tabsTrack.scrollLeft < w) tabsTrack.scrollLeft += w;
    else if (tabsTrack.scrollLeft >= w * 2) tabsTrack.scrollLeft -= w;
  }
  tabsTrack.addEventListener('scroll', normalizeScroll);

  function centerTab(key, smooth) {
    const el = tabsTrack.querySelectorAll(`.theme-tab[data-key="${key}"]`)[1]
      || tabsTrack.querySelector(`.theme-tab[data-key="${key}"]`);
    if (!el) return;
    const left = el.offsetLeft + el.offsetWidth / 2 - tabsTrack.clientWidth / 2;
    tabsTrack.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  function selectTheme(key, { center = true, smooth = true } = {}) {
    state.theme = key;
    tabsTrack.querySelectorAll('.theme-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.key === key);
    });
    if (center) centerTab(key, smooth);
    syncGroupUI();
    buildMotifWall();
    onChange();
  }

  // 拖动滚动 + 点击区分
  let drag = null;
  let suppressClick = false;
  tabsTrack.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, left: tabsTrack.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      suppressClick = true;
      tabsTrack.classList.add('dragging');
    }
    if (drag.moved) tabsTrack.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    drag = null;
    tabsTrack.classList.remove('dragging');
    // click 紧跟 pointerup 触发，给一点窗口期把这次 click 吞掉
    setTimeout(() => { suppressClick = false; }, 80);
  });
  tabsTrack.addEventListener('click', e => {
    if (suppressClick) return;
    const tab = e.target.closest('.theme-tab');
    if (tab) selectTheme(tab.dataset.key);
  });

  // ===== 图标墙：3×3，真实胶带组放现有纹理，纹样组素材未到先留空 =====
  function buildMotifWall() {
    motifWall.innerHTML = '';
    const theme = themeOf(state.theme);
    if (theme.group === 'solid') return;

    const icons = theme.group === 'real' ? getTextures() : [];
    for (let i = 0; i < 9; i++) {
      const tex = icons[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'motif-item' + (tex ? '' : ' empty');

      const icon = document.createElement('span');
      icon.className = 'motif-icon';
      btn.appendChild(icon);

      if (tex) {
        const c = document.createElement('canvas');
        c.width = 96;
        c.height = 96;
        c.getContext('2d').drawImage(tex.image, 0, 0, 96, 96);
        icon.appendChild(c);
        const name = document.createElement('span');
        name.className = 'texture-name';
        name.textContent = tex.name;
        btn.appendChild(name);
        if (tex.key === state.textureKey) btn.classList.add('active');
        btn.addEventListener('click', () => {
          state.textureKey = tex.key;
          motifWall.querySelectorAll('.motif-item').forEach(el => el.classList.remove('active'));
          btn.classList.add('active');
          onChange();
        });
      } else {
        btn.disabled = true;
        btn.tabIndex = -1;
      }
      motifWall.appendChild(btn);
    }
  }

  // ===== 纹样组：整套配色 =====
  function buildPaletteRow() {
    paletteRow.innerHTML = '';
    for (const p of PALETTES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-item' + (p.key === state.paletteKey ? ' active' : '');

      const dots = document.createElement('span');
      dots.className = 'palette-dots';
      for (const color of [p.base, p.main, p.accent].filter(Boolean)) {
        const d = document.createElement('span');
        d.className = 'palette-dot';
        d.style.background = color;
        dots.appendChild(d);
      }
      const name = document.createElement('span');
      name.className = 'palette-name';
      name.textContent = p.name;
      btn.append(dots, name);

      btn.addEventListener('click', () => {
        state.paletteKey = p.key;
        paletteRow.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        onChange();
      });
      paletteRow.appendChild(btn);
    }
  }

  // ===== 纯色组：HSV 取色盘 =====
  function sizeCanvas(el, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, el.clientWidth);
    el.width = Math.round(w * dpr);
    el.height = Math.round(cssH * dpr);
  }

  function drawSV() {
    const w = svPanel.width;
    const h = svPanel.height;
    if (!w || !h) return;
    const g = svPanel.getContext('2d');
    g.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    g.fillRect(0, 0, w, h);
    let grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    const x = hsv.s * w;
    const y = (1 - hsv.v) * h;
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.4)';
    g.shadowBlur = 4;
    g.beginPath();
    g.arc(x, y, 9 * (w / Math.max(1, svPanel.clientWidth)) || 9, 0, Math.PI * 2);
    g.fillStyle = state.color;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#FFFFFF';
    g.stroke();
    g.restore();
  }

  function drawHue() {
    const w = hueBar.width;
    const h = hueBar.height;
    if (!w || !h) return;
    const g = hueBar.getContext('2d');
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    const x = (hsv.h / 360) * w;
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.4)';
    g.shadowBlur = 3;
    g.beginPath();
    g.arc(x, h / 2, h / 2 + 1, 0, Math.PI * 2);
    g.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = '#FFFFFF';
    g.stroke();
    g.restore();
  }

  function sizeAndDrawPicker() {
    if (colorPicker.hidden) return;
    sizeCanvas(svPanel, 150);
    sizeCanvas(hueBar, 16);
    drawSV();
    drawHue();
  }

  function applyColor(fromHex) {
    if (fromHex) hsv = hexToHsv(fromHex);
    state.color = hsvToHex(hsv);
    drawSV();
    drawHue();
    hexInput.value = state.color;
    hexPreview.style.background = state.color;
    onChange();
  }

  function bindPad(el, handler) {
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      const move = ev => {
        const r = el.getBoundingClientRect();
        handler(
          Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
          Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
        );
      };
      move(e);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
      el.addEventListener('pointercancel', () => el.removeEventListener('pointermove', move), { once: true });
    });
  }

  bindPad(svPanel, (x, y) => { hsv.s = x; hsv.v = 1 - y; applyColor(); });
  bindPad(hueBar, x => { hsv.h = Math.min(359.99, x * 360); applyColor(); });

  hexInput.addEventListener('change', () => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hexInput.value.trim());
    if (m) applyColor('#' + m[1]);
    else hexInput.value = state.color;
  });

  window.addEventListener('resize', sizeAndDrawPicker);

  // ===== 分组控件切换 =====
  function syncGroupUI() {
    const group = themeOf(state.theme).group;
    motifWall.hidden = group === 'solid';
    paletteRow.hidden = group !== 'pattern';
    colorPicker.hidden = group !== 'solid';
    if (group === 'solid') requestAnimationFrame(sizeAndDrawPicker);
  }

  // ===== 对外：当前渲染用的纹理源 =====
  function getSource() {
    const group = themeOf(state.theme).group;
    if (group === 'solid') return solidTexture(state.color);
    if (group === 'real') return getTexture(state.textureKey);
    // 纹样组：母题素材未接入，先用所选配色的底色整卷渲染
    const p = PALETTES.find(pl => pl.key === state.paletteKey) || PALETTES[0];
    return solidTexture(p.base);
  }

  // 初始化
  buildPaletteRow();
  buildMotifWall();
  syncGroupUI();
  hexInput.value = state.color;
  hexPreview.style.background = state.color;
  requestAnimationFrame(() => {
    tabsTrack.scrollLeft = setWidth();
    centerTab(state.theme, false);
  });

  return {
    getSource,
    // 导出文件名用的短标签
    fileTag() {
      const group = themeOf(state.theme).group;
      if (group === 'solid') return 'solid-' + state.color.slice(1);
      if (group === 'real') return state.textureKey;
      return state.theme + '-' + state.paletteKey;
    },
  };
}

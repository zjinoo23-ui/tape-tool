// serve.mjs —— 手机真机测试用的本地服务器（零依赖）
// 用法：node serve.mjs
// 监听 0.0.0.0:8000；/__mobile 为测试首页（含局域网地址与二维码）

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8000;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function lanIPv4() {
  const nets = networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      candidates.push(net.address);
    }
  }
  const pref = ['192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.2', '172.3'];
  candidates.sort((a, b) => {
    const ai = pref.findIndex(p => a.startsWith(p));
    const bi = pref.findIndex(p => b.startsWith(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return candidates.length ? candidates[0] : '127.0.0.1';
}

const ip = lanIPv4();
const toolUrl = `http://${ip}:${PORT}/`;
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(toolUrl)}`;

function landingPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>手机真机测试入口</title>
<style>
  body { margin:0; padding:32px 20px; background:#F4EEDF; color:#26261F;
    font-family: "Songti SC", "Noto Serif CJK SC", serif; text-align:center; }
  .card { max-width:420px; margin:0 auto; padding:20px; background:#F0E8D4;
    border:1px solid #E4DAC2; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.18); }
  h1 { font-size:18px; margin:0 0 8px; }
  .url { display:block; margin:12px 0; font-size:20px; font-weight:700; color:#BF5158;
    word-break:break-all; text-decoration:none; }
  img { width:240px; height:240px; background:#fff; border-radius:8px; }
  p { font-size:13px; line-height:1.7; color:#6B5D4F; margin:10px 0 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>胶带素材 · 手机真机测试</h1>
    <a class="url" href="/">${toolUrl}</a>
    <img src="${qrUrl}" alt="打开工具的二维码" />
    <p>手机与电脑连同一个 Wi‑Fi，扫码或直接在手机浏览器输入上面的地址。</p>
    <p>二维码加载不出来时说明没有外网，手动输入地址即可。</p>
  </div>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/__mobile') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(landingPage());
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = resolve(ROOT, '.' + pathname);
    if (!filePath.startsWith(resolve(ROOT) + sep) && filePath !== resolve(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');

    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  胶带素材 · 手机真机测试服务器已启动');
  console.log('  ------------------------------------');
  console.log(`  本机访问：   http://localhost:${PORT}/`);
  console.log(`  手机访问：   ${toolUrl}`);
  console.log(`  扫码入口：   http://${ip}:${PORT}/__mobile`);
  console.log('  ------------------------------------');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('');
});

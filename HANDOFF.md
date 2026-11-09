# 胶带工具 · 工作交接

- 版本：v0.9.0
- 分支：`main`
- 仓库：https://github.com/zjinoo23-ui/tape-tool
- 写作时间：2026-11-09

---

## 1. 项目是什么

手帐和纸胶带生成器，纯前端 Canvas 2D，无框架、无构建、无 npm 依赖。

- 打开方式：直接开 `index.html`，或跑 `serve.mjs` / `启动.bat`（本质是本地静态服务器，推荐 8000 端口）
- 结构：`index.html` + `css/style.css` + `js/*.js`（原生 ES Module）+ `assets/`
- 导出：画布 1600×1120 绘制，导出时按内容边缘裁剪为透明 PNG，文件名带主题/配色标签

## 2. 仓库状态（必读）

- 环境中断时执行过 `pre-termination backup`，远端 `main` 的历史被压平成单条快照提交（当前 `b1bbdbe`）。之前的历史（`7ff372a` → `3fb0fda`）已不可恢复，**这不是代码回滚**，文件内容是最新的。
- 因此「谁在什么时候改了什么」已无从追溯，后续请保持提交粒度小、message 写清原因。
- `tape-studio-single.html` 与 `.trae-html-share-packages/tape-studio-single.html.zip` 曾被备份提交进库并推到远端；现已从全部历史中清除（改写历史 + 强推），并加入 `.gitignore`。
- 工作区经常被切到 `trae/agent-*` 分支（表现为源码“消失”、只剩截图目录），偶尔还会整份回滚。遇到先执行 `git checkout main`，并确认 `HANDOFF.md`、`js/texture-card.js` 是否存在。
- `.uploads/`、`.screenshots/` 已在 `.gitignore` 中。

## 3. 已实现功能

**形态**
- 长度 4–14cm 滑块（1cm = 90 画布 px，只做手感示意）
- 宽度三档：细 135px / 常规 180px / 宽 270px
- 端头左右独立：直边 / 波浪剪边 / 手撕边

**表面**
- 折痕四种：平滑 / 轻皱 / 揉皱 / 斜痕，后三种为素材叠加（`assets/folds/*.png`）
- 凹凸六种：无 / 左半边 / 下半边 / 中下边 / 底三角 / 露角（角尖 90°）
- 透明度滑块 15%–100%（默认 100%）
- 边缘厚度、端头微翘、柔和投影、表面迎光

**纹理卡片（v0.9.0 改造一期）**
- 9 个主题选项卡：固定顺序、横向拖动、无限循环（三份拷贝 + 滚动归位），点击居中
- 3×3 squircle 图标墙（圆角 22%）：真实胶带组放现有 6 张纹理，其余为虚线空占位
- 纹样组：6 套预设配色，点击整套选中
- 纯色组：HSV 取色盘（SV 面板 + 色相条 + HEX 输入 + 预览块），替换图标墙位置
- 分组控件互斥：真实组无配色/取色盘，纯色组无图标墙

## 4. 文件职责

| 文件 | 职责 |
|---|---|
| `js/config.js` | 全部常量、主题/配色/素材清单、版本号 |
| `js/geometry.js` | 胶带几何：列、上下边、端头路径、外轮廓、抖动 |
| `js/renderer.js` | 分层渲染、逐三角形仿射贴图、端头盖帽、投影/光影/边缘/凹凸 |
| `js/creases.js` | 折痕素材叠加、明度归一化、确定性随机切片 |
| `js/texture-card.js` | 纹理卡片 UI（选项卡/图标墙/配色/取色盘）与当前纹理源 |
| `js/assets.js` | 素材加载、纹理均色、纯色纹理缓存 |
| `js/export.js` | 按内容裁剪导出 |
| `js/platform.js` | 保存图片 |
| `js/main.js` | 状态、DOM 接线、启动流程 |

渲染层次（`renderTape`）：
`投影 → 端头影 → clip → 纹理网格 → 折痕 → 表面迎光 → 端头高光 → 凹凸 → 边缘厚度 → restore → 外轮廓细描边`
半透明时整条胶带先画在离屏层，再统一 `globalAlpha` 合成。

## 5. 关键技术点与踩过的坑

1. **纹理坐标**：`u`、`v` 都必须是“归一化到一张图”的单位。`u` 曾误用纹理像素单位、又在贴图时再乘一次 `tw`，导致横向密度是纵向的 256 倍（看起来像没有颗粒）。修复点在 `renderer.js` 的 `uScale = (th / widthPx) / tw`。
2. **端头必须盖满**：波浪/手撕端面会超出首末列，端头用三角扇 + `tape.outline` 包围盒补纹理。任何长度、任何端头组合都不能露透明。
3. **半透明不能用逐三角形 alpha**：三角形裁剪外扩 1.2px 会让相邻三角形重叠，alpha < 1 时重叠区双重混合出现接缝。必须整层离屏后统一合成。
4. **折痕用 `luminosity` 混合**：会整体替换亮度，深色胶带会被白底素材洗白，所以先按该纹理自己的均色亮度归一化（`normalizeLum`，5% 分档缓存）。
5. **贴图发丝缝**：裁剪多边形沿边外法线外扩 1.2px，填充范围再多扩 4px。
6. **凹凸与折痕共存**：凸起面重铺必须按「纹理 → 折痕 → 白色平铺」同序，否则折痕被盖掉。
7. **选项卡撑宽卡片**：卡片展开态 `overflow: visible` 会把内容最小宽度向上传，用 `contain: inline-size` 截断。

## 6. 未完成 / 下一步

1. **纹样组素材接入**：9 个主题各 9 个母题成品图 + 灰度蒙版。目前只按配色底色整卷渲染，图标墙是空占位。
2. **透明度分层规则**（规格第六节）：纹样胶带只让底色跟随透明度、图案母题保持不透明；真实胶带与纯色作用于整条。现在三种都是整条统一透明度，未分层。
3. **蒙版约定**：白色 = 图案（不透明），黑色 = 底色（跟随透明度），中间灰为抗锯齿过渡；一张母题一份蒙版，多套配色共用，不可反相。
4. **配色成品图**：`PALETTES` 6 套已定义（暖白红蓝 / 暮酒紫柠 / 夜蓝玫粉 / 柔粉奶白 / 奶白蓝朱 / 墨线黑白），需按套出图后替换「底色占位」。
5. **纹理素材规格**（供出图参考）：512×512 无缝 PNG 最稳；左右必须无缝（沿胶带长度重复）；带图案孔洞用 RGBA，整体半透明用滑块，两者不要叠加；单张图内避免强低频明暗渐变；各张亮度不必统一。

## 7. 验证方式

- 无头浏览器：`puppeteer-core@23` + `chrome-headless-shell`（`~/.cache/puppeteer/`），封装在 `~/.tools/pptr/lib.mjs`
- 系统依赖：`libatk1.0-0t64 libatk-bridge2.0-0 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libnss3 libnspr4`
- 验收习惯：不只截图目视，直接读 `exportCanvas` 中心像素 RGBA 做数值断言（配色底色、透明度 alpha、贴图尺度用 hook `setTransform` 量化）
- 注意 `/tmp` 会被清空，工具脚本放 `~/.tools/`

## 8. 单文件构建

- 脚本：`~/.tools/bundle.mjs`（不在仓库里）
- 依赖顺序：`config → assets → creases → geometry → export → platform → renderer → texture-card → main`
- 做法：去掉相对 import/export，`config.js` 里 `assets/*.png` 换成 data URL，CSS/JS 内联，输出 `tape-studio-single.html`
- 该文件**不进 Git、不上 GitHub**；生成后拉 `file://` 验证一次再交付

## 9. 约定

- 中文回复，简洁直接；先改代码再解释，不写多余文档
- 不自动 commit / push，提交前说明改动；不写 `--no-verify`
- 单文件构建产物与分享包不进仓库

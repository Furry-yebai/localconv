# LocalConv · 本地文件转换

隐私优先的在线文件转换工具：**音频压缩转码、视频格式转换、文档格式转换，全部在你的浏览器内完成**（WebAssembly），文件不会上传到任何服务器，也没有统计、广告或第三方追踪。

## 功能

| 模块 | 能力 | 引擎 |
| --- | --- | --- |
| 音频 | MP3 / WAV / FLAC / M4A / OGG / OPUS 等互转与压缩（可调比特率） | ffmpeg.wasm |
| 视频 | 改封装（秒级）、提取音轨、重编码压缩（H.264 / VP8） | ffmpeg.wasm |
| 文档 | Word / Excel / PPT / ODT / PDF / 纯文本互转（→ PDF 等） | LibreOffice WASM |

其他特性：

- 串行任务队列，多任务排队执行，支持批量打包下载（zip）
- 双主题（浅色 / 深色）与入场动画，Inter 字体自托管、图标使用 Phosphor
- 纯静态站点，可部署于 Cloudflare Pages（`_headers` 已配置 COOP/COEP 跨源隔离）

## 开发

要求 Node.js 20+。

```bash
npm install          # 安装依赖
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 产出 dist/（会自动 gzip 切分引擎文件）
npm run preview      # 预览构建产物 http://localhost:4173
npm run lint         # oxlint
npm run test:e2e     # 构建 + Playwright E2E（18 个用例）
```

首次跑 E2E 前需要 `npx playwright install chromium`。

### 构建说明

`scripts/prepare-engines.mjs` 会从 npm 包（`@ffmpeg/core`、`@matbee/libreoffice-converter`）生成引擎产物：gzip 压缩后按 Cloudflare Pages 单文件 25 MiB 上限切分，运行时由 `src/engines/chunkLoader.ts` 重新组装。`public/engines` 属于生成物，已在 `.gitignore` 中忽略。

## 部署到 Cloudflare Pages（不关联 GitHub）

本仓库与 Cloudflare Pages **相互独立**，无需连接 GitHub 仓库，直接上传构建产物即可：

1. 本地构建：`npm run build`
2. 二选一上传 `dist/`：
   - **控制台**：Workers & Pages → 创建 → Pages → 上传资产 → 拖入 `dist/` 文件夹
   - **命令行**：`npx wrangler pages deploy dist`（首次会引导登录）

`dist/_headers` 会自动生效（COOP/COEP 跨源隔离 + 引擎文件长缓存）。

## 第三方组件与许可

- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) — GNU GPL v2+
- [LibreOffice WASM](https://github.com/matbeedotcom/libreoffice-document-converter) — MPL-2.0

## License

Copyright (C) 2026 Furry-yebai

本项目以 **GPL-2.0-or-later** 开源许可证发布，详见 [LICENSE](LICENSE)。

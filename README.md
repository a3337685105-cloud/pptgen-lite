# PPTGEN Studio Lite

[English](README.en.md)

PPTGEN Studio Lite 是一个本地运行的 AI PPT 图片页工作台。它把长文本、草稿或参考文件拆成逐页内容，允许你逐页确认、补充提示词、生成图片页，最后导出为 PowerPoint 文件。

> 注意：当前导出的 PPT 是图片型幻灯片。它适合快速生成视觉完整的演示稿，但不能像普通 PPT 那样逐个编辑文本框、图形和图表对象。如果文字渲染有误，建议重新生成、使用改图区局部修改，或在 Office 中手动覆盖修正。

## 当前能力

- 智能工作流：输入主文本，设置目标页数，自动拆分为封面、目录、章节、内容页或数据页。
- 两种内容模式：支持“拆分并扩写”和“仅拆分”，可设置每页目标字数和最大字数。
- 参考文件上传：支持 `txt`、`md`、`csv`、`json`、`jsonl`、`html`、`xml`、`yaml`、`docx`、`pptx`、`pdf`、`xls`、`xlsx` 和图片文件。
- 图片视觉参考：上传的图片会保存在本地，并可作为后续模型上下文；系统不会对图片做 OCR。
- 逐页编辑：拆分后可以编辑每页上屏内容、页面标题、风格关键词和本页提示词。
- 手动模式：可以跳过拆分，直接创建空项目并手动添加页面。
- 单页或批量生成：支持生成当前页、一键生成全部可生成页面、取消生成。
- 局部改图：可导入图片，用画笔或矩形标注区域，再用文字描述修改要求。
- 历史项目：生成项目会保存在浏览器本地状态中，可查看历史生图并恢复到工作台。
- 本地缓存：生成图片保存在 `generated-images/`，参考图片保存在 `data/reference-assets/`。
- PPT 导出：使用 `pptxgenjs` 导出 `.pptx`，每页会以整张图片铺满幻灯片。

## 模型与接口

### 文本与工作流模型

工作流使用 DashScope / Qwen 作为文本、拆分、风格整理和辅助处理接口。

默认模型配置：

| 用途 | 默认模型 | 环境变量 |
| --- | --- | --- |
| 主工作流助手 | `qwen3.6-plus` | `WORKFLOW_ASSISTANT_MODEL` |
| 风格 / 轻量任务 | `qwen-turbo-latest` | `WORKFLOW_STYLE_MODEL` 或 `QWEN_LIGHTWEIGHT_MODEL` |
| 即时整理任务 | `qwen-turbo-latest` | `WORKFLOW_JIT_MODEL` 或 `QWEN_LIGHTWEIGHT_MODEL` |

API Key 可在页面中填写，也可以通过环境变量提供：

```env
DASHSCOPE_API_KEY=your_dashscope_key
# 或
QWEN_API_KEY=your_qwen_key
```

### 图片生成模型

当前活跃工作流的最终生图模型是：

| Provider | Model |
| --- | --- |
| OpenAI-compatible image API | `gpt-image-2` |

需要配置 GPT 图片接口 Key：

```env
OPENAI_IMAGE_API_KEY=your_image_api_key
```

图片接口默认 Host 是 `https://api.bltcy.ai`。你可以在页面的“GPT Host / Endpoint”中填写，也可以通过环境变量配置：

```env
OPENAI_IMAGE_BASE_URL=https://your-image-host
# 或直接填写完整 generations endpoint
OPENAI_IMAGE_GENERATIONS_URL=https://your-image-host/v1/images/generations
```

也支持填写多个 Host，用逗号、分号或换行分隔。可选的 WhatAI fallback：

```env
WHATAI_IMAGE_API_KEY=your_fallback_key
```

## 环境要求

- Windows 10 / 11
- Node.js 18+
- DashScope / Qwen API Key
- OpenAI-compatible 图片接口 Key，模型为 `gpt-image-2`

## 启动

安装依赖：

```bash
npm install
```

启动本地服务：

```bash
npm start
```

打开：

```text
http://localhost:3000/
```

根路径会自动跳转到当前 V2 界面：

```text
http://localhost:3000/v2/index.html
```

Windows 也可以直接双击：

```text
start-app.bat
```

## 桌面端与打包

启动 Electron 桌面端：

```bash
npm run electron
```

构建 Windows 安装包：

```bash
npm run build:win
```

打包产物输出到 `dist/`。

## 基本使用流程

1. 在“智能生成”页填写 DashScope / Qwen API Key 和 GPT 图片接口配置。
2. 粘贴主文本，设置目标页数、处理模式和字数控制。
3. 按需上传参考文件。
4. 点击“开始拆分”，等待系统生成页面列表。
5. 逐页检查并编辑上屏内容、风格关键词和本页提示词。
6. 点击“生成该页”，或使用“一键生成”批量生成。
7. 对不满意的页面重新生成，或在“改图 / 框选”里局部修改。
8. 点击“一键导出 PPT”生成 `.pptx`。

## 支持的参考文件

| 类型 | 处理方式 |
| --- | --- |
| 文本类：`txt`、`md`、`csv`、`json`、`jsonl`、`html`、`xml`、`yaml` | 自动提取文本 |
| Office：`docx`、`pptx` | 自动提取正文或页面文本 |
| 表格：`xls`、`xlsx` | 提取前几个 Sheet 的表格内容 |
| PDF | 尝试提取文本，失败时保留文件元信息 |
| 图片：`png`、`jpg`、`jpeg`、`bmp`、`gif`、`webp` | 保存为视觉参考，不做 OCR |
| 旧版 Office / WPS：`doc`、`ppt`、`wps` | 仅保留元信息，建议转换为 `docx` 或 `pptx` |

## 输出与本地数据

这些目录是运行时产物，通常不应提交到 Git：

- `generated-images/`
- `exports/`
- `data/studio-library.json`
- `data/reference-assets/`
- `tmp/`

清理本地运行产物：

```bash
node scripts/clean-artifacts.js
```

只保留最近 N 天的生成图片：

```bash
node scripts/clean-artifacts.js --keep-days=3
```

清空所有生成图片：

```bash
node scripts/clean-artifacts.js --all-generated
```

## 常用配置

| 变量 | 说明 |
| --- | --- |
| `PORT` | 本地服务端口，默认 `3000` |
| `PPTGEN_RUNTIME_DIR` | 运行时数据目录，默认项目根目录；打包后默认可执行文件所在目录 |
| `DASHSCOPE_API_KEY` / `QWEN_API_KEY` | Qwen 文本工作流 Key |
| `OPENAI_IMAGE_API_KEY` / `OPENAI_API_KEY` | GPT 图片接口 Key |
| `OPENAI_IMAGE_BASE_URL` / `OPENAI_BASE_URL` | GPT 图片接口 Host |
| `OPENAI_IMAGE_GENERATIONS_URL` | 完整图片生成接口地址 |
| `WHATAI_IMAGE_API_KEY` / `WHATAI_API_KEY` | 可选图片 fallback Key |
| `WORKFLOW_ASSISTANT_MODEL` | 主工作流文本模型 |
| `WORKFLOW_STYLE_MODEL` | 风格整理模型 |
| `WORKFLOW_JIT_MODEL` | 即时页面整理模型 |

## 技术栈

- Node.js + Express
- 原生 HTML / CSS / JavaScript V2 前端
- Electron / electron-builder
- `pptxgenjs` 导出 PowerPoint
- `jszip` 解析 `docx` / `pptx`
- `xlsx` 解析表格
- `pdf-parse` 解析 PDF

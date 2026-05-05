# PPTGEN Studio Lite

[中文](README.md)

PPTGEN Studio Lite is a local AI workspace for creating image-based slide decks. It turns long-form text, rough drafts, and reference files into page-by-page slide content, lets you review and refine each page, generates finished slide images, and exports them as a PowerPoint deck.

> Note: exported decks are image-based PowerPoint files. They are useful for producing visually complete slides quickly, but the text, shapes, and charts are not editable as native PowerPoint objects. If rendered text is wrong, regenerate the page, use the image revision workspace, or patch the text manually in Office.

## Current Features

- Smart workflow: paste source content and split it into cover, agenda, chapter, content, and data pages.
- Two content modes: split and expand, or split only, with target and maximum character controls per page.
- Reference uploads: supports `txt`, `md`, `csv`, `json`, `jsonl`, `html`, `xml`, `yaml`, `docx`, `pptx`, `pdf`, `xls`, `xlsx`, and image files.
- Visual image references: uploaded images are stored locally and can be passed as model context; OCR is not performed.
- Page-level editing: adjust onscreen content, page title, global style keywords, and per-page prompts before generation.
- Manual mode: skip splitting, create an empty job, and add pages manually.
- Single-page and batch generation: generate one page, generate all ready pages, or cancel an active generation.
- Image revision: import an image, mark regions with pen or rectangle tools, and describe the edit you want.
- History workspace: generated projects are stored in browser local state and can be restored to the workbench.
- Local cache: generated images are saved in `generated-images/`; reference images are saved in `data/reference-assets/`.
- PPT export: exports `.pptx` with `pptxgenjs`; each generated slide image is placed full-slide.

## Models and APIs

### Text and Workflow Models

The workflow uses DashScope / Qwen for text planning, splitting, style preparation, and auxiliary processing.

Default model configuration:

| Purpose | Default model | Environment variable |
| --- | --- | --- |
| Main workflow assistant | `qwen3.6-plus` | `WORKFLOW_ASSISTANT_MODEL` |
| Style / lightweight tasks | `qwen-turbo-latest` | `WORKFLOW_STYLE_MODEL` or `QWEN_LIGHTWEIGHT_MODEL` |
| Just-in-time page tasks | `qwen-turbo-latest` | `WORKFLOW_JIT_MODEL` or `QWEN_LIGHTWEIGHT_MODEL` |

You can enter the API key in the UI or provide it through environment variables:

```env
DASHSCOPE_API_KEY=your_dashscope_key
# or
QWEN_API_KEY=your_qwen_key
```

### Image Generation Model

The active workflow currently uses:

| Provider | Model |
| --- | --- |
| OpenAI-compatible image API | `gpt-image-2` |

Configure an image API key:

```env
OPENAI_IMAGE_API_KEY=your_image_api_key
```

The default image host is `https://api.bltcy.ai`. You can override it in the UI under "GPT Host / Endpoint" or with environment variables:

```env
OPENAI_IMAGE_BASE_URL=https://your-image-host
# or provide the full generations endpoint
OPENAI_IMAGE_GENERATIONS_URL=https://your-image-host/v1/images/generations
```

Multiple hosts are supported when separated by commas, semicolons, or new lines. Optional WhatAI fallback:

```env
WHATAI_IMAGE_API_KEY=your_fallback_key
```

## Requirements

- Windows 10 / 11
- Node.js 18+
- DashScope / Qwen API key
- OpenAI-compatible image API key for `gpt-image-2`

## Start

Install dependencies:

```bash
npm install
```

Start the local server:

```bash
npm start
```

Open:

```text
http://localhost:3000/
```

The root route redirects to the active V2 UI:

```text
http://localhost:3000/v2/index.html
```

On Windows, you can also double-click:

```text
start-app.bat
```

## Desktop and Packaging

Start the Electron desktop app:

```bash
npm run electron
```

Build the Windows installer:

```bash
npm run build:win
```

Build artifacts are written to `dist/`.

## Basic Workflow

1. Open "Smart Generation" and configure your DashScope / Qwen key plus GPT image API settings.
2. Paste source content, choose target page count, processing mode, and character limits.
3. Upload reference files if needed.
4. Click "Start Splitting" and wait for the page list.
5. Review and edit onscreen content, style keywords, and page prompts.
6. Generate the current page, or batch-generate all ready pages.
7. Regenerate weak pages, or use "Revise / Region Select" for targeted image edits.
8. Click "Export PPT" to create the `.pptx`.

## Supported Reference Files

| Type | Handling |
| --- | --- |
| Text: `txt`, `md`, `csv`, `json`, `jsonl`, `html`, `xml`, `yaml` | Extracted as text |
| Office: `docx`, `pptx` | Extracts document or slide text |
| Spreadsheets: `xls`, `xlsx` | Extracts content from the first sheets |
| PDF | Attempts text extraction; keeps metadata if extraction fails |
| Images: `png`, `jpg`, `jpeg`, `bmp`, `gif`, `webp` | Saved as visual references; no OCR |
| Legacy Office / WPS: `doc`, `ppt`, `wps` | Metadata only; convert to `docx` or `pptx` for text extraction |

## Output and Local Data

These runtime artifacts should usually stay out of Git:

- `generated-images/`
- `exports/`
- `data/studio-library.json`
- `data/reference-assets/`
- `tmp/`

Clean local runtime artifacts:

```bash
node scripts/clean-artifacts.js
```

Keep only generated images from the last N days:

```bash
node scripts/clean-artifacts.js --keep-days=3
```

Remove all generated images:

```bash
node scripts/clean-artifacts.js --all-generated
```

## Common Configuration

| Variable | Description |
| --- | --- |
| `PORT` | Local server port, defaults to `3000` |
| `PPTGEN_RUNTIME_DIR` | Runtime data directory; defaults to the project root, or executable directory when packaged |
| `DASHSCOPE_API_KEY` / `QWEN_API_KEY` | Qwen text workflow key |
| `OPENAI_IMAGE_API_KEY` / `OPENAI_API_KEY` | GPT image API key |
| `OPENAI_IMAGE_BASE_URL` / `OPENAI_BASE_URL` | GPT image API host |
| `OPENAI_IMAGE_GENERATIONS_URL` | Full image generations endpoint |
| `WHATAI_IMAGE_API_KEY` / `WHATAI_API_KEY` | Optional image fallback key |
| `WORKFLOW_ASSISTANT_MODEL` | Main workflow text model |
| `WORKFLOW_STYLE_MODEL` | Style preparation model |
| `WORKFLOW_JIT_MODEL` | Just-in-time page preparation model |

## Tech Stack

- Node.js + Express
- Native HTML / CSS / JavaScript V2 frontend
- Electron / electron-builder
- `pptxgenjs` for PowerPoint export
- `jszip` for `docx` / `pptx` parsing
- `xlsx` for spreadsheet parsing
- `pdf-parse` for PDF parsing

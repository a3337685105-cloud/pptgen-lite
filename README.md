# Nano Banana PPT Studio

Local PPT workflow studio for turning long-form content, rough ideas, or reference files into slide-ready image pages, then exporting a PowerPoint deck.

## Requirements

- Windows 10/11
- Node.js 18+; Node.js 20+ is recommended
- **Text / planning API key** (one of):
  - DashScope / Qwen API key
- **Image generation API key** (one of):
  - Google Gemini API key
  - OpenAI / compatible API key (for GPT Image 2)
  - Grsai API key (for Nano Banana series)

## Start

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000/
```

On Windows, you can also double-click:

```text
start-app.bat
```

The root route redirects to the active V2 UI at `/v2/index.html`.

## Active Features

- **V2 smart PPT workflow UI** with a glassmorphism design
- **Multi-model image generation** supporting Gemini, GPT Image 2, Grsai Nano Banana 2 / Pro, and Grsai Gemini 3.1 Pro
- **Theme definition** with questionnaire-driven style matching
- **Content splitting** with AI processing modes (strict / balanced / creative / expansion)
- **Manual mode** (skip split): create pages one by one without LLM text splitting
- **Page preparation** with risk-level hints and editable onscreen content
- **Single-page and batch image generation**
- **Modify current page** with prompt-guided regeneration
- **Copy final image prompt** for debugging or external use
- **Reference uploads** for text, Markdown, JSON, HTML, XML, DOCX, PPTX, XLS/XLSX, PDF, and images
- Image references are kept as visual context for the model; OCR is not performed
- **Local generated image cache** in `generated-images/`
- **PPT export** through the project dependency `pptxgenjs`

## Supported Image Generation Models

| Provider | Models |
|----------|--------|
| Gemini   | `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` |
| Grsai    | `nano-banana-2`, `nano-banana-pro`, `gemini-3.1-pro` |
| OpenAI   | `gpt-image-2` (via compatible endpoint) |

## Local Runtime Data

These folders are runtime artifacts and should not be committed:

- `generated-images/`
- `exports/`
- `data/studio-library.json`
- `data/reference-assets/`
- `tmp/`

Clean old local artifacts with:

```bash
npm run clean:artifacts
```

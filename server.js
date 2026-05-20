if (typeof DOMMatrix === "undefined") {
  global.DOMMatrix = class DOMMatrix {};
}
if (typeof ImageData === "undefined") {
  global.ImageData = class ImageData {};
}
if (typeof Path2D === "undefined") {
  global.Path2D = class Path2D {};
}

const crypto = require("crypto");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");
const multer = require("multer");
const JSZip = require("jszip");
const PptxGenJS = require("pptxgenjs");
const XLSX = require("xlsx");
const pdfParse = require("pdf-parse");
const { installWorkflowRoutes } = require("./workflow-service");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.PPTGEN_HOST || "127.0.0.1";
let ACTIVE_PORT = Number(PORT);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const RUNTIME_DIR = process.env.PPTGEN_RUNTIME_DIR || (process.pkg ? path.dirname(process.execPath) : __dirname);
const GENERATED_DIR = path.join(RUNTIME_DIR, "generated-images");
const EXPORTS_DIR = path.join(RUNTIME_DIR, "exports");
const DATA_DIR = path.join(RUNTIME_DIR, "data");
const REFERENCE_ASSETS_DIR = path.join(DATA_DIR, "reference-assets");
const LIBRARY_DOC_PATH = path.join(DATA_DIR, "studio-library.json");

loadLocalEnv();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 50 * 1024 * 1024,
  },
});

const REGION_MAP = {
  beijing: "https://dashscope.aliyuncs.com",
};
const GRSAI_IMAGE_DEFAULT_HOST = "https://grsai.dakka.com.cn";
const GRSAI_API_GENERATE_PATH = "/v1/api/generate";
const GRSAI_DRAW_COMPLETIONS_PATH = "/v1/draw/completions";
const OPENAI_IMAGE_DEFAULT_HOST = `${GRSAI_IMAGE_DEFAULT_HOST}${GRSAI_API_GENERATE_PATH}`;
const OPENAI_IMAGE_GENERATIONS_PATH = "/v1/images/generations";
const WHATAI_IMAGE_DEFAULT_HOST = "https://api.whatai.cc";
const WHATAI_IMAGE_FALLBACK_DELAY_MS = clampNumber(process.env.WHATAI_IMAGE_FALLBACK_DELAY_MS, 60000, 5000, 300000);
const WHATAI_IMAGE_POLL_INTERVAL_MS = clampNumber(process.env.WHATAI_IMAGE_POLL_INTERVAL_MS, 3000, 1000, 15000);
const WHATAI_IMAGE_POLL_TIMEOUT_MS = clampNumber(process.env.WHATAI_IMAGE_POLL_TIMEOUT_MS, 240000, 30000, 900000);
const OPENAI_IMAGE_MODELS = new Set([
  "gpt-image-2",
  "gpt-image-2-vip",
]);
function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

const HTTP_TIMEOUT_SEC = clampNumber(process.env.PPTGEN_HTTP_TIMEOUT_SEC, 300, 30, 900);
const HTTP_RETRY_COUNT = Math.round(clampNumber(process.env.PPTGEN_HTTP_RETRY_COUNT, 2, 0, 5));
const HTTP_RETRY_DELAY_MS = clampNumber(process.env.PPTGEN_HTTP_RETRY_DELAY_MS, 1500, 200, 10000);

fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(EXPORTS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(REFERENCE_ASSETS_DIR, { recursive: true });

app.use(express.json({ limit: "50mb" }));
app.get("/", (_req, res) => {
  res.redirect(302, "/v2/index.html");
});
app.use(express.static(PUBLIC_DIR));
app.use("/generated-images", express.static(GENERATED_DIR));
app.use("/exports", express.static(EXPORTS_DIR));
app.use("/reference-assets", express.static(REFERENCE_ASSETS_DIR));

function resolveRegion(region) {
  return REGION_MAP[region] || REGION_MAP.beijing;
}

function loadLocalEnv() {
  [".env.local", ".env"].forEach((fileName) => {
    const filePath = path.join(RUNTIME_DIR, fileName);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return;
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(process.env, key)) return;
      process.env[key] = match[2].replace(/^["']|["']$/g, "");
    });
  });
}

function resolveDashScopeApiKey(apiKey) {
  return String(apiKey || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "").trim();
}




function resolveOpenAiImageApiKey(apiKey) {
  return String(apiKey || process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || process.env.GRSAI_API_KEY || process.env.GRSAI_IMAGE_API_KEY || "").trim();
}

function resolveWhatAiImageApiKey(apiKey) {
  return String(apiKey || process.env.WHATAI_IMAGE_API_KEY || process.env.WHATAI_API_KEY || "").trim();
}



function isOpenAiImageModel(model) {
  return OPENAI_IMAGE_MODELS.has(String(model || "").trim());
}

function isHostedImageModel(model) {
  return isOpenAiImageModel(model);
}

function resolveGrsaiDrawEndpoint(endpointOrHost) {
  const value = String(
    endpointOrHost
    || process.env.GRSAI_DRAW_COMPLETIONS_URL
    || process.env.GRSAI_IMAGE_BASE_URL
    || process.env.OPENAI_IMAGE_GENERATIONS_URL
    || process.env.OPENAI_IMAGE_BASE_URL
    || process.env.OPENAI_BASE_URL
    || GRSAI_IMAGE_DEFAULT_HOST,
  ).trim().replace(/\/+$/, "");
  if (isGrsaiApiGenerateEndpoint(value) || isGrsaiLegacyDrawEndpoint(value)) {
    return value;
  }
  if (/\/v1$/i.test(value)) {
    return `${value}/api/generate`;
  }
  return `${value}${GRSAI_API_GENERATE_PATH}`;
}

function isGrsaiApiGenerateEndpoint(value) {
  return new RegExp(`${GRSAI_API_GENERATE_PATH.replace(/\//g, "\\/")}$`, "i").test(String(value || "").trim());
}

function isGrsaiLegacyDrawEndpoint(value) {
  return new RegExp(`${GRSAI_DRAW_COMPLETIONS_PATH.replace(/\//g, "\\/")}$`, "i").test(String(value || "").trim());
}

function isGrsaiDrawEndpoint(value) {
  const endpoint = String(value || "").trim();
  return isGrsaiApiGenerateEndpoint(endpoint)
    || isGrsaiLegacyDrawEndpoint(endpoint)
    || /(^|\/\/)(?:[^/]*\.)?(?:grsaiapi\.com|grsai\.dakka\.com\.cn)(?:[/:]|$)/i.test(endpoint);
}

function resolveOpenAiImageEndpoint(endpointOrHost) {
  const value = String(
    endpointOrHost
    || process.env.GRSAI_DRAW_COMPLETIONS_URL
    || process.env.GRSAI_IMAGE_BASE_URL
    || process.env.OPENAI_IMAGE_GENERATIONS_URL
    || process.env.OPENAI_IMAGE_BASE_URL
    || process.env.OPENAI_BASE_URL
    || OPENAI_IMAGE_DEFAULT_HOST,
  ).trim().replace(/\/+$/, "");
  if (!value || isGrsaiDrawEndpoint(value)) {
    return resolveGrsaiDrawEndpoint(value);
  }
  if (new RegExp(`${OPENAI_IMAGE_GENERATIONS_PATH.replace(/\//g, "\\/")}$`, "i").test(value)) {
    return value;
  }
  if (/\/v1$/i.test(value)) {
    return `${value}/images/generations`;
  }
  return `${value}${OPENAI_IMAGE_GENERATIONS_PATH}`;
}

function resolveOpenAiBaseHost(endpointOrHost) {
  const endpoint = resolveOpenAiImageEndpoint(endpointOrHost);
  if (isGrsaiDrawEndpoint(endpoint)) {
    return endpoint
      .replace(new RegExp(`${GRSAI_API_GENERATE_PATH.replace(/\//g, "\\/")}$`, "i"), "")
      .replace(new RegExp(`${GRSAI_DRAW_COMPLETIONS_PATH.replace(/\//g, "\\/")}$`, "i"), "")
      .replace(/\/+$/, "");
  }
  return endpoint
    .replace(new RegExp(`${OPENAI_IMAGE_GENERATIONS_PATH.replace(/\//g, "\\/")}$`, "i"), "")
    .replace(/\/+$/, "");
}

function resolveOpenAiModelsEndpoint(endpointOrHost) {
  return `${resolveOpenAiBaseHost(endpointOrHost)}/v1/models`;
}

function resolveOpenAiImageEndpoints(endpointOrHost) {
  const configured = String(
    endpointOrHost
    || process.env.GRSAI_DRAW_COMPLETIONS_URL
    || process.env.GRSAI_IMAGE_BASE_URL
    || process.env.OPENAI_IMAGE_GENERATIONS_URL
    || process.env.OPENAI_IMAGE_BASE_URL
    || process.env.OPENAI_BASE_URL
    || OPENAI_IMAGE_DEFAULT_HOST,
  )
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hosts = configured.length ? configured : [OPENAI_IMAGE_DEFAULT_HOST];
  return Array.from(new Set(hosts.map((item) => resolveOpenAiImageEndpoint(item))));
}

function extensionToMimeType(extension) {
  const normalized = String(extension || "").toLowerCase();
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".bmp") return "image/bmp";
  if (normalized === ".gif") return "image/gif";
  return "image/png";
}

function pickExtensionFromMimeType(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("bmp")) return ".bmp";
  if (mime.includes("gif")) return ".gif";
  return ".png";
}

function getImageExtensionFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return ".jpg";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer.slice(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (buffer.slice(0, 6).toString("ascii") === "GIF87a" || buffer.slice(0, 6).toString("ascii") === "GIF89a") return ".gif";
  return "";
}




function normalizeOpenAiImageSize(size, slideAspect) {
  const raw = String(size || "").trim().toLowerCase().replace("*", "x");
  if (raw === "auto") return "auto";
  if (/^\d+x\d+$/.test(raw)) return raw;

  const quality = String(size || "").trim().toUpperCase();
  const aspect = String(slideAspect || "").trim();
  if (aspect === "1:1") {
    return quality === "4K" ? "2048x2048" : "1024x1024";
  }
  if (aspect === "4:3") {
    if (quality === "4K") return "2048x1536";
    if (quality === "1K") return "1024x768";
    return "1536x1152";
  }
  if (aspect === "9:16") {
    if (quality === "4K") return "2160x3840";
    if (quality === "1K") return "864x1536";
    return "1024x1536";
  }
  if (quality === "4K") return "3840x2160";
  if (quality === "1K") return "1536x864";
  return "2048x1152";
}

const GRSAI_VIP_SIZE_PRESETS = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  "16:9": { "1K": "1280x720", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "720x1280", "2K": "1152x2048", "4K": "2160x3840" },
  "4:3": { "1K": "1152x864", "2K": "2304x1728", "4K": "3264x2448" },
  "3:4": { "1K": "864x1152", "2K": "1728x2304", "4K": "2448x3264" },
  "3:2": { "1K": "1536x1024", "2K": "2048x1360", "4K": "3504x2336" },
  "2:3": { "1K": "1024x1536", "2K": "1360x2048", "4K": "2336x3504" },
  "5:4": { "1K": "1120x896", "2K": "2240x1792", "4K": "3200x2560" },
  "4:5": { "1K": "896x1120", "2K": "1792x2240", "4K": "2560x3200" },
  "21:9": { "1K": "1456x624", "2K": "2912x1248", "4K": "3840x1648" },
  "9:21": { "1K": "624x1456", "2K": "1248x2912", "4K": "1648x3840" },
  "1:3": { "2K": "688x2048", "4K": "1280x3840" },
  "3:1": { "2K": "2048x688", "4K": "3840x1280" },
  "2:1": { "1K": "1536x768", "2K": "3072x1536", "4K": "3840x1920" },
  "1:2": { "1K": "768x1536", "2K": "1536x3072", "4K": "1920x3840" },
};

function normalizeGrsaiVipPixelSize(size, slideAspect) {
  const quality = String(size || "").trim().toUpperCase();
  const normalizedQuality = quality === "1K" || quality === "4K" ? quality : "2K";
  const aspect = String(slideAspect || "16:9").trim();
  const preset = GRSAI_VIP_SIZE_PRESETS[aspect] || GRSAI_VIP_SIZE_PRESETS["16:9"];
  return preset[normalizedQuality] || preset["2K"] || "2048x1152";
}

function normalizeGrsaiAspectRatio(size, slideAspect, model) {
  const raw = String(size || "").trim().toLowerCase().replace("*", "x");
  if (/^\d+x\d+$/.test(raw)) return raw;
  const normalizedModel = String(model || "").trim();
  if (normalizedModel === "gpt-image-2-vip") {
    return normalizeGrsaiVipPixelSize(size, slideAspect);
  }
  const aspect = String(slideAspect || "").trim();
  if (/^\d+:\d+$/.test(aspect)) return aspect;
  return "16:9";
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").trim().match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
  if (!match) return null;
  const mimeType = match[1] || "image/png";
  const buffer = Buffer.from(String(match[2] || "").replace(/[\s\r\n\t]+/g, ""), "base64");
  return {
    mimeType,
    extension: pickExtensionFromMimeType(mimeType),
    buffer,
  };
}

async function saveGeneratedBufferToFile(buffer, { prefix = "result", requestId = "result", index = 1, extension = ".png" } = {}) {
  await fsp.mkdir(GENERATED_DIR, { recursive: true });
  const fileName = [
    sanitizeSegment(prefix, "result"),
    buildTimestamp(),
    sanitizeSegment(requestId, "result"),
    sanitizeSegment(index, "1"),
    crypto.randomUUID().slice(0, 8),
  ].join("_") + extension;
  const targetPath = path.join(GENERATED_DIR, fileName);
  await fsp.writeFile(targetPath, buffer);
  return {
    fileName,
    savedPath: targetPath,
    localUrl: `/generated-images/${encodeURIComponent(fileName)}`,
  };
}

async function loadImageSource(source) {
  const value = String(source || "").trim();
  if (!value) {
    throw new Error("输入图片为空。");
  }

  const parsedDataUrl = parseDataUrl(value);
  if (parsedDataUrl) {
    return parsedDataUrl;
  }

  if (value.startsWith("/generated-images/")) {
    const fileName = decodeURIComponent(value.slice("/generated-images/".length));
    const targetPath = path.join(GENERATED_DIR, fileName);
    const buffer = await fsp.readFile(targetPath);
    const extension = path.extname(targetPath) || ".png";
    return {
      buffer,
      extension,
      mimeType: extensionToMimeType(extension),
    };
  }

  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    if (!response.ok) {
      throw new Error(`读取输入图片失败，状态码 ${response.status}。`);
    }
    const contentType = response.headers.get("content-type") || "";
    const extension = pickFileExtension(value, contentType);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      extension,
      mimeType: contentType || extensionToMimeType(extension),
    };
  }

  throw new Error("只支持 data URL、本地缓存图或 http(s) 图片链接作为输入。");
}

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}

function getPptSlideSize(slideAspect) {
  switch (String(slideAspect || "").trim()) {
    case "4:3":
      return { width: 1024, height: 768 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1280, height: 720 };
  }
}

function getPptLayout(slideAspect) {
  switch (String(slideAspect || "").trim()) {
    case "4:3":
      return { name: "PPTGEN_4_3", width: 10, height: 7.5 };
    case "1:1":
      return { name: "PPTGEN_1_1", width: 7.5, height: 7.5 };
    default:
      return { name: "PPTGEN_16_9", width: 13.333, height: 7.5 };
  }
}

function toPptPosition(position, slideSize, layout) {
  return {
    x: (position.left / slideSize.width) * layout.width,
    y: (position.top / slideSize.height) * layout.height,
    w: (position.width / slideSize.width) * layout.width,
    h: (position.height / slideSize.height) * layout.height,
  };
}

async function saveReferenceImage(file) {
  const extension = pickExtensionFromMimeType(file.mimetype || extensionToMimeType(path.extname(file.originalname)));
  const assetId = crypto.randomUUID();
  const fileName = `${assetId}${extension}`;
  const targetPath = path.join(REFERENCE_ASSETS_DIR, fileName);
  await fsp.mkdir(REFERENCE_ASSETS_DIR, { recursive: true });
  await fsp.writeFile(targetPath, file.buffer);
  return {
    assetId,
    fileName,
    savedPath: targetPath,
    previewUrl: `/reference-assets/${encodeURIComponent(fileName)}`,
  };
}

function runPowerShellJson(script, env = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ], {
      windowsHide: true,
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("PowerPoint 导出原页截图超时。"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}.`));
        return;
      }
      const raw = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "";
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`PowerPoint 导出结果解析失败：${raw.slice(0, 300)}`));
      }
    });
  });
}

async function exportPptxSlideImages(buffer, originalname = "") {
  if (process.platform !== "win32") {
    throw new Error("当前系统不是 Windows，无法使用 PowerPoint 导出原页截图。");
  }

  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "pptgen-pptx-"));
  const inputPath = path.join(tmpRoot, "source.pptx");
  const exportPrefix = `pptx_${buildTimestamp()}_${crypto.randomUUID().slice(0, 8)}`;
  await fsp.writeFile(inputPath, buffer);
  await fsp.mkdir(REFERENCE_ASSETS_DIR, { recursive: true });

  const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.InteropServices
$inputPath = $env:PPTGEN_PPTX_PATH
$outputDir = $env:PPTGEN_PPTX_OUTPUT_DIR
$prefix = $env:PPTGEN_PPTX_PREFIX
$ppt = $null
$presentation = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $presentation = $ppt.Presentations.Open($inputPath, $true, $false, $false)
  $slideWidth = [double]$presentation.PageSetup.SlideWidth
  $slideHeight = [double]$presentation.PageSetup.SlideHeight
  $targetWidth = 1600
  $targetHeight = [int][Math]::Round($targetWidth * $slideHeight / $slideWidth)
  if ($targetHeight -lt 1) { $targetHeight = 900 }
  $images = @()
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $fileName = "{0}_p{1:D3}.png" -f $prefix, $i
    $target = Join-Path $outputDir $fileName
    $slide = $presentation.Slides.Item($i)
    $slide.Export($target, "PNG", $targetWidth, $targetHeight)
    $images += [pscustomobject]@{
      pageNumber = $i
      fileName = $fileName
      width = $targetWidth
      height = $targetHeight
    }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($slide) | Out-Null
  }
  [pscustomobject]@{
    ok = $true
    slideCount = $presentation.Slides.Count
    images = $images
  } | ConvertTo-Json -Compress -Depth 6
} finally {
  if ($presentation -ne $null) {
    try { $presentation.Close() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
  }
  if ($ppt -ne $null) {
    try { $ppt.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  try {
    const result = await runPowerShellJson(script, {
      PPTGEN_PPTX_PATH: inputPath,
      PPTGEN_PPTX_OUTPUT_DIR: REFERENCE_ASSETS_DIR,
      PPTGEN_PPTX_PREFIX: exportPrefix,
    }, 180000);
    return (Array.isArray(result?.images) ? result.images : [])
      .map((item) => ({
        pageNumber: Number(item.pageNumber || 0),
        fileName: String(item.fileName || ""),
        previewUrl: `/reference-assets/${encodeURIComponent(String(item.fileName || ""))}`,
        width: Number(item.width || 0),
        height: Number(item.height || 0),
        sourceFileName: originalname,
      }))
      .filter((item) => item.pageNumber && item.fileName);
  } finally {
    const tmpBase = path.join(os.tmpdir(), "pptgen-pptx-");
    if (tmpRoot.startsWith(tmpBase)) {
      await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function loadReferenceAssetAsDataUrl(referenceFile) {
  const fileName = String(referenceFile?.assetFileName || "").trim()
    || (String(referenceFile?.previewUrl || "").startsWith("/reference-assets/")
      ? decodeURIComponent(String(referenceFile.previewUrl).slice("/reference-assets/".length))
      : "");
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) return "";
  const targetPath = path.join(REFERENCE_ASSETS_DIR, fileName);
  const buffer = await fsp.readFile(targetPath);
  return toDataUrl(buffer, referenceFile?.mimeType || extensionToMimeType(path.extname(fileName)));
}

function normalizeExportText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildExportSlides(pages) {
  return (Array.isArray(pages) ? pages : []).map((page, index) => {
    const fallbackTitle = `第 ${index + 1} 页`;
    const title = normalizeExportText(page?.onscreenTitle || page?.pageTitle || fallbackTitle).split("\n")[0].trim();
    const body = normalizeExportText(page?.onscreenBody || page?.onscreenContent || page?.pageContent || "");
    return {
      pageNumber: Number(page?.pageNumber || index + 1),
      title: title || fallbackTitle,
      body,
      imageUrl: String(page?.imageUrl || page?.baseImage || "").trim(),
    };
  });
}






function buildOpenAiImageGenerationsUrl(baseUrl) {
  return resolveOpenAiImageEndpoint(baseUrl);
}

function buildWhatAiUrl(pathName) {
  const host = String(process.env.WHATAI_IMAGE_BASE_URL || WHATAI_IMAGE_DEFAULT_HOST).trim().replace(/\/+$/, "");
  return `${host}${pathName}`;
}

function shouldUsePowerShellHttpFallback(error) {
  if (process.platform !== "win32") return false;
  const message = String(error?.message || "");
  const causeMessage = String(error?.cause?.message || "");
  const errorCode = String(error?.code || error?.cause?.code || "");
  return [
    /fetch failed/i.test(message),
    /secure TLS connection/i.test(causeMessage),
    /ssl|tls/i.test(causeMessage),
    /socket disconnected/i.test(causeMessage),
    ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"].includes(errorCode),
  ].some(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableHttpStatus(status) {
  const code = Number(status);
  return !code || code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
}

function isRetryableHttpError(error) {
  const message = String(error?.message || error?.cause?.message || "");
  const errorCode = String(error?.code || error?.cause?.code || "");
  return /timeout|timed out|操作超时|network|socket|fetch failed/i.test(message)
    || ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"].includes(errorCode);
}

function cleanUpstreamErrorMessage(message, fallback = "上游服务请求失败。") {
  const raw = String(message || "").trim();
  if (!raw) return fallback;
  if (/operation timed out|timed out|操作超时|time-?out/i.test(raw)) {
    return `图片生成请求超时，已自动重试 ${HTTP_RETRY_COUNT} 次仍未成功。请稍后再试，或降低图片复杂度后重试。`;
  }
  if (/Invoke-WebRequest|WebCmdletWebResponseException|HttpWebRequest|FullyQualifiedErrorId|CategoryInfo/i.test(raw)) {
    return fallback;
  }
  return raw.replace(/\s+/g, " ").slice(0, 300);
}

function sanitizeLogUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    ["key", "api_key", "access_token", "token", "secret"].forEach((name) => {
      if (url.searchParams.has(name)) url.searchParams.set(name, "[redacted]");
    });
    return url.toString();
  } catch {
    return raw.replace(/([?&](?:key|api_key|access_token|token|secret)=)[^&]+/gi, "$1[redacted]");
  }
}

function extractUpstreamErrorMessage(data, fallback) {
  return data?.error?.message
    || data?.message
    || data?.data?.message
    || data?.error
    || fallback;
}

function createImageUpstreamError({ provider, endpoint, status, model, data, fallback }) {
  const upstreamMessage = extractUpstreamErrorMessage(data, fallback);
  const error = new Error(cleanUpstreamErrorMessage(upstreamMessage, fallback));
  error.status = status || 502;
  error.details = data;
  error.provider = provider || "";
  error.endpoint = sanitizeLogUrl(endpoint);
  error.model = String(model || "").trim();
  error.upstreamCode = String(data?.error?.code || data?.code || data?.data?.code || "").trim();
  error.upstreamRequestId = String(data?.request_id || data?.id || data?.error?.request_id || data?.data?.request_id || "").trim();
  logImageUpstreamError(error);
  return error;
}

function logImageUpstreamError(error) {
  const payload = {
    provider: error?.provider || "",
    endpoint: sanitizeLogUrl(error?.endpoint || ""),
    status: error?.status || "",
    model: error?.model || "",
    upstreamCode: error?.upstreamCode || "",
    upstreamRequestId: error?.upstreamRequestId || "",
    message: cleanUpstreamErrorMessage(error?.message || "", "图片上游请求失败。"),
  };
  console.warn(`[image-upstream-error] ${JSON.stringify(payload)}`);
}

function buildPublicImageErrorDetails(error) {
  return {
    provider: error?.provider || "",
    endpoint: sanitizeLogUrl(error?.endpoint || ""),
    status: error?.status || "",
    model: error?.model || "",
    upstreamCode: error?.upstreamCode || "",
    upstreamRequestId: error?.upstreamRequestId || "",
  };
}

async function requestJsonViaPowerShell({ url, method = "POST", headers = {}, body }) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$request = ([Console]::In.ReadToEnd() | ConvertFrom-Json)",
    "$headers = @{}",
    "$contentType = $null",
    "if ($null -ne $request.headers) {",
    "  $request.headers.PSObject.Properties | ForEach-Object {",
    "    if ($_.Name -ieq 'Content-Type') { $contentType = [string]$_.Value }",
    "    else { $headers[$_.Name] = [string]$_.Value }",
    "  }",
    "}",
    `$params = @{ Uri = [string]$request.url; Method = [string]$request.method; UseBasicParsing = $true; TimeoutSec = ${HTTP_TIMEOUT_SEC}; Headers = $headers }`,
    "if ($contentType) { $params['ContentType'] = $contentType }",
    "if ($null -ne $request.body -and [string]$request.body -ne '') { $params['Body'] = [string]$request.body }",
    "$statusCode = 0",
    "$content = ''",
    "try {",
    "  $response = Invoke-WebRequest @params",
    "  $statusCode = [int]$response.StatusCode",
    "  $content = [string]$response.Content",
    "} catch {",
    "  if ($_.Exception.Response) {",
    "    $resp = $_.Exception.Response",
    "    $statusCode = [int]$resp.StatusCode",
    "    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())",
    "    $content = $reader.ReadToEnd()",
    "    $reader.Close()",
    "  } else {",
    "    $statusCode = 0",
    "    $content = (@{ error = @{ code = 'PowerShellRequestFailed'; message = [string]$_.Exception.Message } } | ConvertTo-Json -Compress -Depth 8)",
    "  }",
    "}",
    "$result = @{ ok = ($statusCode -ge 200 -and $statusCode -lt 300); status = $statusCode; text = $content }",
    "[Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 8))",
  ].join("\n");

  const payload = JSON.stringify({ url, method, headers, body });
  const raw = await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(stderr.trim() || `PowerShell HTTP fallback exited with code ${code}.`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`PowerShell HTTP fallback returned invalid JSON: ${stderr.trim() || stdout.slice(0, 300)}`));
      }
    });

    child.stdin.end(payload, "utf8");
  });

  const text = typeof raw?.text === "string" ? raw.text : "";
  try {
    const status = Number(raw?.status);
    return {
      ok: Boolean(raw?.ok),
      status: Number.isFinite(status) ? status : 500,
      data: JSON.parse(text),
    };
  } catch {
    const status = Number(raw?.status);
    return {
      ok: Boolean(raw?.ok),
      status: Number.isFinite(status) ? status : 500,
      data: {
        code: "InvalidJSON",
        message: text || "Upstream returned a non-JSON response.",
      },
    };
  }
}

async function requestJsonOnceViaFetch({ url, method = "POST", headers = {}, body }) {
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });
    return parseJsonResponse(response);
  } catch (error) {
    if (!shouldUsePowerShellHttpFallback(error)) {
      throw error;
    }
    return requestJsonViaPowerShell({ url, method, headers, body });
  }
}

async function requestJsonViaFetch({ url, method = "POST", headers = {}, body }) {
  let lastError = null;
  let lastParsed = null;
  const totalAttempts = HTTP_RETRY_COUNT + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const parsed = await requestJsonOnceViaFetch({ url, method, headers, body });
      lastParsed = parsed;
      if (parsed.ok || !isRetryableHttpStatus(parsed.status) || attempt === totalAttempts) {
        return parsed;
      }
    } catch (error) {
      lastError = error;
      if (!isRetryableHttpError(error) || attempt === totalAttempts) {
        throw error;
      }
    }

    await sleep(HTTP_RETRY_DELAY_MS * attempt);
  }

  if (lastParsed) return lastParsed;
  throw lastError || new Error("HTTP request failed.");
}


function buildOpenAiImageGenerationBody({ payload, slideAspect }) {
  const extracted = extractPromptAndImagesFromPayload(payload);
  if (!extracted.prompt) {
    const error = new Error("OpenAI 图片请求缺少提示词。");
    error.status = 400;
    throw error;
  }
  const model = String(payload?.model || "gpt-image-2-vip").trim() || "gpt-image-2-vip";
  return {
    model,
    prompt: extracted.prompt,
    size: normalizeOpenAiImageSize(payload?.parameters?.size, slideAspect),
    _grsaiAspectRatio: normalizeGrsaiAspectRatio(payload?.parameters?.size, slideAspect, model),
    response_format: "b64_json",
    ...(extracted.urls.length ? { image: extracted.urls } : {}),
  };
}

function buildOpenAiCompatibleImageBody(body) {
  const { _grsaiAspectRatio, ...compatibleBody } = body || {};
  return compatibleBody;
}

function buildGrsaiDrawCompletionBody(body, endpoint) {
  const urls = Array.isArray(body?.image)
    ? body.image.filter(Boolean)
    : (body?.image ? [body.image] : []);
  const model = String(body?.model || "gpt-image-2-vip").trim() || "gpt-image-2-vip";
  const prompt = String(body?.prompt || "").trim();
  const aspectRatio = String(body?._grsaiAspectRatio || body?.size || "2048x1152").trim();
  if (isGrsaiApiGenerateEndpoint(endpoint)) {
    return {
      model,
      prompt,
      images: urls,
      aspectRatio,
      replyType: "json",
    };
  }
  return {
    model,
    prompt,
    aspectRatio,
    quality: "auto",
    shutProgress: true,
    ...(urls.length ? { urls } : {}),
  };
}

async function normalizeOpenAiImageGenerationResponse(data, model) {
  const requestId = String(data?.id || data?.request_id || data?.response_id || crypto.randomUUID()).trim();
  const content = [];

  const rawItems = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.images) ? data.images : (Array.isArray(data?.urls) ? data.urls : (Array.isArray(data) ? data : [])));

  const choices = data?.output?.choices || data?.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choiceContent = choices[0]?.message?.content;
    if (Array.isArray(choiceContent)) {
      for (const item of choiceContent) {
        if (item.type === "image" && item.image) content.push(item);
        else if (item.type === "text" && item.text) content.push(item);
      }
    } else if (typeof choiceContent === "string") {
      content.push({ type: "text", text: choiceContent });
    }
  }

  let imageIndex = 0;
  for (const item of rawItems) {
    let rawData = "";
    let revisedPrompt = "";

    if (typeof item === "string") {
      rawData = item.trim();
    } else if (item && typeof item === "object") {
      rawData = String(item.b64_json || item.url || item.image || "").trim();
      revisedPrompt = String(item.revised_prompt || "").trim();
    }

    if (revisedPrompt) content.push({ type: "text", text: revisedPrompt });

    if (rawData) {
      let buffer = null;
      let finalUrl = "";
      let extension = ".png";

      const sniff = async (input) => {
        if (!input || typeof input !== "string") return null;
        const current = input.trim();

        if (/^https?:\/\//i.test(current)) {
          try {
            const response = await fetch(current);
            if (response.ok) {
              const imageBuffer = Buffer.from(await response.arrayBuffer());
              const detectedExtension = getImageExtensionFromBuffer(imageBuffer);
              if (detectedExtension) {
                extension = detectedExtension || pickExtensionFromMimeType(response.headers.get("content-type") || "") || extension;
                return imageBuffer;
              }
            }
          } catch {}
          finalUrl = current;
          return null;
        }

        if (current.startsWith("data:")) {
          const p = parseDataUrl(current);
          if (!p) return null;
          const detectedExtension = getImageExtensionFromBuffer(p.buffer);
          if (!detectedExtension) return null;
          extension = detectedExtension || p.extension || extension;
          return p.buffer;
        }

        try {
          const normalizedBase64 = current.replace(/[\s\r\n\t]+/g, "");
          if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64) || normalizedBase64.length % 4 === 1) {
            return null;
          }
          const b = Buffer.from(normalizedBase64, "base64");
          if (b.length < 10) return null;

          const detectedExtension = getImageExtensionFromBuffer(b);
          if (detectedExtension) {
            extension = detectedExtension;
            return b;
          }

          const asText = b.toString("utf8").trim();
          if (asText.startsWith("{") || asText.startsWith("[")) {
             try {
               const nested = JSON.parse(asText);
               const nextRaw = nested.url || nested.image || nested.b64_json || (Array.isArray(nested.data) ? (nested.data[0]?.url || nested.data[0]?.b64_json) : "");
               if (nextRaw && nextRaw !== current) return await sniff(nextRaw);
             } catch {}
          }

          return null;
        } catch {
          return null;
        }
      };

      buffer = await sniff(rawData);

      if (finalUrl) {
        content.push({ type: "image", image: finalUrl });
      } else if (buffer) {
        imageIndex += 1;
        const saved = await saveGeneratedBufferToFile(buffer, {
          prefix: "gpt_image_2",
          requestId,
          index: imageIndex,
          extension,
        });
        content.push({ type: "image", image: saved.localUrl });
      }
    }
  }

  const hasImage = content.some((item) => item.type === "image" && item.image);
  if (!hasImage && rawItems.length > 0) {
    const error = new Error("OpenAI 图片接口返回了非图片内容，未保存为图片文件。请检查中转站响应字段是否为 url 或 b64_json。");
    error.status = 502;
    error.details = data;
    throw error;
  }

  return {
    request_id: requestId,
    provider: "openai-image",
    model,
    usage: data?.usage || null,
    output: { choices: [{ message: { content } }] },
    raw: data,
  };
}

function timeoutAfter(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), ms);
  });
}

function isPromiseSettled(result) {
  return result && (result.status === "fulfilled" || result.status === "rejected");
}

async function firstSuccessfulImageResult(primaryPromise, fallbackFactory, fallbackDelayMs) {
  let primary = primaryPromise.then(
    (value) => ({ status: "fulfilled", source: "primary", value }),
    (reason) => ({ status: "rejected", source: "primary", reason }),
  );
  let fallback = null;

  const first = await Promise.race([primary, timeoutAfter(fallbackDelayMs)]);
  if (first?.status === "fulfilled") return first.value;
  if (first?.status === "rejected") {
    fallback = fallbackFactory().then(
      (value) => ({ status: "fulfilled", source: "fallback", value }),
      (reason) => ({ status: "rejected", source: "fallback", reason }),
    );
    const fallbackResult = await fallback;
    if (fallbackResult.status === "fulfilled") return fallbackResult.value;
    throw fallbackResult.reason || first.reason;
  }

  fallback = fallbackFactory().then(
    (value) => ({ status: "fulfilled", source: "fallback", value }),
    (reason) => ({ status: "rejected", source: "fallback", reason }),
  );

  const second = await Promise.race([primary, fallback]);
  if (second.status === "fulfilled") return second.value;

  const other = second.source === "primary" ? await fallback : await primary;
  if (isPromiseSettled(other) && other.status === "fulfilled") return other.value;
  throw second.reason || other?.reason || new Error("Image request failed.");
}

function collectImageCandidates(value, output = [], depth = 0) {
  if (depth > 8 || value == null) return output;
  if (typeof value === "string") {
    const text = value.trim();
    if (/^(https?:\/\/|data:image\/)/i.test(text) || /^[A-Za-z0-9+/]{80,}={0,2}$/.test(text)) {
      output.push(text);
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageCandidates(item, output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    ["url", "image", "b64_json", "base64", "result", "output"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) collectImageCandidates(value[key], output, depth + 1);
    });
    ["data", "images", "urls", "results", "image_urls"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) collectImageCandidates(value[key], output, depth + 1);
    });
  }
  return output;
}

function parseJsonMaybe(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseGrsaiStreamText(text) {
  const raw = String(text || "").trim();
  const direct = parseJsonMaybe(raw);
  if (direct) return direct;

  const parsedChunks = [];
  raw.split(/\r?\n+/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    const normalized = trimmed.replace(/^data:\s*/i, "").trim();
    if (!normalized || normalized === "[DONE]") return;
    const parsed = parseJsonMaybe(normalized);
    if (parsed) parsedChunks.push(parsed);
  });

  if (parsedChunks.length) {
    return parsedChunks.find((item) => String(item?.status || "").toLowerCase() === "succeeded")
      || parsedChunks.find((item) => Array.isArray(item?.results) || item?.url)
      || parsedChunks[parsedChunks.length - 1];
  }

  return {
    error: raw.slice(0, 1000) || "Grsai draw endpoint returned an empty response.",
  };
}

function normalizeGrsaiDrawResponse(data, model) {
  const urls = Array.from(new Set(collectImageCandidates(data)));
  if (!urls.length) {
    const status = String(data?.status || "").trim().toLowerCase();
    const message = data?.error || data?.failure_reason || data?.msg || data?.message || (status ? `Grsai draw status: ${status}` : "Grsai draw endpoint returned no image.");
    const error = new Error(cleanUpstreamErrorMessage(message, "Grsai draw endpoint returned no image."));
    error.status = status === "failed" ? 502 : 500;
    error.details = data;
    error.provider = "grsai-draw";
    error.model = model;
    throw error;
  }
  return normalizeOpenAiImageGenerationResponse({
    id: data?.id,
    data: urls,
    raw: data,
  }, model);
}

async function requestGrsaiDrawCompletion({ apiKey, body, endpoint }) {
  const requestBody = buildGrsaiDrawCompletionBody(body, endpoint);
  let response = null;
  let text = "";
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    text = await response.text();
  } catch (error) {
    error.provider = "grsai-draw";
    error.endpoint = sanitizeLogUrl(endpoint);
    error.model = body.model;
    logImageUpstreamError(error);
    throw error;
  }

  const parsed = parseGrsaiStreamText(text);
  if (!response.ok) {
    throw createImageUpstreamError({
      provider: "grsai-draw",
      endpoint,
      status: response.status || 500,
      model: body.model,
      data: parsed,
      fallback: "Grsai 图片生成请求失败，请稍后重试。",
    });
  }

  const status = String(parsed?.status || "").trim().toLowerCase();
  if (status === "failed" || parsed?.error || parsed?.failure_reason) {
    throw createImageUpstreamError({
      provider: "grsai-draw",
      endpoint,
      status: 502,
      model: body.model,
      data: parsed,
      fallback: "Grsai 图片生成失败，请稍后重试。",
    });
  }

  let normalized = null;
  try {
    normalized = await normalizeGrsaiDrawResponse(parsed, body.model);
  } catch (error) {
    error.provider = error.provider || "grsai-draw";
    error.endpoint = sanitizeLogUrl(endpoint);
    error.model = body.model;
    logImageUpstreamError(error);
    throw error;
  }
  normalized.provider = "grsai-draw";
  normalized.endpoint = endpoint;
  normalized.raw = parsed;
  return normalized;
}

function extractTaskStatus(data) {
  const candidates = [
    data?.status,
    data?.state,
    data?.task_status,
    data?.data?.status,
    data?.data?.state,
    data?.data?.task_status,
  ];
  return String(candidates.find(Boolean) || "").trim().toLowerCase();
}

async function requestWhatAiAsyncImageGenerate({ apiKey, body }) {
  const compatibleBody = buildOpenAiCompatibleImageBody(body);
  const submitUrl = `${buildWhatAiUrl(OPENAI_IMAGE_GENERATIONS_PATH)}?async=true`;
  const parsed = await requestJsonViaFetch({
    method: "POST",
    url: submitUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(compatibleBody),
  });
  if (!parsed.ok) {
    throw createImageUpstreamError({
      provider: "whatai-image",
      endpoint: submitUrl,
      status: parsed.status || 500,
      model: compatibleBody.model,
      data: parsed.data,
      fallback: "WhatAI image request failed. Please try again later.",
    });
  }

  const taskId = String(
    (typeof parsed.data?.data === "string" ? parsed.data.data : "")
    || parsed.data?.data?.task_id
    || parsed.data?.data?.id
    || parsed.data?.task_id
    || parsed.data?.id
    || "",
  ).trim();
  if (!taskId) {
    const error = new Error("WhatAI async image request did not return a task id.");
    error.status = 502;
    error.details = parsed.data;
    throw error;
  }

  const startedAt = Date.now();
  const taskUrl = buildWhatAiUrl(`/v1/images/tasks/${encodeURIComponent(taskId)}`);
  while (Date.now() - startedAt < WHATAI_IMAGE_POLL_TIMEOUT_MS) {
    await sleep(WHATAI_IMAGE_POLL_INTERVAL_MS);
    const task = await requestJsonViaFetch({
      method: "GET",
      url: taskUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!task.ok) {
      throw createImageUpstreamError({
        provider: "whatai-image",
        endpoint: taskUrl,
        status: task.status || 500,
        model: compatibleBody.model,
        data: task.data,
        fallback: "WhatAI image task query failed.",
      });
    }

    const images = Array.from(new Set(collectImageCandidates(task.data)));
    if (images.length > 0) {
      const normalized = await normalizeOpenAiImageGenerationResponse({ id: taskId, data: images }, compatibleBody.model);
      normalized.provider = "whatai-image";
      normalized.endpoint = taskUrl;
      normalized.raw = task.data;
      return normalized;
    }

    const status = extractTaskStatus(task.data);
    if (/fail|error|cancel|reject|expired/.test(status)) {
      throw createImageUpstreamError({
        provider: "whatai-image",
        endpoint: taskUrl,
        status: 502,
        model: compatibleBody.model,
        data: task.data,
        fallback: "WhatAI image task failed.",
      });
    }
  }

  const error = new Error("WhatAI image task timed out.");
  error.status = 504;
  error.provider = "whatai-image";
  error.endpoint = "";
  error.model = compatibleBody.model;
  logImageUpstreamError(error);
  throw error;
}

async function requestOpenAiImageGenerate({ apiKey, payload, slideAspect, baseUrl, whatAiImageApiKey }) {
  const body = buildOpenAiImageGenerationBody({ payload, slideAspect });
  const fallbackKey = resolveWhatAiImageApiKey(whatAiImageApiKey);
  const runPrimary = () => requestPrimaryOpenAiImageGenerate({ apiKey, body, baseUrl });
  if (fallbackKey) {
    return firstSuccessfulImageResult(
      runPrimary(),
      () => requestWhatAiAsyncImageGenerate({ apiKey: fallbackKey, body }),
      WHATAI_IMAGE_FALLBACK_DELAY_MS,
    );
  }
  return runPrimary();
}

async function requestPrimaryOpenAiImageGenerate({ apiKey, body, baseUrl }) {
  const endpoints = resolveOpenAiImageEndpoints(baseUrl);
  if (endpoints.length > 1) {
    let lastError = null;
    for (const url of endpoints) {
      try {
        if (isGrsaiDrawEndpoint(url)) {
          return await requestGrsaiDrawCompletion({ apiKey, body, endpoint: url });
        }
        const compatibleBody = buildOpenAiCompatibleImageBody(body);
        const parsed = await requestJsonViaFetch({
          method: "POST",
          url,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(compatibleBody),
        });
        if (!parsed.ok) {
          const error = createImageUpstreamError({
            provider: "openai-image",
            endpoint: url,
            status: parsed.status || 500,
            model: compatibleBody.model,
            data: parsed.data,
            fallback: "OpenAI image request failed. Please try again later.",
          });
          lastError = error;
          continue;
        }
        const normalized = await normalizeOpenAiImageGenerationResponse(parsed.data, compatibleBody.model);
        normalized.endpoint = url;
        return normalized;
      } catch (error) {
        if (!error.provider) {
          error.provider = "openai-image";
          error.endpoint = sanitizeLogUrl(url);
          error.model = body.model;
          logImageUpstreamError(error);
        }
        lastError = error;
      }
    }
    throw lastError || new Error("OpenAI image request failed.");
  }
  const endpoint = buildOpenAiImageGenerationsUrl(baseUrl);
  if (isGrsaiDrawEndpoint(endpoint)) {
    return requestGrsaiDrawCompletion({ apiKey, body, endpoint });
  }
  const compatibleBody = buildOpenAiCompatibleImageBody(body);
  let parsed = null;
  try {
    parsed = await requestJsonViaFetch({
      method: "POST",
      url: endpoint,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(compatibleBody),
    });
  } catch (error) {
    if (!error.provider) {
      error.provider = "openai-image";
      error.endpoint = sanitizeLogUrl(endpoint);
      error.model = compatibleBody.model;
      logImageUpstreamError(error);
    }
    throw error;
  }
  if (!parsed.ok) {
    throw createImageUpstreamError({
      provider: "openai-image",
      endpoint,
      status: parsed.status || 500,
      model: compatibleBody.model,
      data: parsed.data,
      fallback: "OpenAI 图片生成请求失败，请稍后重试。",
    });
  }
  const normalized = await normalizeOpenAiImageGenerationResponse(parsed.data, compatibleBody.model);
  normalized.endpoint = endpoint;
  return normalized;
}

function extractPromptAndImagesFromPayload(payload) {
  const texts = [];
  const urls = [];
  const messages = Array.isArray(payload?.input?.messages) ? payload.input.messages : [];
  messages.forEach((message) => {
    const content = Array.isArray(message?.content) ? message.content : [];
    content.forEach((item) => {
      if (typeof item?.text === "string" && item.text.trim()) texts.push(item.text.trim());
      if (typeof item?.image === "string" && item.image.trim()) urls.push(item.image.trim());
    });
  });
  return {
    prompt: texts.join("\n\n").trim(),
    urls,
  };
}


function getDefaultLibraryDoc() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    settings: {},
    themes: [],
    workflowPlans: [],
  };
}

async function readLibraryDoc() {
  try {
    const text = await fsp.readFile(LIBRARY_DOC_PATH, "utf8");
    const parsed = JSON.parse(text);
    return {
      ...getDefaultLibraryDoc(),
      ...parsed,
      settings: parsed?.settings && typeof parsed.settings === "object" ? parsed.settings : {},
      themes: Array.isArray(parsed?.themes) ? parsed.themes : [],
      workflowPlans: Array.isArray(parsed?.workflowPlans) ? parsed.workflowPlans : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return getDefaultLibraryDoc();
    }
    throw error;
  }
}

async function writeLibraryDoc(doc) {
  const normalized = {
    ...getDefaultLibraryDoc(),
    ...doc,
    savedAt: new Date().toISOString(),
    settings: doc?.settings && typeof doc.settings === "object" ? doc.settings : {},
    themes: Array.isArray(doc?.themes) ? doc.themes : [],
    workflowPlans: Array.isArray(doc?.workflowPlans) ? doc.workflowPlans : [],
  };
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(LIBRARY_DOC_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function buildGenerationUrl(region, asyncMode) {
  const host = resolveRegion(region);
  const endpoint = asyncMode
    ? "/api/v1/services/aigc/image-generation/generation"
    : "/api/v1/services/aigc/multimodal-generation/generation";
  return `${host}${endpoint}`;
}

function buildMultimodalUrl(region) {
  return `${resolveRegion(region)}/api/v1/services/aigc/multimodal-generation/generation`;
}

function buildTaskUrl(region, taskId) {
  return `${resolveRegion(region)}/api/v1/tasks/${taskId}`;
}

function buildResponsesUrl(region) {
  return `${resolveRegion(region)}/compatible-mode/v1/responses`;
}

function buildChatCompletionsUrl(region) {
  return `${resolveRegion(region)}/compatible-mode/v1/chat/completions`;
}

function sanitizeSegment(value, fallback) {
  const normalized = String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function buildTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}_${parts[3]}${parts[4]}${parts[5]}`;
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectExtension(fileName = "") {
  return path.extname(String(fileName || "")).toLowerCase();
}

function detectFileCategory(fileName = "", mimeType = "") {
  const extension = detectExtension(fileName);
  const mime = String(mimeType || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".bmp", ".gif"].includes(extension) || mime.startsWith("image/")) return "image";
  if ([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv"].includes(extension) || mime.startsWith("video/")) return "video";
  if ([".aac", ".amr", ".flac", ".m4a", ".mp3", ".mpeg", ".ogg", ".opus", ".wav", ".wma"].includes(extension) || mime.startsWith("audio/")) return "audio";
  return "document";
}

function normalizeUploadedFileName(fileName = "") {
  const raw = String(fileName || "upload");
  if (/[\u3400-\u9fff]/.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, "latin1").toString("utf8");
    if (/[^\u0000-\u007f]/.test(decoded) && !decoded.includes("�")) return decoded;
  } catch {}
  return raw;
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) return "";
  const xml = await entry.async("string");
  const matches = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  return normalizeExtractedText(matches.map((item) => decodeXmlEntities(item[1])).join("\n"));
}

async function extractPptxSlides(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftIndex = Number(left.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const rightIndex = Number(right.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return leftIndex - rightIndex;
    });

  const slides = [];
  for (const slideName of slideFiles) {
    const xml = await zip.file(slideName).async("string");
    const texts = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((item) => decodeXmlEntities(item[1]))
      .filter(Boolean);
    const slideIndex = Number(slideName.match(/slide(\d+)\.xml/i)?.[1] || slides.length + 1);
    const normalizedText = normalizeExtractedText(texts.join("\n"));
    const lines = normalizedText.split("\n").map((line) => line.trim()).filter(Boolean);
    slides.push({
      pageNumber: slideIndex,
      text: normalizedText,
      title: pickPptxSlideTitle(lines, slideIndex),
      body: lines.slice(1).join("\n") || lines[0] || "",
    });
  }
  return slides;
}

function pickPptxSlideTitle(lines = [], slideIndex = 1) {
  const cleanLines = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const isNoise = (line) => /^[XYZxyz]$/.test(line)
    || /^-?\d+$/.test(line)
    || /^[()（）\s-]+$/.test(line)
    || /^[<>]+$/.test(line);
  for (let index = 0; index < cleanLines.length; index += 1) {
    const line = cleanLines[index];
    if (isNoise(line)) continue;
    const next = cleanLines[index + 1] || "";
    if (/^[A-Za-z]{2,8}$/.test(line) && /[\u3400-\u9fff]/.test(next) && !isNoise(next)) {
      return `${line}${next}`;
    }
    if (/[\u3400-\u9fff]/.test(line) && line.length >= 2 && line.length <= 40) {
      return line;
    }
  }
  return cleanLines.find((line) => !isNoise(line) && line.length > 1 && line.length <= 60) || `Slide ${slideIndex}`;
}

function formatPptxSlideText(slides = []) {
  return normalizeExtractedText((Array.isArray(slides) ? slides : [])
    .map((slide) => `Slide ${slide.pageNumber}\n${slide.text || ""}`.trim())
    .filter(Boolean)
    .join("\n\n"));
}

async function extractPptxText(buffer) {
  return formatPptxSlideText(await extractPptxSlides(buffer));
}

function extractSpreadsheetText(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return normalizeExtractedText(
    workbook.SheetNames.slice(0, 6).map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      return `Sheet: ${sheetName}\n${csv}`;
    }).join("\n\n"),
  );
}

async function extractFileText(file, options = {}) {
  const extension = detectExtension(file.originalname);
  const buffer = file.buffer;

  if ([".txt", ".md", ".csv", ".json", ".jsonl", ".html", ".htm", ".xml", ".yaml", ".yml"].includes(extension)) {
    return {
      extractedText: normalizeExtractedText(buffer.toString("utf8")),
      parseStatus: "parsed",
      parseNote: "已提取纯文本内容。",
    };
  }

  if (extension === ".docx") {
    return {
      extractedText: await extractDocxText(buffer),
      parseStatus: "parsed",
      parseNote: "已提取 DOCX 正文文本。",
    };
  }

  if (extension === ".pptx") {
    const slides = await extractPptxSlides(buffer);
    let slideImages = [];
    let imageNote = "";
    if (options.includeSlideImages !== false) {
      try {
        slideImages = await exportPptxSlideImages(buffer, file.originalname);
      } catch (error) {
        imageNote = `；原页截图导出失败：${String(error?.message || error).slice(0, 120)}`;
      }
    }
    const imageByPage = new Map(slideImages.map((item) => [Number(item.pageNumber), item]));
    const slidePages = slides.map((slide) => {
      const image = imageByPage.get(Number(slide.pageNumber));
      return {
        pageNumber: slide.pageNumber,
        title: slide.title,
        text: slide.text,
        body: slide.body,
        slideImage: image?.previewUrl || "",
        referenceImages: image?.previewUrl ? [image.previewUrl] : [],
      };
    });
    return {
      extractedText: formatPptxSlideText(slides),
      slidePages,
      slideImages,
      parseStatus: "parsed",
      parseNote: `已提取 PPTX 各页文本${slideImages.length ? `，并导出 ${slideImages.length} 张原页参考图。` : imageNote || "。"}`,
    };
  }

  if (extension === ".pdf") {
    let parsed = null;
    try {
      parsed = await pdfParse(buffer);
    } catch (error) {
      return {
        extractedText: "",
        parseStatus: "metadata_only",
        parseNote: `PDF å·²æŽ¥æ”¶ï¼Œä½†æœªèƒ½è‡ªåŠ¨æå–æ–‡æœ¬ï¼š${error.message || "è§£æžå¤±è´¥"}`,
      };
    }
    return {
      extractedText: normalizeExtractedText(parsed.text || ""),
      parseStatus: "parsed",
      parseNote: "已提取 PDF 文本。",
    };
  }

  if ([".xls", ".xlsx"].includes(extension)) {
    return {
      extractedText: extractSpreadsheetText(buffer),
      parseStatus: "parsed",
      parseNote: "已提取表格内容。",
    };
  }

  if ([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp"].includes(extension)) {
    const saved = await saveReferenceImage(file);
    return {
      extractedText: "",
      parseStatus: "image",
      parseNote: "图片文件会作为视觉参考保留。",
      assetId: saved.assetId,
      assetFileName: saved.fileName,
      previewUrl: saved.previewUrl,
    };
  }

  if ([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv"].includes(extension)) {
    return {
      extractedText: "",
      parseStatus: "metadata_only",
      parseNote: "已接收视频文件，当前仅保留文件元信息供人工参考。",
    };
  }

  if ([".aac", ".amr", ".flac", ".m4a", ".mp3", ".mpeg", ".ogg", ".opus", ".wav", ".wma"].includes(extension)) {
    return {
      extractedText: "",
      parseStatus: "metadata_only",
      parseNote: "已接收音频文件，当前仅保留文件元信息供人工参考。",
    };
  }

  if ([".doc", ".ppt", ".wps"].includes(extension)) {
    return {
      extractedText: "",
      parseStatus: "metadata_only",
      parseNote: "已接收旧版 Office/WPS 文件，当前仅保留文件元信息，请优先上传 docx/pptx 版本以便自动抽取文本。",
    };
  }

  return {
    extractedText: "",
    parseStatus: "metadata_only",
    parseNote: "文件已接收，当前未自动提取正文。",
  };
}
function pickFileExtension(imageUrl, contentType) {
  const pathname = (() => {
    try {
      return new URL(imageUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return ".jpg";
  }
  if (pathname.endsWith(".webp")) {
    return ".webp";
  }
  if (pathname.endsWith(".bmp")) {
    return ".bmp";
  }
  if (pathname.endsWith(".png")) {
    return ".png";
  }

  const mime = String(contentType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return ".jpg";
  }
  if (mime.includes("webp")) {
    return ".webp";
  }
  if (mime.includes("bmp")) {
    return ".bmp";
  }

  return ".png";
}

async function parseJsonResponse(response) {
  const text = await response.text();

  try {
    return {
      ok: response.ok,
      status: response.status,
      data: JSON.parse(text),
    };
  } catch {
    return {
      ok: response.ok,
      status: response.status,
      data: {
        code: "InvalidJSON",
        message: text || "DashScope returned a non-JSON response.",
      },
    };
  }
}

function extractResponsesOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts = [];

  output.forEach((item) => {
    if (item?.type !== "message" || !Array.isArray(item.content)) return;
    item.content.forEach((contentItem) => {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        parts.push(contentItem.text.trim());
      }
    });
  });

  return parts.join("\n\n").trim();
}

function extractChatCompletionText(data) {
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function stripMarkdownCodeFence(text) {
  const value = String(text || "").trim();
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : value;
}

function safeParseJsonObject(text) {
  const normalized = stripMarkdownCodeFence(text);
  try {
    return JSON.parse(normalized);
  } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeResearchCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((item) => {
      const sources = Array.isArray(item?.sources)
        ? item.sources
          .map((source) => ({
            title: String(source?.title || "").trim(),
            url: String(source?.url || "").trim(),
          }))
          .filter((source) => source.title && source.url)
        : [];
      return {
        text: String(item?.text || "").trim(),
        why: String(item?.why || item?.reason || "").trim(),
        sources,
      };
    })
    .filter((item) => item.text && item.sources.length);
}

function extractResponsesError(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  if (typeof data?.status === "string" && data.status === "failed") {
    return "联网补充请求失败。";
  }
  return "";
}

async function repairResearchOutputAsJson({ apiKey, region, rawText }) {
  const parsed = await requestJsonViaFetch({
    method: "POST",
    url: buildChatCompletionsUrl(region),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen3.5-plus",
      messages: [
        {
          role: "system",
          content: [
            "You are a JSON repair assistant.",
            "Return valid JSON only.",
            "Do not add markdown fences.",
            "Preserve meaning from the input and normalize it into the target schema.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            "Convert the following research output into JSON.",
            "JSON schema:",
            "{\"summary\":\"string\",\"candidates\":[{\"text\":\"string\",\"why\":\"string\",\"sources\":[{\"title\":\"string\",\"url\":\"https://...\"}]}]}",
            "If no candidates are valid, return an empty candidates array.",
            "Input:",
            String(rawText || ""),
          ].join("\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "research_supplements",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string" },
                    why: { type: "string" },
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          title: { type: "string" },
                          url: { type: "string" },
                        },
                        required: ["title", "url"],
                      },
                    },
                  },
                  required: ["text", "why", "sources"],
                },
              },
            },
            required: ["summary", "candidates"],
          },
        },
      },
      stream: false,
    }),
  });
  if (!parsed.ok) {
    return {
      ok: false,
      status: parsed.status,
      data: parsed.data,
    };
  }

  const repairedText = extractChatCompletionText(parsed.data);
  const repairedJson = safeParseJsonObject(repairedText);
  if (!repairedJson || typeof repairedJson !== "object") {
    return {
      ok: false,
      status: 502,
      data: {
        code: "InvalidRepairedResearchOutput",
        message: "联网补充结构化修复后仍无法解析为 JSON。",
        raw: repairedText || parsed.data,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    data: repairedJson,
    raw: repairedText,
  };
}

async function generateResearchSearchQuery({ apiKey, region, pageType, pageTitle, pageContent, themeLabel, visibleTextBlock }) {
  const parsed = await requestJsonViaFetch({
    method: "POST",
    url: buildChatCompletionsUrl(region),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen3.5-plus",
      messages: [
        {
          role: "system",
          content: [
            "You create safe, focused web search queries for PPT research.",
            "Return JSON only.",
            "The query must stay on the page topic and avoid drifting into unrelated politics, entertainment, or social news.",
            "Prefer English or bilingual technical keywords when the page is about technology.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            "Generate one concise web search query for this PPT page.",
            "Goal: find factual supplements with reliable sources.",
            "Keep it under 16 words when possible.",
            "JSON schema: {\"query\":\"...\"}",
            `page_type: ${pageType || "content"}`,
            themeLabel ? `theme: ${themeLabel}` : "",
            pageTitle ? `page_title: ${pageTitle}` : "",
            pageContent ? `page_content: ${pageContent}` : "",
            visibleTextBlock ? `confirmed_visible_text: ${visibleTextBlock}` : "",
          ].filter(Boolean).join("\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "research_query",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
        },
      },
      stream: false,
    }),
  });
  if (!parsed.ok) {
    return "";
  }
  const queryJson = safeParseJsonObject(extractChatCompletionText(parsed.data));
  return String(queryJson?.query || "").trim();
}

function buildHeuristicResearchQuery(pageTitle, pageContent) {
  const text = `${String(pageTitle || "")} ${String(pageContent || "")}`;
  const parts = [];
  const push = (value) => {
    if (value && !parts.includes(value)) parts.push(value);
  };

  if (/智能窗|智能玻璃|调光玻璃|Smart Window|Smart Glass/i.test(text)) {
    push("smart window");
    push("smart glass");
  }
  if (/电致变色|electrochromic/i.test(text)) push("electrochromic");
  if (/热致变色|thermochromic/i.test(text)) push("thermochromic");
  if (/光致变色|photochromic/i.test(text)) push("photochromic");
  if (/\bPDLC\b|液晶/i.test(text)) push("PDLC");
  if (/\bSPD\b/i.test(text)) push("SPD");
  if (/发展历史|演进|历程|概述|定义|分类|history|overview/i.test(text)) push("technology history");
  if (/建筑|节能|幕墙|采光|energy|building/i.test(text)) push("building energy saving");
  if (/应用|场景|市场|未来|趋势|application|market|future/i.test(text)) push("applications market");

  return parts.join(" ").trim();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "pptgen-studio",
    port: ACTIVE_PORT,
    generatedDir: GENERATED_DIR,
    libraryDocPath: LIBRARY_DOC_PATH,
    supportedRegions: Object.keys(REGION_MAP),
    configuredKeys: {
      dashscope: Boolean(resolveDashScopeApiKey("")),
      openAiImage: Boolean(resolveOpenAiImageApiKey("")),
      whatAiImage: Boolean(resolveWhatAiImageApiKey("")),
    },
    workflowModels: {
      assistant: process.env.WORKFLOW_ASSISTANT_MODEL || "qwen3.6-plus",
      style: process.env.WORKFLOW_STYLE_MODEL || process.env.QWEN_LIGHTWEIGHT_MODEL || "qwen-turbo-latest",
      jit: process.env.WORKFLOW_JIT_MODEL || process.env.QWEN_LIGHTWEIGHT_MODEL || "qwen-turbo-latest",
    },
  });
});

app.get("/api/library", async (_req, res) => {
  try {
    const doc = await readLibraryDoc();
    return res.json({
      ok: true,
      doc,
    });
  } catch (error) {
    return res.status(500).json({
      code: "LibraryReadFailed",
      message: error.message || "读取项目资料库失败。",
    });
  }
});

app.post("/api/library", async (req, res) => {
  const { doc } = req.body || {};

  if (!doc || typeof doc !== "object") {
    return res.status(400).json({
      code: "InvalidLibraryDoc",
      message: "保存资料库时需要传入 doc 对象。",
    });
  }

  try {
    const savedDoc = await writeLibraryDoc(doc);
    return res.json({
      ok: true,
      doc: savedDoc,
    });
  } catch (error) {
    return res.status(500).json({
      code: "LibraryWriteFailed",
      message: error.message || "保存项目资料库失败。",
    });
  }
});

installWorkflowRoutes(app, {
  resolveRegion,
  resolveDashScopeApiKey,
  resolveOpenAiImageApiKey,
  resolveWhatAiImageApiKey,
  parseJsonResponse,
  requestJsonViaFetch,
  requestOpenAiImageGenerate,
  parseDataUrl,
  loadReferenceAssetAsDataUrl,
});

app.post("/api/test-image-key", async (req, res) => {
  const { apiKey, openAiImageApiKey, openAiImageBaseUrl, whatAiImageApiKey, region, model } = req.body || {};

  if (!model) {
    return res.status(400).json({
      code: "MissingModel",
      message: "测试 Key 需要传入当前图片模型。",
    });
  }

  // GPT Image 模型测试
  if (isOpenAiImageModel(model)) {
    const effectiveKey = resolveOpenAiImageApiKey(openAiImageApiKey);
    if (!effectiveKey) {
      return res.status(400).json({
        code: "MissingOpenAiImageApiKey",
        message: "请先填写 OpenAI Image API Key。",
      });
    }
    const imageEndpoint = resolveOpenAiImageEndpoint(openAiImageBaseUrl);
    if (isGrsaiDrawEndpoint(imageEndpoint)) {
      return res.json({
        ok: true,
        provider: "grsai-draw",
        fallbackProvider: resolveWhatAiImageApiKey(whatAiImageApiKey) ? "whatai-image" : "",
        message: `Grsai 图片接口已配置，模型 ${model} 将使用 ${imageEndpoint}。该接口没有非生图校验端点，首次生成时会完成真实验证。`,
      });
    }

    const modelsEndpoint = resolveOpenAiModelsEndpoint(openAiImageBaseUrl);
    try {
      const parsed = await requestJsonViaFetch({
        method: "GET",
        url: modelsEndpoint,
        headers: {
          Authorization: `Bearer ${effectiveKey}`,
        },
      });
      if (!parsed.ok) {
        const error = createImageUpstreamError({
          provider: "openai-image",
          endpoint: modelsEndpoint,
          status: parsed.status || 500,
          model,
          data: parsed.data,
          fallback: "OpenAI Image API Key 验证失败。",
        });
        return res.status(error.status || 500).json({
          code: "OpenAiImageKeyTestFailed",
          message: error.message || "OpenAI Image API Key 验证失败。",
          details: buildPublicImageErrorDetails(error),
        });
      }

      const listedModels = Array.isArray(parsed.data?.data)
        ? parsed.data.data.map((item) => String(item?.id || item || "").trim()).filter(Boolean)
        : [];
      const modelListed = !listedModels.length || listedModels.includes(model);
      return res.json({
        ok: true,
        provider: "openai-image",
        fallbackProvider: resolveWhatAiImageApiKey(whatAiImageApiKey) ? "whatai-image" : "",
        modelListed,
        message: modelListed
          ? `OpenAI 图片接口 Key 可用，模型 ${model} 将使用 ${imageEndpoint}。`
          : `OpenAI 图片接口 Key 可用，但模型列表未声明 ${model}；生成时仍将使用 ${imageEndpoint}。`,
      });
    } catch (error) {
      if (!error.provider) {
        error.provider = "openai-image";
        error.endpoint = sanitizeLogUrl(modelsEndpoint);
        error.model = model;
        logImageUpstreamError(error);
      }
      return res.status(error.status || 500).json({
        code: "OpenAiImageKeyTestFailed",
        message: error.message || "OpenAI Image API Key 验证失败。",
        details: buildPublicImageErrorDetails(error),
      });
    }
  }

  // DashScope Key 测试
  const effectiveApiKey = resolveDashScopeApiKey(apiKey);
  if (!effectiveApiKey) {
    return res.status(400).json({
      code: "MissingApiKey",
      message: "请先填写 DashScope / Qwen API Key。",
    });
  }

  try {
    const parsed = await requestJsonViaFetch({
      method: "POST",
      url: buildChatCompletionsUrl(region),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        messages: [
          { role: "user", content: "请只回复 OK" },
        ],
        stream: false,
      }),
    });
    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.data);
    }

    return res.json({
      ok: true,
      provider: "dashscope",
      message: "DashScope / Qwen API Key 可用，可以正常调用 Qwen。",
    });
  } catch (error) {
    return res.status(500).json({
      code: "DashScopeKeyTestFailed",
      message: error.message || "DashScope / Qwen API Key 测试失败。",
    });
  }
});

app.post("/api/generate", async (req, res, next) => {
  const { openAiImageApiKey, openAiImageBaseUrl, whatAiImageApiKey, slideAspect, payload } = req.body || {};

  if (!isHostedImageModel(payload?.model)) {
    return next();
  }

  const effectiveApiKey = resolveOpenAiImageApiKey(openAiImageApiKey);
  if (!effectiveApiKey) {
    return res.status(400).json({
      code: "MissingOpenAiImageApiKey",
      message: "请先填写 OpenAI Image API Key，再调用生图模型。",
    });
  }

  try {
    const normalized = await requestOpenAiImageGenerate({
      apiKey: effectiveApiKey,
      payload,
      slideAspect,
      baseUrl: openAiImageBaseUrl,
      whatAiImageApiKey,
    });
    return res.json(normalized);
  } catch (error) {
    return res.status(error.status || 500).json({
      code: "OpenAiImageRequestFailed",
      message: error.message || "调用 OpenAI Image 失败。",
      details: buildPublicImageErrorDetails(error),
    });
  }
});

app.post("/api/generate", async (req, res) => {
  const { apiKey, region, asyncMode, payload } = req.body || {};
  const effectiveApiKey = resolveDashScopeApiKey(apiKey);

  if (!effectiveApiKey) {
    return res.status(400).json({
      code: "MissingApiKey",
      message: "请先在页面中填写 API Key。",
    });
  }

  const missingPayloadFields = [];
  if (!payload || typeof payload !== "object") {
    missingPayloadFields.push("payload");
  } else {
    if (!payload.model) missingPayloadFields.push("model");
    if (!Array.isArray(payload.input?.messages) || !payload.input.messages.length) {
      missingPayloadFields.push("input.messages");
    }
  }

  if (missingPayloadFields.length) {
    return res.status(400).json({
      code: "InvalidPayload",
      message: `请求体不完整：缺少 ${missingPayloadFields.join("、")}。请检查模型、消息和参数配置。`,
      details: {
        missing: missingPayloadFields,
        receivedModel: payload?.model || "",
        messageCount: Array.isArray(payload?.input?.messages) ? payload.input.messages.length : 0,
      },
    });
  }

  if (!payload || !payload.model || !payload.input?.messages?.length) {
    return res.status(400).json({
      code: "InvalidPayload",
      message: "请求体不完整，请检查模型、消息和参数配置。",
    });
  }

  try {
    const headers = {
      "Content-Type": "application/json",
    Authorization: `Bearer ${effectiveApiKey}`,
    };

    if (asyncMode) {
      headers["X-DashScope-Async"] = "enable";
    }

    const parsed = await requestJsonViaFetch({
      method: "POST",
      url: buildGenerationUrl(region, asyncMode),
      headers,
      body: JSON.stringify(payload),
    });
    return res.status(parsed.status).json(parsed.data);
  } catch (error) {
    return res.status(500).json({
      code: "ProxyRequestFailed",
      message: error.message || "调用 DashScope / Qwen 失败。",
    });
  }
});

app.post("/api/tasks/fetch", async (req, res) => {
  const { apiKey, region, taskId } = req.body || {};
  const effectiveApiKey = resolveDashScopeApiKey(apiKey);

  if (!effectiveApiKey || !taskId) {
    return res.status(400).json({
      code: "MissingParams",
      message: "查询任务需要 API Key 和 task_id。",
    });
  }

  try {
    const parsed = await requestJsonViaFetch({
      method: "GET",
      url: buildTaskUrl(region, taskId),
      headers: {
        Authorization: `Bearer ${effectiveApiKey}`,
      },
    });
    return res.status(parsed.status).json(parsed.data);
  } catch (error) {
    return res.status(500).json({
      code: "ProxyRequestFailed",
      message: error.message || "查询任务失败。",
    });
  }
});

app.post("/api/assistant", async (req, res) => {
  const { apiKey, region, payload } = req.body || {};
  const effectiveApiKey = resolveDashScopeApiKey(apiKey);

  if (!effectiveApiKey) {
    return res.status(400).json({
      code: "MissingApiKey",
      message: "调用提示词助手前请先填写 API Key。",
    });
  }

  if (!payload || !payload.model || !payload.input?.messages?.length) {
    return res.status(400).json({
      code: "InvalidPayload",
      message: "助手请求体不完整，请检查模型、消息和参数。",
    });
  }

  try {
    const parsed = await requestJsonViaFetch({
      method: "POST",
      url: buildMultimodalUrl(region),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    return res.status(parsed.status).json(parsed.data);
  } catch (error) {
    return res.status(500).json({
      code: "AssistantRequestFailed",
      message: error.message || "调用 Qwen 助手失败。",
    });
  }
});

app.post("/api/research-supplements", async (req, res) => {
  const { apiKey, region, page, themeLabel, visibleText, searchQuery: requestedSearchQuery } = req.body || {};
  const effectiveApiKey = resolveDashScopeApiKey(apiKey);

  if (!effectiveApiKey) {
    return res.status(400).json({
      code: "MissingApiKey",
      message: "调用联网补充前请先填写 API Key。",
    });
  }

  if (!page || typeof page !== "object") {
    return res.status(400).json({
      code: "MissingPage",
      message: "联网补充需要当前页面信息。",
    });
  }

  const pageTitle = String(page.pageTitle || "").trim();
  const pageContent = String(page.pageContent || "").trim();
  const pageType = String(page.pageType || "content").trim();
  const visibleTextBlock = String(visibleText || "").trim();

  if (!pageTitle && !pageContent) {
    return res.status(400).json({
      code: "MissingPageContent",
      message: "当前页面缺少可研究的标题或正文。",
    });
  }

  const heuristicQuery = buildHeuristicResearchQuery(pageTitle, pageContent);
  const generatedQuery = requestedSearchQuery
    ? ""
    : await generateResearchSearchQuery({
      apiKey: effectiveApiKey,
      region,
      pageType,
      pageTitle,
      pageContent,
      themeLabel,
      visibleTextBlock,
    });
  const searchQuery = String(requestedSearchQuery || "").trim() || heuristicQuery || generatedQuery;

  const prompt = [
    "You are a lightweight web research assistant for PPT slide writing.",
    "Use web search only for the exact topic below and do not drift to unrelated subjects.",
    "Search the web and propose 0 to 4 small factual supplements for one slide.",
    "The supplements must be directly supported by sources and suitable for slide use after human review.",
    "Do not rewrite existing user text.",
    "Do not invent organizations, authors, dates, numbers, conclusions, or background stories.",
    "Prefer short milestone facts, concise term clarifications, representative applications, or one verified industry datapoint.",
    "Candidate text must be in Simplified Chinese and should stay short.",
    "If no reliable supplement is needed, return an empty candidates array.",
    "Return pure JSON only. No markdown. No prose.",
    "JSON schema:",
    "{\"summary\":\"...\",\"candidates\":[{\"text\":\"...\",\"why\":\"...\",\"sources\":[{\"title\":\"...\",\"url\":\"https://...\"}]}]}",
    "",
    searchQuery ? `search_focus_query: ${searchQuery}` : "",
  ].filter(Boolean).join("\n");

  try {
    const parsed = await requestJsonViaFetch({
      method: "POST",
      url: buildResponsesUrl(region),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveApiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        input: prompt,
        tools: [
          { type: "web_search" },
        ],
        enable_thinking: false,
      }),
    });
    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.data);
    }

    const upstreamError = extractResponsesError(parsed.data);
    if (upstreamError) {
      return res.status(502).json({
        code: "ResearchToolError",
        message: upstreamError,
        raw: parsed.data,
      });
    }

    const outputText = extractResponsesOutputText(parsed.data);
    let parsedJson = safeParseJsonObject(outputText);
    let normalizedRaw = outputText || parsed.data;

    if (!parsedJson || typeof parsedJson !== "object") {
      const repaired = await repairResearchOutputAsJson({
        apiKey: effectiveApiKey,
        region,
        rawText: outputText || JSON.stringify(parsed.data),
      });
      if (!repaired.ok) {
        return res.status(repaired.status).json(repaired.data);
      }
      parsedJson = repaired.data;
      normalizedRaw = repaired.raw || outputText || parsed.data;
    }

    if (!parsedJson || typeof parsedJson !== "object") {
      return res.status(502).json({
        code: "InvalidResearchOutput",
        message: "联网补充返回结果无法解析为 JSON。",
        raw: normalizedRaw,
      });
    }

    return res.json({
      ok: true,
      searchQuery,
      summary: String(parsedJson.summary || "").trim(),
      candidates: normalizeResearchCandidates(parsedJson.candidates),
      raw: normalizedRaw,
    });
  } catch (error) {
    return res.status(500).json({
      code: "ResearchSupplementFailed",
      message: error.message || "联网补充请求失败。",
    });
  }
});

app.post("/api/files/parse", upload.array("files", 20), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const includeSlideImages = String(req.body?.includeSlideImages ?? "1").trim() !== "0";

  if (!files.length) {
    return res.status(400).json({
      code: "MissingFiles",
      message: "请至少上传一个文件。",
    });
  }

  try {
    const parsedFiles = [];
    for (const file of files) {
      const originalname = normalizeUploadedFileName(file.originalname);
      const normalizedFile = { ...file, originalname };
      try {
        const parsed = await extractFileText(normalizedFile, { includeSlideImages });
        const extractedText = normalizeExtractedText(parsed.extractedText || "");
        parsedFiles.push({
          id: crypto.randomUUID(),
          name: originalname,
          extension: detectExtension(originalname),
          mimeType: file.mimetype || "",
          size: file.size || 0,
          category: detectFileCategory(originalname, file.mimetype),
          extractedText,
          previewText: extractedText.slice(0, 2400),
          parseStatus: parsed.parseStatus,
          parseNote: parsed.parseNote,
          assetId: parsed.assetId || "",
          assetFileName: parsed.assetFileName || "",
          previewUrl: parsed.previewUrl || "",
          slidePages: Array.isArray(parsed.slidePages) ? parsed.slidePages : [],
          slideImages: Array.isArray(parsed.slideImages) ? parsed.slideImages : [],
        });
      } catch (error) {
        parsedFiles.push({
          id: crypto.randomUUID(),
          name: originalname,
          extension: detectExtension(originalname),
          mimeType: file.mimetype || "",
          size: file.size || 0,
          category: detectFileCategory(originalname, file.mimetype),
          extractedText: "",
          previewText: "",
          parseStatus: "error",
          parseNote: error.message || "文件解析失败。",
        });
      }
    }

    return res.json({
      ok: true,
      files: parsedFiles,
    });
  } catch (error) {
    return res.status(500).json({
      code: "FileParseFailed",
      message: error.message || "文件解析失败。",
    });
  }
});

app.post("/api/download", async (req, res, next) => {
  const { imageUrl } = req.body || {};

  if (typeof imageUrl === "string" && imageUrl.startsWith("/generated-images/")) {
    const fileName = decodeURIComponent(imageUrl.slice("/generated-images/".length));
    const targetPath = path.join(GENERATED_DIR, fileName);

    try {
      await fsp.access(targetPath, fs.constants.F_OK);
      return res.json({
        ok: true,
        fileName,
        savedPath: targetPath,
        localUrl: `/generated-images/${encodeURIComponent(fileName)}`,
      });
    } catch (error) {
      return res.status(404).json({
        code: "LocalImageNotFound",
        message: error.message || "本地缓存图片不存在。",
      });
    }
  }

  const parsedDataUrl = parseDataUrl(imageUrl);
  if (parsedDataUrl) {
    try {
      const saved = await saveGeneratedBufferToFile(parsedDataUrl.buffer, {
        prefix: "inline",
        requestId: "inline-image",
        index: 1,
        extension: parsedDataUrl.extension,
      });
      return res.json({
        ok: true,
        fileName: saved.fileName,
        savedPath: saved.savedPath,
        localUrl: saved.localUrl,
      });
    } catch (error) {
      return res.status(500).json({
        code: "InlineImageSaveFailed",
        message: error.message || "保存内联图片失败。",
      });
    }
  }

  return next();
});

app.post("/api/download", async (req, res) => {
  const { imageUrl, requestId, index } = req.body || {};

  if (!imageUrl) {
    return res.status(400).json({
      code: "MissingImageUrl",
      message: "下载到本地需要 imageUrl。",
    });
  }

  try {
    await fsp.mkdir(GENERATED_DIR, { recursive: true });

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).json({
        code: "DownloadFailed",
        message: `拉取图片失败，状态码 ${response.status}。`,
      });
    }

    const extension = pickFileExtension(
      imageUrl,
      response.headers.get("content-type"),
    );
    const fileName = [
      "wan27",
      buildTimestamp(),
      sanitizeSegment(requestId, "result"),
      sanitizeSegment(index, "1"),
      crypto.randomUUID().slice(0, 8),
    ].join("_") + extension;

    const targetPath = path.join(GENERATED_DIR, fileName);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(targetPath, buffer);

    return res.json({
      ok: true,
      fileName,
      savedPath: targetPath,
      localUrl: `/generated-images/${encodeURIComponent(fileName)}`,
    });
  } catch (error) {
    return res.status(500).json({
      code: "DownloadFailed",
      message: error.message || "保存图片到本地失败。",
    });
  }
});

app.post("/api/export-workflow-ppt", async (req, res) => {
  const { projectTitle, slideAspect, pages } = req.body || {};
  const exportSlides = buildExportSlides(pages);

  if (!exportSlides.length) {
    return res.status(400).json({
      code: "MissingSlides",
      message: "导出 PPT 需要至少一页内容。",
    });
  }

  try {
    const slideSize = getPptSlideSize(slideAspect);
    const layout = getPptLayout(slideAspect);
    const pptx = new PptxGenJS();
    const deckTitle = normalizeExportText(projectTitle) || "智能生成导出";
    pptx.author = "PPTgen Studio";
    pptx.company = "PPTgen";
    pptx.subject = "Workflow PPT export";
    pptx.title = deckTitle;
    pptx.lang = "zh-CN";
    pptx.defineLayout(layout);
    pptx.layout = layout.name;

    for (const slideData of exportSlides) {
      const slide = pptx.addSlide();
      if (slideData.imageUrl) {
        const image = await loadImageSource(slideData.imageUrl);
        slide.addImage({
          data: toDataUrl(image.buffer, image.mimeType),
          altText: slideData.title,
          ...toPptPosition({
            left: 0,
            top: 0,
            width: slideSize.width,
            height: slideSize.height,
          }, slideSize, layout),
        });
      }
      continue;
      const margin = Math.round(slideSize.width * 0.05);
      const innerWidth = slideSize.width - margin * 2;
      const titleTop = Math.round(slideSize.height * 0.065);
      const titleHeight = Math.round(slideSize.height * 0.09);
      const pageBadgeWidth = Math.round(slideSize.width * 0.12);
      const imageTop = Math.round(slideSize.height * 0.19);
      const imageHeight = slideData.imageUrl ? Math.round(slideSize.height * 0.50) : 0;
      const bodyTop = slideData.imageUrl ? imageTop + imageHeight + Math.round(slideSize.height * 0.04) : imageTop;
      const bodyHeight = slideSize.height - bodyTop - margin;

      slide.background = { color: "F5F7FB" };
      slide.addShape(pptx.ShapeType.roundRect, {
        ...toPptPosition({
          left: Math.round(slideSize.width * 0.022),
          top: Math.round(slideSize.height * 0.03),
          width: Math.round(slideSize.width * 0.956),
          height: Math.round(slideSize.height * 0.94),
        }, slideSize, layout),
        fill: { color: "FFFFFF" },
        line: { color: "D9E2EC", width: 1 },
      });
      slide.addShape(pptx.ShapeType.roundRect, {
        ...toPptPosition({
          left: margin,
          top: Math.round(slideSize.height * 0.042),
          width: Math.round(slideSize.width * 0.11),
          height: Math.round(slideSize.height * 0.01),
        }, slideSize, layout),
        fill: { color: "2563EB" },
        line: { color: "2563EB", transparency: 100 },
      });
      slide.addText(slideData.title, {
        ...toPptPosition({
          left: margin,
          top: titleTop,
          width: innerWidth - pageBadgeWidth - 20,
          height: titleHeight,
        }, slideSize, layout),
        fontSize: Math.round(slideSize.height * 0.045),
        bold: true,
        color: "0F172A",
        fontFace: "Microsoft YaHei",
        valign: "mid",
        fit: "shrink",
      });
      slide.addText(`第 ${slideData.pageNumber} 页`, {
        ...toPptPosition({
          left: slideSize.width - margin - pageBadgeWidth,
          top: titleTop + 4,
          width: pageBadgeWidth,
          height: Math.round(slideSize.height * 0.05),
        }, slideSize, layout),
        shape: pptx.ShapeType.roundRect,
        fill: { color: "EEF4FF" },
        line: { color: "EEF4FF", transparency: 100 },
        fontSize: Math.round(slideSize.height * 0.022),
        color: "2563EB",
        bold: true,
        fontFace: "Microsoft YaHei",
        align: "center",
        valign: "mid",
      });

      if (slideData.imageUrl) {
        const image = await loadImageSource(slideData.imageUrl);
        slide.addImage({
          data: toDataUrl(image.buffer, image.mimeType),
          altText: slideData.title,
          ...toPptPosition({
            left: margin,
            top: imageTop,
            width: innerWidth,
            height: imageHeight,
          }, slideSize, layout),
        });
      }

      slide.addShape(pptx.ShapeType.roundRect, {
        ...toPptPosition({
          left: margin,
          top: bodyTop,
          width: innerWidth,
          height: Math.max(bodyHeight, Math.round(slideSize.height * 0.18)),
        }, slideSize, layout),
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0", width: 1 },
      });
      slide.addText(slideData.body || " ", {
        ...toPptPosition({
          left: margin + Math.round(slideSize.width * 0.018),
          top: bodyTop + Math.round(slideSize.height * 0.018),
          width: innerWidth - Math.round(slideSize.width * 0.036),
          height: Math.max(bodyHeight - Math.round(slideSize.height * 0.036), Math.round(slideSize.height * 0.14)),
        }, slideSize, layout),
        fontSize: slideData.imageUrl ? Math.round(slideSize.height * 0.024) : Math.round(slideSize.height * 0.03),
        color: "334155",
        fontFace: "Microsoft YaHei",
        margin: 0,
        fit: "shrink",
        breakLine: false,
      });
    }

    const fileName = `${sanitizeSegment(deckTitle, "workflow-export")}_${buildTimestamp()}_${crypto.randomUUID().slice(0, 6)}.pptx`;
    const targetPath = path.join(EXPORTS_DIR, fileName);
    await pptx.writeFile({ fileName: targetPath, compression: true });

    return res.json({
      ok: true,
      fileName,
      savedPath: targetPath,
      downloadUrl: `/exports/${encodeURIComponent(fileName)}`,
    });
  } catch (error) {
    return res.status(500).json({
      code: "WorkflowPptExportFailed",
      message: error.message || "导出 PPT 失败。",
    });
  }
});
function openInDefaultBrowser(url) {
  const { exec } = require("child_process");
  const cmd = process.platform === "win32"
    ? `start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.warn('Failed to open browser:', err.message); });
}

function startServer(port, options = {}) {
  const openBrowser = options.openBrowser ?? (process.pkg && process.env.PPTGEN_NO_BROWSER !== "1");
  const host = options.host || HOST;

  return new Promise((resolve, reject) => {
    let currentPort = Number(port) || 3000;

    const tryListen = () => {
      const server = app.listen(currentPort, host, () => {
        ACTIVE_PORT = Number(currentPort);
        const url = `http://${host}:${currentPort}`;
        console.log(`PPTGEN is running at ${url}`);
        console.log(`Generated images will be saved to ${GENERATED_DIR}`);
        if (openBrowser) openInDefaultBrowser(url);
        resolve({ app, server, port: currentPort, host, url });
      });

      server.on("error", (error) => {
        if (error?.code === "EADDRINUSE") {
          currentPort++;
          console.warn(`Port ${currentPort - 1} is in use. Retrying on ${currentPort}...`);
          server.close();
          tryListen();
          return;
        }
        reject(error);
      });
    };

    tryListen();
  });
}

if (require.main === module) {
  startServer(Number(PORT) || 3000).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  getActivePort: () => ACTIVE_PORT,
};



const STORAGE_KEY = "ppt-studio-v2-mainline";
const SETTINGS_STORAGE_KEY = `${STORAGE_KEY}:settings`;
const DEFAULT_REGION = "beijing";
const PPT_MODEL = "gpt-image-2";
const OPENAI_WORKFLOW_MODELS = new Set([
  "gpt-image-2",
]);
const OPENAI_IMAGE_DEFAULT_HOST = "https://api.bltcy.ai";
const MAX_REVISE_BOXES = 2;

const DEFAULT_PREFERENCES = {
  styleMode: "business",
  layoutVariety: "balanced",
  detailLevel: "polished",
  visualDensity: "balanced",
  compositionFocus: "balanced",
  dataNarrative: "balanced",
  pageMood: "modern",
};

const PREFERENCE_LABELS = {
  styleMode: { business: "商务清晰", academic: "科研克制", creative: "创意表达" },
  layoutVariety: { uniform: "整体统一", balanced: "稳中有变", diverse: "变化明显" },
  detailLevel: { minimal: "极简克制", polished: "精致均衡", rich: "细节丰富" },
  visualDensity: { airy: "留白充足", balanced: "疏密均衡", dense: "信息偏满" },
  compositionFocus: { imageLead: "视觉主导", balanced: "图文均衡", textLead: "文字主导" },
  dataNarrative: { clean: "清晰直给", balanced: "适度增强", expressive: "冲击更强" },
  pageMood: { steady: "稳重专业", modern: "现代清晰", dramatic: "强烈冲击" },
};

const PREFERENCE_PROMPT_KEYS = {
  styleMode: "画面气质",
  layoutVariety: "版式节奏",
  detailLevel: "视觉细节",
  visualDensity: "信息密度",
  compositionFocus: "图文关系",
  dataNarrative: "数据表现",
  pageMood: "整体张力",
};

const AI_PROCESSING_MODE_LABELS = {
  expand: "拆分并扩写",
  split: "仅拆分",
};

const PAGE_TYPE_META = {
  cover: { label: "封面", short: "封" },
  catalog: { label: "目录", short: "目" },
  chapter: { label: "章节", short: "章" },
  content: { label: "内容", short: "内" },
  data: { label: "数据", short: "数" },
};

const SPLIT_PRESETS = [
  {
    id: "balanced",
    label: "平衡标准",
    text: [
      "优先保证逻辑完整和单页单主题。",
      "普通内容页尽量控制在 50-150 字，关键转折允许适度少字。",
      "遇到时间线、对比关系、分类结构时优先拆成独立页。",
    ].join("\n"),
  },
  {
    id: "concise",
    label: "简洁讲解",
    text: [
      "优先少字与结论感。",
      "尽量把每页压缩成明确观点、短结论和少量支撑说明。",
      "内容过多时宁可拆页，也不要堆成密集信息墙。",
    ].join("\n"),
  },
  {
    id: "research",
    label: "研究细节",
    text: [
      "允许更多背景、数据和技术脉络。",
      "对方法、指标、机制、趋势要保留更多上下文。",
      "优先把数据、图表和引用拆成更清晰的独立页。",
    ].join("\n"),
  },
];

const ASPECT_META = {
  "16:9": { width: 1600, height: 900, outputSize: "3840*2160" },
  "4:3": { width: 1400, height: 1050, outputSize: "3840*2880" },
  "1:1": { width: 1200, height: 1200, outputSize: "3840*3840" },
};

const WORKFLOW_PROJECTS_VERSION = 1;
const THEME_PROMPT_SECTIONS = [
  { key: "basic", label: "基础风格" },
];

const state = {
  activeTab: "smart",
  smartStep: "split",
  settings: {
    apiKey: "",
    openAiImageApiKey: "",
    openAiImageBaseUrl: OPENAI_IMAGE_DEFAULT_HOST,
    whatAiImageApiKey: "",
    workflowImageModel: PPT_MODEL,
    region: DEFAULT_REGION,
    slideAspect: "16:9",
    outputSize: "2K",
    seed: "",
  },
  serverConfig: {
    loaded: false,
    configuredKeys: {
      dashscope: false,
      openAiImage: false,
      whatAiImage: false,
    },
  },
  workspaceZoom: 100,
  themeName: "",
  decorationLevel: "medium",
  preferences: { ...DEFAULT_PREFERENCES },
  themeDefinition: null,
  themePromptTrace: null,
  selectedThemePromptSection: "basic",
  themeConfirmed: false,
  workflowContent: "",
  workflowPageCount: 8,
  aiProcessingMode: "expand",
  workflowEnableExpansion: true,
  workflowTargetChars: 0,
  workflowMaxChars: 200,
  splitPresetId: "",
  splitTemplateText: "",
  parsedFiles: [],
  workflowJobId: "",
  workflowJob: null,
  workflowPollTimer: null,
  selectedPageId: "",
  pageDrafts: {},
  gptSharedStylePrompt: "",
  workflowProjectsIndex: [],
  workflowProjectSnapshots: {},
  selectedHistoryProjectId: "",
  pageDrawing: {
    tool: "",
    color: "#22d3ee",
    width: 6,
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    snapshot: null,
  },
  revise: {
    images: [],
    selectedImageId: "",
    prompt: "",
    results: [],
    drawing: { tool: "pen", color: "#22d3ee", width: 6, active: false, pointerId: null, snapshot: null, startX: 0, startY: 0 },
  },
};

const el = {};
const activeRequests = new Map();
const CANCEL_LABELS = {
  theme: "已取消生成风格。",
  split: "已取消拆分。",
  reprepare: "已取消重新整理。",
  repolish: "已取消 AI 一键重润。",
  pageGenerate: "已取消当前页生成。",
  batchGenerate: "已取消批量生成。",
  revise: "已取消改图。",
  testApi: "已取消 Key 测试。",
};

function cacheElements() {
  [
    "statusBar",
    "chainDescription",
    "workspaceZoomRange",
    "workspaceZoomValue",
    "themeName",
    "themeDecorationLevel",
    "prefStyleMode",
    "prefLayoutVariety",
    "prefDetailLevel",
    "prefVisualDensity",
    "prefCompositionFocus",
    "prefDataNarrative",
    "prefPageMood",
    "preferenceSummary",
    "generateThemeBtn",
    "cancelThemeBtn",
    "confirmThemeBtn",
    "goSplitBtn",
    "themeStatus",
    "themeSummaryPreview",
    "themePromptTabs",
    "themeModelPrompt",
    "workflowImageModelEntry",
    "workflowModelHint",
    "confirmWorkflowModelBtn",
    "quickApiKey",
    "quickOpenAiImageKeyField",
    "quickOpenAiImageApiKey",
    "quickOpenAiImageBaseUrlField",
    "quickOpenAiImageBaseUrl",
    "quickTestApiKeyBtn",
      "workflowPageCount",
    "workflowContent",
    "splitTemplateInput",
    "aiProcessingMode",
    "workflowEnableExpansion",
    "workflowTargetChars",
    "workflowMaxChars",
    "splitPresetToolbar",
    "pickReferenceFilesBtn",
    "referenceFilesInput",
    "referenceFilesList",
    "runSplitBtn",
    "skipSplitBtn",
    "cancelSplitBtn",
    "backToThemeBtn",
    "backToSplitBtn",
    "workflowSummary",
    "workflowStats",
    "workflowDiagnostics",
    "workflowPromptTrace",
    "workflowRibbonMeta",
    "workflowPageList",
    "addManualPageBtn",
    "pageMetaHint",
    "pageGlobalStylePromptField",
    "pageGlobalStylePrompt",
    "pageOnscreenPreview",
    "pageOnscreenEditor",
    "pageVisualElementsBlock",
    "pageVisualElementsDisplay",
    "repreparePageBtn",
    "aiRepolishPageBtn",
    "cancelRepreparePageBtn",
    "batchGenerateReadyBtn",
    "cancelBatchGenerateBtn",
    "uploadOverlayBtn",
    "overlayFileInput",
    "clearOverlayBtn",
    "slideStage",
    "slideFrame",
    "slideBaseImage",
    "slideEmptyState",
    "overlayLayer",
    "generateCurrentPageBtn",
    "cancelGenerateCurrentPageBtn",
    "modifyCurrentPageBtn",
    "pageExtraPromptField",
    "pageExtraPrompt",
    "pagePromptTrace",
    "pageResultStrip",
    "viewCurrentPageLargeBtn",
    "saveCurrentPageImageBtn",
    "copyPagePromptBtn",
    "exportWorkflowPptBtn",
    "historySummary",
    "historyProjectList",
    "historyProjectMeta",
    "historyPageGrid",
    "restoreHistoryProjectBtn",
    "pageImageModal",
    "pageImageModalTitle",
    "pageImageModalImg",
    "savePageImageModalBtn",
    "closePageImageModalBtn",
    "revisePrevBtn",
    "reviseNextBtn",
    "reviseImportBtn",
    "reviseDeleteBtn",
    "reviseFileInput",
    "reviseImageName",
    "reviseImageCounter",
    "reviseBaseImage",
    "reviseCanvas",
    "reviseStage",
    "reviseEmptyState",
    "reviseThumbStrip",
    "revisePrompt",
    "sendReviseBtn",
    "cancelReviseBtn",
    "reviseResultStrip",
    "reviseHistoryStrip",
    "exportReviseImageBtn",
    "apiKey",
    "openAiImageApiKey",
    "openAiImageBaseUrl",
    "whatAiImageApiKey",
    "workflowImageModel",
    "region",
    "slideAspect",
    "outputSize",
    "seed",
    "testApiKeyBtn",
    "cancelTestApiKeyBtn",
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function syncKeysFromDom() {
  if (el.quickApiKey?.value) state.settings.apiKey = el.quickApiKey.value.trim();
  else if (el.apiKey?.value) state.settings.apiKey = el.apiKey.value.trim();
  if (el.quickOpenAiImageApiKey?.value) state.settings.openAiImageApiKey = el.quickOpenAiImageApiKey.value.trim();
  else if (el.openAiImageApiKey?.value) state.settings.openAiImageApiKey = el.openAiImageApiKey.value.trim();
  if (el.whatAiImageApiKey?.value) state.settings.whatAiImageApiKey = el.whatAiImageApiKey.value.trim();
  if (el.quickOpenAiImageBaseUrl?.value) state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(el.quickOpenAiImageBaseUrl.value);
  else if (el.openAiImageBaseUrl?.value) state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(el.openAiImageBaseUrl.value);
  // Sync DOM back
  if (el.apiKey) el.apiKey.value = state.settings.apiKey;
  if (el.quickApiKey) el.quickApiKey.value = state.settings.apiKey;
  if (el.openAiImageApiKey) el.openAiImageApiKey.value = state.settings.openAiImageApiKey;
  if (el.quickOpenAiImageApiKey) el.quickOpenAiImageApiKey.value = state.settings.openAiImageApiKey;
  if (el.whatAiImageApiKey) el.whatAiImageApiKey.value = state.settings.whatAiImageApiKey;
  if (el.openAiImageBaseUrl) el.openAiImageBaseUrl.value = normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl);
  if (el.quickOpenAiImageBaseUrl) el.quickOpenAiImageBaseUrl.value = normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeAiProcessingModeValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "expand" || normalized === "split") return normalized;
  if (normalized === "strict") return "split";
  if (normalized === "balanced" || normalized === "creative") return "expand";
  return "expand";
}

function aiProcessingModeUsesExpansion(mode = state.aiProcessingMode) {
  return normalizeAiProcessingModeValue(mode) === "expand";
}

function normalizeStatusMessage(message) {
  const raw = String(message || "").trim();
  if (!raw) return "";
  if (/Invoke-WebRequest|WebCmdletWebResponseException|HttpWebRequest|FullyQualifiedErrorId|CategoryInfo/i.test(raw)) {
    if (/操作超时|timed out|timeout/i.test(raw)) {
      return "图片生成请求超时，系统已自动重试仍未成功。请稍后再试，或降低图片复杂度后重试。";
    }
    return "上游接口请求失败，请稍后重试。";
  }
  return raw.replace(/\s+/g, " ").slice(0, 260);
}

function setStatus(message, tone = "idle") {
  const displayMessage = normalizeStatusMessage(message);
  if (el.statusBar) {
    el.statusBar.textContent = displayMessage;
    el.statusBar.dataset.tone = tone;
  }
  const toast = el.statusToast || document.getElementById("statusToast");
  if (!toast || !displayMessage) return;
  toast.textContent = displayMessage;
  toast.dataset.tone = tone;
  toast.hidden = false;
  clearTimeout(setStatus.timer);
  const delay = tone === "error" ? 5200 : tone === "running" ? 0 : 2800;
  if (delay > 0) {
    setStatus.timer = setTimeout(() => {
      toast.hidden = true;
    }, delay);
  }
}

function setButtonLoading(button, loading, runningText) {
  if (!button) return;
  button.disabled = loading;
  if (loading) {
    button.dataset.idleText = button.textContent;
    button.textContent = runningText || "处理中...";
  } else if (button.dataset.idleText) {
    button.textContent = button.dataset.idleText;
  }
}

function startCancelableAction(key, button, cancelButton, runningText) {
  const previous = activeRequests.get(key);
  if (previous) {
    previous.controller.abort();
    activeRequests.delete(key);
  }
  const controller = new AbortController();
  activeRequests.set(key, { controller, button, cancelButton });
  setButtonLoading(button, true, runningText);
  if (cancelButton) {
    if (!cancelButton.dataset.idleText) cancelButton.dataset.idleText = cancelButton.textContent;
    cancelButton.textContent = cancelButton.dataset.idleText;
    cancelButton.hidden = false;
    cancelButton.disabled = false;
  }
  return controller.signal;
}

function finishCancelableAction(key) {
  const active = activeRequests.get(key);
  if (!active) return;
  if (active.cancelButton) {
    active.cancelButton.hidden = true;
    active.cancelButton.disabled = true;
    if (active.cancelButton.dataset.idleText) active.cancelButton.textContent = active.cancelButton.dataset.idleText;
  }
  setButtonLoading(active.button, false);
  activeRequests.delete(key);
}

function cancelAction(key, message = CANCEL_LABELS[key] || "已取消当前请求。") {
  const active = activeRequests.get(key);
  if (!active) return false;
  active.controller.abort();
  if (active.cancelButton) {
    active.cancelButton.disabled = true;
    active.cancelButton.textContent = key === "batchGenerate" ? "停止中..." : "取消中...";
  }
  setStatus(message, "idle");
  return true;
}

function isAbortError(error) {
  return error?.name === "AbortError" || /abort/i.test(String(error?.message || ""));
}

function isMissingWorkflowJobError(error) {
  return String(error?.message || "").includes("找不到对应的工作流任务");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function buildProjectTitle(job) {
  const firstPageTitle = job?.pages?.find((page) => page.pageTitle)?.pageTitle || "";
  const themeName = job?.themeDefinition?.themeName || state.themeName || "";
  return String(firstPageTitle || themeName || `项目 ${new Date().toLocaleString("zh-CN")}`).trim();
}

function buildProjectIndexEntry(job) {
  const title = buildProjectTitle(job);
  const pages = Array.isArray(job?.pages) ? job.pages : [];
  return {
    version: WORKFLOW_PROJECTS_VERSION,
    jobId: job.id,
    title,
    createdAt: job.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalPages: pages.length,
    themeName: job?.themeDefinition?.themeName || state.themeName || "",
    pageSummaries: pages.map((page) => {
      const resultImages = Array.isArray(page.resultImages)
        ? Array.from(new Set(page.resultImages.filter(Boolean)))
        : (page.baseImage ? [page.baseImage] : []);
      return {
        pageId: page.id,
        pageNumber: page.pageNumber,
        pageTitle: page.pageTitle || "",
        generated: Boolean(page.generated || resultImages.length),
        baseImage: page.baseImage || resultImages[0] || "",
        resultImages,
      };
    }),
  };
}

function buildProjectSnapshot(job) {
  if (!job?.id) return null;
  return {
    version: WORKFLOW_PROJECTS_VERSION,
    jobId: job.id,
    savedAt: new Date().toISOString(),
    themeName: state.themeName,
    decorationLevel: state.decorationLevel,
    preferences: { ...state.preferences },
    workflowContent: state.workflowContent,
    workflowPageCount: state.workflowPageCount,
  aiProcessingMode: state.aiProcessingMode,
  workflowEnableExpansion: aiProcessingModeUsesExpansion(state.aiProcessingMode),
    workflowTargetChars: state.workflowTargetChars,
    workflowMaxChars: state.workflowMaxChars,
    parsedFiles: Array.isArray(state.parsedFiles) ? state.parsedFiles : [],
    workflowJob: sanitizeRecoveredWorkflowJob(JSON.parse(JSON.stringify(job))),
    selectedPageId: state.selectedPageId || "",
    pageDrafts: serializePageDraftsForStorage(),
  };
}

function syncActiveProjectSnapshot() {
  if (!state.workflowJob?.id) return;
  const entry = buildProjectIndexEntry(state.workflowJob);
  state.workflowProjectSnapshots[state.workflowJob.id] = buildProjectSnapshot(state.workflowJob);
  state.workflowProjectsIndex = [
    entry,
    ...state.workflowProjectsIndex.filter((item) => item?.jobId && item.jobId !== state.workflowJob.id),
  ];
  if (!state.selectedHistoryProjectId) {
    state.selectedHistoryProjectId = state.workflowJob.id;
  }
}

function serializePageDraftsForStorage() {
  return Object.fromEntries(Object.entries(state.pageDrafts).map(([pageId, draft]) => {
    const editablePrompt = getEditablePagePromptFromValues(draft.sharedPrompt, draft.extraPrompt, draft.pageStylePrompt);
    return [
      pageId,
      {
        onscreenTitle: draft.onscreenTitle || "",
        onscreenBody: draft.onscreenBody || "",
        onscreenContent: draft.onscreenContent || "",
        sourceOnscreenTitle: draft.sourceOnscreenTitle || "",
        sourceOnscreenContent: draft.sourceOnscreenContent || "",
        sharedPrompt: editablePrompt,
        extraPrompt: editablePrompt,
        pageStylePrompt: getEffectivePageStylePrompt(editablePrompt),
        overlays: (draft.overlays || []).filter((item) => /^https?:\/\//i.test(item.src) || item.src.startsWith("/generated-images/")),
      },
    ];
  }));
}

function getSettingsForStorage() {
  return {
    apiKey: state.settings.apiKey || "",
    openAiImageApiKey: state.settings.openAiImageApiKey || "",
    openAiImageBaseUrl: normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl),
    whatAiImageApiKey: state.settings.whatAiImageApiKey || "",
    workflowImageModel: PPT_MODEL,
    region: state.settings.region || DEFAULT_REGION,
    slideAspect: state.settings.slideAspect || "16:9",
    outputSize: state.settings.outputSize || "2K",
    seed: state.settings.seed || "",
  };
}

function saveSettingsState() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(getSettingsForStorage()));
  } catch (error) {
    console.warn("settings save failed", error);
  }
}

function loadSettingsState() {
  const parsed = safeJsonParse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "");
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveState() {
  saveSettingsState();
  syncActiveProjectSnapshot();
  const draftToStore = serializePageDraftsForStorage();
  const payload = {
    activeTab: state.activeTab,
    smartStep: state.smartStep,
    settings: state.settings,
    workspaceZoom: state.workspaceZoom,
    themeName: state.themeName,
    decorationLevel: state.decorationLevel,
    preferences: state.preferences,
    themeDefinition: state.themeDefinition,
    themePromptTrace: state.themePromptTrace,
    selectedThemePromptSection: state.selectedThemePromptSection,
    themeConfirmed: state.themeConfirmed,
    workflowContent: state.workflowContent,
    workflowPageCount: state.workflowPageCount,
  aiProcessingMode: state.aiProcessingMode,
  workflowEnableExpansion: aiProcessingModeUsesExpansion(state.aiProcessingMode),
    workflowTargetChars: state.workflowTargetChars,
    workflowMaxChars: state.workflowMaxChars,
    splitPresetId: state.splitPresetId,
    splitTemplateText: state.splitTemplateText,
    parsedFiles: state.parsedFiles,
    workflowJobId: state.workflowJobId,
    workflowJob: state.workflowJob,
    selectedPageId: state.selectedPageId,
    pageDrafts: draftToStore,
    gptSharedStylePrompt: state.gptSharedStylePrompt,
    workflowProjectsIndex: state.workflowProjectsIndex,
    workflowProjectSnapshots: state.workflowProjectSnapshots,
    selectedHistoryProjectId: state.selectedHistoryProjectId,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, clearing old data');
      try {
        const slimPayload = { ...payload, workflowProjectSnapshots: {}, workflowProjectsIndex: payload.workflowProjectsIndex?.slice(0, 5) || [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slimPayload));
      } catch (_) {
        // Cannot save at all
      }
    }
  }
}

function loadState() {
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY) || "");
  const storedSettings = loadSettingsState();
  if (!parsed || typeof parsed !== "object") {
    state.settings = { ...state.settings, ...storedSettings };
    state.settings.workflowImageModel = PPT_MODEL;
    state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl);
    return;
  }
  state.activeTab = ["smart", "history", "revise", "settings"].includes(parsed.activeTab) ? parsed.activeTab : "smart";
  state.smartStep = ["split", "pages"].includes(parsed.smartStep) ? parsed.smartStep : "split";
  if (state.smartStep === "theme" && !parsed.workflowJob && !parsed.themeDefinition) {
    state.smartStep = "split";
  }
  state.settings = { ...state.settings, ...(parsed.settings || {}), ...storedSettings };
  state.settings.workflowImageModel = PPT_MODEL;
  state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl);
  state.workspaceZoom = clamp(Number(parsed.workspaceZoom || 100), 50, 140);
  state.themeName = String(parsed.themeName || "");
  state.decorationLevel = String(parsed.decorationLevel || "medium");
  state.preferences = { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) };
  state.themeDefinition = sanitizeRecoveredThemeDefinition(parsed.themeDefinition || null);
  state.themePromptTrace = parsed.themePromptTrace || null;
  state.selectedThemePromptSection = String(parsed.selectedThemePromptSection || "basic");
  state.themeConfirmed = Boolean(parsed.themeConfirmed);
  state.workflowContent = String(parsed.workflowContent || "");
  state.workflowPageCount = clamp(Number(parsed.workflowPageCount || 8), 2, 120);
  state.aiProcessingMode = normalizeAiProcessingModeValue(parsed.aiProcessingMode);
  state.workflowEnableExpansion = aiProcessingModeUsesExpansion(state.aiProcessingMode);
  state.workflowTargetChars = clamp(Number(parsed.workflowTargetChars || 0), 0, 300);
  state.workflowMaxChars = clamp(Number(parsed.workflowMaxChars || 200), 0, 400);
  state.splitPresetId = "";
  state.splitTemplateText = "";
  state.parsedFiles = Array.isArray(parsed.parsedFiles) ? parsed.parsedFiles : [];
  state.workflowJobId = String(parsed.workflowJobId || "");
  state.workflowJob = parsed.workflowJob || null;
  state.selectedPageId = String(parsed.selectedPageId || "");
  state.pageDrafts = parsed.pageDrafts && typeof parsed.pageDrafts === "object" ? parsed.pageDrafts : {};
  state.gptSharedStylePrompt = String(parsed.gptSharedStylePrompt || "");
  state.workflowProjectsIndex = Array.isArray(parsed.workflowProjectsIndex) ? parsed.workflowProjectsIndex : [];
  state.workflowProjectSnapshots = parsed.workflowProjectSnapshots && typeof parsed.workflowProjectSnapshots === "object"
    ? parsed.workflowProjectSnapshots
    : {};
  state.selectedHistoryProjectId = String(parsed.selectedHistoryProjectId || "");
}

function applyStateToUi() {
  syncWorkflowModelOptions();
  el.workspaceZoomRange.value = String(state.workspaceZoom);
  applyWorkspaceZoom(state.workspaceZoom);
  el.themeName.value = state.themeName;
  el.themeDecorationLevel.value = state.decorationLevel;
  el.prefStyleMode.value = state.preferences.styleMode;
  el.prefLayoutVariety.value = state.preferences.layoutVariety;
  el.prefDetailLevel.value = state.preferences.detailLevel;
  el.prefVisualDensity.value = state.preferences.visualDensity;
  el.prefCompositionFocus.value = state.preferences.compositionFocus;
  el.prefDataNarrative.value = state.preferences.dataNarrative;
  el.prefPageMood.value = state.preferences.pageMood;
  el.workflowPageCount.value = String(state.workflowPageCount);
  el.aiProcessingMode.value = normalizeAiProcessingModeValue(state.aiProcessingMode);
  if (el.workflowTargetChars) el.workflowTargetChars.value = state.workflowTargetChars ? String(state.workflowTargetChars) : "";
  if (el.workflowMaxChars) el.workflowMaxChars.value = state.workflowMaxChars ? String(state.workflowMaxChars) : "";
  el.workflowContent.value = state.workflowContent;
  if (el.splitTemplateInput) el.splitTemplateInput.value = state.splitTemplateText;
  syncSplitExpansionControls();
  el.apiKey.value = state.settings.apiKey || "";
  if (el.openAiImageApiKey) el.openAiImageApiKey.value = state.settings.openAiImageApiKey || "";
  if (el.openAiImageBaseUrl) el.openAiImageBaseUrl.value = normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl);
  if (el.whatAiImageApiKey) el.whatAiImageApiKey.value = state.settings.whatAiImageApiKey || "";
  if (el.quickApiKey) el.quickApiKey.value = state.settings.apiKey || "";
  if (el.quickOpenAiImageApiKey) el.quickOpenAiImageApiKey.value = state.settings.openAiImageApiKey || "";
  if (el.quickOpenAiImageBaseUrl) el.quickOpenAiImageBaseUrl.value = normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl);
  if (el.workflowImageModelEntry) el.workflowImageModelEntry.value = state.settings.workflowImageModel || PPT_MODEL;
  if (el.workflowImageModel) el.workflowImageModel.value = PPT_MODEL;
  el.region.value = state.settings.region || DEFAULT_REGION;
  el.slideAspect.value = state.settings.slideAspect || "16:9";
  el.outputSize.value = state.settings.outputSize || "2K";
  el.seed.value = state.settings.seed || "";
  el.revisePrompt.value = state.revise.prompt || "";
  if (el.pageGlobalStylePrompt) el.pageGlobalStylePrompt.value = state.gptSharedStylePrompt || "";
}

function syncSplitExpansionControls() {
  const enabled = aiProcessingModeUsesExpansion(state.aiProcessingMode);
  state.workflowEnableExpansion = enabled;
  if (el.workflowTargetChars) {
    el.workflowTargetChars.disabled = !enabled;
    el.workflowTargetChars.placeholder = enabled ? "例如 180" : "拆分并扩写时启用";
    el.workflowTargetChars.closest(".field")?.classList.toggle("is-disabled", !enabled);
  }
}

function applyWorkspaceZoom(value) {
  state.workspaceZoom = clamp(Number(value || 100), 50, 140);
  document.documentElement.style.setProperty("--workspace-zoom", (state.workspaceZoom / 100).toFixed(2));
  el.workspaceZoomValue.textContent = `${state.workspaceZoom}%`;
}

function getCurrentPreferences() {
  return {
    styleMode: el.prefStyleMode.value,
    layoutVariety: el.prefLayoutVariety.value,
    detailLevel: el.prefDetailLevel.value,
    visualDensity: el.prefVisualDensity.value,
    compositionFocus: el.prefCompositionFocus.value,
    dataNarrative: el.prefDataNarrative.value,
    pageMood: el.prefPageMood.value,
  };
}

function getPreferencePromptPairs(preferences = getCurrentPreferences()) {
  return [
    `${PREFERENCE_PROMPT_KEYS.styleMode}=${PREFERENCE_LABELS.styleMode[preferences.styleMode]}`,
    `${PREFERENCE_PROMPT_KEYS.layoutVariety}=${PREFERENCE_LABELS.layoutVariety[preferences.layoutVariety]}`,
    `${PREFERENCE_PROMPT_KEYS.detailLevel}=${PREFERENCE_LABELS.detailLevel[preferences.detailLevel]}`,
    `${PREFERENCE_PROMPT_KEYS.visualDensity}=${PREFERENCE_LABELS.visualDensity[preferences.visualDensity]}`,
    `${PREFERENCE_PROMPT_KEYS.compositionFocus}=${PREFERENCE_LABELS.compositionFocus[preferences.compositionFocus]}`,
    `${PREFERENCE_PROMPT_KEYS.dataNarrative}=${PREFERENCE_LABELS.dataNarrative[preferences.dataNarrative]}`,
    `${PREFERENCE_PROMPT_KEYS.pageMood}=${PREFERENCE_LABELS.pageMood[preferences.pageMood]}`,
  ];
}

function getConfirmedWorkflowThemeBasic() {
  return String(state.workflowJob?.themeDefinition?.basic || "").trim();
}

function isStandardWorkflowThemeReady() {
  return usingSimpleWorkflowUi() || Boolean(getConfirmedWorkflowThemeBasic());
}

function ensureStandardWorkflowThemeReady(message = "请先生成并确认风格，再进入逐页生成。") {
  if (isStandardWorkflowThemeReady()) return true;
  switchSmartStep(state.workflowJob ? "theme" : "split", { silent: true });
  setStatus(message, "error");
  return false;
}

function renderPreferenceSummary() {
  const current = getCurrentPreferences();
  state.preferences = current;
  el.preferenceSummary.textContent = `当前风格锚点：${getPreferencePromptPairs(current).join("；")}`;
}

function getPageTypeMeta(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return PAGE_TYPE_META[normalized] || PAGE_TYPE_META.content;
}

function switchTab(tab) {
  if (tab !== "smart") {
    closeCurrentPageLargeImage();
  }
  state.activeTab = tab;
  document.querySelectorAll(".sidebar-tab").forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === tab);
  });
  if (tab === "history") {
    renderHistoryProjects();
  }
  saveState();
}

function switchSmartStep(step, options = {}) {
  let nextStep = step;
  if (nextStep === "theme" && usingSimpleWorkflowUi()) {
    nextStep = state.workflowJob ? "pages" : "split";
  }
  if (nextStep === "pages" && !isStandardWorkflowThemeReady()) {
    nextStep = state.workflowJob ? "theme" : "split";
    if (!options.silent) {
      setStatus("请先生成并确认风格，再进入逐页生成。", "error");
    }
  }
  if (nextStep === "theme" && !hasThemeWorkflowUi()) {
    nextStep = state.workflowJob ? "pages" : "split";
  }
  state.smartStep = nextStep;
  document.querySelectorAll(".ribbon-step").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.step === nextStep);
    button.classList.toggle("is-disabled", button.dataset.step === "theme" && usingSimpleWorkflowUi());
    if (button.dataset.step === "theme") button.disabled = usingSimpleWorkflowUi();
  });
  document.querySelectorAll(".smart-stage").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.stepPanel === nextStep);
  });
  if (!document.querySelector(".smart-stage.is-active")) {
    nextStep = state.workflowJob ? "pages" : "split";
    state.smartStep = nextStep;
    document.querySelectorAll(".ribbon-step").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.step === nextStep);
    });
    document.querySelectorAll(".smart-stage").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.stepPanel === nextStep);
    });
  }
  const meta = {
    split: "先把内容拆分和字数倾向定下来，再匹配稳定的成熟风格。",
    pages: state.workflowJob
      ? `${state.workflowJob.readyToGeneratePages || 0} 页已可直接生成，${state.workflowJob.preparedPages || 0}/${state.workflowJob.totalPages || 0} 页已完成准备。`
      : "左侧看进度，中间改上屏内容，右侧直接生成当前页。",
  };
  if (el.workflowRibbonMeta) el.workflowRibbonMeta.textContent = meta[nextStep];
  syncWorkflowModeUi();
  saveState();
}

function getSelectedPage() {
  if (!state.workflowJob?.pages?.length) return null;
  return state.workflowJob.pages.find((page) => page.id === state.selectedPageId) || state.workflowJob.pages[0];
}

function ensureSelectedPage() {
  const selected = getSelectedPage();
  if (selected) {
    state.selectedPageId = selected.id;
    ensurePageDraft(selected);
  } else {
    state.selectedPageId = "";
  }
}

function clearWorkflowSession({ toSplit = false } = {}) {
  stopWorkflowPolling();
  state.workflowJobId = "";
  state.workflowJob = null;
  state.selectedPageId = "";
  state.pageDrafts = {};
  if (toSplit) {
    switchSmartStep("split");
  } else {
    renderPagesWorkbench();
  }
  saveState();
}

function getCurrentWorkflowImageModel() {
  return PPT_MODEL;
}

function usingGeminiWorkflowModel() {
  return false;
}

function usingOpenAiWorkflowModel() {
  return OPENAI_WORKFLOW_MODELS.has(getCurrentWorkflowImageModel());
}

function usingGptSimpleWorkflow() {
  return usingOpenAiWorkflowModel();
}

function hasThemeWorkflowUi() {
  return Boolean(
    document.querySelector('[data-step="theme"]')
    && document.querySelector('[data-step-panel="theme"]')
  );
}

function usingSimpleWorkflowUi() {
  return usingGptSimpleWorkflow() || !hasThemeWorkflowUi();
}

function usingGrsaiWorkflowModel() {
  return false;
}

function usingHostedWorkflowModel() {
  const model = getCurrentWorkflowImageModel();
  return OPENAI_WORKFLOW_MODELS.has(model);
}

function hasDashScopeApiKey() {
  return Boolean(state.settings.apiKey || state.serverConfig?.configuredKeys?.dashscope);
}

function hasHostedImageApiKey() {
  if (usingOpenAiWorkflowModel()) {
    return Boolean(state.settings.openAiImageApiKey || state.serverConfig?.configuredKeys?.openAiImage);
  }
  return Boolean(state.settings.openAiImageApiKey || state.serverConfig?.configuredKeys?.openAiImage);
}

function normalizeOpenAiImageBaseUrl(value) {
  const endpoints = String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .map((item) => (item === "https://api.openai.com" || item === "https://api.openai.com/v1/images/generations")
      ? OPENAI_IMAGE_DEFAULT_HOST
      : item);
  return Array.from(new Set(endpoints)).join(", ") || OPENAI_IMAGE_DEFAULT_HOST;
}

function getCurrentHostedImageKeyPayload() {
  return {
    openAiImageApiKey: state.settings.openAiImageApiKey,
    openAiImageBaseUrl: normalizeOpenAiImageBaseUrl(state.settings.openAiImageBaseUrl),
    whatAiImageApiKey: state.settings.whatAiImageApiKey,
  };
}

const WORKFLOW_IMAGE_MODEL_OPTIONS = [
    `<option value="gpt-image-2">GPT Image 2</option>`,
];

function getWorkflowModelSelects() {
  return [el.workflowImageModelEntry, el.workflowImageModel].filter(Boolean);
}

function syncWorkflowModelOptions() {
  const selects = getWorkflowModelSelects();
  if (!selects.length) return;
  selects.forEach((select) => {
    select.innerHTML = WORKFLOW_IMAGE_MODEL_OPTIONS.join("");
    select.value = PPT_MODEL;
  });
  state.settings.workflowImageModel = PPT_MODEL;
}

function setWorkflowImageModel(value) {
  state.settings.workflowImageModel = PPT_MODEL;
  getWorkflowModelSelects().forEach((select) => {
    select.value = PPT_MODEL;
  });
  if (document.querySelector(".ribbon-step")) {
    switchSmartStep(state.smartStep || "split", { silent: true });
    return;
  }
  syncWorkflowModeUi();
}

function syncWorkflowModelCards() {
  const current = getCurrentWorkflowImageModel();
  document.querySelectorAll("[data-model-card]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modelCard === current);
  });
}

function syncQuickKeyPlaceholders() {
  const ck = state.serverConfig?.configuredKeys;
  if (!ck) return;
  const setPlaceholder = (element, baseText, isConfigured) => {
    if (!element) return;
    element.placeholder = isConfigured ? `${baseText}；本机已配置可留空` : baseText;
  };
  setPlaceholder(el.quickApiKey, "用于内容拆分和风格匹配", ck.dashscope);
  setPlaceholder(el.quickOpenAiImageApiKey, "用于 gpt-image-2", ck.openAiImage);
}

function syncWorkflowModeUi() {
  const isSimple = usingSimpleWorkflowUi();
  const isGpt = usingGptSimpleWorkflow();
  document.body.dataset.workflowMode = isSimple ? "gpt" : "standard";
  document.body.dataset.workflowProvider = isGpt ? "openai" : "standard";
  if (el.quickOpenAiImageKeyField) el.quickOpenAiImageKeyField.hidden = !isSimple;
  if (el.quickOpenAiImageBaseUrlField) el.quickOpenAiImageBaseUrlField.hidden = !isSimple;
  document.querySelectorAll('[data-step="theme"]').forEach((button) => {
    button.disabled = isSimple;
    button.classList.toggle("is-disabled", isSimple);
  });
  const pagesStepNumber = document.querySelector('[data-step="pages"] span');
  if (pagesStepNumber) pagesStepNumber.textContent = isSimple ? "2" : "3";
  if (el.workflowModelHint) {
    el.workflowModelHint.textContent = isSimple
      ? "GPT Image 2 轻链路：拆分内容后，逐页填写风格提示词并直接生图。"
      : "标准链路：拆分内容后匹配基础风格，再逐页确认内容并生成。";
  }
  if (state.smartStep === "theme" && isSimple) {
    state.smartStep = state.workflowJob ? "pages" : "split";
  }
}

const THEME_IMPLEMENTATION_KEYWORD_PATTERN = /(优设标题黑|MiSans|思源黑体|JetBrains Mono|Helvetica(?:\s+Now)?|Inter(?:\s+Display)?|DIN|Heavy|Bold|Regular|Light|0\.618|黄金比例|pt\b|px\b|12列|12-column|12 column|R=\d+\s*px)/i;
const THEME_IMPLEMENTATION_FRAGMENT_PATTERNS = [
  /字重对比[^；。！!\n|]*/gi,
  /无衬线[^；。！!\n|]*?(?:优设标题黑|MiSans|思源黑体|JetBrains Mono|Helvetica(?:\s+Now)?|Inter(?:\s+Display)?|DIN)[^；。！!\n|]*/gi,
  /标题与正文(?:字体大小|字号)[^；。！!\n|]*?(?:0\.618|黄金比例)[^；。！!\n|]*/gi,
  /(?:中文|英文|技术参数)[:：]?\s*[^；。！!\n|]*?(?:优设标题黑|MiSans|思源黑体|JetBrains Mono|Helvetica(?:\s+Now)?|Inter(?:\s+Display)?|DIN)[^；。！!\n|]*/gi,
];

function sanitizeDirectionalThemeText(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  let value = source.replace(/\s*\|\s*/g, "；");
  let removedTypographyImplementation = false;
  THEME_IMPLEMENTATION_FRAGMENT_PATTERNS.forEach((pattern) => {
    if (pattern.test(value)) {
      removedTypographyImplementation = true;
    }
    pattern.lastIndex = 0;
    value = value.replace(pattern, "");
  });
  const fragments = (value.match(/[^。！？；\n]+[。！？；]?/gu) || [])
    .map((item) => item.replace(/[。！？；]+$/u, "").trim())
    .filter(Boolean);
  const cleaned = [];
  fragments.forEach((fragment) => {
    if (THEME_IMPLEMENTATION_KEYWORD_PATTERN.test(fragment)) {
      removedTypographyImplementation = true;
      return;
    }
    cleaned.push(fragment);
  });
  if (removedTypographyImplementation) {
    cleaned.push("字体与版式只保留方向性要求：标题更有识别度，正文稳定清晰，技术信息克制统一");
  }
  return Array.from(new Set(cleaned))
    .join("；")
    .replace(/；{2,}/g, "；")
    .replace(/^；|；$/g, "")
    .trim();
}

function sanitizeRecoveredThemeDefinition(themeDefinition) {
  if (!themeDefinition || typeof themeDefinition !== "object") return themeDefinition;
  const normalized = { ...themeDefinition };
  ["displaySummaryZh", "basic"].forEach((key) => {
    normalized[key] = sanitizeDirectionalThemeText(normalized[key] || "");
  });
  normalized.modelPrompt = "";
  normalized.archivedLegacyThemeModules = {
    cover: sanitizeDirectionalThemeText(normalized.cover || ""),
    catalog: sanitizeDirectionalThemeText(normalized.catalog || ""),
    chapter: sanitizeDirectionalThemeText(normalized.chapter || ""),
    content: sanitizeDirectionalThemeText(normalized.content || ""),
    data: sanitizeDirectionalThemeText(normalized.data || ""),
  };
  normalized.cover = "";
  normalized.catalog = "";
  normalized.chapter = "";
  normalized.content = "";
  normalized.data = "";
  if (!normalized.displaySummaryZh) {
    normalized.displaySummaryZh = normalized.basic || "";
  }
  return normalized;
}

function stripCurrentGptStylePrompt(value) {
  const text = String(value || "").trim();
  if (!text || !usingGptSimpleWorkflow()) return text;
  const stylePrompt = getCurrentGptStylePromptValue();
  if (!stylePrompt) return text;
  if (text === stylePrompt) return "";
  for (const prefix of [`${stylePrompt}\r\n`, `${stylePrompt}\n`]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length).trim();
  }
  return text;
}

function getEditablePagePromptFromValues(sharedPrompt = "", extraPrompt = "", pageStylePrompt = "", traceExtraPrompt = "") {
  const candidates = [extraPrompt, traceExtraPrompt, sharedPrompt];
  for (const candidate of candidates) {
    const prompt = stripCurrentGptStylePrompt(candidate);
    if (prompt) return prompt;
  }
  return usingGptSimpleWorkflow() ? "" : String(pageStylePrompt || "").trim();
}

function getEditablePagePromptFromPage(page) {
  return getEditablePagePromptFromValues(
    page?.sharedPrompt,
    page?.extraPrompt,
    page?.pageStylePrompt,
    page?.promptTrace?.finalImage?.extraPrompt
  );
}

function applyDraftPromptForGeneration(draft, userPrompt) {
  const editablePrompt = stripCurrentGptStylePrompt(userPrompt);
  draft.sharedPrompt = editablePrompt;
  draft.extraPrompt = editablePrompt;
  draft.pageStylePrompt = getEffectivePageStylePrompt(editablePrompt);
  return editablePrompt;
}

function sanitizeRecoveredWorkflowJob(job) {
  if (!job || !Array.isArray(job.pages)) return job;
  job.themeDefinition = sanitizeRecoveredThemeDefinition(job.themeDefinition || null);
  job.pages = job.pages.map((page) => {
    const normalizedPage = { ...page };
    if (normalizedPage.generationStatus === "running") {
      normalizedPage.generationStatus = normalizedPage.generated ? "done" : "idle";
    }
    if (!normalizedPage.onscreenContentText && normalizedPage.onscreenContent) {
      normalizedPage.onscreenContentText = normalizedPage.onscreenContent;
    }
    if (!normalizedPage.onscreenContent && normalizedPage.onscreenContentText) {
      normalizedPage.onscreenContent = normalizedPage.onscreenContentText;
    }
    const editablePrompt = getEditablePagePromptFromPage(normalizedPage);
    normalizedPage.sharedPrompt = editablePrompt;
    normalizedPage.extraPrompt = editablePrompt;
    normalizedPage.visualElementsPrompt = String(normalizedPage.visualElementsPrompt || "");
    normalizedPage.visualElementsDisplay = String(normalizedPage.visualElementsDisplay || normalizedPage.visualElementsPrompt || "");
    normalizedPage.pageStylePrompt = String(normalizedPage.pageStylePrompt || "");
    normalizedPage.resultImages = Array.isArray(normalizedPage.resultImages)
      ? Array.from(new Set(normalizedPage.resultImages.filter(Boolean)))
      : [];
    if (normalizedPage.baseImage && !normalizedPage.resultImages.includes(normalizedPage.baseImage)) {
      normalizedPage.resultImages.push(normalizedPage.baseImage);
    }
    normalizedPage.generated = Boolean(normalizedPage.generated || normalizedPage.resultImages.length);
    return normalizedPage;
  });
  return job;
}

function mergeWorkflowJobWithLocalImages(incomingJob, existingJob = state.workflowJob) {
  const job = sanitizeRecoveredWorkflowJob(incomingJob);
  if (!job?.pages?.length || !existingJob?.pages?.length) return job;
  const localPages = new Map(existingJob.pages.map((page) => [page.id, page]));
  job.pages = job.pages.map((page) => {
    const local = localPages.get(page.id);
    if (!local) return page;
    const mergedImages = Array.from(new Set([
      ...(Array.isArray(page.resultImages) ? page.resultImages : []),
      ...(Array.isArray(local.resultImages) ? local.resultImages : []),
      page.baseImage,
      local.baseImage,
    ].filter(Boolean)));
    if (!mergedImages.length) return page;
    return {
      ...page,
      baseImage: page.baseImage || local.baseImage || mergedImages[0],
      resultImages: mergedImages,
      generated: Boolean(page.generated || local.generated || mergedImages.length),
    };
  });
  return job;
}

function getWorkflowGenerationSize() {
  const aspectMeta = getAspectMeta();
  return usingHostedWorkflowModel()
    ? state.settings.outputSize
    : (aspectMeta?.outputSize || ASPECT_META["16:9"].outputSize);
}

function getPageGenerateRequestKey(pageId) {
  return `pageGenerate:${pageId}`;
}

function isPageGenerating(pageId) {
  return activeRequests.has(getPageGenerateRequestKey(pageId));
}

function getCurrentSharedPromptValue() {
  return stripCurrentGptStylePrompt(el.pageExtraPrompt?.value);
}

function getCurrentGptStylePromptValue() {
  return String(state.gptSharedStylePrompt || el.pageGlobalStylePrompt?.value || "").trim();
}

function composeGptPageStylePrompt(pagePrompt = getCurrentSharedPromptValue()) {
  const editablePrompt = stripCurrentGptStylePrompt(pagePrompt);
  return [getCurrentGptStylePromptValue(), editablePrompt].filter(Boolean).join("\n");
}

function getEffectivePageStylePrompt(pagePrompt = getCurrentSharedPromptValue()) {
  const editablePrompt = stripCurrentGptStylePrompt(pagePrompt);
  return usingGptSimpleWorkflow() ? composeGptPageStylePrompt(editablePrompt) : editablePrompt;
}

function appendDrawingRemovalInstruction(prompt, hasCanvasImage = true) {
  const base = String(prompt || "").trim();
  if (!hasCanvasImage) return base;
  const instruction = "修改完成之后去掉用户手绘标记。";
  return base.includes(instruction) ? base : [base, instruction].filter(Boolean).join("\n");
}

function ensurePageDraft(page) {
  if (!page) return null;
  const canonicalContent = formatOnscreenPreview(page.onscreenContentText || page.onscreenContent || page.pageContent || "");
  const canonicalSplit = splitOnscreenContentForEditor(canonicalContent, page.pageTitle || "");
  const editablePrompt = getEditablePagePromptFromPage(page);
  if (!state.pageDrafts[page.id]) {
    state.pageDrafts[page.id] = {
      onscreenTitle: canonicalSplit.title,
      onscreenBody: canonicalSplit.body,
      onscreenContent: composeOnscreenContentFromEditors(canonicalSplit.title, canonicalSplit.body),
      sourceOnscreenTitle: canonicalSplit.title,
      sourceOnscreenContent: composeOnscreenContentFromEditors(canonicalSplit.title, canonicalSplit.body),
      sharedPrompt: editablePrompt,
      extraPrompt: editablePrompt,
      pageStylePrompt: page.pageStylePrompt || "",
      overlays: [],
      drawingLayer: "",
    };
  }
  if (typeof state.pageDrafts[page.id].onscreenTitle !== "string") {
    state.pageDrafts[page.id].onscreenTitle = "";
  }
  if (typeof state.pageDrafts[page.id].onscreenBody !== "string") {
    state.pageDrafts[page.id].onscreenBody = "";
  }
  if (typeof state.pageDrafts[page.id].sourceOnscreenTitle !== "string") {
    state.pageDrafts[page.id].sourceOnscreenTitle = "";
  }
  if (typeof state.pageDrafts[page.id].sourceOnscreenContent !== "string") {
    state.pageDrafts[page.id].sourceOnscreenContent = "";
  }
  if (!state.pageDrafts[page.id].onscreenContent && page.onscreenContent) {
    state.pageDrafts[page.id].onscreenContent = page.onscreenContent;
  }
  if (!state.pageDrafts[page.id].onscreenTitle && !state.pageDrafts[page.id].onscreenBody && state.pageDrafts[page.id].onscreenContent) {
    const localSplit = splitOnscreenContentForEditor(state.pageDrafts[page.id].onscreenContent, page.pageTitle || "");
    state.pageDrafts[page.id].onscreenTitle = localSplit.title;
    state.pageDrafts[page.id].onscreenBody = localSplit.body;
  }
  if (typeof state.pageDrafts[page.id].pageStylePrompt !== "string") {
    state.pageDrafts[page.id].pageStylePrompt = "";
  }
  if (!state.pageDrafts[page.id].pageStylePrompt && page.pageStylePrompt) {
    state.pageDrafts[page.id].pageStylePrompt = page.pageStylePrompt;
  }
  const normalizedPrompt = getEditablePagePromptFromValues(
    state.pageDrafts[page.id].sharedPrompt,
    state.pageDrafts[page.id].extraPrompt,
    state.pageDrafts[page.id].pageStylePrompt,
    page.promptTrace?.finalImage?.extraPrompt
  );
  state.pageDrafts[page.id].sharedPrompt = normalizedPrompt;
  state.pageDrafts[page.id].extraPrompt = normalizedPrompt;
  state.pageDrafts[page.id].pageStylePrompt = getEffectivePageStylePrompt(normalizedPrompt);
  if (!Array.isArray(state.pageDrafts[page.id].overlays)) {
    state.pageDrafts[page.id].overlays = [];
  }
  if (typeof state.pageDrafts[page.id].drawingLayer !== "string") {
    state.pageDrafts[page.id].drawingLayer = "";
  }
  return state.pageDrafts[page.id];
}

function syncPageDraftFromPage(page, { force = false } = {}) {
  const draft = ensurePageDraft(page);
  if (!page || !draft) return draft;

  const serverContent = formatOnscreenPreview(page.onscreenContentText || page.onscreenContent || page.pageContent || "");
  const serverSplit = splitOnscreenContentForEditor(serverContent, page.pageTitle || "");
  const serverComposite = composeOnscreenContentFromEditors(serverSplit.title, serverSplit.body);
  const previousServerContent = formatOnscreenPreview(draft.sourceOnscreenContent || "");
  const currentDraftContent = formatOnscreenPreview(
    composeOnscreenContentFromEditors(draft.onscreenTitle || "", draft.onscreenBody || "")
    || draft.onscreenContent
    || ""
  );
  const shouldAdoptServer =
    force
    || !currentDraftContent
    || !previousServerContent
    || currentDraftContent === previousServerContent;

  if (shouldAdoptServer) {
    draft.onscreenTitle = serverSplit.title;
    draft.onscreenBody = serverSplit.body;
    draft.onscreenContent = serverComposite;
  }

  draft.sourceOnscreenTitle = serverSplit.title;
  draft.sourceOnscreenContent = serverComposite;
  return draft;
}

function updateThemeView() {
  el.confirmThemeBtn.disabled = !state.themeDefinition;
  el.goSplitBtn.disabled = !isStandardWorkflowThemeReady();
  el.themeSummaryPreview.textContent = state.themeDefinition?.displaySummaryZh || "风格摘要会显示在这里。";
  el.themeModelPrompt.textContent = state.themeDefinition?.basic || "还没有生成基础风格。";
}

function renderThemePromptModules() {
  if (!el.themePromptTabs || !el.themeModelPrompt) return;
  const themeDefinition = state.themeDefinition || null;
  if (!themeDefinition) {
    el.themePromptTabs.innerHTML = "";
    el.themeModelPrompt.textContent = "还没有生成主题模块提示词。";
    return;
  }
  const availableSections = THEME_PROMPT_SECTIONS
    .map((section) => ({
      ...section,
      value: String(themeDefinition?.[section.key] || "").trim(),
    }))
    .filter((section) => section.value);
  if (!availableSections.length) {
    el.themePromptTabs.innerHTML = "";
    el.themeModelPrompt.textContent = "还没有可展示的主题模块提示词。";
    return;
  }
  if (!availableSections.some((section) => section.key === state.selectedThemePromptSection)) {
    state.selectedThemePromptSection = availableSections[0].key;
  }
  el.themePromptTabs.innerHTML = availableSections.map((section) => `
    <button
      class="template-chip theme-prompt-chip ${section.key === state.selectedThemePromptSection ? "is-active" : ""}"
      type="button"
      data-theme-prompt-section="${section.key}"
    >
      ${escapeHtml(section.label)}
    </button>
  `).join("");
  el.themePromptTabs.querySelectorAll("[data-theme-prompt-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedThemePromptSection = button.dataset.themePromptSection || availableSections[0].key;
      renderThemePromptModules();
      saveState();
    });
  });
  const activeSection = availableSections.find((section) => section.key === state.selectedThemePromptSection) || availableSections[0];
  el.themeModelPrompt.textContent = activeSection.value;
}

const baseUpdateThemeView = updateThemeView;
updateThemeView = function updateThemeViewWithModuleTabs() {
  baseUpdateThemeView();
  renderThemePromptModules();
};

function renderSplitPresets() {
  if (!el.splitPresetToolbar || !el.splitTemplateInput) {
    state.splitPresetId = "";
    state.splitTemplateText = "";
    return;
  }
  el.splitPresetToolbar.innerHTML = SPLIT_PRESETS.map((preset) => `
    <button class="template-chip ${preset.id === state.splitPresetId ? "is-active" : ""}" type="button" data-preset-id="${preset.id}">
      ${escapeHtml(preset.label)}
    </button>
  `).join("");
  el.splitPresetToolbar.querySelectorAll("[data-preset-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = SPLIT_PRESETS.find((item) => item.id === button.dataset.presetId);
      if (!preset) return;
      state.splitPresetId = preset.id;
      state.splitTemplateText = preset.text;
      el.splitTemplateInput.value = preset.text;
      renderSplitPresets();
      saveState();
    });
  });
}

function renderHistoryProjectsLegacy() {
  if (!el.historyProjectList || !el.historySummary || !el.historyPageGrid || !el.historyProjectMeta) return;
  const projects = Array.isArray(state.workflowProjectsIndex) ? state.workflowProjectsIndex : [];
  if (!projects.length) {
    el.historySummary.textContent = "还没有历史项目。完成一次拆分后会自动收录到这里。";
    el.historyProjectList.innerHTML = `<div class="inline-hint">暂无历史生图项目</div>`;
    el.historyProjectMeta.textContent = "";
    el.historyPageGrid.innerHTML = "";
    if (el.restoreHistoryProjectBtn) el.restoreHistoryProjectBtn.disabled = true;
    return;
  }

  const selectedProjectId = state.selectedHistoryProjectId && state.workflowProjectSnapshots[state.selectedHistoryProjectId]
    ? state.selectedHistoryProjectId
    : projects[0].jobId;
  state.selectedHistoryProjectId = selectedProjectId;
  const selectedProject = projects.find((item) => item.jobId === selectedProjectId) || projects[0];
  const snapshot = state.workflowProjectSnapshots[selectedProject.jobId];

  el.historySummary.textContent = `共 ${projects.length} 个项目，按每次拆分归档。`;
  el.historyProjectList.innerHTML = projects.map((project) => `
    <div class="page-item history-project-item ${project.jobId === selectedProjectId ? "is-active" : ""}" data-history-project-id="${escapeHtml(project.jobId)}">
      <div class="history-project-title">
        <strong>${escapeHtml(project.title || "未命名项目")}</strong>
      </div>
      <div class="page-meta">
        <span class="meta-pill">${escapeHtml(`${project.totalPages || 0} 页`)}</span>
        <span class="meta-pill">${escapeHtml(new Date(project.updatedAt || project.createdAt || Date.now()).toLocaleString("zh-CN"))}</span>
      </div>
    </div>
  `).join("");

  el.historyProjectList.querySelectorAll("[data-history-project-id]").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedHistoryProjectId = node.dataset.historyProjectId;
      renderHistoryProjects();
      saveState();
    });
  });

  el.historyProjectMeta.textContent = selectedProject
    ? `${selectedProject.title || "未命名项目"} · ${selectedProject.totalPages || 0} 页 · ${new Date(selectedProject.updatedAt || selectedProject.createdAt || Date.now()).toLocaleString("zh-CN")}`
    : "";

  const pageCards = Array.isArray(selectedProject?.pageSummaries) ? selectedProject.pageSummaries : [];
  el.historyPageGrid.innerHTML = pageCards.length
    ? pageCards.map((page) => `
      <div class="file-item history-page-card">
        ${page.baseImage ? `<img src="${escapeHtml(page.baseImage)}" alt="${escapeHtml(page.pageTitle || `第${page.pageNumber}页`)}" />` : `<div class="inline-summary">该页还没有生成结果</div>`}
        <strong>第${page.pageNumber}页 · ${escapeHtml(page.pageTitle || "未命名")}</strong>
        <span>${page.generated ? "已生成" : "未生成"}</span>
      </div>
    `).join("")
    : `<div class="inline-hint">这个项目还没有页面快照。</div>`;

  if (el.restoreHistoryProjectBtn) {
    el.restoreHistoryProjectBtn.disabled = !snapshot;
  }
  el.historyPageGrid.querySelectorAll("[data-history-image-src]").forEach((node) => {
    node.addEventListener("click", () => {
      openImageViewer(node.dataset.historyImageSrc || "", node.dataset.historyImageTitle || "历史生图");
    });
  });
}

function restoreHistoryProject() {
  const projectId = state.selectedHistoryProjectId;
  const snapshot = state.workflowProjectSnapshots[projectId];
  if (!snapshot) {
    setStatus("没有找到可恢复的历史项目。", "error");
    return;
  }
  stopWorkflowPolling();
  state.themeName = snapshot.themeName || "";
  state.decorationLevel = snapshot.decorationLevel || "medium";
  state.preferences = { ...DEFAULT_PREFERENCES, ...(snapshot.preferences || {}) };
  state.workflowContent = snapshot.workflowContent || "";
  state.workflowPageCount = clamp(Number(snapshot.workflowPageCount || 8), 2, 120);
  state.aiProcessingMode = normalizeAiProcessingModeValue(snapshot.aiProcessingMode);
  state.workflowEnableExpansion = aiProcessingModeUsesExpansion(state.aiProcessingMode);
  state.workflowTargetChars = clamp(Number(snapshot.workflowTargetChars || 0), 0, 300);
  state.workflowMaxChars = clamp(Number(snapshot.workflowMaxChars || 200), 0, 400);
  state.parsedFiles = Array.isArray(snapshot.parsedFiles) ? snapshot.parsedFiles : [];
  state.workflowJob = sanitizeRecoveredWorkflowJob(snapshot.workflowJob || null);
  state.workflowJobId = snapshot.jobId || state.workflowJob?.id || "";
  state.selectedPageId = snapshot.selectedPageId || state.workflowJob?.pages?.[0]?.id || "";
  state.pageDrafts = snapshot.pageDrafts && typeof snapshot.pageDrafts === "object" ? snapshot.pageDrafts : {};
  state.smartStep = state.workflowJob ? "pages" : "split";
  state.themeDefinition = sanitizeRecoveredThemeDefinition(state.workflowJob?.themeDefinition || state.themeDefinition);
  state.themePromptTrace = state.workflowJob?.promptTrace?.themeCore || state.themePromptTrace;
  state.themeConfirmed = Boolean(state.themeDefinition);
  applyStateToUi();
  renderPreferenceSummary();
  renderReferenceFiles();
  updateThemeView();
  ensureSelectedPage();
  renderHistoryProjects();
  switchTab("smart");
  switchSmartStep(state.smartStep, { silent: true });
  renderPagesWorkbench();
  setStatus(`已恢复项目：${buildProjectTitle(state.workflowJob || { pages: [] })}`, "success");
  saveState();
}

function collectHistoryImagesFromSummary(page, snapshot) {
  const directImages = Array.isArray(page?.resultImages) ? page.resultImages.filter(Boolean) : [];
  if (directImages.length) return Array.from(new Set(directImages));
  const snapshotPage = Array.isArray(snapshot?.workflowJob?.pages)
    ? snapshot.workflowJob.pages.find((item) => item.id === page?.pageId)
    : null;
  const snapshotImages = Array.isArray(snapshotPage?.resultImages) ? snapshotPage.resultImages.filter(Boolean) : [];
  const fallbackImages = [snapshotPage?.baseImage, page?.baseImage].filter(Boolean);
  return Array.from(new Set([...snapshotImages, ...fallbackImages]));
}

function renderHistoryPageImages(page, snapshot) {
  const historyImages = collectHistoryImagesFromSummary(page, snapshot);
  if (!historyImages.length) {
    return '<div class="inline-summary">该页还没有生成结果</div>';
  }
  return `
    <div class="history-image-stack">
      <img class="history-image-primary" src="${escapeHtml(historyImages[0])}" alt="${escapeHtml(page.pageTitle || `第${page.pageNumber}页`)}" data-history-image-src="${escapeHtml(historyImages[0])}" data-history-image-title="${escapeHtml(page.pageTitle || `第${page.pageNumber}页`)}" />
      <div class="history-image-thumbs">
        ${historyImages.map((src, index) => `
          <img
            src="${escapeHtml(src)}"
            alt="${escapeHtml(`${page.pageTitle || `第${page.pageNumber}页`} - ${index + 1}`)}"
            title="${escapeHtml(`第${index + 1}次生成`)}"
            data-history-image-src="${escapeHtml(src)}"
            data-history-image-title="${escapeHtml(`${page.pageTitle || `第${page.pageNumber}页`} - ${index + 1}`)}"
          />
        `).join("")}
      </div>
    </div>
  `;
}

function renderHistoryProjects() {
  if (!el.historyProjectList || !el.historySummary || !el.historyPageGrid || !el.historyProjectMeta) return;
  const projects = Array.isArray(state.workflowProjectsIndex) ? state.workflowProjectsIndex : [];
  if (!projects.length) {
    el.historySummary.textContent = "还没有历史项目。完成一次拆分后会自动收录到这里。";
    el.historyProjectList.innerHTML = `<div class="inline-hint">暂无历史生图项目</div>`;
    el.historyProjectMeta.textContent = "";
    el.historyPageGrid.innerHTML = "";
    if (el.restoreHistoryProjectBtn) el.restoreHistoryProjectBtn.disabled = true;
    return;
  }

  const selectedProjectId = state.selectedHistoryProjectId && state.workflowProjectSnapshots[state.selectedHistoryProjectId]
    ? state.selectedHistoryProjectId
    : projects[0].jobId;
  state.selectedHistoryProjectId = selectedProjectId;
  const selectedProject = projects.find((item) => item.jobId === selectedProjectId) || projects[0];
  const snapshot = state.workflowProjectSnapshots[selectedProject.jobId];

  el.historySummary.textContent = `共 ${projects.length} 个项目，按每次拆分归档。`;
  el.historyProjectList.innerHTML = projects.map((project) => `
    <div class="page-item history-project-item ${project.jobId === selectedProjectId ? "is-active" : ""}" data-history-project-id="${escapeHtml(project.jobId)}">
      <div class="history-project-title">
        <strong>${escapeHtml(project.title || "未命名项目")}</strong>
      </div>
      <div class="page-meta">
        <span class="meta-pill">${escapeHtml(`${project.totalPages || 0} 页`)}</span>
      </div>
      <div class="inline-hint">${escapeHtml(new Date(project.updatedAt || project.createdAt || Date.now()).toLocaleString("zh-CN"))}</div>
    </div>
  `).join("");

  el.historyProjectList.querySelectorAll("[data-history-project-id]").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedHistoryProjectId = node.dataset.historyProjectId;
      renderHistoryProjects();
      saveState();
    });
  });

  el.historyProjectMeta.textContent = selectedProject
    ? `${selectedProject.title || "未命名项目"} · ${selectedProject.totalPages || 0} 页 · ${new Date(selectedProject.updatedAt || selectedProject.createdAt || Date.now()).toLocaleString("zh-CN")}`
    : "";

  const snapshotPages = Array.isArray(snapshot?.workflowJob?.pages) ? snapshot.workflowJob.pages : [];
  const pageCards = Array.isArray(selectedProject?.pageSummaries) && selectedProject.pageSummaries.length
    ? selectedProject.pageSummaries
    : snapshotPages.map((page) => ({
      pageId: page.id,
      pageNumber: page.pageNumber,
      pageTitle: page.pageTitle || "",
      generated: Boolean(page.generated || (page.resultImages || []).length || page.baseImage),
      baseImage: page.baseImage || "",
      resultImages: Array.isArray(page.resultImages) ? page.resultImages : [],
    }));

  el.historyPageGrid.innerHTML = pageCards.length
    ? pageCards.map((page) => {
      const historyCount = collectHistoryImagesFromSummary(page, snapshot).length;
      return `
        <div class="file-item history-page-card">
          ${renderHistoryPageImages(page, snapshot)}
          <strong>第${page.pageNumber}页 · ${escapeHtml(page.pageTitle || "未命名")}</strong>
          <span>${page.generated ? `已生成 ${historyCount} 张` : "未生成"}</span>
        </div>
      `;
    }).join("")
    : `<div class="inline-hint">这个项目还没有页面快照。</div>`;

  el.historyPageGrid.querySelectorAll("[data-history-image-src]").forEach((node) => {
    node.addEventListener("click", () => {
      openImageViewer(node.dataset.historyImageSrc, node.dataset.historyImageTitle || "历史生图");
    });
  });

  if (el.restoreHistoryProjectBtn) {
    el.restoreHistoryProjectBtn.disabled = !snapshot;
  }
}

function openImageViewer(src, title = "当前页大图") {
  if (!src || !el.pageImageModal || !el.pageImageModalImg) return;
  if (el.pageImageModalTitle) el.pageImageModalTitle.textContent = title || "当前页大图";
  el.pageImageModalImg.src = src;
  el.pageImageModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function openCurrentPageLargeImage() {
  const page = getSelectedPage();
  if (!page?.baseImage) return;
  openImageViewer(page.baseImage, page.pageTitle || `第${page.pageNumber}页`);
}

function closeCurrentPageLargeImage() {
  if (!el.pageImageModal || !el.pageImageModalImg) return;
  el.pageImageModal.hidden = true;
  el.pageImageModalImg.src = "";
  document.body.style.overflow = "";
}

function saveImageUrl(src, filename = "pptgen-image.png") {
  const url = String(src || "").trim();
  if (!url) {
    setStatus("当前没有可另存的图片。", "error");
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function saveCurrentPageImage() {
  const page = getSelectedPage();
  if (!page?.baseImage) {
    setStatus("当前页还没有可另存的图片。", "error");
    return;
  }
  saveImageUrl(page.baseImage, `pptgen_page_${page.pageNumber || 1}.png`);
}

function saveModalImage() {
  saveImageUrl(el.pageImageModalImg?.src || "", "pptgen-image.png");
}

function buildWorkflowExportPayload() {
  const pages = Array.isArray(state.workflowJob?.pages) ? state.workflowJob.pages : [];
  return {
    projectTitle: buildProjectTitle(state.workflowJob || { pages: [] }),
    slideAspect: state.settings.slideAspect || "16:9",
    pages: pages.map((page, index) => {
      const draft = ensurePageDraft(page);
      const fallbackContent = formatOnscreenPreview(page.onscreenContentText || page.onscreenContent || page.pageContent || "");
      const onscreenTitle = normalizeDisplayText(draft?.onscreenTitle || page.pageTitle || "").split("\n")[0].trim();
      const onscreenBody = formatOnscreenPreview(draft?.onscreenBody || fallbackContent);
      return {
        pageId: page.id,
        pageNumber: page.pageNumber || index + 1,
        pageTitle: page.pageTitle || "",
        onscreenTitle,
        onscreenBody,
        onscreenContent: composeOnscreenContentFromEditors(onscreenTitle, onscreenBody),
        imageUrl: page.baseImage || "",
      };
    }),
  };
}

async function exportWorkflowPpt() {
  if (!state.workflowJob?.pages?.length) {
    setStatus("请先完成拆分，至少生成出页面结构后再导出 PPT。", "error");
    return;
  }

  const button = el.exportWorkflowPptBtn;
  const originalLabel = button?.textContent || "一键导出 PPT";
  if (button) {
    button.disabled = true;
    button.textContent = "导出中...";
  }

  setStatus("正在导出 PPT...", "running");
  try {
    const response = await fetch("/api/export-workflow-ppt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWorkflowExportPayload()),
    });
    const data = await response.json();
    if (!response.ok || data.code) {
      throw new Error(data.message || "导出 PPT 失败。");
    }

    const anchor = document.createElement("a");
    anchor.href = data.downloadUrl;
    anchor.download = data.fileName || "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setStatus(`PPT 已导出：${data.fileName || "output.pptx"}`, "success");
  } catch (error) {
    setStatus(error.message || "导出 PPT 失败。", "error");
  } finally {
    if (button) {
      button.textContent = originalLabel;
    }
    syncCurrentPageGenerateUi();
  }
}

function stringifyTrace(trace) {
  if (!trace) return "还没有 prompt trace。";
  return JSON.stringify(trace, null, 2);
}

function getFinalPromptFromPage(page) {
  return String(page?.promptTrace?.finalImage?.prompt || "").trim();
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
}

function getAspectMeta() {
  return ASPECT_META[state.settings.slideAspect] || ASPECT_META["16:9"];
}

function getPageImageCandidates(page) {
  if (!page) return [];
  return Array.from(new Set([
    page.baseImage,
    ...(Array.isArray(page.resultImages) ? page.resultImages : []),
  ].filter(Boolean)));
}

function renderArtboard() {
  const page = getSelectedPage();
  const draft = page ? ensurePageDraft(page) : null;
  const imageCandidates = getPageImageCandidates(page);
  const baseImage = imageCandidates[0] || "";
  if (!page) {
    el.slideBaseImage.hidden = true;
    el.slideBaseImage.src = "";
    el.slideBaseImage.dataset.renderKey = "";
    el.slideEmptyState.hidden = false;
    el.overlayLayer.innerHTML = "";
    renderPageDrawingLayer();
    return;
  }
  const hasVisualContent = Boolean(baseImage || draft?.drawingLayer || draft?.overlays?.length);
  if (baseImage) {
    if (!page.baseImage) page.baseImage = baseImage;
    const renderKey = `${page.id}:${imageCandidates.join("|")}`;
    el.slideBaseImage.dataset.renderKey = renderKey;
    const tryImage = (index = 0) => {
      if (el.slideBaseImage.dataset.renderKey !== renderKey) return;
      const src = imageCandidates[index];
      if (!src) {
        el.slideBaseImage.hidden = true;
        el.slideBaseImage.src = "";
        el.slideEmptyState.hidden = false;
        return;
      }
      el.slideBaseImage.onload = () => {
        if (el.slideBaseImage.dataset.renderKey !== renderKey) return;
        page.baseImage = src;
        el.slideBaseImage.hidden = false;
        el.slideEmptyState.hidden = true;
      };
      el.slideBaseImage.onerror = () => tryImage(index + 1);
      if (el.slideBaseImage.src !== src) {
        el.slideBaseImage.src = src;
      } else if (el.slideBaseImage.complete && el.slideBaseImage.naturalWidth > 0) {
        el.slideBaseImage.onload();
      }
    };
    tryImage(0);
  } else {
    el.slideBaseImage.hidden = true;
    el.slideBaseImage.src = "";
    el.slideBaseImage.dataset.renderKey = "";
  }
  el.slideEmptyState.hidden = hasVisualContent;

  const overlays = draft?.overlays || [];
  renderPageDrawingLayer();
  el.overlayLayer.innerHTML = overlays.map((item) => `
    <div class="overlay-item" data-overlay-id="${item.id}" style="left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;">
      <img src="${escapeHtml(item.src)}" alt="overlay" />
      <button class="overlay-resize-handle" type="button" data-overlay-resize-id="${item.id}" aria-label="调整补图大小"></button>
    </div>
  `).join("");

  el.overlayLayer.querySelectorAll(".overlay-item").forEach((node) => {
    const overlayId = node.dataset.overlayId;
    node.addEventListener("pointerdown", (event) => beginOverlayDrag(event, overlayId));
  });
  el.overlayLayer.querySelectorAll("[data-overlay-resize-id]").forEach((node) => {
    const overlayId = node.dataset.overlayResizeId;
    node.addEventListener("pointerdown", (event) => beginOverlayResize(event, overlayId));
  });
}

function resizePageDrawCanvas(forceRedraw = false) {
  if (!el.pageDrawCanvas || !el.slideStage) return;
  const rect = el.slideStage.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (el.pageDrawCanvas.width !== width || el.pageDrawCanvas.height !== height) {
    el.pageDrawCanvas.width = width;
    el.pageDrawCanvas.height = height;
    forceRedraw = true;
  }
  if (forceRedraw) {
    renderPageDrawingLayer();
  }
}

function renderPageDrawingLayer() {
  if (!el.pageDrawCanvas) return;
  const ctx = el.pageDrawCanvas.getContext("2d");
  if (!ctx) return;
  resizePageDrawCanvas(false);
  ctx.clearRect(0, 0, el.pageDrawCanvas.width, el.pageDrawCanvas.height);
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  const layer = draft?.drawingLayer || "";
  if (!page || !layer) return;
  const renderKey = `${page.id}:${layer.slice(0, 48)}`;
  el.pageDrawCanvas.dataset.renderKey = renderKey;
  loadImage(layer)
    .then((image) => {
      if (el.pageDrawCanvas?.dataset.renderKey !== renderKey) return;
      const currentCtx = el.pageDrawCanvas.getContext("2d");
      if (!currentCtx) return;
      currentCtx.clearRect(0, 0, el.pageDrawCanvas.width, el.pageDrawCanvas.height);
      currentCtx.drawImage(image, 0, 0, el.pageDrawCanvas.width, el.pageDrawCanvas.height);
    })
    .catch(() => {});
}

function updatePageDrawToolbar() {
  if (!el.pageDrawPenBtn || !el.pageDrawRectBtn) return;
  const tool = state.pageDrawing?.tool || "";
  el.pageDrawPenBtn.classList.toggle("is-active", tool === "pen");
  el.pageDrawRectBtn.classList.toggle("is-active", tool === "rect");
  el.pageDrawCanvas?.classList.toggle("is-drawing-enabled", Boolean(tool));
  if (el.pageDrawColorInput && state.pageDrawing?.color) {
    el.pageDrawColorInput.value = state.pageDrawing.color;
  }
}

function savePageDrawingLayer() {
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  if (!page || !draft || !el.pageDrawCanvas) return;
  draft.drawingLayer = el.pageDrawCanvas.toDataURL("image/png");
  saveState();
  renderArtboard();
}

function clearPageDrawingLayer() {
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  if (!page || !draft) return;
  draft.drawingLayer = "";
  renderPageDrawingLayer();
  renderArtboard();
  saveState();
}

function setupPageDrawingInteractions() {
  if (!el.pageDrawCanvas || el.pageDrawCanvas.dataset.bound === "true") return;
  const drawingState = state.pageDrawing;
  const getPoint = (event) => {
    const rect = el.pageDrawCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * el.pageDrawCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * el.pageDrawCanvas.height,
    };
  };
  const getCtx = () => el.pageDrawCanvas.getContext("2d");
  const applyStrokeStyle = (ctx) => {
    ctx.strokeStyle = state.pageDrawing.color || "#22d3ee";
    ctx.lineWidth = state.pageDrawing.width || 6;
    ctx.setLineDash([]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  };
  const applyRectStyle = (ctx) => {
    const color = state.pageDrawing.color || "#22d3ee";
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}26`;
    ctx.lineWidth = Math.max(4, state.pageDrawing.width || 6);
    ctx.setLineDash([10, 8]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  };

  const pointerDown = (event) => {
    if (event.button !== 0) return;
    const tool = drawingState.tool || "";
    if (!tool) return;
    const page = getSelectedPage();
    if (!page) return;
    resizePageDrawCanvas(false);
    const point = getPoint(event);
    const ctx = getCtx();
    if (!point || !ctx) return;
    drawingState.active = true;
    drawingState.pointerId = event.pointerId;
    drawingState.startX = point.x;
    drawingState.startY = point.y;
    drawingState.snapshot = ctx.getImageData(0, 0, el.pageDrawCanvas.width, el.pageDrawCanvas.height);
    if (tool === "pen") {
      applyStrokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
    el.pageDrawCanvas.setPointerCapture?.(event.pointerId);
  };

  const pointerMove = (event) => {
    if (!drawingState.active || drawingState.pointerId !== event.pointerId) return;
    const point = getPoint(event);
    const ctx = getCtx();
    if (!point || !ctx) return;
    const tool = drawingState.tool || "";
    if (!tool) return;
    if (tool === "pen") {
      applyStrokeStyle(ctx);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      return;
    }
    if (tool === "rect" && drawingState.snapshot) {
      ctx.putImageData(drawingState.snapshot, 0, 0);
      applyRectStyle(ctx);
      const x = Math.min(drawingState.startX, point.x);
      const y = Math.min(drawingState.startY, point.y);
      const w = Math.abs(point.x - drawingState.startX);
      const h = Math.abs(point.y - drawingState.startY);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  };

  const pointerUp = (event) => {
    if (!drawingState.active) return;
    if (drawingState.pointerId != null && event.pointerId != null && drawingState.pointerId !== event.pointerId) return;
    drawingState.active = false;
    drawingState.pointerId = null;
    drawingState.snapshot = null;
    savePageDrawingLayer();
  };

  el.pageDrawCanvas.addEventListener("pointerdown", pointerDown);
  el.pageDrawCanvas.addEventListener("pointermove", pointerMove);
  el.pageDrawCanvas.addEventListener("pointerup", pointerUp);
  el.pageDrawCanvas.addEventListener("pointerleave", pointerUp);
  el.pageDrawPenBtn?.addEventListener("click", () => {
    state.pageDrawing.tool = state.pageDrawing.tool === "pen" ? "" : "pen";
    saveState();
    updatePageDrawToolbar();
  });
  el.pageDrawRectBtn?.addEventListener("click", () => {
    state.pageDrawing.tool = state.pageDrawing.tool === "rect" ? "" : "rect";
    saveState();
    updatePageDrawToolbar();
  });
  el.clearPageDrawingBtn?.addEventListener("click", clearPageDrawingLayer);
  el.pageDrawColorInput?.addEventListener("input", () => {
    state.pageDrawing.color = el.pageDrawColorInput.value || "#22d3ee";
    saveState();
  });
  el.pageDrawCanvas.dataset.bound = "true";
  updatePageDrawToolbar();
}

function beginOverlayDrag(event, overlayId) {
  if (event.target?.closest?.("[data-overlay-resize-id]")) return;
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  const overlay = draft.overlays.find((item) => item.id === overlayId);
  if (!overlay) return;
  event.preventDefault();
  const stageRect = el.slideStage.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = overlay.x;
  const startTop = overlay.y;
  const move = (moveEvent) => {
    const dx = ((moveEvent.clientX - startX) / stageRect.width) * 100;
    const dy = ((moveEvent.clientY - startY) / stageRect.height) * 100;
    overlay.x = clamp(startLeft + dx, 0, Math.max(0, 100 - overlay.w));
    overlay.y = clamp(startTop + dy, 0, Math.max(0, 100 - overlay.h));
    renderArtboard();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    saveState();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginOverlayResize(event, overlayId) {
  event.preventDefault();
  event.stopPropagation();
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  const overlay = draft?.overlays?.find((item) => item.id === overlayId);
  if (!overlay || !el.slideStage) return;

  const stageRect = el.slideStage.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startWidth = overlay.w;
  const startHeight = overlay.h;
  const maxWidth = 100 - overlay.x;
  const maxHeight = 100 - overlay.y;
  const minSize = 8;

  const move = (moveEvent) => {
    const dw = ((moveEvent.clientX - startX) / stageRect.width) * 100;
    const dh = ((moveEvent.clientY - startY) / stageRect.height) * 100;
    overlay.w = clamp(startWidth + dw, minSize, Math.max(minSize, maxWidth));
    overlay.h = clamp(startHeight + dh, minSize, Math.max(minSize, maxHeight));
    renderArtboard();
  };

  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    saveState();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`读取失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(String(src || ""))) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = src;
  });
}

async function exportCurrentArtboard() {
  const page = getSelectedPage();
  if (!page) return "";
  const draft = ensurePageDraft(page);
  if (!page.baseImage && !draft.drawingLayer && !draft.overlays.length) return "";
  try {
    const meta = getAspectMeta();
    const canvas = document.createElement("canvas");
    canvas.width = meta.width;
    canvas.height = meta.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (page.baseImage) {
      const base = await loadImage(page.baseImage);
      ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    }
    if (draft.drawingLayer) {
      const drawing = await loadImage(draft.drawingLayer);
      ctx.drawImage(drawing, 0, 0, canvas.width, canvas.height);
    }
    for (const overlay of draft.overlays) {
      const image = await loadImage(overlay.src);
      ctx.drawImage(
        image,
        (overlay.x / 100) * canvas.width,
        (overlay.y / 100) * canvas.height,
        (overlay.w / 100) * canvas.width,
        (overlay.h / 100) * canvas.height,
      );
    }
    return canvas.toDataURL("image/png");
  } catch (error) {
    setStatus("当前底图包含跨域图片，已忽略画布叠加继续生成。", "error");
    return "";
  }
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.code) {
    throw new Error(data.message || "请求失败。");
  }
  return data;
}

async function refreshServerConfig() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return;
    const data = await response.json();
    state.serverConfig = {
      loaded: true,
      configuredKeys: {
        dashscope: Boolean(data?.configuredKeys?.dashscope),
        hostedImage: Boolean(data?.configuredKeys?.hostedImage),
        openAiImage: Boolean(data?.configuredKeys?.openAiImage),
        whatAiImage: Boolean(data?.configuredKeys?.whatAiImage),
      },
      workflowModels: data?.workflowModels || null,
    };
    syncQuickKeyPlaceholders();
    syncCurrentPageGenerateUi();
  } catch (_error) {
    // Local env configuration is optional; keep UI usable if health probing fails.
  }
}

async function ensureServerConfigReady() {
  if (state.serverConfig?.loaded) return;
  await refreshServerConfig();
}

async function handleReferenceFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  setStatus(`正在解析 ${files.length} 个参考文件...`, "running");
  try {
    const response = await fetch("/api/files/parse", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok || data.code) throw new Error(data.message || "文件解析失败。");
    state.parsedFiles = [...state.parsedFiles, ...(data.files || [])];
    renderReferenceFiles();
    setStatus("参考文件已加入拆分材料。", "success");
    saveState();
  } catch (error) {
    setStatus(error.message || "文件解析失败。", "error");
  } finally {
    event.target.value = "";
  }
}

function stopWorkflowPolling() {
  if (state.workflowPollTimer) {
    clearInterval(state.workflowPollTimer);
    state.workflowPollTimer = null;
  }
}

async function handleOverlayFiles(event) {
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  const files = Array.from(event.target.files || []);
  if (!page || !files.length) return;
  for (const file of files) {
    try {
      const src = await fileToDataUrl(file);
      draft.overlays.push({
        id: uid(),
        src,
        x: 8,
        y: 8,
        w: 26,
        h: 26,
      });
    } catch (error) {
      setStatus(error.message || "补充图片上传失败。", "error");
    }
  }
  renderArtboard();
  saveState();
  event.target.value = "";
}

function clearCurrentOverlays() {
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  if (!draft) return;
  draft.overlays = [];
  renderArtboard();
  saveState();
}

function getCurrentReviseImage() {
  return state.revise.images.find((item) => item.id === state.revise.selectedImageId) || null;
}

function getReviseImageHistory(image) {
  if (!image) return [];
  const history = Array.isArray(image.history) ? image.history.filter(Boolean) : [];
  if (image.src && !history.includes(image.src)) history.unshift(image.src);
  image.history = Array.from(new Set(history));
  return image.history;
}

function appendReviseImageHistory(image, urls = []) {
  if (!image) return [];
  const existing = getReviseImageHistory(image);
  image.history = Array.from(new Set([
    ...urls.filter(Boolean),
    ...existing,
  ]));
  return image.history;
}

function ensureReviseSelection() {
  const current = getCurrentReviseImage();
  if (!current) {
    state.revise.selectedImageId = state.revise.images[0]?.id || "";
  }
}

function renderRevise() {
  ensureReviseSelection();
  const image = getCurrentReviseImage();
  const imageHistory = getReviseImageHistory(image);
  const imageResults = Array.isArray(image?.results) ? image.results : [];
  el.reviseImageName.textContent = image?.name || "请先导入底图";
  updateReviseDrawToolbar();
  const index = state.revise.images.findIndex((item) => item.id === state.revise.selectedImageId);
  el.reviseImageCounter.textContent = image ? `${index + 1} / ${state.revise.images.length}` : "0 / 0";
  el.reviseBaseImage.hidden = !image;
  el.reviseEmptyState.hidden = Boolean(image);
  if (image) {
    el.reviseBaseImage.src = image.src;
    drawReviseCanvas();
  } else {
    const ctx = el.reviseCanvas.getContext("2d");
    ctx.clearRect(0, 0, el.reviseCanvas.width, el.reviseCanvas.height);
  }

  el.reviseThumbStrip.innerHTML = state.revise.images.map((item, idx) => `
    <button class="thumb-item ${item.id === state.revise.selectedImageId ? "is-active" : ""}" type="button" data-image-id="${item.id}">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name)}" />
      <strong>${escapeHtml(`${idx + 1}. ${item.name}`)}</strong>
    </button>
  `).join("");
  el.reviseThumbStrip.querySelectorAll("[data-image-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.revise.selectedImageId = button.dataset.imageId;
      renderRevise();
    });
  });

  el.reviseResultStrip.innerHTML = imageResults.map((src) => `
    <div class="result-item"><img src="${escapeHtml(src)}" alt="改图结果" /></div>
  `).join("");

  // 左侧历史记录面板
  if (el.reviseHistoryStrip) {
    el.reviseHistoryStrip.innerHTML = imageHistory.length
      ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">历史改图结果（点击切换查看）</div>`
        + imageHistory.map((src, i) => `
          <div class="result-item" data-result-index="${i}" style="cursor:pointer;">
            <img src="${escapeHtml(src)}" alt="改图结果 ${i + 1}" />
          </div>
        `).join("")
      : "";
    el.reviseHistoryStrip.querySelectorAll("[data-result-index]").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.resultIndex, 10);
        const resultSrc = imageHistory[idx];
        if (resultSrc) {
          const current = getCurrentReviseImage();
          if (current) {
            current.src = resultSrc;
            current.drawingLayer = "";
            current.boxes = [];
            current.naturalWidth = 0;
            current.naturalHeight = 0;
            renderRevise();
            return;
          }
          state.revise.images.push({
            id: uid(),
            name: `改图结果 ${idx + 1}`,
            src: resultSrc,
            drawingLayer: "",
          });
          state.revise.selectedImageId = state.revise.images[state.revise.images.length - 1].id;
          renderRevise();
        }
      });
    });
  }

  // 导出按钮
  if (el.exportReviseImageBtn) {
    el.exportReviseImageBtn.style.display = image ? "inline-flex" : "none";
  }
}

function fitCanvasToStage() {
  const rect = el.reviseStage.getBoundingClientRect();
  el.reviseCanvas.width = rect.width;
  el.reviseCanvas.height = rect.height;
}


function updateReviseDrawToolbar() {
  const tool = state.revise.drawing?.tool || "";
  el.reviseDrawPenBtn?.classList.toggle("is-active", tool === "pen");
  el.reviseDrawRectBtn?.classList.toggle("is-active", tool === "rect");
  el.reviseCanvas?.classList.toggle("is-drawing-enabled", Boolean(tool));
  if (el.reviseDrawColorInput && state.revise.drawing?.color) {
    el.reviseDrawColorInput.value = state.revise.drawing.color;
  }
}

function saveReviseDrawingLayer() {
  const image = getCurrentReviseImage();
  if (!image || !el.reviseCanvas) return;
  image.drawingLayer = el.reviseCanvas.toDataURL("image/png");
  saveState();
}

function drawReviseCanvas() {
  const rect = el.reviseStage.getBoundingClientRect();
  el.reviseCanvas.width = rect.width;
  el.reviseCanvas.height = rect.height;
  const ctx = el.reviseCanvas.getContext("2d");
  ctx.clearRect(0, 0, el.reviseCanvas.width, el.reviseCanvas.height);
  
  const image = getCurrentReviseImage();
  if (!image || !image.drawingLayer) return;
  
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, el.reviseCanvas.width, el.reviseCanvas.height);
    ctx.drawImage(img, 0, 0, el.reviseCanvas.width, el.reviseCanvas.height);
  };
  img.src = image.drawingLayer;
}

function setupReviseCanvasInteractions() {
  if (!el.reviseCanvas || el.reviseCanvas.dataset.bound === "true") return;
  const drawingState = state.revise.drawing;
  
  const getPoint = (event) => {
    const rect = el.reviseCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * el.reviseCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * el.reviseCanvas.height,
    };
  };
  
  const getCtx = () => el.reviseCanvas.getContext("2d");
  const applyStrokeStyle = (ctx) => {
    ctx.strokeStyle = drawingState.color || "#22d3ee";
    ctx.lineWidth = drawingState.width || 6;
    ctx.setLineDash([]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  };
  const applyRectStyle = (ctx) => {
    const color = drawingState.color || "#22d3ee";
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}26`;
    ctx.lineWidth = Math.max(4, drawingState.width || 6);
    ctx.setLineDash([10, 8]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  };

  const pointerDown = (event) => {
    if (event.button !== 0) return;
    const tool = drawingState.tool || "";
    if (!tool) return;
    const image = getCurrentReviseImage();
    if (!image) return;
    
    const point = getPoint(event);
    const ctx = getCtx();
    if (!point || !ctx) return;
    
    drawingState.active = true;
    drawingState.pointerId = event.pointerId;
    drawingState.startX = point.x;
    drawingState.startY = point.y;
    drawingState.snapshot = ctx.getImageData(0, 0, el.reviseCanvas.width, el.reviseCanvas.height);
    
    if (tool === "pen") {
      applyStrokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
    el.reviseCanvas.setPointerCapture?.(event.pointerId);
  };

  const pointerMove = (event) => {
    if (!drawingState.active || drawingState.pointerId !== event.pointerId) return;
    const point = getPoint(event);
    const ctx = getCtx();
    if (!point || !ctx) return;
    const tool = drawingState.tool || "";
    if (!tool) return;
    
    if (tool === "pen") {
      applyStrokeStyle(ctx);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      return;
    }
    if (tool === "rect" && drawingState.snapshot) {
      ctx.putImageData(drawingState.snapshot, 0, 0);
      applyRectStyle(ctx);
      const x = Math.min(drawingState.startX, point.x);
      const y = Math.min(drawingState.startY, point.y);
      const w = Math.abs(point.x - drawingState.startX);
      const h = Math.abs(point.y - drawingState.startY);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  };

  const pointerUp = (event) => {
    if (!drawingState.active) return;
    if (drawingState.pointerId != null && event.pointerId != null && drawingState.pointerId !== event.pointerId) return;
    drawingState.active = false;
    drawingState.pointerId = null;
    drawingState.snapshot = null;
    saveReviseDrawingLayer();
  };

  el.reviseCanvas.addEventListener("pointerdown", pointerDown);
  el.reviseCanvas.addEventListener("pointermove", pointerMove);
  el.reviseCanvas.addEventListener("pointerup", pointerUp);
  el.reviseCanvas.addEventListener("pointerleave", pointerUp);
  
  el.reviseDrawPenBtn = document.getElementById("reviseDrawPenBtn");
  el.reviseDrawRectBtn = document.getElementById("reviseDrawRectBtn");
  el.reviseDrawColorInput = document.getElementById("reviseDrawColorInput");
  el.clearReviseDrawingBtn = document.getElementById("clearReviseDrawingBtn");
  
  el.reviseDrawPenBtn?.addEventListener("click", () => {
    state.revise.drawing.tool = state.revise.drawing.tool === "pen" ? "" : "pen";
    saveState();
    updateReviseDrawToolbar();
  });
  el.reviseDrawRectBtn?.addEventListener("click", () => {
    state.revise.drawing.tool = state.revise.drawing.tool === "rect" ? "" : "rect";
    saveState();
    updateReviseDrawToolbar();
  });
  el.clearReviseDrawingBtn?.addEventListener("click", () => {
    const image = getCurrentReviseImage();
    if (image) {
      image.drawingLayer = "";
      drawReviseCanvas();
      saveState();
    }
  });
  el.reviseDrawColorInput?.addEventListener("input", () => {
    state.revise.drawing.color = el.reviseDrawColorInput.value || "#22d3ee";
    saveState();
  });
  
  el.reviseCanvas.dataset.bound = "true";
  updateReviseDrawToolbar();
}


function normalizeBox(box) {
  const [ax, ay, bx, by] = box;
  return [
    Math.round(Math.min(ax, bx)),
    Math.round(Math.min(ay, by)),
    Math.round(Math.max(ax, bx)),
    Math.round(Math.max(ay, by)),
  ];
}

async function handleReviseFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    try {
      const src = await fileToDataUrl(file);
      const img = await loadImage(src);
      state.revise.images.push({
        id: uid(),
        name: file.name,
        src,
        history: [src],
        results: [],
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        boxes: [],
      });
    } catch (error) {
      setStatus(error.message || "导入图片失败。", "error");
    }
  }
  ensureReviseSelection();
  renderRevise();
  event.target.value = "";
}

function stepReviseImage(delta) {
  if (state.revise.images.length <= 1) return;
  const currentIndex = state.revise.images.findIndex((item) => item.id === state.revise.selectedImageId);
  const nextIndex = (Math.max(0, currentIndex) + delta + state.revise.images.length) % state.revise.images.length;
  state.revise.selectedImageId = state.revise.images[nextIndex].id;
  renderRevise();
}

function deleteCurrentReviseImage() {
  if (!state.revise.selectedImageId) return;
  state.revise.images = state.revise.images.filter((item) => item.id !== state.revise.selectedImageId);
  ensureReviseSelection();
  renderRevise();
}

function normalizeDisplayText(text) {
  return String(text || "").trim();
}

function formatJobStats(job) {
  if (!job) return "";
  return [
    `总页数 ${job.totalPages || 0}`,
    `已准备 ${job.preparedPages || 0}`,
    `可生成 ${job.readyToGeneratePages || 0}`,
    `失败 ${job.failedPages || 0}`,
  ].join(" · ");
}

function renderReferenceFiles() {
  if (!state.parsedFiles.length) {
    el.referenceFilesList.innerHTML = `<div class="inline-hint">暂无参考文件</div>`;
    return;
  }
  el.referenceFilesList.innerHTML = state.parsedFiles.map((file, index) => `
    <div class="file-item" data-reference-file-index="${index}">
      <div class="file-item-header">
        <strong>${escapeHtml(file.name)}</strong>
        <button class="icon-btn file-delete-btn" type="button" data-remove-reference-file="${index}" aria-label="删除参考文件 ${escapeHtml(file.name)}" title="删除参考文件">×</button>
      </div>
      <div class="file-meta">
        <span class="meta-pill">${escapeHtml(file.category || "unknown")}</span>
        <span class="meta-pill">${escapeHtml(file.parseStatus || "unknown")}</span>
      </div>
      ${file.previewUrl ? `<img class="file-preview-image" src="${escapeHtml(file.previewUrl)}" alt="${escapeHtml(file.name)}" />` : ""}
      ${file.previewText ? `<details class="trace-details"><summary>预览文本</summary><pre>${escapeHtml(file.previewText)}</pre></details>` : ""}
    </div>
  `).join("");
  el.referenceFilesList.querySelectorAll("[data-remove-reference-file]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeReferenceFile);
      if (!Number.isInteger(index) || index < 0 || index >= state.parsedFiles.length) return;
      const [removed] = state.parsedFiles.splice(index, 1);
      renderReferenceFiles();
      saveState();
      setStatus(`已删除参考文件：${removed?.name || "未命名文件"}`, "success");
    });
  });
}

async function confirmTheme() {
  if (!state.themeDefinition) return;
  state.themeConfirmed = true;
  if (state.workflowJobId && state.workflowJob) {
    try {
      const data = await apiJson("/api/workflow/theme/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: state.workflowJobId,
          themeDefinition: state.themeDefinition,
          preferences: state.preferences,
          decorationLevel: state.decorationLevel,
          promptTrace: { themeCore: state.themePromptTrace },
        }),
      });
      state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
    } catch (error) {
      setStatus(error.message || "应用风格失败。", "error");
      return;
    }
  }
  updateThemeView();
  switchSmartStep(state.workflowJob ? "pages" : "split");
  setStatus(state.workflowJob ? "风格已应用到当前项目，可以逐页确认并生成。" : "风格已确认，继续输入文本并拆分。", "success");
  saveState();
}

function renderOnscreenPreview(value) {
  if (!el.pageOnscreenPreview) return;
  const lines = formatOnscreenPreview(value).split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    el.pageOnscreenPreview.innerHTML = `<div class="inline-hint">当前页还没有可展示的上屏内容。</div>`;
    return;
  }
  el.pageOnscreenPreview.innerHTML = lines.map((line, index) => {
    if (index === 0) {
      return `<div class="onscreen-preview-title">${escapeHtml(line)}</div>`;
    }
    if (/^(\d+[\.\u3001]|[一二三四五六七八九十]+[、.])/.test(line)) {
      return `<div class="onscreen-preview-bullet">${escapeHtml(line)}</div>`;
    }
    return `<div class="onscreen-preview-line">${escapeHtml(line)}</div>`;
  }).join("");
}

function buildThemePagePlanSummary() {
  const pages = Array.isArray(state.workflowJob?.pages) ? state.workflowJob.pages : [];
  return pages.slice(0, 24).map((page) => {
    const content = formatOnscreenPreview(page.onscreenContentText || page.onscreenContent || page.pageContent || "");
    return `${page.pageNumber}. [${page.pageType || "content"}] ${page.pageTitle || ""}: ${content.slice(0, 180)}`;
  }).join("\n");
}

async function generateTheme() {
  syncKeysFromDom();
  state.themeName = el.themeName.value.trim();
  state.decorationLevel = el.themeDecorationLevel.value;
  state.preferences = getCurrentPreferences();
  await ensureServerConfigReady();
  if (!hasDashScopeApiKey()) {
    setStatus("请先填写 DashScope / Qwen API Key。", "error");
    switchTab("settings");
    return;
  }
  const signal = startCancelableAction("theme", el.generateThemeBtn, el.cancelThemeBtn, "生成中...");
  setStatus("正在根据内容匹配风格主题...", "running");
  try {
    const data = await apiJson("/api/workflow/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        apiKey: state.settings.apiKey,
        region: state.settings.region,
        themeName: state.themeName || "AI 自动匹配成熟风格",
        decorationLevel: state.decorationLevel,
        preferences: state.preferences,
        referenceFiles: state.parsedFiles,
        workflowJobId: state.workflowJobId,
        contentContext: state.workflowContent,
        pagePlanSummary: buildThemePagePlanSummary(),
      }),
    });
    state.themeDefinition = sanitizeRecoveredThemeDefinition(data.themeDefinition);
    state.themePromptTrace = data.promptTrace || null;
    state.themeConfirmed = false;
    updateThemeView();
    setStatus("风格模板已生成，确认后即可使用。", "success");
    saveState();
  } catch (error) {
    if (isAbortError(error)) return;
    setStatus(error.message || "生成风格失败。", "error");
  } finally {
    finishCancelableAction("theme");
  }
}

async function sendRevise() {
  const image = getCurrentReviseImage();
  state.revise.prompt = el.revisePrompt.value.trim();
  await ensureServerConfigReady();
  // 改图使用 GPT Image，需要 OpenAI Image API Key
  if (!hasHostedImageApiKey()) {
    setStatus("改图需要 GPT Image API Key。请在设置页填写。", "error");
    switchTab("settings");
    return;
  }
  if (!image) {
    setStatus("请先导入一张底图。", "error");
    return;
  }
  if (!state.revise.prompt) {
    setStatus("请先输入改图提示词。", "error");
    return;
  }

  // 根据原图比例推断最接近的生成尺寸 (支持 16:9, 9:16, 4:3, 3:4, 1:1)
  const imgW = image.naturalWidth || 1024;
  const imgH = image.naturalHeight || 1024;
  const aspect = imgW / imgH;
  let outputSize;

  if (aspect > 1.6) {
    // 接近 16:9 (1.77)
    outputSize = "2048x1152";
  } else if (aspect > 1.2) {
    // 接近 4:3 (1.33)
    outputSize = "1536x1152";
  } else if (aspect < 0.6) {
    // 接近 9:16 (0.56)
    outputSize = "1152x2048";
  } else if (aspect < 0.8) {
    // 接近 3:4 (0.75)
    outputSize = "1152x1536";
  } else {
    // 接近 1:1
    outputSize = "1024x1024";
  }

  
  // 如果有绘制图层，则合并底图和绘制图层
  let finalImageSrc = image.src;
  if (image.drawingLayer) {
    setStatus("正在合成图片...", "running");
    const mergedUrl = await new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = imgW;
      canvas.height = imgH;
      const ctx = canvas.getContext("2d");
      
      const baseImg = new Image();
      baseImg.onload = () => {
        ctx.drawImage(baseImg, 0, 0, imgW, imgH);
        const drawImg = new Image();
        drawImg.onload = () => {
          ctx.drawImage(drawImg, 0, 0, imgW, imgH);
          resolve(canvas.toDataURL("image/png"));
        };
        drawImg.src = image.drawingLayer;
      };
      baseImg.src = image.src;
    });
    finalImageSrc = mergedUrl;
  }

  // 构造 GPT Image 兼容的 payload
  const payload = {
    model: "gpt-image-2",
    input: {
      messages: [
        {
          role: "user",
          content: [
            { text: state.revise.prompt },
            { image: finalImageSrc },
          ],
        },
      ],
    },
    parameters: {
      size: outputSize,
      n: 1,
    },
  };

  const signal = startCancelableAction("revise", el.sendReviseBtn, el.cancelReviseBtn, "改图中...");
  setStatus("正在调用 GPT 改图...", "running");
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        workflowRouteVersion: 2,
        openAiImageApiKey: state.settings.openAiImageApiKey,
        openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
        whatAiImageApiKey: state.settings.whatAiImageApiKey,
        region: state.settings.region,
        slideAspect: state.settings.slideAspect,
        payload,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.code) throw new Error(data.message || "改图失败。");
    const results = ((data.output?.choices || [])[0]?.message?.content || [])
      .filter((item) => item.type === "image" && item.image)
      .map((item) => item.image);
    if (!results.length) throw new Error("接口返回成功，但没有图片结果。");
    state.revise.results = results;
    const current = getCurrentReviseImage();
    if (current && results[0]) {
      current.results = results;
      appendReviseImageHistory(current, [...results, current.src]);
      current.src = results[0];
      current.drawingLayer = "";
      current.boxes = [];
      current.naturalWidth = 0;
      current.naturalHeight = 0;
      el.reviseBaseImage.onload = () => {
        current.naturalWidth = el.reviseBaseImage.naturalWidth;
        current.naturalHeight = el.reviseBaseImage.naturalHeight;
        drawReviseCanvas();
      };
    }
    renderRevise();
    setStatus("改图完成。", "success");
  } catch (error) {
    if (isAbortError(error)) return;
    setStatus(error.message || "改图失败。", "error");
  } finally {
    finishCancelableAction("revise");
  }
}

function exportReviseImage() {
  const image = getCurrentReviseImage();
  if (!image) {
    setStatus("请先导入底图。", "error");
    return;
  }
  const canvas = el.reviseCanvas;
  const offscreen = document.createElement("canvas");
  offscreen.width = el.reviseBaseImage.naturalWidth || canvas.width;
  offscreen.height = el.reviseBaseImage.naturalHeight || canvas.height;
  const ctx = offscreen.getContext("2d");
  ctx.drawImage(el.reviseBaseImage, 0, 0, offscreen.width, offscreen.height);
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, offscreen.width, offscreen.height);
  const dataUrl = offscreen.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = `${(image.name || "revise").replace(/\.\w+$/, "")}_edited.png`;
  link.href = dataUrl;
  link.click();
}

function bindEvents() {
  try {
  document.querySelectorAll(".sidebar-tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-model-card]").forEach((button) => {
    button.addEventListener("click", () => {
      setWorkflowImageModel(button.dataset.modelCard || PPT_MODEL);
      saveState();
    });
  });
  document.querySelectorAll(".ribbon-step").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.step;
      if (next === "theme" && usingGptSimpleWorkflow()) return;
      if (next === "pages" && !state.workflowJob) return;
      switchSmartStep(next);
    });
  });

  el.workspaceZoomRange?.addEventListener("input", () => {
    applyWorkspaceZoom(el.workspaceZoomRange.value);
    saveState();
  });
  ["prefStyleMode", "prefLayoutVariety", "prefDetailLevel", "prefVisualDensity", "prefCompositionFocus", "prefDataNarrative", "prefPageMood"].forEach((id) => {
    el[id]?.addEventListener("change", () => {
      renderPreferenceSummary();
      saveState();
    });
  });

  el.themeName?.addEventListener("input", () => {
    state.themeName = el.themeName.value;
    saveState();
  });
  el.themeDecorationLevel?.addEventListener("change", () => {
    state.decorationLevel = el.themeDecorationLevel.value;
    saveState();
  });
  el.generateThemeBtn?.addEventListener("click", generateTheme);
  el.cancelThemeBtn?.addEventListener("click", () => cancelAction("theme"));
  el.confirmThemeBtn?.addEventListener("click", confirmTheme);
  el.confirmWorkflowModelBtn?.addEventListener("click", () => {
    setWorkflowImageModel(el.workflowImageModelEntry?.value || state.settings.workflowImageModel || PPT_MODEL);
    switchSmartStep("split");
    saveState();
  });
  el.goSplitBtn?.addEventListener("click", () => switchSmartStep(state.workflowJob ? "pages" : "split"));
  el.backToThemeBtn?.addEventListener("click", () => switchSmartStep("split"));
  el.backToSplitBtn?.addEventListener("click", () => switchSmartStep("split"));
  el.pickReferenceFilesBtn?.addEventListener("click", () => el.referenceFilesInput?.click());
  el.referenceFilesInput?.addEventListener("change", handleReferenceFiles);
  el.runSplitBtn?.addEventListener("click", runSplit);
  el.skipSplitBtn?.addEventListener("click", skipSplit);
  el.cancelSplitBtn?.addEventListener("click", () => cancelAction("split"));
  el.workflowContent?.addEventListener("input", () => {
    state.workflowContent = el.workflowContent?.value || "";
    saveState();
  });
  el.workflowPageCount?.addEventListener("change", () => {
    state.workflowPageCount = clamp(Number(el.workflowPageCount?.value || 8), 2, 120);
    saveState();
  });
  el.aiProcessingMode?.addEventListener("change", () => {
    state.aiProcessingMode = normalizeAiProcessingModeValue(el.aiProcessingMode?.value || "");
    state.workflowEnableExpansion = aiProcessingModeUsesExpansion(state.aiProcessingMode);
    syncSplitExpansionControls();
    saveState();
  });
  el.splitTemplateInput?.addEventListener("input", () => {
    state.splitTemplateText = el.splitTemplateInput.value;
    saveState();
  });
  el.pageOnscreenEditor?.addEventListener("input", () => {
    const page = getSelectedPage();
    const draft = ensurePageDraft(page);
    if (!draft) return;
    draft.onscreenContent = el.pageOnscreenEditor.value;
    renderOnscreenPreview(draft.onscreenContent);
    saveState();
  });
  el.pageExtraPrompt?.addEventListener("input", () => {
    const page = getSelectedPage();
    const draft = ensurePageDraft(page);
    if (!draft) return;
    applyDraftPromptForGeneration(draft, getCurrentSharedPromptValue());
    saveState();
    syncCurrentPageGenerateUi();
  });
  el.pageGlobalStylePrompt?.addEventListener("input", () => {
    state.gptSharedStylePrompt = el.pageGlobalStylePrompt?.value?.trim() || "";
    Object.values(state.pageDrafts || {}).forEach((draft) => {
      if (!draft) return;
      applyDraftPromptForGeneration(draft, getEditablePagePromptFromValues(draft.sharedPrompt, draft.extraPrompt, draft.pageStylePrompt));
    });
    saveState();
    syncCurrentPageGenerateUi();
  });
  el.repreparePageBtn?.addEventListener("click", reprepareCurrentPage);
  el.aiRepolishPageBtn?.addEventListener("click", aiRepolishCurrentPage);
  el.cancelRepreparePageBtn?.addEventListener("click", () => cancelAction("repolish") || cancelAction("reprepare"));
  el.batchGenerateReadyBtn?.addEventListener("click", batchGenerateReadyPages);
  el.cancelBatchGenerateBtn?.addEventListener("click", () => cancelAction("batchGenerate"));
  el.addManualPageBtn?.addEventListener("click", addManualPage);
  el.uploadOverlayBtn?.addEventListener("click", () => el.overlayFileInput?.click());
  el.overlayFileInput?.addEventListener("change", handleOverlayFiles);
  el.clearOverlayBtn?.addEventListener("click", clearCurrentOverlays);
  el.generateCurrentPageBtn?.addEventListener("click", generateCurrentPage);
  el.modifyCurrentPageBtn?.addEventListener("click", modifyCurrentPage);
  el.copyPagePromptBtn?.addEventListener("click", copyCurrentPagePrompt);
  el.viewCurrentPageLargeBtn?.addEventListener("click", openCurrentPageLargeImage);
  el.saveCurrentPageImageBtn?.addEventListener("click", saveCurrentPageImage);
  el.slideBaseImage?.addEventListener("click", openCurrentPageLargeImage);
  el.exportWorkflowPptBtn?.addEventListener("click", exportWorkflowPpt);
  el.cancelGenerateCurrentPageBtn?.addEventListener("click", () => {
    const page = getSelectedPage();
    if (!page) {
      setStatus("未找到当前页面，请刷新或重新拆分。", "error");
      return;
    }
    cancelAction(getPageGenerateRequestKey(page.id), "已取消当前页生成。");
  });
  el.restoreHistoryProjectBtn?.addEventListener("click", restoreHistoryProject);
  el.closePageImageModalBtn?.addEventListener("click", closeCurrentPageLargeImage);
  el.savePageImageModalBtn?.addEventListener("click", saveModalImage);
  document.querySelectorAll("[data-close-page-image-modal]").forEach((node) => {
    node.addEventListener("click", closeCurrentPageLargeImage);
  });

  el.reviseImportBtn.addEventListener("click", () => el.reviseFileInput.click());
  el.reviseFileInput.addEventListener("change", handleReviseFiles);
  el.revisePrevBtn.addEventListener("click", () => stepReviseImage(-1));
  el.reviseNextBtn.addEventListener("click", () => stepReviseImage(1));
  el.reviseDeleteBtn.addEventListener("click", deleteCurrentReviseImage);
  el.revisePrompt.addEventListener("input", () => {
    state.revise.prompt = el.revisePrompt.value;
  });
  el.sendReviseBtn.addEventListener("click", sendRevise);
  el.cancelReviseBtn.addEventListener("click", () => cancelAction("revise"));
  el.exportReviseImageBtn?.addEventListener("click", exportReviseImage);

  el.apiKey?.addEventListener("input", () => {
    state.settings.apiKey = el.apiKey?.value?.trim() || "";
    if (el.quickApiKey) el.quickApiKey.value = state.settings.apiKey;
    saveState();
  });
  el.openAiImageApiKey?.addEventListener("input", () => {
    state.settings.openAiImageApiKey = el.openAiImageApiKey.value.trim();
    if (el.quickOpenAiImageApiKey) el.quickOpenAiImageApiKey.value = state.settings.openAiImageApiKey;
    saveState();
  });
  el.openAiImageBaseUrl?.addEventListener("input", () => {
    state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(el.openAiImageBaseUrl.value);
    if (el.quickOpenAiImageBaseUrl) el.quickOpenAiImageBaseUrl.value = state.settings.openAiImageBaseUrl;
    saveState();
  });
  el.whatAiImageApiKey?.addEventListener("input", () => {
    state.settings.whatAiImageApiKey = el.whatAiImageApiKey.value.trim();
    saveState();
  });
  el.quickOpenAiImageBaseUrl?.addEventListener("input", () => {
    state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(el.quickOpenAiImageBaseUrl.value);
    if (el.openAiImageBaseUrl) el.openAiImageBaseUrl.value = state.settings.openAiImageBaseUrl;
    saveState();
  });
  el.quickApiKey?.addEventListener("input", () => {
    state.settings.apiKey = el.quickApiKey.value.trim();
    if (el.apiKey) el.apiKey.value = state.settings.apiKey;
    saveState();
  });
  el.quickOpenAiImageApiKey?.addEventListener("input", () => {
    state.settings.openAiImageApiKey = el.quickOpenAiImageApiKey.value.trim();
    if (el.openAiImageApiKey) el.openAiImageApiKey.value = state.settings.openAiImageApiKey;
    saveState();
  });
  el.quickApiKey?.addEventListener("change", () => {
    state.settings.apiKey = el.quickApiKey.value.trim();
    if (el.apiKey) el.apiKey.value = state.settings.apiKey;
    saveState();
  });
  el.quickOpenAiImageApiKey?.addEventListener("change", () => {
    state.settings.openAiImageApiKey = el.quickOpenAiImageApiKey.value.trim();
    if (el.openAiImageApiKey) el.openAiImageApiKey.value = state.settings.openAiImageApiKey;
    saveState();
  });
  el.workflowImageModel?.addEventListener("change", () => {
    setWorkflowImageModel(PPT_MODEL);
    saveState();
  });
  el.workflowImageModelEntry?.addEventListener("change", () => {
    setWorkflowImageModel(PPT_MODEL);
    saveState();
  });
  el.region?.addEventListener("change", () => { state.settings.region = el.region?.value || ""; saveState(); });
  el.slideAspect?.addEventListener("change", () => { state.settings.slideAspect = el.slideAspect?.value || "16:9"; renderArtboard(); saveState(); });
  el.outputSize?.addEventListener("change", () => { state.settings.outputSize = el.outputSize?.value || "2K"; saveState(); });
  el.seed?.addEventListener("input", () => { state.settings.seed = el.seed?.value?.trim() || ""; saveState(); });
  el.testApiKeyBtn?.addEventListener("click", testApiKeys);
  el.quickTestApiKeyBtn?.addEventListener("click", testApiKeys);
  el.cancelTestApiKeyBtn?.addEventListener("click", () => cancelAction("testApi"));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.pageImageModal?.hidden) {
      closeCurrentPageLargeImage();
    }
  });

  window.addEventListener("resize", () => {
    renderArtboard();
    renderRevise();
  });
  } catch (e) {
    console.error("bindEvents 注册事件失败:", e);
    setStatus("页面事件初始化异常，请刷新页面。", "error");
  }
}

function renderPageResults() {
  if (!el.pageResultStrip) return;
  const page = getSelectedPage();
  if (!page) {
    el.pageResultStrip.innerHTML = "";
    return;
  }

  const historyImages = Array.isArray(page.resultImages)
    ? Array.from(new Set(page.resultImages.filter(Boolean)))
    : [];
  if (page.baseImage && !historyImages.includes(page.baseImage)) {
    historyImages.unshift(page.baseImage);
  }
  const isGenerating = isPageGenerating(page.id);
  const statusText = isGenerating
    ? "当前请求已提交，正在生成中..."
    : page.generationStatus === "error"
      ? (page.generationError || "最近一次生成失败。")
      : historyImages.length
        ? `${historyImages.length} 个版本`
        : "还没有历史生图版本。";

  el.pageResultStrip.innerHTML = `
    <div class="page-result-header">
      <strong>历史生图版本</strong>
      <span class="inline-hint">${escapeHtml(statusText)}</span>
    </div>
    ${historyImages.length ? `
      <div class="page-result-thumbs">
        ${historyImages.map((src, index) => `
          <button
            class="result-item result-thumb ${src === page.baseImage ? "is-active" : ""}"
            type="button"
            data-result-image-src="${escapeHtml(src)}"
            aria-label="${escapeHtml(`切换到第 ${index + 1} 个历史版本`)}"
            title="${escapeHtml(`第 ${index + 1} 个版本`)}"
          >
            <img src="${escapeHtml(src)}" alt="${escapeHtml(page.pageTitle || `第${page.pageNumber}页`)}" />
            <span>${index + 1}</span>
          </button>
        `).join("")}
      </div>
    ` : `<div class="inline-summary">${escapeHtml(statusText)}</div>`}
  `;

  el.pageResultStrip.querySelectorAll("[data-result-image-src]").forEach((node) => {
    node.addEventListener("click", () => {
      const nextSrc = node.dataset.resultImageSrc || page.baseImage;
      if (nextSrc === page.baseImage) {
        openImageViewer(nextSrc, page.pageTitle || `第${page.pageNumber}页`);
        return;
      }
      page.baseImage = nextSrc;
      saveState();
      renderPagesWorkbench();
    });
  });
}

function formatOnscreenPreview(value) {
  const source = String(value || "")
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  if (!source) return "";

  const lines = source
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(?:视觉元素|视觉建议|画面建议|设计说明|版式说明|构图说明|画面说明|视觉)\s*[:：]/i.test(line))
    .map((line) => line
      .replace(/^\s*(?:blocks|items|points|entries|sections)\s*[:：]\s*/i, "")
      .replace(/^\s*(?:title|subtitle|metaInfo|metainfo|abstract|summary|body|content|text|heading|detail|label|metric|value|note|type|highlight|dataPoints?)\s*[:：]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);

  return lines.filter((line, index) => line !== lines[index - 1]).join("\n");
}

async function skipSplit() {
  clearWorkflowSession();
  const signal = startCancelableAction("split", el.skipSplitBtn, el.cancelSplitBtn, "创建中...");
  state.workflowJob = {
    id: "",
    status: "running",
    totalPages: 0,
    preparedPages: 0,
    readyToGeneratePages: 0,
    failedPages: 0,
    pages: [],
    statusText: "",
  };
  state.selectedPageId = "";
  renderPagesWorkbench();
  try {
    const data = await apiJson("/api/workflow/manual-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        themeDefinition: state.themeDefinition,
        preferences: state.preferences,
        decorationLevel: state.decorationLevel,
        imageModel: getCurrentWorkflowImageModel(),
      }),
    });
    state.workflowJobId = data.jobId;
    state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
    state.selectedPageId = "";
    ensureSelectedPage();
    state.themeConfirmed = usingGptSimpleWorkflow();
    switchSmartStep(usingGptSimpleWorkflow() ? "pages" : "theme");
    setStatus(
      usingGptSimpleWorkflow()
        ? "已进入手工模式，点击 + 添加页面并逐页生成。"
        : "已进入手工模式，下一步根据页面结构匹配风格。",
      "success",
    );
    saveState();
  } catch (error) {
    if (isAbortError(error)) {
      clearWorkflowSession({ toSplit: true });
      return;
    }
    clearWorkflowSession({ toSplit: true });
    setStatus(error.message || "创建手工项目失败。", "error");
  } finally {
    finishCancelableAction("split");
  }
}

async function addManualPage() {
  if (!state.workflowJobId) {
    setStatus("请先创建项目。", "error");
    return;
  }
  const signal = startCancelableAction("addPage", el.addManualPageBtn, null, "添加中...");
  try {
    const data = await apiJson("/api/workflow/manual-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        jobId: state.workflowJobId,
        pageTitle: "新页面",
        pageContent: "",
        pageType: "content",
      }),
    });
    state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
    state.selectedPageId = data.page?.id || "";
    ensureSelectedPage();
    renderPagesWorkbench();
    setStatus("已添加新页面，请填写标题和内容。", "success");
    saveState();
  } catch (error) {
    if (isAbortError(error)) return;
    setStatus(error.message || "添加页面失败。", "error");
  } finally {
    finishCancelableAction("addPage");
  }
}

async function runSplit() {
  syncKeysFromDom();
  saveState();
  setWorkflowImageModel(el.workflowImageModelEntry?.value || el.workflowImageModel?.value || state.settings.workflowImageModel || PPT_MODEL);
  state.workflowContent = el.workflowContent.value.trim();
  state.workflowPageCount = clamp(Number(el.workflowPageCount.value || 8), 2, 120);
  state.aiProcessingMode = normalizeAiProcessingModeValue(el.aiProcessingMode.value);
  state.workflowEnableExpansion = aiProcessingModeUsesExpansion(state.aiProcessingMode);
  state.workflowTargetChars = clamp(Number(el.workflowTargetChars?.value || 0), 0, 300);
  state.workflowMaxChars = clamp(Number(el.workflowMaxChars?.value || 200), 0, 400);
  if (aiProcessingModeUsesExpansion(state.aiProcessingMode) && state.workflowTargetChars && state.workflowMaxChars && state.workflowTargetChars > state.workflowMaxChars) {
    state.workflowTargetChars = state.workflowMaxChars;
    if (el.workflowTargetChars) el.workflowTargetChars.value = String(state.workflowTargetChars);
  }
  state.splitTemplateText = "";
  await ensureServerConfigReady();
  if (!hasDashScopeApiKey()) {
    setStatus("请先填写 DashScope / Qwen API Key。", "error");
    switchTab("settings");
    return;
  }
  if (!state.workflowContent) {
    setStatus("请先输入主文本。", "error");
    return;
  }

  const signal = startCancelableAction("split", el.runSplitBtn, el.cancelSplitBtn, "拆分中...");
  state.workflowJob = {
    id: state.workflowJobId || "",
    status: "running",
    totalPages: state.workflowPageCount,
    preparedPages: 0,
    readyToGeneratePages: 0,
    failedPages: 0,
    pages: [],
    statusText: "正在拆分内容并准备逐页结果...",
  };
  state.selectedPageId = "";
  renderPagesWorkbench();
  setStatus("正在拆分内容并准备逐页结果...", "running");
  try {
    const data = await apiJson("/api/workflow/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        apiKey: state.settings.apiKey,
        region: state.settings.region,
        content: state.workflowContent,
        pageCount: state.workflowPageCount,
        splitTemplate: "",
        aiProcessingMode: state.aiProcessingMode,
        imageModel: getCurrentWorkflowImageModel(),
        enableExpansion: aiProcessingModeUsesExpansion(state.aiProcessingMode),
        targetChars: aiProcessingModeUsesExpansion(state.aiProcessingMode) ? state.workflowTargetChars : 0,
        maxChars: state.workflowMaxChars,
      }),
    });
    state.workflowJobId = data.jobId;
    state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
    state.selectedPageId = data.job?.pages?.[0]?.id || "";
    ensureSelectedPage();
    startWorkflowPolling();
    renderPagesWorkbench();
    state.themeConfirmed = usingGptSimpleWorkflow();
    switchSmartStep(usingGptSimpleWorkflow() ? "pages" : "theme");
    setStatus(usingGptSimpleWorkflow() ? "内容已拆分，可以逐页填写 GPT 风格并生成。" : "内容已拆分，下一步根据页面结构匹配风格。", "success");
    saveState();
  } catch (error) {
    if (isAbortError(error)) {
      clearWorkflowSession({ toSplit: true });
      return;
    }
    clearWorkflowSession({ toSplit: true });
    setStatus(error.message || "拆分失败。", "error");
  } finally {
    finishCancelableAction("split");
  }
}

function startWorkflowPolling() {
  stopWorkflowPolling();
  if (!state.workflowJobId) return;
  state.workflowPollTimer = setInterval(async () => {
    try {
      const data = await apiJson(`/api/workflow/jobs/${encodeURIComponent(state.workflowJobId)}`);
      state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
      ensureSelectedPage();
      renderPagesWorkbench();
      renderHistoryProjects();
      if (el.workflowRibbonMeta) {
        el.workflowRibbonMeta.textContent = `${data.job.readyToGeneratePages || 0} 页可直接生成，当前已准备 ${data.job.preparedPages || 0}/${data.job.totalPages || 0} 页。`;
      }
      if (data.job.status === "ready") {
        stopWorkflowPolling();
        setStatus(data.job.statusText || "页面准备完成。", "success");
      }
      saveState();
    } catch (error) {
      stopWorkflowPolling();
      if (isMissingWorkflowJobError(error)) {
        clearWorkflowSession({ toSplit: true });
        setStatus("之前的拆分任务已失效，请重新拆分。", "error");
        return;
      }
      setStatus(error.message || "读取任务进度失败。", "error");
    }
  }, 2200);
}

async function syncWorkflowJobOnce() {
  if (!state.workflowJobId) return;
  try {
    const data = await apiJson(`/api/workflow/jobs/${encodeURIComponent(state.workflowJobId)}`);
    state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
    ensureSelectedPage();
    renderPagesWorkbench();
    renderHistoryProjects();
    saveState();
  } catch (error) {
    if (isMissingWorkflowJobError(error)) {
      clearWorkflowSession({ toSplit: true });
      setStatus("之前的拆分任务已失效，请重新拆分。", "error");
    }
  }
}

function renderPageList() {
  const job = state.workflowJob;
  if (!job?.pages?.length) {
    if (el.workflowStats) el.workflowStats.textContent = "";
    if (el.workflowDiagnostics) el.workflowDiagnostics.textContent = "";
    if (el.workflowPromptTrace) el.workflowPromptTrace.textContent = "";
    el.workflowPageList.innerHTML = "";
    return;
  }
  ensureSelectedPage();
  if (el.workflowSummary) el.workflowSummary.textContent = "";
  if (el.workflowStats) el.workflowStats.textContent = formatJobStats(job);
  if (el.workflowDiagnostics) el.workflowDiagnostics.textContent = normalizeDisplayText(job.splitDiagnostics);
  if (el.workflowPromptTrace) el.workflowPromptTrace.textContent = stringifyTrace(job.promptTrace);
  el.workflowPageList.innerHTML = job.pages.map((page) => {
    const typeMeta = getPageTypeMeta(page.pageType);
    const pageActive = isPageGenerating(page.id);
    const serverBusy = ["preparing", "running"].includes(page.generationStatus);
    const status = page.generated
      ? "已生成"
      : pageActive || serverBusy
        ? "生成中"
        : page.prepareDone ? "可生成" : "处理中";
    const statusClass = page.generated ? "generated" : (pageActive || serverBusy || page.prepareDone) ? "ready" : "idle";
    const riskClass = page.riskLevel === "high" ? "high" : page.riskLevel === "medium" ? "medium" : "";
    return `
      <div class="page-item ${page.id === state.selectedPageId ? "is-active" : ""}" data-page-id="${page.id}">
        <div class="page-title-row">
          <strong>第${page.pageNumber} 页 · ${escapeHtml(page.pageTitle || "未命名")}</strong>
          <span class="status-pill ${statusClass}">${status}</span>
        </div>
        <div class="page-meta">
          <span class="meta-pill page-type-pill page-type-${escapeHtml(String(page.pageType || "content").toLowerCase())}">${escapeHtml(typeMeta.label)}</span>
          ${riskClass ? `<span class="risk-pill ${riskClass}">排版风险</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  el.workflowPageList.querySelectorAll("[data-page-id]").forEach((item) => {
    item.addEventListener("click", () => {
      updateCurrentPageDraftFromEditors();
      state.selectedPageId = item.dataset.pageId;
      renderPagesWorkbench();
      saveState();
    });
  });
}

async function batchGenerateReadyPagesLegacy() {
  syncKeysFromDom();
  const job = state.workflowJob;
  if (!job?.pages?.length) return;
  if (!ensureStandardWorkflowThemeReady("请先生成并确认风格，再进行批量生成。")) return;

  await ensureServerConfigReady();
  const selectedImageModel = getCurrentWorkflowImageModel();
  if (usingHostedWorkflowModel() && !hasHostedImageApiKey()) {
    setStatus("请先填写生图 API Key。", "error");
    switchTab("settings");
    return;
  }

  const candidates = job.pages.filter((page) => page.readyToGenerate && !page.generated);
  if (!candidates.length) {
    setStatus("还没有可直接批量生成的页面。", "error");
    return;
  }

  const signal = startCancelableAction("batchGenerate", el.batchGenerateReadyBtn, el.cancelBatchGenerateBtn, "批量生成中...");
  try {
    const concurrency = 5;
    const errors = [];
    let completed = 0;
    const updatePageInJob = (updatedPage) => {
      if (!updatedPage?.id) return;
      state.workflowJob.pages = state.workflowJob.pages.map((item) => item.id === updatedPage.id ? updatedPage : item);
    };
    const markPageRunning = (page) => {
      const current = state.workflowJob.pages.find((item) => item.id === page.id);
      if (!current) return;
      current.generationStatus = "running";
      current.generationError = "";
    };
    const markPageFailed = (page, error) => {
      const current = state.workflowJob.pages.find((item) => item.id === page.id);
      if (!current) return;
      current.generationStatus = "error";
      current.generationError = error?.message || "生成失败。";
    };
    const generateOnePage = async (page) => {
      const draft = ensurePageDraft(page);
      applyDraftPromptForGeneration(draft, getEditablePagePromptFromValues(draft.sharedPrompt, draft.extraPrompt, draft.pageStylePrompt));
      return apiJson("/api/workflow/page/generate-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          apiKey: state.settings.apiKey,
          openAiImageApiKey: state.settings.openAiImageApiKey,
          openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
          whatAiImageApiKey: state.settings.whatAiImageApiKey,
          region: state.settings.region,
          imageModel: selectedImageModel,
          jobId: state.workflowJobId,
          pageId: page.id,
          slideAspect: state.settings.slideAspect,
          size: getWorkflowGenerationSize(),
          seed: state.settings.seed,
          extraPrompt: draft.extraPrompt || "",
          pageStylePrompt: draft.pageStylePrompt || "",
          onscreenContent: formatOnscreenPreview(draft.onscreenContent || page.onscreenContentText || page.onscreenContent || ""),
          canvasImage: "",
        }),
      });
    };

    for (let start = 0; start < candidates.length; start += concurrency) {
      const batch = candidates.slice(start, start + concurrency);
      batch.forEach(markPageRunning);
      sanitizeRecoveredWorkflowJob(state.workflowJob);
      renderPagesWorkbench();
      syncCurrentPageGenerateUi();
      const batchNumbers = batch.map((page) => page.pageNumber).join("、");
      setStatus(`正在并发生成第 ${batchNumbers} 页...`, "running");

      const results = await Promise.all(batch.map((page) => generateOnePage(page)
        .then((data) => ({ ok: true, page, data }))
        .catch((error) => ({ ok: false, page, error }))));

      for (const result of results) {
        if (result.ok) {
          if (!result.data.page?.generated) {
            const error = new Error(result.data.page?.generationError || `第 ${result.page.pageNumber} 页没有拿到图片结果。`);
            markPageFailed(result.page, error);
            errors.push(error);
            continue;
          }
          updatePageInJob(result.data.page);
          completed += 1;
          continue;
        }
        if (isAbortError(result.error)) throw result.error;
        markPageFailed(result.page, result.error);
        errors.push(result.error || new Error(`第 ${result.page.pageNumber} 页生成失败。`));
      }

      sanitizeRecoveredWorkflowJob(state.workflowJob);
      ensureSelectedPage();
      saveState();
      renderPagesWorkbench();
      syncCurrentPageGenerateUi();
      if (errors.length) throw errors[0];
      setStatus(`已完成 ${completed}/${candidates.length} 页，继续生成下一批...`, "running");
    }

    setStatus("所有可生成页面已完成。", "success");
  } catch (error) {
    if (isAbortError(error)) return;
    if (isMissingWorkflowJobError(error)) {
      clearWorkflowSession({ toSplit: true });
      setStatus("之前的拆分任务已失效，请重新拆分。", "error");
      return;
    }
    setStatus(error.message || "批量生成失败。", "error");
  } finally {
    finishCancelableAction("batchGenerate");
    renderPagesWorkbench();
    syncCurrentPageGenerateUi();
  }
}

async function batchGenerateReadyPages() {
  syncKeysFromDom();
  const job = state.workflowJob;
  if (!job?.pages?.length) return;
  if (!ensureStandardWorkflowThemeReady("请先生成并确认风格，再进行批量生成。")) return;

  await ensureServerConfigReady();
  const selectedImageModel = getCurrentWorkflowImageModel();
  if (usingHostedWorkflowModel() && !hasHostedImageApiKey()) {
    setStatus("请先填写生图 API Key。", "error");
    switchTab("settings");
    return;
  }

  const candidates = job.pages.filter((page) => page.readyToGenerate && !page.generated);
  if (!candidates.length) {
    setStatus("还没有可直接批量生成的页面。", "error");
    return;
  }

  const resetCanceledRunningPages = () => {
    candidates.forEach((page) => {
      const current = state.workflowJob?.pages?.find((item) => item.id === page.id);
      if (!current || current.generated || current.generationStatus !== "running") return;
      current.generationStatus = "idle";
      current.generationError = "";
    });
    sanitizeRecoveredWorkflowJob(state.workflowJob);
    ensureSelectedPage();
    saveState();
    renderPagesWorkbench();
    syncCurrentPageGenerateUi();
  };

  const signal = startCancelableAction("batchGenerate", el.batchGenerateReadyBtn, el.cancelBatchGenerateBtn, "批量生成中...");
  try {
    const concurrency = 5;
    const errors = [];
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;

    const updatePageInJob = (updatedPage) => {
      if (!updatedPage?.id) return;
      state.workflowJob.pages = state.workflowJob.pages.map((item) => item.id === updatedPage.id ? updatedPage : item);
    };

    const markPageRunning = (page) => {
      const current = state.workflowJob.pages.find((item) => item.id === page.id);
      if (!current) return;
      current.generationStatus = "running";
      current.generationError = "";
    };

    const markPageFailed = (page, error) => {
      const current = state.workflowJob.pages.find((item) => item.id === page.id);
      if (!current) return;
      current.generationStatus = "error";
      current.generationError = error?.message || "生成失败。";
    };

    const generateOnePage = async (page) => {
      const draft = ensurePageDraft(page);
      applyDraftPromptForGeneration(draft, getEditablePagePromptFromValues(draft.sharedPrompt, draft.extraPrompt, draft.pageStylePrompt));
      return apiJson("/api/workflow/page/generate-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          apiKey: state.settings.apiKey,
          openAiImageApiKey: state.settings.openAiImageApiKey,
          openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
          whatAiImageApiKey: state.settings.whatAiImageApiKey,
          region: state.settings.region,
          imageModel: selectedImageModel,
          jobId: state.workflowJobId,
          pageId: page.id,
          slideAspect: state.settings.slideAspect,
          size: getWorkflowGenerationSize(),
          seed: state.settings.seed,
          extraPrompt: draft.extraPrompt || "",
          pageStylePrompt: draft.pageStylePrompt || "",
          onscreenContent: formatOnscreenPreview(draft.onscreenContent || page.onscreenContentText || page.onscreenContent || ""),
          canvasImage: "",
        }),
      });
    };

    const refreshBatchUi = () => {
      sanitizeRecoveredWorkflowJob(state.workflowJob);
      ensureSelectedPage();
      renderPagesWorkbench();
      syncCurrentPageGenerateUi();
    };

    const nextPage = () => {
      if (nextIndex >= candidates.length) return null;
      const page = candidates[nextIndex];
      nextIndex += 1;
      return page;
    };

    const worker = async () => {
      while (!signal.aborted) {
        const page = nextPage();
        if (!page) return;

        markPageRunning(page);
        refreshBatchUi();
        setStatus(`批量生成中：已完成 ${completed}/${candidates.length} 页，失败 ${failed} 页，保持最多 ${concurrency} 页并发...`, "running");

        try {
          const data = await generateOnePage(page);
          if (!data.page?.generated) {
            throw new Error(data.page?.generationError || `第 ${page.pageNumber} 页没有拿到图片结果。`);
          }
          updatePageInJob(data.page);
          completed += 1;
        } catch (error) {
          if (isAbortError(error) || isMissingWorkflowJobError(error)) throw error;
          markPageFailed(page, error);
          failed += 1;
          errors.push(error || new Error(`第 ${page.pageNumber} 页生成失败。`));
        }

        saveState();
        refreshBatchUi();
      }

      throw new DOMException("已取消批量生成。", "AbortError");
    };

    const workerCount = Math.min(concurrency, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (failed > 0) {
      setStatus(`批量生成完成 ${completed}/${candidates.length} 页，失败 ${failed} 页。`, "error");
      return;
    }
    setStatus("所有可生成页面已完成。", "success");
  } catch (error) {
    if (isAbortError(error)) {
      resetCanceledRunningPages();
      setStatus("已停止批量生成，后续页面不会继续生成。", "idle");
      return;
    }
    if (isMissingWorkflowJobError(error)) {
      clearWorkflowSession({ toSplit: true });
      setStatus("之前的拆分任务已失效，请重新拆分。", "error");
      return;
    }
    setStatus(error.message || "批量生成失败。", "error");
  } finally {
    finishCancelableAction("batchGenerate");
    renderPagesWorkbench();
    syncCurrentPageGenerateUi();
  }
}

async function testApiKeys() {
  syncKeysFromDom();
  saveState();
  state.settings.openAiImageBaseUrl = normalizeOpenAiImageBaseUrl(el.quickOpenAiImageBaseUrl?.value || el.openAiImageBaseUrl?.value);
  state.settings.workflowImageModel = PPT_MODEL;
  state.settings.region = el.region?.value || DEFAULT_REGION;
  state.settings.slideAspect = el.slideAspect?.value || "16:9";
  state.settings.outputSize = el.outputSize?.value || "2K";
  state.settings.seed = el.seed?.value?.trim() || "";
  await ensureServerConfigReady();
  if (!hasDashScopeApiKey() && !hasHostedImageApiKey()) {
    setStatus("请先填写至少一个可用的 API Key。", "error");
    return;
  }
  const signal = startCancelableAction("testApi", el.testApiKeyBtn, el.cancelTestApiKeyBtn, "测试中...");
  setStatus("正在测试 Key...", "running");
  try {
    const tasks = [];
    const selectedWorkflowModel = getCurrentWorkflowImageModel();
    if (hasHostedImageApiKey() && usingHostedWorkflowModel()) {
      tasks.push(fetch("/api/test-image-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          apiKey: state.settings.apiKey,
          openAiImageApiKey: state.settings.openAiImageApiKey,
          openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
          whatAiImageApiKey: state.settings.whatAiImageApiKey,
          region: state.settings.region,
          model: selectedWorkflowModel,
        }),
      }).then(async (response) => ({ ok: response.ok, data: await response.json() })));
    }
    const results = await Promise.all(tasks);
    const failures = results.filter((item) => !item.ok || item.data?.code);
    if (failures.length) {
      throw new Error(failures.map((item) => item.data?.message || "测试失败").join("；"));
    }
    setStatus("Key 测试通过。", "success");
    saveState();
  } catch (error) {
    if (isAbortError(error)) return;
    setStatus(error.message || "测试失败。", "error");
  } finally {
    finishCancelableAction("testApi");
  }
}

function splitOnscreenContentForEditor(value, fallbackTitle = "") {
  const cleaned = formatOnscreenPreview(value);
  const normalizedFallback = normalizeDisplayText(fallbackTitle || "").split("\n")[0].trim();
  let title = normalizedFallback;
  let body = cleaned;

  if (!cleaned) {
    return { title, body: "" };
  }

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!title && lines.length) {
    const candidate = lines[0];
    if (candidate.length <= 32 && !/[\u3002\uFF01\uFF1F\uFF1B]$/.test(candidate)) {
      title = candidate;
      lines.shift();
    }
  }

  body = lines.join("\n");
  if (title) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body
      .replace(new RegExp(`^${escapedTitle}\\s*[:\\uFF1A\\u2014\\-]\\s*`), "")
      .replace(new RegExp(`^${escapedTitle}\\s*\\n+`), "")
      .trim();
  }

  if (!body && cleaned && cleaned !== title) {
    body = cleaned;
  }

  return { title, body };
}

function composeOnscreenContentFromEditors(titleValue, bodyValue) {
  const title = normalizeDisplayText(titleValue || "").split("\n")[0].trim();
  const body = formatOnscreenPreview(bodyValue || "");
  if (title && body) {
    if (
      body === title ||
      body.startsWith(`${title}\n`) ||
      body.startsWith(`${title}\uFF1A`) ||
      body.startsWith(`${title}:`)
    ) {
      return body;
    }
    return `${title}\n${body}`.trim();
  }
  return title || body;
}

function updateCurrentPageDraftFromEditors() {
  const page = getSelectedPage();
  const draft = ensurePageDraft(page);
  if (!draft) return "";
  const title = el.pageOnscreenTitleEditor?.value.trim() || "";
  const body = el.pageOnscreenBodyEditor?.value || "";
  draft.onscreenTitle = title;
  draft.onscreenBody = body;
  draft.onscreenContent = composeOnscreenContentFromEditors(title, body);
  if (page) {
    page.pageTitle = title || page.pageTitle || `第 ${page.pageNumber || ""} 页`;
    page.pageContent = formatOnscreenPreview(body);
    page.onscreenContent = draft.onscreenContent;
    page.onscreenContentText = draft.onscreenContent;
  }
  return draft.onscreenContent;
}

function attachEnhancedPageEditorEvents() {
  el.pageOnscreenBodyEditor = el.pageOnscreenEditor;
  if (el.pageOnscreenTitleEditor && !el.pageOnscreenTitleEditor.dataset.boundEnhanced) {
    el.pageOnscreenTitleEditor.addEventListener("input", () => {
      updateCurrentPageDraftFromEditors();
      renderPageList();
      saveState();
    });
    el.pageOnscreenTitleEditor.dataset.boundEnhanced = "true";
  }
  if (el.pageOnscreenBodyEditor && !el.pageOnscreenBodyEditor.dataset.boundEnhanced) {
    el.pageOnscreenBodyEditor.addEventListener("input", () => {
      updateCurrentPageDraftFromEditors();
      renderPageList();
      saveState();
    });
    el.pageOnscreenBodyEditor.dataset.boundEnhanced = "true";
  }
}

function syncCurrentPageGenerateUi() {
  if (!el.generateCurrentPageBtn || !el.cancelGenerateCurrentPageBtn) return;
  // Auto-recover: if job has pages but none selected, pick first page
  if (state.workflowJob?.pages?.length && !state.selectedPageId) {
    state.selectedPageId = state.workflowJob.pages[0].id;
    ensurePageDraft(state.workflowJob.pages[0]);
  }
  const page = getSelectedPage();
  const requestKey = page ? getPageGenerateRequestKey(page.id) : "";
  const activeRequest = requestKey ? activeRequests.get(requestKey) : null;
  const pageActive = Boolean(activeRequest);
  const themeReady = isStandardWorkflowThemeReady();
  const sharedPrompt = getCurrentSharedPromptValue();
  const canModify = Boolean(page?.baseImage && sharedPrompt && !pageActive);
  if (pageActive) {
    el.generateCurrentPageBtn.disabled = true;
    if (el.modifyCurrentPageBtn) el.modifyCurrentPageBtn.disabled = true;
  } else {
    el.generateCurrentPageBtn.disabled = !page || !themeReady;
    el.generateCurrentPageBtn.textContent = page?.generated ? "\u91cd\u65b0\u751f\u6210\u8be5\u9875" : "\u751f\u6210\u8be5\u9875";
    delete el.generateCurrentPageBtn.dataset.idleText;
    if (el.modifyCurrentPageBtn) {
      el.modifyCurrentPageBtn.disabled = !canModify;
      el.modifyCurrentPageBtn.textContent = "\u6309\u8981\u6c42\u4fee\u6539";
      delete el.modifyCurrentPageBtn.dataset.idleText;
    }
  }
  if (pageActive && activeRequest?.button === el.generateCurrentPageBtn) {
    el.generateCurrentPageBtn.textContent = "\u751f\u6210\u4e2d...";
  }
  if (pageActive && el.modifyCurrentPageBtn && activeRequest?.button === el.modifyCurrentPageBtn) {
    el.modifyCurrentPageBtn.textContent = "\u4fee\u6539\u4e2d...";
  }
  el.cancelGenerateCurrentPageBtn.hidden = !pageActive;
  el.cancelGenerateCurrentPageBtn.disabled = !pageActive;
  if (el.viewCurrentPageLargeBtn) {
    el.viewCurrentPageLargeBtn.disabled = !page?.baseImage || pageActive;
  }
  if (el.saveCurrentPageImageBtn) {
    el.saveCurrentPageImageBtn.disabled = !page?.baseImage || pageActive;
  }
  if (el.copyPagePromptBtn) {
    el.copyPagePromptBtn.disabled = !page || pageActive || !themeReady;
  }
  if (el.batchGenerateReadyBtn) {
    const hasCandidates = Array.isArray(state.workflowJob?.pages) && state.workflowJob.pages.some((item) => item.readyToGenerate && !item.generated);
    if (el.batchGenerateReadyBtn.textContent !== "批量生成中...") {
      el.batchGenerateReadyBtn.disabled = !hasCandidates || !themeReady;
    }
  }
  if (el.exportWorkflowPptBtn) {
    const hasWorkflowPages = Array.isArray(state.workflowJob?.pages) && state.workflowJob.pages.length > 0;
    if (el.exportWorkflowPptBtn.textContent !== "导出中...") {
      el.exportWorkflowPptBtn.disabled = !hasWorkflowPages;
    }
  }
}

function upgradeSmartUiLayout() {
  const splitStage = document.querySelector('[data-step-panel="split"]');
  const splitControlGrid = splitStage?.querySelector(".split-control-grid");
  document.getElementById("workflowEnableExpansion")?.closest(".field")?.remove();
  el.workflowEnableExpansion = null;
  if (splitControlGrid && !document.getElementById("workflowTargetChars")) {
    const field = document.createElement("label");
    field.className = "field";
    field.innerHTML = `
      <span>\u6bcf\u9875\u76ee\u6807\u5b57\u6570</span>
      <input id="workflowTargetChars" type="number" min="0" max="300" placeholder="\u9009\u62e9\u201c\u62c6\u5206\u5e76\u6269\u5199\u201d\u540e\u542f\u7528" />
    `;
    splitControlGrid.appendChild(field);
    el.workflowTargetChars = field.querySelector("#workflowTargetChars");
    el.workflowTargetChars.value = state.workflowTargetChars ? String(state.workflowTargetChars) : "";
  }
  if (splitControlGrid && !document.getElementById("workflowMaxChars")) {
    const field = document.createElement("label");
    field.className = "field";
    field.innerHTML = `
      <span>\u6bcf\u9875\u6700\u5927\u5b57\u6570</span>
      <input id="workflowMaxChars" type="number" min="0" max="400" placeholder="\u9ed8\u8ba4 200\uff0c0 \u8868\u793a\u4e0d\u538b\u7f29" />
    `;
    splitControlGrid.appendChild(field);
    el.workflowMaxChars = field.querySelector("#workflowMaxChars");
    el.workflowMaxChars.value = state.workflowMaxChars ? String(state.workflowMaxChars) : "";
  }
  const splitTemplateCard = splitStage?.querySelector(".split-template-card");
  const splitFooter = splitStage?.querySelector(".stage-footer");
  splitTemplateCard?.remove();
  syncSplitExpansionControls();
  if (splitFooter && !splitFooter.querySelector("#splitNextHintBtn")) {
    const placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = "btn ghost";
    placeholder.id = "splitNextHintBtn";
    placeholder.disabled = true;
    placeholder.textContent = "\u4e0b\u4e00\u6b65";
    splitFooter.appendChild(placeholder);
  }

  const pagesStage = document.querySelector('[data-step-panel="pages"]');
  const onscreenCard = pagesStage?.querySelector(".onscreen-card");
  if (onscreenCard) {
    document.getElementById("pageVisualElementsBlock")?.remove();
    el.pageVisualElementsBlock = null;
    el.pageVisualElementsDisplay = null;
    const preview = onscreenCard.querySelector("#pageOnscreenPreview");
    if (preview) {
      preview.remove();
      el.pageOnscreenPreview = null;
    }
    const bodyField = onscreenCard.querySelector('label[for="pageOnscreenEditor"], label.field.field-stack.grow, label.field.field-stack.onscreen-body-field') || onscreenCard.querySelector("label.field.field-stack");
    if (bodyField && !document.getElementById("pageOnscreenTitleEditor")) {
      const titleField = document.createElement("label");
      titleField.className = "field onscreen-title-field";
      titleField.id = "pageOnscreenTitleField";
      titleField.innerHTML = `
        <span>\u6807\u9898</span>
        <textarea id="pageOnscreenTitleEditor" rows="2" placeholder="\u8fd9\u4e00\u9875\u7684\u6807\u9898"></textarea>
      `;
      bodyField.insertAdjacentElement("beforebegin", titleField);
    }
    const titleField = document.getElementById("pageOnscreenTitleEditor");
    if (titleField) {
      el.pageOnscreenTitleEditor = titleField;
    }
    if (bodyField) {
      bodyField.classList.remove("grow");
      bodyField.classList.add("onscreen-body-field");
      const label = bodyField.querySelector("span");
      if (label) label.textContent = "\u6b63\u6587";
    }
    el.pageOnscreenBodyEditor = el.pageOnscreenEditor;
    if (el.pageOnscreenBodyEditor) {
      el.pageOnscreenBodyEditor.rows = 14;
      el.pageOnscreenBodyEditor.placeholder = "\u8fd9\u4e00\u9875\u7684\u4e3b\u8981\u4e0a\u5c4f\u6587\u5b57";
    }
    attachEnhancedPageEditorEvents();
  }

  const artboardToolbar = pagesStage?.querySelector(".artboard-toolbar");
  if (artboardToolbar && !document.getElementById("pageDrawToolbar")) {
    const drawToolbar = document.createElement("div");
    drawToolbar.className = "page-draw-toolbar";
    drawToolbar.id = "pageDrawToolbar";
    drawToolbar.innerHTML = `
      <button class="btn ghost tool-btn" type="button" id="pageDrawPenBtn">\u753b\u7b14</button>
      <button class="btn ghost tool-btn" type="button" id="pageDrawRectBtn">\u77e9\u5f62</button>
      <label class="tool-color" for="pageDrawColorInput">
        <span>\u989c\u8272</span>
        <input id="pageDrawColorInput" type="color" value="#22d3ee" />
      </label>
      <button class="btn ghost" type="button" id="clearPageDrawingBtn">\u6e05\u7a7a\u7ed8\u5236</button>
    `;
    artboardToolbar.appendChild(drawToolbar);
    el.pageDrawToolbar = drawToolbar;
    el.pageDrawPenBtn = drawToolbar.querySelector("#pageDrawPenBtn");
    el.pageDrawRectBtn = drawToolbar.querySelector("#pageDrawRectBtn");
    el.pageDrawColorInput = drawToolbar.querySelector("#pageDrawColorInput");
    el.clearPageDrawingBtn = drawToolbar.querySelector("#clearPageDrawingBtn");
  }
  const slideStage = pagesStage?.querySelector("#slideStage");
  if (slideStage && !document.getElementById("pageDrawCanvas")) {
    const drawCanvas = document.createElement("canvas");
    drawCanvas.id = "pageDrawCanvas";
    drawCanvas.className = "page-draw-canvas";
    slideStage.insertBefore(drawCanvas, el.overlayLayer || null);
    el.pageDrawCanvas = drawCanvas;
  }
  if (pagesStage && !pagesStage.dataset.layoutUpgraded) {
    const pageFooter = Array.from(pagesStage.children).find((node) => node.classList?.contains("stage-footer"));
    if (pageFooter && !pageFooter.querySelector("#pagesNextHintBtn")) {
      const placeholder = document.createElement("button");
      placeholder.type = "button";
      placeholder.className = "btn ghost";
      placeholder.id = "pagesNextHintBtn";
      placeholder.disabled = true;
      placeholder.textContent = "\u4e0b\u4e00\u6b65";
      pageFooter.appendChild(placeholder);
    }
    pagesStage.dataset.layoutUpgraded = "true";
  }
  const pageFooter = Array.from(pagesStage?.children || []).find((node) => node.classList?.contains("stage-footer"));
  if (pageFooter) {
    pageFooter.classList.add("pages-workbench-footer");
    const exportButton = el.exportWorkflowPptBtn || document.getElementById("exportWorkflowPptBtn");
    const exportRow = exportButton?.closest?.(".export-deck-row");
    if (exportButton && !pageFooter.contains(exportButton)) {
      const nextHint = pageFooter.querySelector("#pagesNextHintBtn");
      pageFooter.insertBefore(exportButton, nextHint || null);
    }
    if (exportRow) {
      exportRow.hidden = true;
    }
  }
}

function renderPagesWorkbench() {
  renderPageList();
  const page = getSelectedPage();
  if (!page) {
    el.pageMetaHint.textContent = "";
    if (el.pageOnscreenTitleEditor) el.pageOnscreenTitleEditor.value = "";
    if (el.pageOnscreenBodyEditor) el.pageOnscreenBodyEditor.value = "";
    if (el.pageOnscreenEditor) el.pageOnscreenEditor.value = "";
    if (el.pageGlobalStylePrompt) el.pageGlobalStylePrompt.value = state.gptSharedStylePrompt || "";
    if (el.pageGlobalStylePromptField) el.pageGlobalStylePromptField.hidden = !usingGptSimpleWorkflow();
    if (el.pageExtraPromptField) el.pageExtraPromptField.hidden = false;
    el.pageExtraPrompt.value = "";
    el.pagePromptTrace.textContent = "";
    if (el.viewCurrentPageLargeBtn) el.viewCurrentPageLargeBtn.disabled = true;
    if (el.saveCurrentPageImageBtn) el.saveCurrentPageImageBtn.disabled = true;
    if (el.copyPagePromptBtn) el.copyPagePromptBtn.disabled = true;
    renderArtboard();
    renderPageResults();
    syncCurrentPageGenerateUi();
    return;
  }

  const draft = syncPageDraftFromPage(page);
  const sourceText = formatOnscreenPreview(page.onscreenContentText || page.onscreenContent || page.pageContent || "");
  draft.onscreenTitle = normalizeDisplayText(draft.onscreenTitle || page.pageTitle || "").split("\n")[0].trim();
  draft.onscreenBody = formatOnscreenPreview(draft.onscreenBody || sourceText);
  draft.onscreenContent = composeOnscreenContentFromEditors(draft.onscreenTitle, draft.onscreenBody);

  el.pageMetaHint.textContent = page.riskReason
    ? `\u7b2c${page.pageNumber}\u9875 \u00b7 ${page.pageTitle} \u00b7 \u6392\u7248\u98ce\u9669`
    : `\u7b2c${page.pageNumber}\u9875 \u00b7 ${page.pageTitle}`;
  if (el.pageGlobalStylePrompt) el.pageGlobalStylePrompt.value = state.gptSharedStylePrompt || "";
  if (el.pageGlobalStylePromptField) el.pageGlobalStylePromptField.hidden = !usingGptSimpleWorkflow();
  if (el.pageOnscreenTitleEditor) el.pageOnscreenTitleEditor.value = draft.onscreenTitle;
  if (el.pageOnscreenBodyEditor) el.pageOnscreenBodyEditor.value = draft.onscreenBody;
  if (el.pageOnscreenPreview) el.pageOnscreenPreview.innerHTML = "";
  if (el.pageExtraPromptField) el.pageExtraPromptField.hidden = false;
  const editablePrompt = getEditablePagePromptFromValues(
    draft.sharedPrompt,
    draft.extraPrompt,
    draft.pageStylePrompt,
    page.promptTrace?.finalImage?.extraPrompt
  );
  draft.sharedPrompt = editablePrompt;
  draft.extraPrompt = editablePrompt;
  draft.pageStylePrompt = getEffectivePageStylePrompt(editablePrompt);
  el.pageExtraPrompt.value = editablePrompt;
  el.pagePromptTrace.textContent = stringifyTrace(page.promptTrace);
  if (el.viewCurrentPageLargeBtn) {
    el.viewCurrentPageLargeBtn.disabled = !page.baseImage || isPageGenerating(page.id);
  }
  if (el.saveCurrentPageImageBtn) {
    el.saveCurrentPageImageBtn.disabled = !page.baseImage || isPageGenerating(page.id);
  }
  renderArtboard();
  renderPageResults(page);
  syncCurrentPageGenerateUi();
}

async function submitCurrentPageReprepare(options = {}) {
  const page = getSelectedPage();
  if (!page) {
    setStatus("未找到当前页面，请确认页面列表不为空。", "error");
    return;
  }
  const { autoExpandToMaxChars = false } = options;
  const draft = ensurePageDraft(page);
  draft.onscreenContent = updateCurrentPageDraftFromEditors();
  if (!draft.onscreenContent) {
    setStatus("\u8bf7\u5148\u586b\u5199\u5f53\u524d\u9875\u7684\u6807\u9898\u6216\u6b63\u6587\u3002", "error");
    return;
  }
  const actionKey = autoExpandToMaxChars ? "repolish" : "reprepare";
  const actionButton = autoExpandToMaxChars ? el.aiRepolishPageBtn : el.repreparePageBtn;
  const signal = startCancelableAction(actionKey, actionButton, el.cancelRepreparePageBtn, autoExpandToMaxChars ? "重润中..." : "\u6574\u7406\u4e2d...");
  setStatus(
    autoExpandToMaxChars
      ? `\u6b63\u5728\u6309\u6700\u5927\u5b57\u6570 AI \u91cd\u6da6\u7b2c${page.pageNumber}\u9875...`
      : `\u6b63\u5728\u91cd\u65b0\u6574\u7406\u7b2c${page.pageNumber}\u9875...`,
    "running"
  );
  try {
    const data = await apiJson("/api/workflow/page/reprepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        apiKey: state.settings.apiKey,
        region: state.settings.region,
        jobId: state.workflowJobId,
        pageId: page.id,
        pageTitle: draft.onscreenTitle || page.pageTitle || "",
        onscreenContent: draft.onscreenContent,
        autoExpandToMaxChars,
      }),
    });
    state.workflowJob = mergeWorkflowJobWithLocalImages(data.job, state.workflowJob);
    ensureSelectedPage();
    syncPageDraftFromPage(getSelectedPage(), { force: true });
    renderPagesWorkbench();
    setStatus(
      autoExpandToMaxChars
        ? `\u7b2c${page.pageNumber}\u9875\u5df2\u6309\u6700\u5927\u5b57\u6570 AI \u91cd\u6da6\u3002`
        : `\u7b2c${page.pageNumber}\u9875\u5df2\u91cd\u65b0\u6574\u7406\u3002`,
      "success"
    );
    saveState();
  } catch (error) {
    if (isAbortError(error)) return;
    if (isMissingWorkflowJobError(error)) {
      clearWorkflowSession({ toSplit: true });
      setStatus("\u4e4b\u524d\u7684\u62c6\u5206\u4efb\u52a1\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u62c6\u5206\u3002", "error");
      return;
    }
    setStatus(
      error.message || (autoExpandToMaxChars ? "AI 一键重润失败。" : "\u91cd\u65b0\u6574\u7406\u5931\u8d25\u3002"),
      "error"
    );
  } finally {
    finishCancelableAction(actionKey);
  }
}

async function reprepareCurrentPage() {
  return submitCurrentPageReprepare();
}

async function aiRepolishCurrentPage() {
  return submitCurrentPageReprepare({ autoExpandToMaxChars: true });
}

async function copyCurrentPagePrompt() {
  const page = getSelectedPage();
  if (!page) {
    setStatus("未找到当前页面，无法复制提示词。", "error");
    return;
  }
  if (!ensureStandardWorkflowThemeReady("请先生成并确认风格，再复制标准链路提示词。")) return;
  const draft = ensurePageDraft(page);
  applyDraftPromptForGeneration(draft, getCurrentSharedPromptValue());
  draft.onscreenContent = updateCurrentPageDraftFromEditors();
  const promptTrace = page.promptTrace?.finalImage || null;
  const pageContent = String(page.onscreenContentText || page.onscreenContent || page.pageContent || "").trim();
  const promptIsCurrent = Boolean(promptTrace?.prompt)
    && String(promptTrace.pageTitle || "").trim() === String(draft.onscreenTitle || page.pageTitle || "").trim()
    && String(promptTrace.extraPrompt || "").trim() === draft.extraPrompt
    && String(promptTrace.pageStylePrompt || "").trim() === draft.pageStylePrompt
    && pageContent === String(draft.onscreenContent || "").trim();
  let prompt = promptIsCurrent ? getFinalPromptFromPage(page) : "";

  if (!prompt) {
    const requestKey = `copyPrompt:${page.id}`;
    const signal = startCancelableAction(requestKey, el.copyPagePromptBtn, null, "准备中...");
    setStatus(`正在整理第${page.pageNumber}页最终提示词...`, "running");
    try {
      const canvasImage = await exportCurrentArtboard();
      const data = await apiJson("/api/workflow/page/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          apiKey: state.settings.apiKey,
          openAiImageApiKey: state.settings.openAiImageApiKey,
          openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
          whatAiImageApiKey: state.settings.whatAiImageApiKey,
          region: state.settings.region,
          imageModel: getCurrentWorkflowImageModel(),
          jobId: state.workflowJob?.id,
          pageId: page.id,
          pageTitle: draft.onscreenTitle || page.pageTitle || "",
          sharedPrompt: draft.sharedPrompt,
          extraPrompt: draft.extraPrompt,
          pageStylePrompt: draft.pageStylePrompt,
          canvasImage,
          onscreenContent: draft.onscreenContent,
        }),
      });
      if (data.page && state.workflowJob?.pages) {
        state.workflowJob.pages = state.workflowJob.pages.map((item) => item.id === data.page.id ? data.page : item);
        state.workflowJob = sanitizeRecoveredWorkflowJob(state.workflowJob);
      }
      prompt = String(data.finalPrompt || data.page?.promptTrace?.finalImage?.prompt || "").trim();
      saveState();
    } catch (error) {
      if (isAbortError(error)) return;
      setStatus(error.message || "整理提示词失败。", "error");
      return;
    } finally {
      finishCancelableAction(requestKey);
      renderPagesWorkbench();
    }
  }

  if (!prompt) {
    setStatus("当前页还没有可复制的最终提示词。", "error");
    return;
  }
  try {
    const ok = await copyTextToClipboard(prompt);
    if (!ok) throw new Error("浏览器拒绝复制。");
    setStatus(`第${page.pageNumber}页完整提示词已复制。`, "success");
  } catch (error) {
    setStatus(error.message || "复制提示词失败。", "error");
  }
}

async function generateCurrentPage() {
  syncKeysFromDom();
  const page = getSelectedPage();
  if (!page) {
    setStatus("未找到当前页面，请先完成内容拆分。", "error");
    return;
  }
  if (!ensureStandardWorkflowThemeReady("请先生成并确认风格，再生成当前页面。")) return;
  const currentPageId = page.id;
  const currentPageNumber = page.pageNumber;

  await ensureServerConfigReady();
  const selectedImageModel = getCurrentWorkflowImageModel();
  if (usingHostedWorkflowModel() && !hasHostedImageApiKey()) {
    setStatus("请先填写生图 API Key。", "error");
    switchTab("settings");
    return;
  }
  if (!usingHostedWorkflowModel() && !hasDashScopeApiKey()) {
    setStatus("\u8bf7\u5148\u586b\u5199 DashScope / Qwen API Key\u3002", "error");
    switchTab("settings");
    return;
  }

  const draft = ensurePageDraft(page);
  applyDraftPromptForGeneration(draft, getCurrentSharedPromptValue());
  draft.onscreenContent = updateCurrentPageDraftFromEditors();
  const requestKey = getPageGenerateRequestKey(page.id);
  const signal = startCancelableAction(requestKey, el.generateCurrentPageBtn, el.cancelGenerateCurrentPageBtn, page?.generated ? "重新生成中..." : "生成中...");
  page.generationStatus = "running";
  page.generationError = "";
  renderPagesWorkbench();
  setStatus(`第${page.pageNumber}页正在生成...`, "running");
  try {
    const data = await apiJson("/api/workflow/page/generate-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        apiKey: state.settings.apiKey,
        openAiImageApiKey: state.settings.openAiImageApiKey,
        openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
        whatAiImageApiKey: state.settings.whatAiImageApiKey,
        region: state.settings.region,
        imageModel: selectedImageModel,
        jobId: state.workflowJobId,
        pageId: page.id,
        pageTitle: draft.onscreenTitle || page.pageTitle || "",
        slideAspect: state.settings.slideAspect,
        size: getWorkflowGenerationSize(),
        seed: state.settings.seed,
        sharedPrompt: draft.sharedPrompt,
        extraPrompt: draft.extraPrompt,
        pageStylePrompt: draft.pageStylePrompt,
        onscreenContent: draft.onscreenContent,
        canvasImage: "",
      }),
    });
    if (!data.page?.generated) {
      throw new Error(data.page?.generationError || "\u8fd9\u4e00\u9875\u6ca1\u6709\u62ff\u5230\u56fe\u7247\u7ed3\u679c\u3002");
    }
    state.workflowJob.pages = state.workflowJob.pages.map((item) => item.id === data.page.id ? data.page : item);
    state.workflowJob = sanitizeRecoveredWorkflowJob(state.workflowJob);
    setStatus(`\u7b2c${currentPageNumber}\u9875\u5df2\u751f\u6210\u3002`, "success");
    saveState();
  } catch (error) {
    if (isAbortError(error)) return;
    if (isMissingWorkflowJobError(error)) {
      clearWorkflowSession({ toSplit: true });
      setStatus("\u4e4b\u524d\u7684\u62c6\u5206\u4efb\u52a1\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u62c6\u5206\u3002", "error");
      return;
    }
    const current = state.workflowJob?.pages?.find((item) => item.id === currentPageId);
    if (current) {
      current.generationStatus = "error";
      current.generationError = error.message || "\u751f\u6210\u5931\u8d25\u3002";
    }
    setStatus(error.message || "\u751f\u6210\u5931\u8d25\u3002", "error");
  } finally {
    finishCancelableAction(requestKey);
    renderPagesWorkbench();
    syncCurrentPageGenerateUi();
  }
}

async function modifyCurrentPage() {
  syncKeysFromDom();
  const page = getSelectedPage();
  if (!page) {
    setStatus("未找到当前页面，请先完成内容拆分。", "error");
    return;
  }
  const draft = ensurePageDraft(page);
  draft.sharedPrompt = getCurrentSharedPromptValue();
  draft.extraPrompt = appendDrawingRemovalInstruction(draft.sharedPrompt, true);
  draft.pageStylePrompt = usingGptSimpleWorkflow()
    ? composeGptPageStylePrompt(draft.extraPrompt)
    : draft.extraPrompt;
  draft.onscreenContent = updateCurrentPageDraftFromEditors();
  if (!draft.sharedPrompt) {
    setStatus("请先填写该页提示词，再按要求修改。", "error");
    return;
  }
  if (!page.baseImage) {
    setStatus("当前页还没有可修改的底图，请先生成该页。", "error");
    return;
  }

  await ensureServerConfigReady();
  const selectedImageModel = getCurrentWorkflowImageModel();
  if (usingHostedWorkflowModel() && !hasHostedImageApiKey()) {
    setStatus("请先填写生图 API Key。", "error");
    switchTab("settings");
    return;
  }
  if (!usingHostedWorkflowModel() && !hasDashScopeApiKey()) {
    setStatus("请先填写 DashScope / Qwen API Key。", "error");
    switchTab("settings");
    return;
  }

  const requestKey = getPageGenerateRequestKey(page.id);
  const signal = startCancelableAction(requestKey, el.modifyCurrentPageBtn, el.cancelGenerateCurrentPageBtn, "修改中...");
  page.generationStatus = "running";
  page.generationError = "";
  renderPagesWorkbench();
  setStatus(`第${page.pageNumber}页正在按提示词修改...`, "running");
  try {
    const canvasImage = await exportCurrentArtboard();
    const data = await apiJson("/api/workflow/page/generate-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        apiKey: state.settings.apiKey,
        openAiImageApiKey: state.settings.openAiImageApiKey,
        openAiImageBaseUrl: state.settings.openAiImageBaseUrl,
        whatAiImageApiKey: state.settings.whatAiImageApiKey,
        region: state.settings.region,
        imageModel: selectedImageModel,
        jobId: state.workflowJobId,
        pageId: page.id,
        pageTitle: draft.onscreenTitle || page.pageTitle || "",
        slideAspect: state.settings.slideAspect,
        size: getWorkflowGenerationSize(),
        seed: state.settings.seed,
        promptMode: "modify-only",
        sharedPrompt: draft.sharedPrompt,
        extraPrompt: draft.extraPrompt,
        pageStylePrompt: draft.pageStylePrompt,
        onscreenContent: draft.onscreenContent,
        canvasImage,
      }),
    });
    if (!data.page?.generated) {
      throw new Error(data.page?.generationError || "这一页没有拿到图片结果。");
    }
    state.workflowJob.pages = state.workflowJob.pages.map((item) => item.id === data.page.id ? data.page : item);
    state.workflowJob = sanitizeRecoveredWorkflowJob(state.workflowJob);
    setStatus(`第${page.pageNumber}页已按要求修改。`, "success");
    saveState();
  } catch (error) {
    if (isAbortError(error)) return;
    if (isMissingWorkflowJobError(error)) {
      clearWorkflowSession({ toSplit: true });
      setStatus("之前的拆分任务已失效，请重新拆分。", "error");
      return;
    }
    const current = state.workflowJob?.pages?.find((item) => item.id === page.id);
    if (current) {
      current.generationStatus = "error";
      current.generationError = error.message || "修改失败。";
    }
    setStatus(error.message || "修改失败。", "error");
  } finally {
    finishCancelableAction(requestKey);
    renderPagesWorkbench();
    syncCurrentPageGenerateUi();
  }
}

function initialize() {
  cacheElements();
  loadState();
  state.workflowJob = sanitizeRecoveredWorkflowJob(state.workflowJob);
  refreshServerConfig();
  applyStateToUi();
  renderPreferenceSummary();
  renderSplitPresets();
  renderReferenceFiles();
  renderHistoryProjects();
  updateThemeView();
  ensureSelectedPage();
  renderPagesWorkbench();
  renderRevise();
  switchTab(state.activeTab);
  switchSmartStep(state.smartStep);
  upgradeSmartUiLayout();
  renderPagesWorkbench();
  bindEvents();
  attachEnhancedPageEditorEvents();
  el.workflowTargetChars?.addEventListener("change", () => {
    state.workflowTargetChars = clamp(Number(el.workflowTargetChars.value || 0), 0, 300);
    if (state.workflowTargetChars && state.workflowMaxChars && state.workflowTargetChars > state.workflowMaxChars) {
      state.workflowTargetChars = state.workflowMaxChars;
      el.workflowTargetChars.value = String(state.workflowTargetChars);
    }
    saveState();
  });
  el.workflowMaxChars?.addEventListener("change", () => {
    state.workflowMaxChars = clamp(Number(el.workflowMaxChars.value || 200), 0, 400);
    if (aiProcessingModeUsesExpansion(state.aiProcessingMode) && state.workflowTargetChars && state.workflowMaxChars && state.workflowTargetChars > state.workflowMaxChars) {
      state.workflowTargetChars = state.workflowMaxChars;
      if (el.workflowTargetChars) el.workflowTargetChars.value = String(state.workflowTargetChars);
    }
    saveState();
  });
  setupPageDrawingInteractions();
  renderArtboard();
  updatePageDrawToolbar();
  setupReviseCanvasInteractions();
  syncWorkflowJobOnce();
  if (state.workflowJobId && state.workflowJob?.status !== "ready") {
    startWorkflowPolling();
  }
}

document.addEventListener("DOMContentLoaded", initialize);

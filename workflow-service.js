const crypto = require("crypto");

const WORKFLOW_ASSISTANT_MODEL = "qwen3.6-plus";
const DEFAULT_LIGHTWEIGHT_ASSISTANT_MODEL = "qwen-turbo-latest";
const WORKFLOW_IMAGE_MODEL = "gpt-image-2";
const OPENAI_WORKFLOW_IMAGE_MODELS = new Set([
  "gpt-image-2",
]);
const DEFAULT_REGION = "beijing";
const DEFAULT_DECORATION_LEVEL = "medium";
const WORKFLOW_FIXED_PROMPT = [
  "你是一位国际一流的学术PPT设计大师，杂志编辑风/平面设计大师，红点设计奖，精通从内容提炼、逻辑梳理、排版设计到配图的全流程PPT设计。",
  "根据以上内容设计一页PPT。要求内部逻辑清晰、重点突出。字体采用相应字体，按照需要加粗或艺术化，一页不超两种字体。标题与正文字体大小越1:0.618，黄金比例。对比度足够，确保易读性。视觉效果通透美观。你擅长为内容配图，搭配的图片中，照片真实，测试结果图片准确无误，说明图简洁凝练清晰。",
].join("\n");
const CONSTANTS_RULES = [
  "整份演示遵循对比、重复、对齐、亲密四项排版原则。",
  "文字区保持清晰底色、稳定对比和明确层级。",
  "装饰、材质和背景纹理服务阅读节奏，阅读区保持干净。",
  "每页使用统一网格、精确对齐和清晰分组。",
].join(" ");

const PAGE_TYPE_LABELS = {
  cover: "封面页",
  catalog: "目录页",
  chapter: "章节页",
  content: "内容页",
  data: "数据页",
};

const PAGE_MODULE_NAMES = {
  cover: "封面模块",
  catalog: "目录模块",
  chapter: "章节模块",
  content: "内容模块",
  data: "数据模块",
};

const DENSITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  "very-high": "很高",
  minimal: "低",
  balanced: "中",
  standard: "中",
  dense: "高",
};

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
  styleMode: { business: "商务汇报感", academic: "学术研究感", creative: "创意表达感" },
  layoutVariety: { uniform: "版式统一稳态", balanced: "版式适度变化", diverse: "版式变化明显" },
  detailLevel: { minimal: "装饰极简克制", polished: "装饰精致均衡", rich: "装饰细节丰富" },
  visualDensity: { airy: "留白更充足", balanced: "疏密更均衡", dense: "信息更饱满" },
  compositionFocus: { imageLead: "视觉主导", balanced: "图文均衡", textLead: "文字主导" },
  dataNarrative: { clean: "数据清晰直给", balanced: "图表适度增强", expressive: "数据冲击更强" },
  pageMood: { steady: "稳重专业", modern: "现代清晰", dramatic: "冲击更强" },
};

const PREFERENCE_PROMPT_KEYS = {
  styleMode: "风格基调",
  layoutVariety: "版式变化",
  detailLevel: "装饰细节",
  visualDensity: "画面疏密",
  compositionFocus: "图文重心",
  dataNarrative: "数据表现",
  pageMood: "整体气质",
};

const DECORATION_LEVELS = {
  plain: "朴素",
  medium: "中等",
  complex: "复杂",
};

const AI_PROCESSING_MODES = {
  strict: "原汁原味",
  balanced: "适度润色",
  creative: "深度扩写",
};

const workflowJobs = new Map();

function getWorkflowStyleModel() {
  return String(process.env.WORKFLOW_STYLE_MODEL || process.env.QWEN_LIGHTWEIGHT_MODEL || DEFAULT_LIGHTWEIGHT_ASSISTANT_MODEL).trim();
}

function getWorkflowJitModel() {
  return String(process.env.WORKFLOW_JIT_MODEL || process.env.QWEN_LIGHTWEIGHT_MODEL || DEFAULT_LIGHTWEIGHT_ASSISTANT_MODEL).trim();
}

function getWorkflowAssistantModel() {
  return String(process.env.WORKFLOW_ASSISTANT_MODEL || WORKFLOW_ASSISTANT_MODEL).trim() || WORKFLOW_ASSISTANT_MODEL;
}

function modelSupportsImageInputs(model) {
  const normalized = String(model || "").trim().toLowerCase();
  return /(?:qwen3\.6|qwen3\.5|qwen3-vl|qwen2\.5-vl|qwen-vl|qwen3-omni|qwen-omni|qvq|vision|omni|vl|ocr)/i.test(normalized);
}

function stringifyStructuredField(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => stringifyStructuredField(item)).filter(Boolean).join("\n").trim();
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const text = stringifyStructuredField(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function normalizeContentKey(input) {
  return String(input || "").replace(/[\s_-]+/g, "").toLowerCase();
}

function splitPageContentBuckets(value) {
  const source = stringifyStructuredField(value)
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  if (!source) {
    return {
      onscreenContentText: "",
      visualElementsPrompt: "",
      visualElementsDisplay: "",
    };
  }

  const visualKeySet = new Set([
    "visual",
    "visualelement",
    "visualelements",
    "visualhint",
    "visualhints",
    "visualsuggestion",
    "visualsuggestions",
    "designnote",
    "designnotes",
    "layoutnote",
    "layoutnotes",
    "compositionnote",
    "compositionnotes",
    "artdirection",
  ]);
  const wrapperKeySet = new Set(["blocks", "items", "points", "entries", "sections"]);
  const hiddenKeySet = new Set(["type", "highlight", "index", "order", "sort", "priority"]);
  const chineseVisualPrefix = /^(?:视觉元素|视觉建议|画面建议|设计说明|版式说明|构图说明|画面说明|视觉)\s*[:：]\s*(.*)$/i;
  const chineseTextPrefix = /^(?:标题|副标题|补充信息|摘要|正文|内容)\s*[:：]\s*(.*)$/i;
  const visualHeuristics = [
    /(?:页面|本页|画面).{0,8}(?:采用|使用|适合|建议).{0,16}(?:布局|排版|构图|网格|Bento|卡片)/i,
    /(?:左文右图|右文左图|上文下图|上图下文|三栏|四宫格|时间轴|网格|卡片化|分栏|分块|图表化)/i,
    /(?:右下角|左上角|居中突出|黄金分割|背景装饰|作为背景|视觉焦点|主视觉)/i,
    /用.+(?:图标|示意图|结构图|流程图|时间轴|图表|插画|配图)/i,
  ];
  const textLines = [];
  const visualLines = [];

  const pushUnique = (target, text) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (target[target.length - 1] === clean) return;
    target.push(clean);
  };

  source.split(/\r?\n+/).forEach((rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return;

    const visualMatch = line.match(chineseVisualPrefix);
    if (visualMatch) {
      pushUnique(visualLines, visualMatch[1] || "");
      return;
    }

    const textMatch = line.match(chineseTextPrefix);
    if (textMatch) {
      pushUnique(textLines, textMatch[1] || "");
      return;
    }

    const match = line.match(/^([A-Za-z_][\w-]*)\s*[:：]\s*(.*)$/);
    if (!match) {
      if (visualHeuristics.some((pattern) => pattern.test(line))) {
        pushUnique(visualLines, line);
        return;
      }
      pushUnique(textLines, line);
      return;
    }

    const key = normalizeContentKey(match[1]);
    const content = String(match[2] || "").trim();
    if (visualKeySet.has(key)) {
      pushUnique(visualLines, content);
      return;
    }
    if (wrapperKeySet.has(key) || hiddenKeySet.has(key)) {
      return;
    }
    if (visualHeuristics.some((pattern) => pattern.test(content || line))) {
      pushUnique(visualLines, content || line);
      return;
    }
    pushUnique(textLines, content || line);
  });

  return {
    onscreenContentText: textLines.join("\n").trim(),
    visualElementsPrompt: visualLines.join("\n").trim(),
    visualElementsDisplay: visualLines.join("\n").trim(),
  };
}

function normalizeVisualElements(value) {
  return splitPageContentBuckets(value).visualElementsPrompt;
}

function normalizeOnscreenContent(value) {
  return splitPageContentBuckets(value).onscreenContentText;
}

function stripMarkdownCodeFence(text) {
  const source = String(text || "").trim();
  if (source.startsWith("```")) {
    return source.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  return source;
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

function extractAssistantMessageText(response) {
  const content = response?.output?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item?.text === "string") return item.text;
      return "";
    })
    .join("\n")
    .trim();
}

function installWorkflowRoutes(app, deps) {
  const {
    resolveRegion,
    parseJsonResponse,
    requestJsonViaFetch,
    requestOpenAiImageGenerate,
    resolveDashScopeApiKey = (value) => String(value || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "").trim(),
    resolveOpenAiImageApiKey = (value) => String(value || process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || "").trim(),
    resolveWhatAiImageApiKey = (value) => String(value || process.env.WHATAI_IMAGE_API_KEY || process.env.WHATAI_API_KEY || "").trim(),
    parseDataUrl,
    loadReferenceAssetAsDataUrl,
  } = deps;

  const requestJson = requestJsonViaFetch || (async ({ url, method = "POST", headers = {}, body }) => {
    const response = await fetch(url, { method, headers, body });
    return parseJsonResponse(response);
  });

  async function callAssistant(apiKey, region, payload) {
    const parsed = await requestJson({
      method: "POST",
      url: `${resolveRegion(region || DEFAULT_REGION)}/api/v1/services/aigc/multimodal-generation/generation`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!parsed.ok || parsed.data?.code) {
      throw new Error(parsed.data?.message || "Qwen 调用失败。");
    }
    const text = extractAssistantMessageText(parsed.data);
    if (!text) throw new Error("Qwen 返回为空。");
    return { data: parsed.data, text };
  }

  async function callCompatibleChatJson(apiKey, region, { model, systemPrompt, userPrompt, temperature }) {
    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    };
    if (Number.isFinite(Number(temperature))) {
      body.temperature = Number(temperature);
    }
    const parsed = await requestJson({
      method: "POST",
      url: buildChatCompletionsUrl(region || DEFAULT_REGION),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!parsed.ok || parsed.data?.code || parsed.data?.error) {
      throw new Error(parsed.data?.error?.message || parsed.data?.message || "Qwen compatible chat 调用失败。");
    }
    const text = extractChatCompletionText(parsed.data);
    if (!text) throw new Error("Qwen compatible chat 返回为空。");
    return { data: parsed.data, text };
  }

  function buildAssistantPayload(systemPrompt, userPrompt, options = {}) {
    const model = String(options.model || getWorkflowAssistantModel()).trim() || WORKFLOW_ASSISTANT_MODEL;
    const imageDataUrls = modelSupportsImageInputs(model) && Array.isArray(options.imageDataUrls)
      ? options.imageDataUrls.filter(Boolean)
      : [];
    const payload = {
      model,
      input: {
        messages: [
          { role: "system", content: [{ text: systemPrompt }] },
          {
            role: "user",
            content: [
              ...imageDataUrls.map((image) => ({ image })),
              { text: userPrompt },
            ],
          },
        ],
      },
      parameters: {
        result_format: "message",
        response_format: { type: "json_object" },
        enable_thinking: false,
      },
    };
    if (Number.isFinite(Number(options.temperature))) {
      payload.parameters.temperature = Number(options.temperature);
    }
    return payload;
  }

  async function runAssistantJsonObject(apiKey, region, systemPrompt, userPrompt, moduleName, options = {}) {
    const payload = buildAssistantPayload(systemPrompt, userPrompt, options);
    const transport = options.transport || (modelSupportsImageInputs(payload.model) ? "dashscope-multimodal" : "compatible-chat");
    const { text } = transport === "compatible-chat"
      ? await callCompatibleChatJson(apiKey, region, {
        model: payload.model,
        systemPrompt,
        userPrompt,
        temperature: options.temperature,
      })
      : await callAssistant(apiKey, region, payload);
    const parsed = safeParseJsonObject(text);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`${moduleName} 返回的 JSON 无法解析。`);
    }
    return { payload, text, parsed };
  }

  function buildResponsesUrl(region) {
    return `${resolveRegion(region || DEFAULT_REGION)}/compatible-mode/v1/responses`;
  }

  function buildChatCompletionsUrl(region) {
    return `${resolveRegion(region || DEFAULT_REGION)}/compatible-mode/v1/chat/completions`;
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

  function extractChatCompletionText(data) {
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : "";
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

  async function repairResearchOutputAsJson({ apiKey, region, rawText }) {
    const parsed = await requestJson({
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
              "你是 JSON 修复助手。",
              "只返回有效 JSON。",
              "输出保持纯 JSON 文本。",
              "保留输入含义，并整理为目标结构。",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "把下面的联网补充结果转换成 JSON。",
              "JSON 结构：",
              "{\"summary\":\"string\",\"candidates\":[{\"text\":\"string\",\"why\":\"string\",\"sources\":[{\"title\":\"string\",\"url\":\"https://...\"}]}]}",
              "没有有效候选内容时，返回空 candidates 数组。",
              "输入：",
              String(rawText || ""),
            ].join("\n"),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "workflow_research_supplements",
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
          message: "联网补充结果修复后仍无法解析为 JSON。",
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

  async function runExpansionResearch(apiKey, region, page, referenceDigest) {
    const prompt = [
      "你是用于演示文稿单页写作的轻量联网研究助手。",
      "联网检索聚焦当前页面的精确主题。",
      "请为扩展这一页提出零到四条事实补充。",
      "每条补充都需要有来源支撑，并适合人工审核后写入幻灯片。",
      "用户已有文字保持原意；补充内容基于可核验来源。",
      "优先选择简洁里程碑事实、参数范围、短定义、代表性应用或简短对比点。",
      "候选文字使用简体中文并保持简短。",
      "没有可靠补充时，返回空 candidates 数组。",
      "只返回纯 JSON。",
      "JSON 结构：",
      "{\"summary\":\"...\",\"candidates\":[{\"text\":\"...\",\"why\":\"...\",\"sources\":[{\"title\":\"...\",\"url\":\"https://...\"}]}]}",
      "",
      `page_type: ${String(page?.pageType || "content")}`,
      page?.pageTitle ? `page_title: ${String(page.pageTitle).slice(0, 200)}` : "",
      page?.pageContent ? `page_content: ${String(page.pageContent).slice(0, 1600)}` : "",
      referenceDigest?.summary ? `reference_summary: ${String(referenceDigest.summary).slice(0, 1200)}` : "",
      referenceDigest?.usableFacts?.length ? `reference_facts:\n${referenceDigest.usableFacts.slice(0, 12).join("\n")}` : "",
    ].filter(Boolean).join("\n");

    const parsed = await requestJson({
      method: "POST",
      url: buildResponsesUrl(region),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        input: prompt,
        tools: [{ type: "web_search" }],
        enable_thinking: false,
      }),
    });
    if (!parsed.ok) {
      throw new Error(parsed.data?.message || "联网扩写检索失败。");
    }

    const upstreamError = extractResponsesError(parsed.data);
    if (upstreamError) {
      throw new Error(upstreamError);
    }

    const outputText = extractResponsesOutputText(parsed.data);
    let parsedJson = safeParseJsonObject(outputText);
    let normalizedRaw = outputText || parsed.data;

    if (!parsedJson || typeof parsedJson !== "object") {
      const repaired = await repairResearchOutputAsJson({
        apiKey,
        region,
        rawText: outputText || JSON.stringify(parsed.data),
      });
      if (repaired.ok) {
        parsedJson = repaired.data;
        normalizedRaw = repaired.raw || normalizedRaw;
      }
    }

    const candidates = normalizeResearchCandidates(parsedJson?.candidates);
    return {
      summary: String(parsedJson?.summary || "").trim(),
      candidates,
      raw: normalizedRaw,
    };
  }

  function normalizePreferenceValue(key, value) {
    const normalized = String(value || "").trim();
    return Object.prototype.hasOwnProperty.call(PREFERENCE_LABELS[key] || {}, normalized)
      ? normalized
      : DEFAULT_PREFERENCES[key];
  }

  function normalizePreferences(preferences = {}) {
    return {
      styleMode: normalizePreferenceValue("styleMode", preferences.styleMode),
      layoutVariety: normalizePreferenceValue("layoutVariety", preferences.layoutVariety),
      detailLevel: normalizePreferenceValue("detailLevel", preferences.detailLevel),
      visualDensity: normalizePreferenceValue("visualDensity", preferences.visualDensity),
      compositionFocus: normalizePreferenceValue("compositionFocus", preferences.compositionFocus),
      dataNarrative: normalizePreferenceValue("dataNarrative", preferences.dataNarrative),
      pageMood: normalizePreferenceValue("pageMood", preferences.pageMood),
    };
  }

  function normalizeDecorationLevel(level) {
    const normalized = String(level || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DECORATION_LEVELS, normalized) ? normalized : DEFAULT_DECORATION_LEVEL;
  }

function getDecorationLevelLabel(level) {
  return DECORATION_LEVELS[normalizeDecorationLevel(level)];
}

function normalizeAiProcessingMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["strict", "balanced", "creative"].includes(normalized) ? normalized : "balanced";
}

function getAiProcessingModeLabel(value) {
  return AI_PROCESSING_MODES[normalizeAiProcessingMode(value)];
}

  function buildPreferencePromptPairs(preferences = DEFAULT_PREFERENCES) {
    const normalized = normalizePreferences(preferences);
    return [
      `${PREFERENCE_PROMPT_KEYS.styleMode}=${PREFERENCE_LABELS.styleMode[normalized.styleMode]}`,
      `${PREFERENCE_PROMPT_KEYS.layoutVariety}=${PREFERENCE_LABELS.layoutVariety[normalized.layoutVariety]}`,
      `${PREFERENCE_PROMPT_KEYS.detailLevel}=${PREFERENCE_LABELS.detailLevel[normalized.detailLevel]}`,
      `${PREFERENCE_PROMPT_KEYS.visualDensity}=${PREFERENCE_LABELS.visualDensity[normalized.visualDensity]}`,
      `${PREFERENCE_PROMPT_KEYS.compositionFocus}=${PREFERENCE_LABELS.compositionFocus[normalized.compositionFocus]}`,
      `${PREFERENCE_PROMPT_KEYS.dataNarrative}=${PREFERENCE_LABELS.dataNarrative[normalized.dataNarrative]}`,
      `${PREFERENCE_PROMPT_KEYS.pageMood}=${PREFERENCE_LABELS.pageMood[normalized.pageMood]}`,
    ];
  }

function buildPreferencePromptBlock(preferences) {
  return [
    "【问卷风格锚点】",
    ...buildPreferencePromptPairs(preferences),
  ].join("\n");
}

const THEME_IMPLEMENTATION_KEYWORD_PATTERN = /(优设标题黑|MiSans|思源黑体|JetBrains Mono|Helvetica(?:\s+Now)?|Inter(?:\s+Display)?|DIN|Heavy|Bold|Regular|Light|0\.618|黄金比例|pt\b|px\b|12列|12-column|12 column|R=\d+\s*px)/i;
const THEME_IMPLEMENTATION_FRAGMENT_PATTERNS = [
  /字重对比[^；。！!\n|]*/gi,
  /无衬线[^；。！!\n|]*?(?:优设标题黑|MiSans|思源黑体|JetBrains Mono|Helvetica(?:\s+Now)?|Inter(?:\s+Display)?|DIN)[^；。！!\n|]*/gi,
  /标题与正文(?:字体大小|字号)[^；。！!\n|]*?(?:0\.618|黄金比例)[^；。！!\n|]*/gi,
  /(?:中文|英文|技术参数)[:：]?\s*[^；。！!\n|]*?(?:优设标题黑|MiSans|思源黑体|JetBrains Mono|Helvetica(?:\s+Now)?|Inter(?:\s+Display)?|DIN)[^；。！!\n|]*/gi,
];

function sanitizeDirectionalThemeText(text) {
  let value = stringifyStructuredField(text || "");
  if (!value) return "";
  let removedTypographyImplementation = false;
  value = value.replace(/\s*\|\s*/g, "；");
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

function buildThemeDefinitionBlock(themeDefinition) {
  if (!themeDefinition) return "";
  return [
      "【全局主题模板】",
      themeDefinition.basic ? `基础风格：${themeDefinition.basic}` : "",
      themeDefinition.cover ? `封面模块：${themeDefinition.cover}` : "",
      themeDefinition.catalog ? `目录模块：${themeDefinition.catalog}` : "",
      themeDefinition.chapter ? `章节模块：${themeDefinition.chapter}` : "",
      themeDefinition.content ? `内容模块：${themeDefinition.content}` : "",
      themeDefinition.data ? `数据模块：${themeDefinition.data}` : "",
      themeDefinition.decorationLevel ? `装饰强度：${getDecorationLevelLabel(themeDefinition.decorationLevel)}` : "",
    ].filter(Boolean).join("\n");
  }

  function buildHardConstraintBlock() {
    return [
      "【硬约束】",
      "内容依据用户主文本和参考材料明确支持的信息组织。",
      "装饰使用无字图形、纹理、容器、线条、光效和图标，服务页面阅读。",
      "页面主标题与页面主正文保持明显层级差，建议约 1.5-2 倍；二级和三级标题只做温和层级差。",
      "一整页内容按分栏、分块、卡片化或图表化组织，保留留白与可读性。",
      "最终画面呈现为可直接用于演示文稿的单页幻灯片。",
    ].join("\n");
  }

  function countCharacters(text) {
    const source = String(text || "").replace(/\s+/g, "");
    let total = 0;
    for (const char of source) {
      if (/[\u4e00-\u9fff]/u.test(char)) {
        total += 1;
      } else if (/[A-Za-z]/.test(char)) {
        total += 0.45;
      } else if (/[0-9]/.test(char)) {
        total += 0.4;
      } else {
        total += 0.2;
      }
    }
    return Math.round(total);
  }

  function normalizeReferenceFiles(referenceFiles = []) {
    return Array.isArray(referenceFiles)
      ? referenceFiles
        .map((item) => ({
          id: String(item?.id || crypto.randomUUID()),
          name: String(item?.name || "").trim(),
          category: String(item?.category || "").trim(),
          size: Number(item?.size || 0),
          parseStatus: String(item?.parseStatus || "").trim(),
          parseNote: String(item?.parseNote || "").trim(),
          extractedText: String(item?.extractedText || "").trim(),
          previewText: String(item?.previewText || "").trim(),
          assetId: String(item?.assetId || "").trim(),
          assetFileName: String(item?.assetFileName || "").trim(),
          previewUrl: String(item?.previewUrl || "").trim(),
          mimeType: String(item?.mimeType || "").trim(),
          includeInSplit: item?.includeInSplit !== false,
        }))
        .filter((item) => item.name)
      : [];
  }

  async function loadReferenceImageDataUrls(referenceFiles = []) {
    if (typeof loadReferenceAssetAsDataUrl !== "function") return [];
    const imageFiles = referenceFiles
      .filter((file) => file.category === "image" && (file.assetFileName || file.previewUrl) && (!file.size || file.size <= 8 * 1024 * 1024))
      .slice(0, 6);
    const loaded = await Promise.allSettled(
      imageFiles.map((file) => loadReferenceAssetAsDataUrl(file)),
    );
    return loaded
      .filter((item) => item.status === "fulfilled" && item.value)
      .map((item) => item.value);
  }

  function buildReferenceDigestInput(mainText, referenceFiles) {
    const lines = ["【用户主文本】", mainText, "", "【参考材料】"];
    referenceFiles.forEach((file, index) => {
      lines.push(`文件 ${index + 1}：${file.name}（${file.category || "unknown"}）`);
      if (file.category === "image") {
        lines.push("视觉参考图片：请只提取风格、材质、构图、颜色和主题物体线索，不要做 OCR，不要臆造图片中没有的信息。");
      } else {
        lines.push(file.extractedText || file.previewText || "");
      }
      lines.push("");
    });
    return lines.join("\n");
  }

function normalizeThemeDefinition(result, fallbackThemeName, decorationLevel, preferences) {
  const normalized = {
    displaySummaryZh: sanitizeDirectionalThemeText(result?.displaySummaryZh || ""),
    basic: sanitizeDirectionalThemeText(result?.basic || ""),
    cover: sanitizeDirectionalThemeText(result?.cover || ""),
    catalog: sanitizeDirectionalThemeText(result?.catalog || ""),
    chapter: sanitizeDirectionalThemeText(result?.chapter || ""),
    content: sanitizeDirectionalThemeText(result?.content || ""),
    data: sanitizeDirectionalThemeText(result?.data || ""),
    decorationLevel: normalizeDecorationLevel(decorationLevel),
    preferences,
    themeName: String(fallbackThemeName || "").trim(),
  };
    if (!normalized.displaySummaryZh) {
      normalized.displaySummaryZh = [
        fallbackThemeName ? `主题：${fallbackThemeName}` : "",
        normalized.basic ? `基础风格：${normalized.basic}` : "",
        normalized.catalog ? `目录页：${normalized.catalog}` : "",
        normalized.chapter ? `章节页：${normalized.chapter}` : "",
        normalized.content ? `内容页：${normalized.content}` : "",
      ].filter(Boolean).join("\n");
    }
    return normalized;
  }

  function normalizeThemeBasicDefinition(result, fallbackThemeName, decorationLevel, preferences) {
    const normalized = normalizeThemeDefinition(result, fallbackThemeName, decorationLevel, preferences);
    normalized.cover = "";
    normalized.catalog = "";
    normalized.chapter = "";
    normalized.content = "";
    normalized.data = "";
    if (!normalized.displaySummaryZh) {
      normalized.displaySummaryZh = normalized.basic || (fallbackThemeName ? `主题：${fallbackThemeName}` : "已生成全局 Basic 风格。");
    }
    return normalized;
  }

  function normalizePageType(value, index) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["cover", "catalog", "chapter", "content", "data"].includes(normalized)) return normalized;
    return index === 0 ? "cover" : "content";
  }

  function normalizeSplitRisk(value, estimatedChars) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["low", "medium", "high"].includes(normalized)) return normalized;
    if (estimatedChars > 250) return "high";
    if (estimatedChars > 200) return "medium";
    return "low";
  }

  function normalizeContentBand(value, fallbackText = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (["minimal", "balanced", "standard", "dense"].includes(normalized)) return normalized;
    const count = countCharacters(fallbackText);
    if (count < 50) return "minimal";
    if (count <= 150) return "balanced";
    if (count <= 250) return "standard";
    return "dense";
  }

  function normalizePagePlan(pagePlan = [], decorationLevel) {
    return (Array.isArray(pagePlan) ? pagePlan : [])
      .map((item, index) => {
        const pageContent = stringifyStructuredField(item?.pageContent || item?.page_content || "");
        const estimatedChars = Number(item?.estimatedChars || item?.estimated_chars || countCharacters(pageContent));
        return {
          id: crypto.randomUUID(),
          pageNumber: Number(item?.pageNumber || item?.page_number || index + 1),
          pageType: normalizePageType(item?.pageType || item?.page_type, index),
          pageTitle: stringifyStructuredField(item?.pageTitle || item?.page_title || `第 ${index + 1} 页`),
          pageContent,
          sectionTopic: stringifyStructuredField(item?.sectionTopic || item?.section_topic || ""),
          estimatedChars,
          splitRisk: normalizeSplitRisk(item?.splitRisk || item?.split_risk, estimatedChars),
          recommendedBand: normalizeContentBand(item?.recommendedBand || item?.recommended_band, pageContent),
          decorationLevel: normalizeDecorationLevel(item?.decorationLevel || decorationLevel),
        };
      })
      .filter((page) => page.pageTitle || page.pageContent);
  }

  function buildEmptyQualityResult() {
    return {
      pass: true,
      severity: "low",
      issues: [],
      suggestions: [],
      metrics: {
        charCount: 0,
        estimatedMinFont: 18,
        contrastRisk: "manual-check",
        whitespaceBand: "balanced",
        fontFamilyCount: 1,
      },
      checklist: "",
    };
  }

  function createWorkflowPage(rawPage) {
    return {
      ...rawPage,
      splitDone: true,
      prepareDone: false,
      readyToGenerate: false,
      generated: false,
      generationStatus: "idle",
      generationError: "",
      onscreenContent: "",
      onscreenContentText: "",
      visualElementsPrompt: "",
      visualElementsDisplay: "",
      contentBand: rawPage.recommendedBand || "balanced",
      layoutInstruction: "",
      layoutMapping: null,
      jitDecoration: null,
      overflowFlag: false,
      overflowReason: "",
      revisionHint: "",
      layoutSummary: "",
      textHierarchy: "",
      visualFocus: "",
      readabilityNotes: "",
      pagePrompt: "",
      qualityResult: buildEmptyQualityResult(),
      qualityPass: false,
      riskLevel: rawPage.splitRisk === "high" ? "high" : rawPage.splitRisk === "medium" ? "medium" : "none",
      riskReason: rawPage.splitRisk === "high" ? "拆分阶段已标记为高风险页。" : "",
      extraPrompt: "",
      baseImage: "",
      resultImages: [],
      promptTrace: {},
    };
  }

  function preparePageForGeneration(job, page, source = "split") {
    const separatedContent = splitPageContentBuckets(page.onscreenContent || page.onscreenContentText || page.pageContent || page.pageTitle || "");
    const cleanOnscreenContent = separatedContent.onscreenContentText;
    const visualElementsPrompt = separatedContent.visualElementsPrompt;
    const charCount = countCharacters(cleanOnscreenContent);

    page.onscreenContent = cleanOnscreenContent;
    page.onscreenContentText = cleanOnscreenContent;
    page.visualElementsPrompt = visualElementsPrompt;
    page.visualElementsDisplay = separatedContent.visualElementsDisplay;
    page.contentBand = normalizeContentBand(page.contentBand || page.recommendedBand, cleanOnscreenContent);
    page.layoutMapping = deriveLayoutMapping(page, cleanOnscreenContent);
    page.layoutInstruction = page.layoutMapping.instruction;
    page.jitDecoration = null;
    page.pageTypePromptModule = null;
    page.overflowFlag = charCount > 250;
    page.overflowReason = page.overflowFlag
      ? `当前页内容约 ${charCount} 字（按中英数字加权估算），建议关注页面密度。`
      : "";
    page.revisionHint = page.overflowFlag
      ? "如果你接受当前信息密度，可以直接生成；如果想更清爽，再手动精简。"
      : "";
    page.layoutSummary = "";
    page.textHierarchy = "";
    page.visualFocus = "";
    page.readabilityNotes = "";
    page.pagePrompt = "";
    page.qualityResult = {
      ...buildEmptyQualityResult(),
      metrics: {
        charCount,
        estimatedMinFont: 18,
        contrastRisk: "disabled",
        whitespaceBand: page.contentBand,
        fontFamilyCount: 1,
      },
      checklist: "已停用自动质检，当前只保留排版风险提醒。",
    };
    page.qualityPass = true;
    page.prepareDone = true;
    page.readyToGenerate = true;
    page.promptTrace.simplifiedPrepare = {
      mode: "local",
      source,
      strategy: "normalize-onscreen-only",
      imagePromptStrategy: "basic + pageTypeTemplate + languageInstruction + onscreenContent",
      quality: "disabled",
      layout: "disabled",
      layoutMapping: page.layoutMapping,
      onscreenContent: cleanOnscreenContent,
      visualElementsPrompt,
    };
    page.riskLevel = deriveRiskLevel(page);
    page.riskReason = deriveRiskReason(page);
  }

  function createWorkflowJob(options) {
    const pages = options.pages.map((page) => createWorkflowPage(page));
    const job = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "running",
      userStage: "pages",
      statusText: "正在拆分并准备页面...",
      totalPages: pages.length,
      preparedPages: 0,
      failedPages: 0,
      readyToGeneratePages: 0,
      currentPageNumber: 0,
      documentSummary: options.documentSummary || "",
      splitDiagnostics: options.splitDiagnostics || "",
      referenceDigest: options.referenceDigest || null,
      themeDefinition: options.themeDefinition,
      preferences: options.preferences,
      aiProcessingMode: normalizeAiProcessingMode(options.aiProcessingMode),
      splitPreset: options.splitPreset || "",
        promptTrace: {
          themeCore: options.themeTrace || null,
          referenceDigest: options.referenceTrace || null,
          splitPlan: options.splitTrace || null,
          expansionPlan: options.expansionTrace || null,
          lengthControlPlan: options.expansionTrace || null,
        },
      pages,
      errors: [],
    };
    workflowJobs.set(job.id, job);
    return job;
  }

  function refreshJobProgress(job) {
    const runningStaleAfterMs = 30 * 60 * 1000;
    const now = Date.now();
    job.pages.forEach((page) => {
      if (!page.prepareDone) return;
      page.onscreenContent = normalizeOnscreenContent(page.onscreenContent);
      page.onscreenContentText = page.onscreenContent;
      page.visualElementsPrompt = normalizeVisualElements(page.visualElementsPrompt || page.pageContent || "");
      page.visualElementsDisplay = page.visualElementsPrompt;
      if (page.generationStatus === "running") {
        const startedAt = Date.parse(page.generationStartedAt || "");
        const isStale = Number.isFinite(startedAt) && now - startedAt > runningStaleAfterMs;
        if (page.generated) page.generationStatus = "done";
        else if (isStale) page.generationStatus = "idle";
      }
      page.readyToGenerate = true;
      page.riskLevel = deriveRiskLevel(page);
      page.riskReason = deriveRiskReason(page);
    });
    job.updatedAt = new Date().toISOString();
    job.preparedPages = job.pages.filter((page) => page.prepareDone).length;
    job.failedPages = job.pages.filter((page) => page.generationStatus === "error").length;
    job.readyToGeneratePages = job.pages.filter((page) => page.readyToGenerate).length;
    if (job.preparedPages >= job.totalPages) {
      job.status = "ready";
      job.statusText = job.pages.some((page) => page.riskLevel !== "none")
        ? `页面准备完成，${job.readyToGeneratePages} 页都可以生成，风险页会继续保留提醒。`
        : `页面准备完成，${job.readyToGeneratePages} 页都可以生成。`;
    }
  }

  function publicJobSnapshot(job) {
    const publicPages = job.pages.map((page) => ({
      ...page,
      baseImage: String(page.baseImage || "").startsWith("data:") ? "" : page.baseImage,
      resultImages: Array.isArray(page.resultImages)
        ? page.resultImages.filter((item) => !String(item || "").startsWith("data:"))
        : [],
    }));
    return {
      id: job.id,
      status: job.status,
      userStage: job.userStage,
      statusText: job.statusText,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      totalPages: job.totalPages,
      preparedPages: job.preparedPages,
      failedPages: job.failedPages,
      readyToGeneratePages: job.readyToGeneratePages,
      currentPageNumber: job.currentPageNumber,
      documentSummary: job.documentSummary,
      splitDiagnostics: job.splitDiagnostics,
      referenceDigest: job.referenceDigest,
      themeDefinition: job.themeDefinition,
      preferences: job.preferences,
      aiProcessingMode: job.aiProcessingMode,
      promptTrace: job.promptTrace,
      pages: publicPages,
      errors: job.errors,
    };
  }

  function deriveRiskLevel(page) {
    if (page.overflowFlag || page.splitRisk === "high") return "high";
    if (page.splitRisk === "medium") return "medium";
    return "none";
  }

  function deriveRiskReason(page) {
    if (page.overflowFlag) return page.overflowReason || "当前页内容偏长，建议关注页面密度。";
    if (page.splitRisk === "high") return "拆分页时识别为高排版风险页。";
    if (page.splitRisk === "medium") return "拆分页时识别为中排版风险页。";
    return "";
  }

  async function runThemeBasicDefinition(apiKey, region, themeName, decorationLevel, preferences, referenceFiles = [], context = {}) {
    const safeThemeName = String(themeName || "").trim() || "AI 自动匹配成熟风格";
    const contentContextBlock = [
      context?.documentSummary ? `【内容摘要】\n${context.documentSummary}` : "",
      context?.pagePlanSummary ? `【已拆分页计划】\n${context.pagePlanSummary}` : "",
      context?.mainText ? `【用户原始内容】\n${String(context.mainText).slice(0, 6000)}` : "",
    ].filter(Boolean).join("\n\n");
    const systemPrompt = [
      "你是一个演示文稿视觉总监，只负责生成全局基础风格基底。",
      "基础风格只定义整份演示的世界观、成熟风格基底、色彩气质、材质、字体层级、光影和统一视觉秩序。",
      "本阶段仅生成基础风格字段；页面级模块会在单页生成前根据页面内容即时生成。",
      "返回 JSON 对象，字段包含 displaySummaryZh、basic。",
    ].join("\n");
    const userPrompt = [
      `【主题关键词】\n${safeThemeName}`,
      `【装饰强度】\n${getDecorationLevelLabel(decorationLevel)}`,
      buildPreferencePromptBlock(preferences),
      "请将上面的问卷风格锚点直接吸收到基础风格描述中，不要只做泛化概括。",
      contentContextBlock,
      "【成熟风格选择】",
      "请先从瑞士编辑网格、咨询公司高管汇报、极简发布会、财经终端编辑风、博物馆展陈、科学期刊图版中选择一个最适合作为基底，也可以融合两个；输出时只呈现融合后的选择结果。",
      "【基础风格输出要求】",
      "1. 使用专业中文表达，渲染、材质、光影和镜头语言也尽量用中文描述。",
      "2. 写成可直接拼进生图提示词的风格指令，不写成解释文档。",
      "3. 只描述全局统一气质，不指定某一页的构图，不写目录页/内容页/数据页的具体排版。",
      "4. 以正向语言说明文字清晰、结构克制、装饰有序、背景服务阅读。",
      "5. 只给出方向性要求，不写具体实现配方；不要列出具体字体名称、字重组合、字号比例、网格列数、像素尺寸、圆角数值或代码式参数。",
      "6. 如果需要描述文字风格，只说明标题更强、正文更稳、技术信息更克制这类方向，不展开到具体字体家族或精确配比。",
      "返回 JSON：",
      "{\"displaySummaryZh\":\"...\",\"basic\":\"...\"}",
    ].filter(Boolean).join("\n\n");

    const styleModel = getWorkflowStyleModel();
    const styleModelSupportsImages = modelSupportsImageInputs(styleModel);
    const imageDataUrls = styleModelSupportsImages ? await loadReferenceImageDataUrls(referenceFiles) : [];
    const result = await runAssistantJsonObject(apiKey, region, systemPrompt, userPrompt, "基础风格基底", {
      imageDataUrls,
      model: styleModel,
      temperature: 0.35,
      transport: styleModelSupportsImages ? "dashscope-multimodal" : "compatible-chat",
    });
    return {
      themeDefinition: normalizeThemeBasicDefinition(result.parsed, safeThemeName, decorationLevel, preferences),
      trace: { model: styleModel, systemPrompt, userPrompt, responseText: result.text },
    };
  }

  async function runReferenceDigest(apiKey, region, mainText, referenceFiles, preferences, themeDefinition) {
    if (!referenceFiles.length) {
      return { digest: null, trace: null };
    }

    const systemPrompt = [
      "你是一位 PPT 资料整合助手。",
      "请只返回 JSON object，不要输出 markdown。",
      "字段必须包含 summary、usableFacts、cautions。",
      "summary 用于后续拆分，是一段简洁材料综述。",
      "usableFacts 是可补充给拆分页的事实点列表。",
      "cautions 是需要谨慎使用的信息提醒列表。",
    ].join("\n");

    const userPrompt = [
      buildPreferencePromptBlock(preferences),
      buildThemeDefinitionBlock(themeDefinition),
      "请先理解用户主文本，再把参考材料中真正能补充主文本的内容提炼出来。",
      "用户主文本优先级最高；参考材料只能补充明确存在、且与主题直接相关的信息。",
      "不要把文件里的所有内容都塞进摘要，不要延展到用户没有要求的方向。",
      buildReferenceDigestInput(mainText, referenceFiles),
      "返回 JSON：",
      "{\"summary\":\"...\",\"usableFacts\":[\"...\"],\"cautions\":[\"...\"]}",
    ].join("\n\n");

    const assistantModel = getWorkflowAssistantModel();
    const imageDataUrls = modelSupportsImageInputs(assistantModel) ? await loadReferenceImageDataUrls(referenceFiles) : [];
    const result = await runAssistantJsonObject(apiKey, region, systemPrompt, userPrompt, "参考材料摘要", {
      imageDataUrls,
      model: assistantModel,
    });
    return {
      digest: {
        summary: stringifyStructuredField(result.parsed.summary || ""),
        usableFacts: Array.isArray(result.parsed.usableFacts) ? result.parsed.usableFacts.map((item) => stringifyStructuredField(item)).filter(Boolean) : [],
        cautions: Array.isArray(result.parsed.cautions) ? result.parsed.cautions.map((item) => stringifyStructuredField(item)).filter(Boolean) : [],
      },
      trace: { systemPrompt, userPrompt, responseText: result.text },
    };
  }

  async function runSplitPlan(apiKey, region, options) {
    const { mainText, pageCount, splitPreset, aiProcessingMode } = options;

    const systemPrompt = [
      "你是一位 PPT 内容策划师。",
      "这一步只做拆分页和逻辑分段，不做最终上屏文案，不生成风格、版式、装饰或生图提示词。",
      "请只返回 JSON object，不要输出 markdown。",
      "字段必须包含 documentSummary、splitDiagnostics、pagePlan。",
      "pagePlan 每一项必须包含 pageNumber、pageType、pageTitle、pageContent、sectionTopic、estimatedChars、splitRisk、recommendedBand。",
    ].join("\n");

    const modeInstruction =
      aiProcessingMode === "strict"
        ? "精确模式：尽量保留原文表达和篇章顺序，只做硬性分页、标题提炼和页面类型判断。"
        : aiProcessingMode === "creative"
          ? "创作模式：允许适度补出承上启下的标题和概括句，但不得脱离原文主题，不引入外部事实。"
          : "均衡模式：适度梳理逻辑和小标题，让分页后的页面主题更清楚，但不扩展到风格或视觉层。";

    const userPrompt = [
      `【AI 处理模式】\n${getAiProcessingModeLabel(aiProcessingMode)}`,
      "【拆分原则】",
      `目标页数：${pageCount}。`,
      "第 1 页必须是 cover。",
      "pageType 只能是 cover、catalog、chapter、content、data。",
      "需要目录请使用 catalog，需要章节过渡请使用 chapter。",
      "每页只承载一个主主题或一个完整思想单元。",
      "每页文字建议 50-150 字，200 字以内优先，超过 250 字视为高风险。",
      "优先按照主题切换、逻辑递进、并列对比来切页。",
      "这一阶段只输出结构化拆分结果；上屏内容整理、页面排版和视觉生成都留到后续阶段。",
      modeInstruction,
      splitPreset ? `【本次拆分模板】\n${splitPreset}` : "",
      "【用户原始内容】",
      mainText,
      "返回 JSON：",
      "{\"documentSummary\":\"...\",\"splitDiagnostics\":\"...\",\"pagePlan\":[{\"pageNumber\":1,\"pageType\":\"cover\",\"pageTitle\":\"...\",\"pageContent\":\"...\",\"sectionTopic\":\"...\",\"estimatedChars\":90,\"splitRisk\":\"low|medium|high\",\"recommendedBand\":\"minimal|balanced|standard|dense\"}]}",
    ].filter(Boolean).join("\n\n");

    const result = await runAssistantJsonObject(apiKey, region, systemPrompt, userPrompt, "拆分页");
    return {
      pages: normalizePagePlan(result.parsed.pagePlan || result.parsed.pages || [], DEFAULT_DECORATION_LEVEL),
      documentSummary: stringifyStructuredField(result.parsed.documentSummary || result.parsed.summary || ""),
      splitDiagnostics: stringifyStructuredField(result.parsed.splitDiagnostics || ""),
      trace: { systemPrompt, userPrompt, responseText: result.text },
    };
  }

  async function runPageExpansion(apiKey, region, options) {
    const { enableExpansion, targetChars, maxChars, pages, referenceDigest } = options;
    const normalizedMaxChars = Math.max(0, Number(maxChars) || 0);
    const normalizedTargetChars = Boolean(enableExpansion)
      ? Math.max(0, Math.min(Number(targetChars) || 0, normalizedMaxChars || Number(targetChars) || 0))
      : 0;
    const candidates = (Array.isArray(pages) ? pages : [])
      .map((page) => {
        const pageType = String(page.pageType || "").toLowerCase();
        const currentChars = countCharacters(page.pageContent || "");
        const shouldExpand =
          normalizedTargetChars > 0 &&
          ["content", "data"].includes(pageType) &&
          currentChars < normalizedTargetChars;
        const shouldCondense =
          normalizedMaxChars > 0 &&
          ["catalog", "content", "data"].includes(pageType) &&
          currentChars > normalizedMaxChars;
        if (!shouldExpand && !shouldCondense) return null;
        return {
          ...page,
          currentChars,
          lengthMode: shouldCondense ? "condense" : "expand",
          desiredChars: shouldCondense ? normalizedMaxChars : normalizedTargetChars,
        };
      })
      .filter(Boolean);

    if (!candidates.length) {
      return {
        pages,
        trace: null,
      };
    }

    const researchByPageNumber = new Map();
    const researchTrace = [];
    if (normalizedTargetChars > 0) {
      for (const page of candidates.filter((item) => item.lengthMode === "expand")) {
        try {
          const research = await runExpansionResearch(apiKey, region, page, referenceDigest);
          researchByPageNumber.set(Number(page.pageNumber || 0), research);
          researchTrace.push({
            pageNumber: Number(page.pageNumber || 0),
            pageTitle: page.pageTitle,
            summary: research.summary,
            candidateCount: research.candidates.length,
            candidates: research.candidates.map((item) => ({
              text: item.text,
              sources: item.sources.map((source) => source.title),
            })),
          });
        } catch (error) {
          researchTrace.push({
            pageNumber: Number(page.pageNumber || 0),
            pageTitle: page.pageTitle,
            candidateCount: 0,
            error: error.message || "联网扩写检索失败。",
          });
        }
      }
    }

    const systemPrompt = [
      "你是一位 PPT 单页内容长度调节助手。",
      "你要根据每页的长度指示，决定是扩写还是压缩。",
      "不要改变 pageNumber、pageType、pageTitle、sectionTopic。",
      "不得编造没有依据的新事实。",
      "不要生成 visualElements、designNotes、layoutNotes 或任何视觉字段。",
      "如果是 expand：只允许使用当前页面原文、参考摘要、参考事实，以及联网检索得到的已验证补充事实来扩写。",
      "如果联网检索没有给出可靠补充，请宁可保持略短，也不要为了凑字数乱写。",
      "如果是 condense：保留关键信息、比较关系和结论，删去重复、冗长说明，必须压到不超过目标字数。",
      "只返回 JSON object。",
    ].join("\n");

    const userPrompt = [
      normalizedTargetChars ? `【扩写目标字数】\n${normalizedTargetChars}` : "",
      normalizedMaxChars ? `【压缩上限字数】\n${normalizedMaxChars}` : "",
      referenceDigest?.summary ? `【参考摘要】\n${referenceDigest.summary}` : "",
      referenceDigest?.usableFacts?.length ? `【可用客观事实】\n${referenceDigest.usableFacts.join("\n")}` : "",
      "【待调整页面】",
      JSON.stringify(candidates.map((page) => {
        const research = researchByPageNumber.get(Number(page.pageNumber || 0));
        return {
          pageNumber: page.pageNumber,
          pageType: page.pageType,
          pageTitle: page.pageTitle,
          sectionTopic: page.sectionTopic,
          pageContent: page.pageContent,
          currentChars: page.currentChars,
          lengthMode: page.lengthMode,
          desiredChars: page.desiredChars,
          estimatedChars: page.estimatedChars,
          researchedSummary: research?.summary || "",
          researchedSupplements: Array.isArray(research?.candidates)
            ? research.candidates.map((item) => ({
              text: item.text,
              sourceTitles: item.sources.map((source) => source.title),
            }))
            : [],
        };
      }), null, 2),
      "返回 JSON：",
      "{\"pages\":[{\"pageNumber\":1,\"lengthMode\":\"expand|condense\",\"pageContent\":\"...\",\"estimatedChars\":140}]}",
    ].filter(Boolean).join("\n\n");

    const result = await runAssistantJsonObject(apiKey, region, systemPrompt, userPrompt, "单页长度调节");
    const expandedPages = Array.isArray(result.parsed.pages) ? result.parsed.pages : [];
    const expandedByNumber = new Map(
      expandedPages
        .map((item) => ({
          pageNumber: Number(item?.pageNumber || 0),
          pageContent: stringifyStructuredField(item?.pageContent || ""),
          estimatedChars: Number(item?.estimatedChars || 0),
        }))
        .filter((item) => item.pageNumber > 0 && item.pageContent)
        .map((item) => [item.pageNumber, item])
    );

    const mergedPages = pages.map((page) => {
      const expanded = expandedByNumber.get(Number(page.pageNumber || 0));
      if (!expanded) return page;
      return {
        ...page,
        pageContent: expanded.pageContent,
        estimatedChars: expanded.estimatedChars || countCharacters(expanded.pageContent),
      };
    });

    return {
      pages: mergedPages,
      trace: {
        systemPrompt,
        userPrompt,
        responseText: result.text,
        targetChars: normalizedTargetChars,
        maxChars: normalizedMaxChars,
        enableExpansion: Boolean(enableExpansion),
        research: researchTrace,
      },
    };
  }

  async function prepareSinglePage(apiKey, region, job, page) {
    preparePageForGeneration(job, page, "local-reprepare");
  }

  async function precomputePagePromptModule(apiKey, region, job, page, source = "prepare") {
    if (!page?.prepareDone) return null;
    if (!page.promptTrace || typeof page.promptTrace !== "object") page.promptTrace = {};
    page.jitDecoration = await runJitDecorationExtraction(apiKey, region || DEFAULT_REGION, job, page);
    page.promptTrace.jitDecoration = page.jitDecoration.trace || {
      source: page.jitDecoration.source,
      keywords: page.jitDecoration.keywords,
      visualElementBrief: page.jitDecoration.visualElementBrief || "",
      decorationPrompt: page.jitDecoration.decorationPrompt,
      error: page.jitDecoration.error || "",
      precomputeSource: source,
    };
    attachPageTypePromptModule(job, page);
    return page.pageTypePromptModule;
  }

  function deriveLayoutMapping(page, cleanOnscreenContent = "") {
    const pageType = String(page?.pageType || "content").toLowerCase();
    const wordCount = Number(page?.estimatedChars || page?.word_count || countCharacters(cleanOnscreenContent));
    const density = wordCount <= 60 ? "low" : wordCount <= 140 ? "medium" : wordCount <= 240 ? "high" : "very-high";
    const type = ["cover", "catalog", "chapter", "content", "data"].includes(pageType) ? pageType : "content";
    const table = {
      cover: {
        layout: "海报式封面版式，单一主标题区，单一视觉焦点，充足留白",
        text: "大标题、短副标题和少量辅助信息形成清晰层级",
      },
      catalog: {
        layout: "结构化议程网格，编号形成稳定节奏，章节导航清晰",
        text: "短章节名、编号和说明文字保持统一对齐与间距",
      },
      chapter: {
        layout: "章节分隔版式，大号章节序号，明确材质色块",
        text: "一个章节标题搭配一句简短过渡说明",
      },
      data: {
        layout: density === "high" || density === "very-high"
          ? "高密度数据网格，清晰图表容器，信息严格对齐"
          : "单一核心图表英雄区，注释区位置精确",
        text: "关键数字和结论优先呈现，坐标轴、图例和注释清晰可读",
      },
      content: {
        layout: density === "low"
          ? "编辑型重点版式，一个核心观点搭配支撑视觉隐喻"
          : density === "medium"
            ? "双栏演示版式，文字栏与视觉栏保持平衡留白"
            : "便当盒式信息网格，高密度文字分组成卡片阅读区",
        text: density === "low"
          ? "标题和三条简短支撑要点"
          : density === "medium"
            ? "章节标题、紧凑段落和三到五条要点"
            : "使用卡片、分栏和严格分组承载密集内容",
      },
    };
    const picked = table[type] || table.content;
    const typeLabel = PAGE_TYPE_LABELS[type] || PAGE_TYPE_LABELS.content;
    const densityLabel = DENSITY_LABELS[density] || density;
    return {
      type,
      wordCount,
      density,
      instruction: [
        "【版式映射】",
        `页面类型：${typeLabel}；字数密度：${densityLabel}（约 ${wordCount} 字）。`,
        `版式方案：${picked.layout}。`,
        `文字层级：${picked.text}。`,
        "阅读区：文字区与装饰区清晰分离，正文放在稳定底色区域。",
      ].join("\n"),
    };
  }

  async function prepareWorkflowJob(job, apiKey, region, options = {}) {
    const {
      enableExpansion = false,
      targetChars = 0,
      maxChars = 0,
      referenceDigest = null,
      precomputePromptModules = true,
    } = options;

    for (const page of job.pages) {
      job.currentPageNumber = page.pageNumber;
      job.status = "running";
      job.statusText = `正在整理第 ${page.pageNumber}/${job.totalPages} 页...`;
      job.updatedAt = new Date().toISOString();
      try {
        preparePageForGeneration(job, page, "local-batch");
        if (precomputePromptModules) {
          await precomputePagePromptModule(apiKey, region, job, page, "split-prepare");
        }
      } catch (error) {
        page.prepareDone = true;
        page.readyToGenerate = true;
        page.riskLevel = "high";
        page.riskReason = error.message || `第 ${page.pageNumber} 页准备失败。`;
        page.qualityPass = true;
        page.qualityResult = {
          ...buildEmptyQualityResult(),
          issues: [page.riskReason],
          suggestions: ["你可以直接生成，也可以先修改当前页内容。"],
        };
        job.errors.push(page.riskReason);
      }
      refreshJobProgress(job);
    }
    job.currentPageNumber = 0;
    refreshJobProgress(job);
  }

  function getWorkflowJobOrThrow(jobId) {
    const job = workflowJobs.get(String(jobId || "").trim());
    if (!job) {
      const error = new Error("找不到对应的工作流任务。");
      error.status = 404;
      throw error;
    }
    return job;
  }

  function getWorkflowPageOrThrow(job, pageId) {
    const page = job.pages.find((item) => item.id === String(pageId || "").trim());
    if (!page) {
      const error = new Error("找不到对应的页面。");
      error.status = 404;
      throw error;
    }
    return page;
  }

  function buildPptLayoutPrinciplesBlock() {
    return [
      "【PPT排版原则｜高优先级】",
      CONSTANTS_RULES,
      "对比：标题、结论和关键数字使用更高层级字号与字重；标题与正文形成稳定比例。",
      "亲密：相关内容形成清晰分组，并保持稳定间距。",
      "对齐：文字、图形、卡片、数据区遵循统一网格与明确边线，保持秩序感。",
      "重复：同层级元素保持一致的字体、字重、颜色、间距与容器样式。",
      "留白：保留呼吸感，内容较多时优先分栏、分块、卡片化或图表化。",
      "可读：正文适合投影阅读，文字区使用足够字号、清晰底色和稳定对比。",
    ].join("\n");
  }

  function buildHeuristicDecoration(page, cleanOnscreenContent = "") {
    const source = `${page?.pageTitle || ""}\n${cleanOnscreenContent}`.replace(/\s+/g, " ").trim();
    const tokens = Array.from(new Set(
      source
        .split(/[^A-Za-z0-9\u4e00-\u9fa5]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 8),
    ));
    const keywords = tokens.slice(0, 3);
    const subject = keywords.join("、") || String(page?.pageTitle || "主题").trim() || "主题";
    return {
      keywords,
      visualElementBrief: subject,
      decorationPrompt: `${subject}形成浅层结构纹理和局部视觉锚点。`,
      source: "heuristic",
    };
  }

  async function runJitDecorationExtraction(apiKey, region, job, page) {
    const cleanOnscreenContent = normalizeOnscreenContent(page.onscreenContentText || page.onscreenContent || page.pageContent);
    const fallback = buildHeuristicDecoration(page, cleanOnscreenContent);
    if (!apiKey) return fallback;

    const systemPrompt = [
      "你是演示文稿页面的快速视觉元素提取助手。",
      "输入包含全局基础风格和单页内容。",
      "请从当前页内容中提取一个具体、可画、能支撑阅读氛围的视觉元素。",
      "返回 JSON 对象，字段包含 keywords、visualElementBrief、decorationPrompt。",
      "keywords 是一到三个中文关键词；visualElementBrief 是几个词或一个很短的中文短语。",
      "decorationPrompt 是一句中文装饰词条，适合放入页面模块，聚焦真实物体、材料、结构、场景、图解隐喻或行业符号。",
      "输出保持简洁、具体、服务当前页主题。",
    ].join("\n");
    const userPrompt = [
      "【基础风格】",
      stringifyStructuredField(job.themeDefinition?.basic || ""),
      "【当前页】",
      `页面类型：${PAGE_TYPE_LABELS[page.pageType] || PAGE_TYPE_LABELS.content}`,
      `标题：${page.pageTitle || ""}`,
      `正文：${cleanOnscreenContent}`,
      "请提取最适合这一页的装饰词条。",
    ].join("\n\n");

    try {
      const jitModel = getWorkflowJitModel();
      const result = await runAssistantJsonObject(apiKey, region || DEFAULT_REGION, systemPrompt, userPrompt, "单页装饰词条", {
        model: jitModel,
        temperature: 0.2,
        transport: modelSupportsImageInputs(jitModel) ? "dashscope-multimodal" : "compatible-chat",
      });
      const keywords = Array.isArray(result.parsed?.keywords)
        ? result.parsed.keywords.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
        : fallback.keywords;
      const decorationPrompt = stringifyStructuredField(result.parsed?.decorationPrompt || result.parsed?.decoration || "").trim()
        || fallback.decorationPrompt;
      const visualElementBrief = stringifyStructuredField(result.parsed?.visualElementBrief || result.parsed?.visualElement || "").trim()
        || fallback.visualElementBrief
        || keywords.join(", ");
      return {
        keywords,
        visualElementBrief,
        decorationPrompt,
        source: "llm",
        trace: { model: jitModel, systemPrompt, userPrompt, responseText: result.text },
      };
    } catch (error) {
      return {
        ...fallback,
        source: "heuristic-after-llm-error",
        error: error.message || String(error),
      };
    }
  }

  function buildPageTypePromptModule(job, page, cleanOnscreenContent = "", visualElementBrief = "") {
    const pageType = ["cover", "catalog", "chapter", "content", "data"].includes(page?.pageType) ? page.pageType : "content";
    const moduleNames = PAGE_MODULE_NAMES;
    const layout = deriveLayoutMapping(page, cleanOnscreenContent);
    const wordCount = Number(layout.wordCount || page?.estimatedChars || countCharacters(cleanOnscreenContent));
    const density = layout.density || normalizeContentBand(page?.contentBand, cleanOnscreenContent);
    const typeLabel = PAGE_TYPE_LABELS[pageType] || PAGE_TYPE_LABELS.content;
    const densityLabel = DENSITY_LABELS[density] || density;
    const decorationEntry = stringifyStructuredField(
      page?.jitDecoration?.decorationPrompt
        || visualElementBrief
        || page?.jitDecoration?.visualElementBrief
        || "",
    ).trim() || "与本页主题相关的材料纹理和结构线索。";
    const typeRules = {
      cover: {
        composition: "建立单一主视觉焦点，标题区必须占据最清晰的阅读层级，副标题和元信息保持克制。",
        container: "使用海报式标题安全区，背景视觉服务主题气质，标题保持清晰可读。",
      },
      catalog: {
        composition: "建立清晰的章节导航节奏，编号、章节名和短说明沿统一网格排列。",
        container: "使用纵向议程、横向时间线或分栏目录容器，保持每个条目间距一致。",
      },
      chapter: {
        composition: "使用章节分隔页逻辑，大号序号或章节标题形成稳定锚点。",
        container: "用大面积材质色块、留白和单一视觉符号切换叙事段落。",
      },
      data: {
        composition: density === "high" || density === "very-high"
          ? "构建高密度但严格对齐的数据仪表盘，结论数字、图表容器和注释区分层清楚。"
          : "构建单一核心数据图表的英雄区，关键数字和结论优先于装饰。",
        container: "图表、数字卡片、坐标轴、图例和注释必须拥有干净容器，阅读区与背景纹理分离。",
      },
      content: {
        composition: density === "low"
          ? "采用编辑型留白构图，一句核心观点配少量支撑信息和一个主题视觉隐喻。"
          : density === "medium"
            ? "采用双栏或三栏内容版式，正文、要点和视觉区保持清晰比例。"
            : "采用便当盒式信息网格，把密集内容拆成成组卡片。",
        container: "标题、正文、要点和解释性图形各自进入独立阅读区，整体保留清晰比例和稳定间距。",
      },
    };
    const picked = typeRules[pageType] || typeRules.content;
    return {
      moduleKey: pageType,
      moduleName: moduleNames[pageType] || moduleNames.content,
      wordCount,
      density,
      visualElementBrief: decorationEntry,
      decorationEntry,
      modulePrompt: [
        `【${moduleNames[pageType] || moduleNames.content}】`,
        `页面类型：${typeLabel}；内容量：${densityLabel}（约 ${wordCount} 字）。`,
        `构图逻辑：${picked.composition}`,
        `信息容器：${picked.container}`,
        `装饰词条：${decorationEntry}`,
      ].join("\n"),
      source: "jit-local-page-map",
    };
  }

  function attachPageTypePromptModule(job, page) {
    if (!page.promptTrace || typeof page.promptTrace !== "object") page.promptTrace = {};
    const cleanOnscreenContent = normalizeOnscreenContent(page.onscreenContentText || page.onscreenContent || page.pageContent);
    const visualElement = page.jitDecoration?.visualElementBrief || page.jitDecoration?.decorationPrompt || "";
    page.pageTypePromptModule = buildPageTypePromptModule(job, page, cleanOnscreenContent, visualElement);
    page.promptTrace.pageTypeModule = page.pageTypePromptModule;
    return page.pageTypePromptModule;
  }

  function stripTitleFromOnscreenContent(title, content) {
    const safeTitle = stringifyStructuredField(title || "").trim();
    const lines = String(content || "").replace(/\r/g, "").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!safeTitle || !lines.length) return lines.join("\n").trim();
    const firstLine = lines[0].trim();
    if (
      firstLine === safeTitle
      || firstLine === `标题：${safeTitle}`
      || firstLine === `标题:${safeTitle}`
      || firstLine.startsWith(`${safeTitle}：`)
      || firstLine.startsWith(`${safeTitle}:`)
    ) {
      lines.shift();
    }
    return lines.join("\n").trim();
  }

  function buildGptFinalImagePrompt(page, pageStylePrompt = "") {
    const title = stringifyStructuredField(page?.pageTitle || "").trim() || "未命名页面";
    const cleanOnscreenContent = normalizeOnscreenContent(page?.onscreenContentText || page?.onscreenContent || page?.pageContent);
    const body = stripTitleFromOnscreenContent(title, cleanOnscreenContent) || cleanOnscreenContent || title;
    const style = stringifyStructuredField(pageStylePrompt || "").trim();
    return [
      WORKFLOW_FIXED_PROMPT,
      style ? `可选风格提示词：\n${style}` : "",
      `内容：\n标题：${title}\n正文：${body}`,
    ].filter(Boolean).join("\n\n");
  }

  function getConfirmedThemeBasicOrThrow(job) {
    const basicPrompt = stringifyStructuredField(job?.themeDefinition?.basic || "");
    if (basicPrompt) return basicPrompt;
    const error = new Error("当前项目还没有确认基础风格，请先完成风格生成并确认。");
    error.status = 409;
    throw error;
  }

  function buildFinalImagePrompt(job, page, extraPrompt = "") {
    const cleanOnscreenContent = normalizeOnscreenContent(page.onscreenContentText || page.onscreenContent || page.pageContent);
    const layout = deriveLayoutMapping(page, cleanOnscreenContent);
    page.layoutMapping = layout;
    page.layoutInstruction = layout.instruction;
    const pageTypeTemplate = page.pageTypePromptModule?.modulePrompt
      || buildPageTypePromptModule(job, page, cleanOnscreenContent, page.jitDecoration?.visualElementBrief || "").modulePrompt
      || "";
    const pptLayoutPrinciples = buildPptLayoutPrinciplesBlock();
    const layoutInstruction = layout.instruction;
    const roleInstruction = WORKFLOW_FIXED_PROMPT;
    const basicPrompt = getConfirmedThemeBasicOrThrow(job);
    return [
      roleInstruction,
      basicPrompt ? `基础风格：${basicPrompt}` : "",
      pptLayoutPrinciples,
      pageTypeTemplate,
      layoutInstruction,
      `本页标题：${page.pageTitle}`,
      cleanOnscreenContent ? `正文内容：\n${cleanOnscreenContent}` : "",
      extraPrompt ? `补充要求：\n${normalizeOnscreenContent(extraPrompt)}` : "",
    ].filter(Boolean).join("\n\n");
  }

  function extractGeminiSearchMetadata(data) {
    const metadata = [];
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    candidates.forEach((candidate) => {
      if (candidate?.groundingMetadata) metadata.push(candidate.groundingMetadata);
      if (candidate?.citationMetadata) metadata.push(candidate.citationMetadata);
    });
    return metadata.length ? metadata : null;
  }

  app.post("/api/workflow/theme", async (req, res) => {
    const {
      apiKey,
      region,
      themeName,
      decorationLevel,
      preferences,
      referenceFiles,
      workflowJobId,
      contentContext,
      pagePlanSummary,
    } = req.body || {};
    const effectiveApiKey = resolveDashScopeApiKey(apiKey);
    if (!effectiveApiKey) {
      return res.status(400).json({ code: "MissingApiKey", message: "请先填写 DashScope / Qwen API Key。" });
    }

    try {
      const normalizedPreferences = normalizePreferences(preferences);
      const normalizedReferenceFiles = normalizeReferenceFiles(referenceFiles);
      const contextJob = workflowJobId ? workflowJobs.get(String(workflowJobId)) : null;
      const context = {
        mainText: String(contentContext || "").trim(),
        documentSummary: contextJob?.documentSummary || "",
        pagePlanSummary: String(pagePlanSummary || "").trim()
          || (contextJob?.pages || [])
            .slice(0, 24)
            .map((page) => `${page.pageNumber}. [${page.pageType}] ${page.pageTitle}: ${stringifyStructuredField(page.pageContent).slice(0, 180)}`)
            .join("\n"),
      };
      const result = await runThemeBasicDefinition(
        effectiveApiKey,
        region || DEFAULT_REGION,
        String(themeName || "").trim() || "AI 自动匹配成熟风格",
        decorationLevel,
        normalizedPreferences,
        normalizedReferenceFiles,
        context,
      );
      return res.json({
        ok: true,
        themeDefinition: result.themeDefinition,
        promptTrace: { themeCore: result.trace },
      });
    } catch (error) {
      return res.status(500).json({
        code: "WorkflowThemeFailed",
        message: error.message || "生成主题模板失败。",
      });
    }
  });

  app.post("/api/workflow/theme/apply", async (req, res) => {
    const { jobId, themeDefinition, preferences, decorationLevel, promptTrace } = req.body || {};
    try {
      const job = getWorkflowJobOrThrow(jobId);
      const normalizedPreferences = normalizePreferences(preferences);
      job.themeDefinition = normalizeThemeBasicDefinition(
        themeDefinition || {},
        themeDefinition?.themeName || "AI 自动匹配成熟风格",
        decorationLevel || job.themeDefinition?.decorationLevel || DEFAULT_DECORATION_LEVEL,
        normalizedPreferences,
      );
      job.preferences = normalizedPreferences;
      job.promptTrace.themeCore = promptTrace?.themeCore || promptTrace || job.promptTrace.themeCore;
      job.updatedAt = new Date().toISOString();
      return res.json({
        ok: true,
        job: publicJobSnapshot(job),
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        code: "WorkflowThemeApplyFailed",
        message: error.message || "应用主题模板失败。",
      });
    }
  });

  app.post("/api/workflow/manual-job", async (req, res) => {
    const { themeDefinition, preferences, decorationLevel, imageModel } = req.body || {};
    try {
      const normalizedPreferences = normalizePreferences(preferences);
      const normalizedThemeDefinition = normalizeThemeBasicDefinition(
        themeDefinition || {},
        themeDefinition?.themeName || "",
        decorationLevel,
        normalizedPreferences,
      );
      const job = createWorkflowJob({
        documentSummary: "手工项目。",
        splitDiagnostics: "跳过拆分，由用户手动添加页面。",
        referenceDigest: null,
        themeDefinition: normalizedThemeDefinition,
        preferences: normalizedPreferences,
        splitPreset: "",
        aiProcessingMode: "manual",
        pages: [],
        themeTrace: null,
        referenceTrace: null,
        splitTrace: null,
        expansionTrace: {
          mode: "manual",
          enableExpansion: false,
          targetChars: 0,
          maxChars: 0,
        },
      });
      job.status = "ready";
      job.statusText = "手工项目已创建，请添加页面。";
      refreshJobProgress(job);
      return res.json({
        ok: true,
        jobId: job.id,
        job: publicJobSnapshot(job),
      });
    } catch (error) {
      return res.status(500).json({
        code: "WorkflowManualJobFailed",
        message: error.message || "创建手工项目失败。",
      });
    }
  });

  app.post("/api/workflow/manual-page", async (req, res) => {
    const { jobId, pageTitle, pageContent, pageType } = req.body || {};
    try {
      const job = getWorkflowJobOrThrow(jobId);
      const nextPageNumber = job.pages.length + 1;
      const rawPage = {
        id: crypto.randomUUID(),
        pageNumber: nextPageNumber,
        pageTitle: String(pageTitle || "").trim() || `第 ${nextPageNumber} 页`,
        pageContent: String(pageContent || "").trim(),
        pageType: ["cover", "catalog", "chapter", "content", "data"].includes(pageType) ? pageType : "content",
        onscreenContent: String(pageContent || "").trim(),
        onscreenContentText: String(pageContent || "").trim(),
        recommendedBand: "balanced",
        splitRisk: "low",
      };
      const page = createWorkflowPage(rawPage);
      preparePageForGeneration(job, page, "manual");
      job.pages.push(page);
      refreshJobProgress(job);
      return res.json({
        ok: true,
        job: publicJobSnapshot(job),
        page,
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        code: "WorkflowManualPageFailed",
        message: error.message || "添加页面失败。",
      });
    }
  });

  app.post("/api/workflow/split", async (req, res) => {
    const {
      apiKey,
      region,
      content,
      pageCount,
      splitTemplate,
      aiProcessingMode,
      enableExpansion,
      targetChars,
      maxChars,
      referenceFiles,
      themeDefinition,
      preferences,
      decorationLevel,
      imageModel,
    } = req.body || {};

    const effectiveApiKey = resolveDashScopeApiKey(apiKey);
    if (!effectiveApiKey) {
      return res.status(400).json({ code: "MissingApiKey", message: "请先填写 DashScope / Qwen API Key。" });
    }

    const mainText = String(content || "").trim();
    if (!mainText) {
      return res.status(400).json({ code: "MissingContent", message: "请先输入需要拆分的主文本。" });
    }

    try {
      const normalizedPreferences = normalizePreferences(preferences);
      const normalizedThemeDefinition = normalizeThemeBasicDefinition(
        themeDefinition || {},
        themeDefinition?.themeName || "",
        decorationLevel,
        normalizedPreferences,
      );
      const referenceDigestResult = { digest: null, trace: null };
      const splitResult = await runSplitPlan(effectiveApiKey, region || DEFAULT_REGION, {
        mainText,
        pageCount: Math.max(1, Number(pageCount) || 6),
        splitPreset: String(splitTemplate || "").trim(),
        aiProcessingMode: normalizeAiProcessingMode(aiProcessingMode),
      });
      const normalizedEnableExpansion = Boolean(enableExpansion);
      const normalizedTargetChars = Math.max(0, Number(targetChars) || 0);
      const normalizedMaxChars = Math.max(0, Number(maxChars) || 0);
      const precomputePromptModules = false;

      if (!splitResult.pages.length) {
        return res.status(502).json({
          code: "EmptySplitResult",
          message: "拆分页结果为空，请调整文本或拆分模板后重试。",
        });
      }

      const job = createWorkflowJob({
        documentSummary: splitResult.documentSummary || `已拆分为 ${splitResult.pages.length} 页。`,
        splitDiagnostics: splitResult.splitDiagnostics || "本次拆分没有返回额外诊断。",
        referenceDigest: referenceDigestResult.digest,
        themeDefinition: normalizedThemeDefinition,
        preferences: normalizedPreferences,
        splitPreset: String(splitTemplate || "").trim(),
        aiProcessingMode: normalizeAiProcessingMode(aiProcessingMode),
        pages: splitResult.pages,
        themeTrace: null,
        referenceTrace: referenceDigestResult.trace,
        splitTrace: splitResult.trace,
        expansionTrace: {
          mode: "local-prepare-only",
          enableExpansion: normalizedEnableExpansion,
          targetChars: normalizedTargetChars,
          maxChars: normalizedMaxChars,
        },
      });
      job.status = "running";
      job.statusText = "拆分完成，正在逐页准备结果...";
      refreshJobProgress(job);

      setTimeout(() => {
        prepareWorkflowJob(job, effectiveApiKey, region || DEFAULT_REGION, {
          enableExpansion: normalizedEnableExpansion,
          targetChars: normalizedTargetChars,
          maxChars: normalizedMaxChars,
          referenceDigest: null,
          precomputePromptModules,
        }).catch((error) => {
          job.status = "error";
          job.statusText = error.message || "逐页准备失败。";
          job.errors.push(job.statusText);
          refreshJobProgress(job);
        });
      }, 0);

      return res.json({
        ok: true,
        jobId: job.id,
        job: publicJobSnapshot(job),
      });
    } catch (error) {
      return res.status(500).json({
        code: "WorkflowSplitFailed",
        message: error.message || "拆分工作流失败。",
      });
    }
  });

  app.get("/api/workflow/jobs/:jobId", (req, res) => {
    try {
      const job = getWorkflowJobOrThrow(req.params.jobId);
      refreshJobProgress(job);
      return res.json({ ok: true, job: publicJobSnapshot(job) });
    } catch (error) {
      return res.status(error.status || 500).json({
        code: "WorkflowJobNotFound",
        message: error.message || "读取工作流任务失败。",
      });
    }
  });

  app.post("/api/workflow/page/reprepare", async (req, res) => {
    const { apiKey, region, jobId, pageId, pageTitle, onscreenContent, autoExpandToMaxChars } = req.body || {};
    const effectiveApiKey = resolveDashScopeApiKey(apiKey);
    try {
      const job = getWorkflowJobOrThrow(jobId);
      const page = getWorkflowPageOrThrow(job, pageId);
      if (String(pageTitle || "").trim()) {
        page.pageTitle = stringifyStructuredField(pageTitle).trim();
      }
      const nextOnscreenContent = String(onscreenContent || "").trim();
      if (!nextOnscreenContent) {
        return res.status(400).json({ code: "MissingOnscreenContent", message: "请先填写这页的上屏内容。" });
      }

      page.onscreenContent = normalizeOnscreenContent(nextOnscreenContent);
      page.onscreenContentText = page.onscreenContent;
      page.pageContent = page.onscreenContent;
      page.generated = false;
      page.promptTrace.userEditedOnscreen = {
        updatedAt: new Date().toISOString(),
        onscreenContent: nextOnscreenContent,
      };

      if (autoExpandToMaxChars) {
        const lengthPlan = job.promptTrace?.lengthControlPlan || job.promptTrace?.expansionPlan || null;
        const normalizedMaxChars = Math.max(0, Number(lengthPlan?.maxChars) || 0);
        if (!normalizedMaxChars) {
          return res.status(400).json({
            code: "MissingMaxChars",
            message: "当前工作流没有可用的最大字数设置，无法执行 AI 一键重润。",
          });
        }
        if (!String(effectiveApiKey || "").trim()) {
          return res.status(400).json({
            code: "MissingApiKey",
            message: "请先填写 API Key，再执行 AI 一键重润。",
          });
        }
        const lengthResult = await runPageExpansion(effectiveApiKey, region || DEFAULT_REGION, {
          enableExpansion: true,
          targetChars: normalizedMaxChars,
          maxChars: normalizedMaxChars,
          pages: [{
            ...page,
            pageContent: page.onscreenContent,
          }],
          referenceDigest: job.referenceDigest || null,
        });
        const repolishedPage = Array.isArray(lengthResult.pages) ? lengthResult.pages[0] : null;
        if (repolishedPage) {
          Object.assign(page, repolishedPage);
          page.onscreenContent = normalizeOnscreenContent(page.pageContent || page.onscreenContent);
          page.onscreenContentText = page.onscreenContent;
        }
        if (lengthResult.trace) {
          page.promptTrace.lengthControl = lengthResult.trace;
          page.promptTrace.aiRepolish = {
            updatedAt: new Date().toISOString(),
            mode: "expand-to-max-chars",
            maxChars: normalizedMaxChars,
          };
        }
      }

      preparePageForGeneration(job, page, "user-edit");
      await precomputePagePromptModule(effectiveApiKey, region || DEFAULT_REGION, job, page, "user-edit");
      refreshJobProgress(job);
      return res.json({
        ok: true,
        job: publicJobSnapshot(job),
        page,
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        code: "WorkflowPageReprepareFailed",
        message: error.message || "重新整理页面失败。",
      });
    }
  });

  app.post("/api/workflow/page/generate-v2", async (req, res) => {
    let responseClosedEarly = false;
    res.on("close", () => {
      if (!res.writableEnded) responseClosedEarly = true;
    });

    const {
      apiKey,
      openAiImageApiKey,
      openAiImageBaseUrl,
      whatAiImageApiKey,
      region,
      imageModel,
      jobId,
      pageId,
      pageTitle,
      slideAspect,
      size,
      seed,
      extraPrompt,
      pageStylePrompt,
      canvasImage,
      onscreenContent,
      promptMode,
    } = req.body || {};

    const selectedImageModel = String(imageModel || WORKFLOW_IMAGE_MODEL).trim() || WORKFLOW_IMAGE_MODEL;
    const effectiveApiKey = resolveDashScopeApiKey(apiKey);
    const effectiveOpenAiKey = resolveOpenAiImageApiKey(openAiImageApiKey);
    const effectiveWhatAiKey = resolveWhatAiImageApiKey(whatAiImageApiKey);

    if (!effectiveOpenAiKey) {
      return res.status(400).json({ code: "MissingOpenAiImageApiKey", message: "请先填写 OpenAI Image API Key。" });
    }

    try {
      const job = getWorkflowJobOrThrow(jobId);
      const page = getWorkflowPageOrThrow(job, pageId);
      if (String(pageTitle || "").trim()) {
        page.pageTitle = stringifyStructuredField(pageTitle).trim();
      }
      if (String(onscreenContent || "").trim()) {
        page.onscreenContent = normalizeOnscreenContent(String(onscreenContent || "").trim());
        page.onscreenContentText = page.onscreenContent;
        page.pageContent = page.onscreenContent;
        preparePageForGeneration(job, page, "generate-inline");
      }
      page.generationStatus = "running";
      page.generationError = "";
      page.generationStartedAt = new Date().toISOString();
      // 使用 GPT 简化 prompt
      const finalPrompt = buildGptFinalImagePrompt(page, String(pageStylePrompt || "").trim());
      page.jitDecoration = null;
      page.pageTypePromptModule = null;
      const finalPromptTrace = {
        promptMode: "gpt-simple",
        pageStylePrompt: String(pageStylePrompt || "").trim(),
        basicIncluded: false,
        questionnaireAnchorIncluded: false,
        layoutMapping: null,
        pageTypeModule: null,
        jitDecoration: null,
      };
      page.promptTrace.finalImage = {
        builtAt: new Date().toISOString(),
        model: selectedImageModel,
        pageTitle: page.pageTitle || "",
        prompt: finalPrompt,
        extraPrompt: String(extraPrompt || "").trim(),
        ...finalPromptTrace,
        hasCanvasImage: Boolean(String(promptMode || "").trim() === "modify-only" && parseDataUrl(String(canvasImage || "").trim())),
        searchMetadata: null,
      };

      const canUseCanvasImage = String(promptMode || "").trim() === "modify-only";
      const parsedCanvasImage = canUseCanvasImage ? parseDataUrl(String(canvasImage || "").trim()) : null;
      let responsePayload = null;
      let images = [];

      // GPT Image 生成
      const content = [{ text: finalPrompt }];
      if (parsedCanvasImage) {
        content.push({ image: String(canvasImage || "").trim() });
      }
      const openAiPayload = {
        model: selectedImageModel,
        input: {
          messages: [
            {
              role: "user",
              content,
            },
          ],
        },
        parameters: {
          size: size || "2K",
          n: 1,
        },
      };
      responsePayload = await requestOpenAiImageGenerate({
        apiKey: effectiveOpenAiKey,
        payload: openAiPayload,
        slideAspect,
        baseUrl: openAiImageBaseUrl,
        whatAiImageApiKey: effectiveWhatAiKey,
      });
      if (responseClosedEarly) {
        if (!page.generated && page.generationStatus === "running") {
          page.generationStatus = "idle";
          page.generationError = "";
        }
        refreshJobProgress(job);
        return;
      }
      images = (responsePayload.output?.choices?.[0]?.message?.content || [])
        .filter((item) => item.type === "image" && item.image)
        .map((item) => item.image);

      page.generationStatus = images.length > 0 ? "done" : "error";
      page.generationError = images.length > 0 ? "" : "没有拿到图片结果。";
      page.extraPrompt = String(extraPrompt || "").trim();
      page.pageStylePrompt = String(pageStylePrompt || "").trim();
      const previousImages = Array.isArray(page.resultImages) ? page.resultImages.filter(Boolean) : [];
      const mergedImages = Array.from(new Set([
        ...images.filter(Boolean),
        ...previousImages,
      ]));
      page.generated = mergedImages.length > 0;
      page.resultImages = mergedImages;
      if (images[0]) page.baseImage = images[0];
      if (!page.baseImage && mergedImages[0]) page.baseImage = mergedImages[0];
      page.generationFinishedAt = new Date().toISOString();
      refreshJobProgress(job);

      return res.json({
        ok: true,
        page,
        response: responsePayload,
      });
    } catch (error) {
      if (responseClosedEarly) {
        try {
          const job = workflowJobs.get(String(jobId || "").trim());
          const page = job?.pages?.find((item) => item.id === String(pageId || "").trim());
          if (page && !page.generated && page.generationStatus === "running") {
            page.generationStatus = "idle";
            page.generationError = "";
            refreshJobProgress(job);
          }
        } catch {}
        return;
      }
      return res.status(error.status || 500).json({
        code: "WorkflowPageGenerateFailed",
        message: error.message || "生成页面失败。",
      });
    }
  });

  app.post("/api/workflow/page/prompt", async (req, res) => {
    const {
      apiKey,
      region,
      imageModel,
      jobId,
      pageId,
      pageTitle,
      extraPrompt,
      pageStylePrompt,
      canvasImage,
      onscreenContent,
    } = req.body || {};

    const selectedImageModel = String(imageModel || WORKFLOW_IMAGE_MODEL).trim() || WORKFLOW_IMAGE_MODEL;
    const effectiveApiKey = resolveDashScopeApiKey(apiKey);

    try {
      const job = getWorkflowJobOrThrow(jobId);
      const page = getWorkflowPageOrThrow(job, pageId);
      if (String(pageTitle || "").trim()) {
        page.pageTitle = stringifyStructuredField(pageTitle).trim();
      }
      if (String(onscreenContent || "").trim()) {
        page.onscreenContent = normalizeOnscreenContent(String(onscreenContent || "").trim());
        page.onscreenContentText = page.onscreenContent;
        page.pageContent = page.onscreenContent;
        preparePageForGeneration(job, page, "prompt-copy");
      }
      // 使用 GPT 简化 prompt
      const finalPrompt = buildGptFinalImagePrompt(page, String(pageStylePrompt || "").trim());
      page.jitDecoration = null;
      page.pageTypePromptModule = null;
      const finalPromptTrace = {
        promptMode: "gpt-simple",
        pageStylePrompt: String(pageStylePrompt || "").trim(),
        basicIncluded: false,
        questionnaireAnchorIncluded: false,
        layoutMapping: null,
        pageTypeModule: null,
        jitDecoration: null,
      };
      page.extraPrompt = String(extraPrompt || "").trim();
      page.pageStylePrompt = String(pageStylePrompt || "").trim();
      page.promptTrace.finalImage = {
        builtAt: new Date().toISOString(),
        model: selectedImageModel,
        pageTitle: page.pageTitle || "",
        prompt: finalPrompt,
        extraPrompt: String(extraPrompt || "").trim(),
        ...finalPromptTrace,
        hasCanvasImage: Boolean(canvasImage),
        searchMetadata: null,
      };
      refreshJobProgress(job);

      return res.json({
        ok: true,
        finalPrompt,
        page,
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        code: "WorkflowPagePromptFailed",
        message: error.message || "准备页面提示词失败。",
      });
    }
  });

}

module.exports = {
  installWorkflowRoutes,
};

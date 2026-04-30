> **Note:** This is a historical planning document from 2026-04. Many items described here (e.g., intent-to-draft, single-call prepare, final prompt slimming) have since been implemented or evolved. See the current codebase and README for the up-to-date feature set.

# Plan: 精简 PPT 工作流与短链路优化

## Context

当前 Nano Banana PPT Studio 的 workflow-service.js 存在三个核心痛点：
1. **用户只有模糊想法时无法开工**：现有链路要求用户先写出完整的每页文本，再进入拆分。没有从"意图+参考文献"自动生成字数适中初稿的能力。
2. **最终发给 Gemini 的提示词过于臃肿**：buildFinalImagePrompt 同时注入 modelPrompt、页面类型风格、5 个布局元数据字段、硬约束、负向约束，大量重复（如"禁止新增文字"出现 4 次以上）。导致生成结果"看上去唬人，细看排版不均、装饰喧宾夺主"。
3. **每页准备阶段 3 次串行 Qwen 调用**：onscreen→layout→quality，延迟高且后两轮对最终生图价值有限。

用户明确要求：
- 在用户不清楚每页内容时，先把意图+参考文献转化为**字数适中的可编辑文档初稿**
- 前几轮调用服务于"明确内容+辅助风格设计"（提升提示词质量），最终给 Gemini 的提示词必须**精简**
- **不新增风格压缩调用**，而是从源头让 theme generation 输出更精炼
- 准备阶段合并为 **1 次调用**，追求最短链路

## Proposed Changes

### 1. 新增 "意图→文档草稿" 独立阶段

新增 API endpoint `POST /api/workflow/intent`，在 split 之前执行。

**流程**：
```
用户输入想法 + 受众 + 参考文献
  → Qwen 生成结构化文档草稿（title, summary, pages[]）
  → 前端展示可编辑的草稿面板
  → 用户确认/修改后，将 pages[] 作为 documentDraft 传给 /api/workflow/split
```

**字数控制机制**：
- Prompt 中明确要求 Qwen 为每页输出 `targetChars`（目标字数）和 `maxChars`（上限字数）
- 内容页 targetChars 50-150，maxChars 200
- 数据页 maxChars 不超过 200
- 后端对返回结果做字符数校验，超限页标记风险但不阻断

**Prompt 设计（workflow-service.js）**：
```
System: 你是一位 PPT 内容策划师。用户只有一个粗略想法，你需要把它扩展成一份可直接用于拆分的文档草稿。
请只返回 JSON object，不要输出 markdown。
字段必须包含 title、summary、pages。
pages 每一项必须包含 pageNumber、pageType、pageTitle、pageContent、targetChars、maxChars。
pageContent 必须是最终可直接上屏的纯文本，不要带字段标签。

User:
【用户意图】{intent}
【受众】{audience || "未指定"}
【目标页数】{pageCount}
【用户偏好】{preferenceBlock}
【参考材料】{referenceDigest}
【输出要求】
- 第1页必须是 cover。
- 内容页每页 targetChars 50-150，maxChars 200。
- 数据页 maxChars 不超过 200。
- 不要臆造事实，优先使用参考材料中的信息。
- 返回 JSON：...
```

### 2. 优化主题生成，从源头精简风格描述

**修改 `runThemeDefinition` 的 system prompt 和 user prompt**，不再要求 Qwen 输出冗长的抒情化设计描述，而是直接输出对生图模型有效的精炼关键词。

**原问题**：
- System prompt 只要求 "modelPrompt 给后续模型编排使用，要专业、精炼、结构化"，没有字数限制
- `ppt-harness.json` 和前端 override 进一步叠加了 verbose 风格规则

**优化后**：
```
System:
你是一位 PPT 视觉系统设计师。
请只返回 JSON object，不要输出 markdown。
字段必须包含 displaySummaryZh、modelPrompt、basic、cover、content、data。
displaySummaryZh 给人看，要中文、清晰、简洁。
modelPrompt 给图像生成模型使用，必须控制在 300 字以内，使用视觉关键词（配色、字体气质、构图倾向、留白比例、装饰类型），删除抒情和比喻。
cover/content/data 每项控制在 100 字以内，只写与默认基础风格的差异。

User:
请为一个以 Nano Banana 为最终生图模型的 PPT 生成系统设计全局主题模板。
主题关键词：{themeName}
装饰强度：{decorationLevel}
【用户偏好】{preferenceBlock}
要求：
- 区分封面页、内容页、数据页的视觉表达。
- 装饰只允许无字图形。
- modelPrompt 必须是生图模型能直接执行的简短风格指令。
- 返回 JSON：...
```

**Fallback**：若 Qwen 未遵守字数限制，`normalizeThemeDefinition` 中对 modelPrompt 做硬截断（保留前 350 字），并在 `displaySummaryZh` 中提示用户"风格描述已自动精简"。

### 3. 合并准备阶段为单次调用

将 `prepareSinglePage` 从 3 次串行 Qwen 调用合并为 **1 次**。

**新 prepare 输出字段**：
- `onscreenContent`：整理后的上屏纯文本
- `layoutHint`：版式提示，控制在 80 字以内（如"左右分栏，左图右文"）
- `riskLevel` / `riskReason`：自检风险标记

**Prompt 设计**：
```
System:
你是一位 PPT 页面优化助手。把原始内容整理成可直接上屏的文本，并给出一个简短的版式提示。
请只返回 JSON object，不要输出 markdown。
字段必须包含 onscreenContent、layoutHint、riskLevel、riskReason。
onscreenContent 是纯文本，不要带字段标签。
layoutHint 控制在 80 字以内，只描述对生图模型有用的版式信息。

User:
【硬约束】...
【用户偏好】...
【主题风格】{themeDefinition.modelPrompt}
页面类型：{page.pageType}
页面标题：{page.pageTitle}
原始内容：\n{page.pageContent}
目标字数：约 {page.targetChars || 100} 字，上限 {page.maxChars || 150} 字。
返回 JSON：...
```

**移除的字段**：`layoutSummary`、`textHierarchy`、`visualFocus`、`readabilityNotes`、`pagePrompt` → 统一替换为 `layoutHint`。

### 4. 精简最终发给 Gemini 的提示词

重写 `buildFinalImagePrompt`，目标长度 < 1500 字。

**新模板**：
```javascript
function buildFinalImagePrompt(job, page, extraPrompt = "") {
  const cleanOnscreenContent = normalizeOnscreenContent(page.onscreenContent || page.pageContent);
  const style = job.themeDefinition?.modelPrompt || "";
  const pageStyle = job.themeDefinition?.[page.pageType === "cover" ? "cover" : page.pageType === "data" ? "data" : "content"] || "";

  const parts = [
    `Style: ${style} ${pageStyle}`.trim(),
    `Type: ${page.pageType}`,
    `Title: ${page.pageTitle}`,
    `Content:\n${cleanOnscreenContent}`,
  ];

  if (page.layoutHint) {
    parts.push(`Layout: ${page.layoutHint}`);
  }

  if (extraPrompt) {
    parts.push(`Extra: ${extraPrompt}`);
  }

  parts.push("Rules: PPT slide, no extra text/logo/watermark/page numbers, 30% whitespace, max 2 fonts, readable hierarchy.");

  return parts.join("\n\n");
}
```

**删减内容**：
- 删除 `buildHardConstraintBlock()` 的多行重复硬约束，替换为单行 Rules
- 删除 `【页面信息】` 等元数据包装（Gemini 不需要"页面类型："标签）
- 删除 `textHierarchy`、`visualFocus`、`readabilityNotes`、`pagePrompt` 四个冗余字段
- 删除负向约束的重复段落，合并入 Rules

### 5. 前端 v2 交互改造

**新增 UI（public/v2/index.html）**：
在 Split 阶段增加输入模式切换：
- **"我已写好全文"**：现有文本输入框
- **"我只有大致想法"**：新增意图输入区（主题想法 + 受众 + 生成草稿按钮）
- 生成后展示可编辑的文档草稿预览面板，用户可修改后再执行拆分

**状态扩展（public/v2/app.js）**：
```javascript
state.inputMode = "full"; // "full" | "intent"
state.intentText = "";
state.intentAudience = "";
state.documentDraft = null;
```

**事件流**：
1. 用户选择"只有大致想法"模式，输入意图
2. 点击"生成文档草稿" → `POST /api/workflow/intent`
3. 前端展示 `documentDraftPreview`（可编辑每页 title/content/targetChars）
4. 用户确认后，将 `documentDraft` 作为 payload 传给 `POST /api/workflow/split`
5. `runSplitPlan` 接收 `documentDraft` 时，以它为输入直接生成 `pagePlan`，不再把原始长文本作为唯一输入

## Critical Files to Modify

1. `D:/pptgen/workflow-service.js`
   - 新增 `runIntentToDocument` 函数
   - 新增 `POST /api/workflow/intent` endpoint
   - 修改 `runThemeDefinition` 的 prompts，加入字数限制
   - 修改 `prepareSinglePage` 为单调用实现
   - 重写 `buildFinalImagePrompt`
   - 修改 `runSplitPlan` 支持接收 `documentDraft` 作为输入
   - 更新 `createWorkflowPage` / `normalizeThemeDefinition` 以适应新字段

2. `D:/pptgen/public/v2/index.html`
   - Split 阶段增加模式切换按钮
   - 新增意图输入 textarea、受众 input、生成草稿按钮
   - 新增文档草稿预览/编辑面板

3. `D:/pptgen/public/v2/app.js`
   - 扩展 state、loadState、saveState
   - 绑定模式切换事件
   - 新增 `generateDocumentDraft` handler
   - 修改 `runSplit` 以根据模式发送 `content` 或 `documentDraft`
   - 更新页面列表渲染以展示 targetChars / maxChars

4. `D:/pptgen/public/v2/styles.css`
   - 新增 `.mode-toggle`、`.draft-preview`、`.draft-editor` 样式

## Verification

1. 启动服务器后，在 v2 界面测试：
   - 选择"只有大致想法"模式，输入"智能玻璃在建筑中的应用"，点击生成草稿
   - 检查返回的文档草稿是否每页有 targetChars/maxChars，字数是否在范围内
   - 编辑草稿后执行拆分，检查 Job 的 pages 是否正确继承草稿内容

2. 测试主题生成：
   - 输入主题关键词，检查返回的 `modelPrompt` 长度是否 ≤ 350 字符
   - 检查 `displaySummaryZh` 中是否有精简提示（若触发了截断）

3. 测试页面生成：
   - 选一页点击生成，在浏览器 Network 面板中查看 `/api/workflow/page/generate-v2` 的请求 payload
   - 检查 prompt trace 中的 `finalImage.prompt` 长度是否显著缩短（目标 < 1500 字符）
   - 对比生成结果的质量：排版是否更干净、装饰是否不过度

4. 兼容性测试：
   - 用旧版 localStorage 数据刷新页面，确认新字段有默认值，不报错
   - 测试"我已写好全文"模式，确认原有链路仍正常工作

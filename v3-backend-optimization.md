> **Note:** This is a historical planning document from 2026-04. The project remains on v2; the optimizations described here (concurrency, label renames, CPU profiling) have since been implemented or superseded by later changes. See the current codebase for the up-to-date implementation.

# PPT Studio v3 后端优化计划 (Backend Optimization Plan)

## 1. 目标与背景
为了配合全新 v3 (Glassmorphism) 的高质感体验，我们需要优化后端工作流 (`workflow-service.js`)，解决后台多页准备过慢的问题，并优化部分偏好选项的文案，使其更符合专业生产力工具的调性。

**注意：本次优化仅涉及性能与选项文案，不再修改生图 Prompt 中关于视觉风格的部分。**

## 2. 优化实施步骤

### 阶段一：文案与选项字典优化 (Text & Labels Optimization)
目标文件：`workflow-service.js` 和 `public/v3/app.js`

*   **重命名标签与选项**，提升专业感：
    *   `styleMode` (风格模式) -> **视觉基调** (商务稳重 / 学术严谨 / 创意发散)
    *   `layoutVariety` (版式变化) -> **版式律动** (统一规范 / 适度变化 / 多样非对称)
    *   `detailLevel` (视觉细节) -> **细节精度** (极简留白 / 均衡打磨 / 丰富质感)
    *   `visualDensity` (留白与信息量) -> **信息密度** (呼吸感留白 / 均衡可读 / 紧凑充实)
    *   `compositionFocus` (图文主次) -> **构图重心** (图表主导 / 图文平衡 / 文字主导)
    *   `dataNarrative` (数据页表达) -> **数据叙事** (极简数字 / 结构化图表 / 场景化可视化)
    *   `pageMood` (整体气质) -> **情绪氛围** (理智冷静 / 现代清新 / 戏剧张力)

*   **AI 处理模式 (`AI_PROCESSING_MODES`) 优化**：
    *   `strict`: "严格模式：忠于原意不扩写"
    *   `balanced`: "润色模式：适度整理与提炼"
    *   `creative`: "发散模式：深度扩写与桥接"

### 阶段二：受控并发加速 (Concurrency Optimization)
目标文件：`workflow-service.js` 中的 `prepareWorkflowJob` 函数。

*   **现状**：当前使用同步的 `for...of` 循环，导致如果一份 PPT 有 15 页，需要等待非常久才能全部准备完毕。
*   **方案**：引入 `Promise.all` 和分块（Chunking）机制。
    *   设定 `CONCURRENCY_LIMIT = 3`，防止瞬间发出大量请求导致大模型 API 限流（Rate Limit）。
    *   将 `job.pages` 按 3 页一组进行切分。
    *   在每一组内使用 `Promise.all` 并发调用相关函数。

### 阶段三：冗余计算优化 (CPU Profiling)
目标文件：`workflow-service.js`

*   在 `preparePageForGeneration` 函数中，对长文本进行正则解析后，确保结果稳妥缓存在 `page.onscreenContentText` 和 `page.visualElementsPrompt` 中，避免在循环和二次整理时重复触发昂贵的正则表达式。

## 3. 风险与回滚 (Risks & Rollback)
*   **并发限流**：若并发数为 3 仍触发云厂商报错（如 HTTP 429 Too Many Requests），将回退至传统的单步 `await`。
*   此修改仅存在于后端内存和逻辑层，不会影响现有的本地配置文件，回滚极其安全。

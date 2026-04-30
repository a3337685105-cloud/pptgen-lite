# v2 Workflow Cleanup Archive

日期：2026-04-20

## 清理对象
- `public/v2/app.js`
  - 早期被后定义覆盖的重复函数已移除，主要包括：
    - `runSplit`：历史位置约 `1213 / 2487 / 3332`
    - `renderPagesWorkbench`：历史位置约 `807 / 1854 / 2151 / 2835 / 3503 / 4025`
    - `reprepareCurrentPage`：历史位置约 `1298 / 2589 / 4060`
    - 同期一起清掉的重复入口还包括：
      - `generateCurrentPage`
      - `batchGenerateReadyPages`
      - `renderPageList`
      - `formatOnscreenPreview`
      - `bindEvents`
      - `syncCurrentPageGenerateUi`
      - `splitOnscreenContentForEditor`
      - `composeOnscreenContentFromEditors`
      - `upgradeSmartUiLayout`
- `workflow-service.js`
  - 早期被后定义覆盖的重复函数已移除，主要包括：
    - `prepareWorkflowJob`：历史位置约 `1566 / 1593`
    - `buildFinalImagePrompt`：历史位置约 `1661 / 1706 / 1721`
    - `runPageExpansion` 的早期重复实现

## 清理原因
- 这些旧函数已经被文件后段的同名函数覆盖，继续保留会造成“看起来改了，但实际没生效”的错觉。
- prompt 责任拆分、分页编辑器和生图链路在后续演进中已经改过多轮，旧实现会误导排查。
- 当前主文件只保留单一真相来源，避免继续堆叠补丁。

## 当前替代入口
- `public/v2/app.js`
  - 当前唯一生效的拆分入口：`runSplit`
  - 当前唯一生效的单页整理入口：`reprepareCurrentPage`
  - 当前唯一生效的页工作台渲染：`renderPagesWorkbench`
  - 当前唯一生效的批量/单页生图入口：
    - `batchGenerateReadyPages`
    - `generateCurrentPage`
- `workflow-service.js`
  - 当前唯一生效的最终生图 prompt 装配：`buildFinalImagePrompt`
  - 当前唯一生效的页面准备入口：`prepareWorkflowJob`

## 备注
- 本文档只记录旧入口位置与替代关系，不再保留整段尸体代码。
- 如需回溯具体历史实现，请结合 Git 历史查看对应提交。

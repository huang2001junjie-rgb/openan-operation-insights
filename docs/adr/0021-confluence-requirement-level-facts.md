# ADR-0021：Confluence 需求级原子事实——`confluence-requirements.json`（个人模式需求明细的唯一来源）

- **状态**：✅ 已接受（2026-11-03）— 新增 `data/confluence-requirements.json`（`schemaVersion` = **1**，ADR-0018 遗留债 1 的**部分**结清）；`collect:wiki` 同轮写入；唯一读路径是 ADR-0020 的 `GET /api/person-confluence-requirements`（04 §5.3.21）。
- **日期**：2026-11-03
- **关联文档**：04 §1 / §1.1 / §3.16 / §4.13 / §5.3.21 / §6.2；07 §1.5（P10）/ §2.2（A12）/ §4（A3/A7 债状态更新）；05 §3（collect:wiki 输出）/ §5.4（离线自检 73 → **91** 项）；03 §8（启动自检：十二个文件、三文件「待采集」WARN 分级）/ §5.2（文件划分）/ §12（自检脚本清单）
- **决策者**：项目负责人（锁定 spec：幂等键、恒全历史、URL 读时派生、待采集降级逐条拍板）

## 背景

ADR-0009 的需求口径是「`Requirement Proposal` 页表格 `Contacts` 列里每个 @ 提及各算 1 条」，落的是**账号级累计计数**（`confluence-accounts.json` 的 `requirements` 维度）。个人模式（ADR-0020）需要回答「这个人负责**哪些需求**」——只有计数没有清单，必须新增**需求行级原子事实**。

约束：

1. **不推翻 A3 / A7 既有口径**：组织级 / 账号级的 `requirements` 计数**仍读账号级累计**（ADR-0009 不变），新事实文件的**唯一读路径**是个人模式明细——两段并存、口径独立，07 §4 已登记差异；
2. **复用现有采集轮**：与需求计数同源同轮（`collect:wiki`），不新增采集动作；
3. **离线可校验**：fixture + 断言，不依赖真实 Confluence。

## 决策

### 决策 1：事实粒度 = 需求行 × 联系人提及，幂等键 `pageId+rowIndex+accountId`

一条事实 = 「某账号在某页某需求行的 Contacts 列被 @ 提及」。行内同一账号重复提及只记一条（幂等键天然去重）；**页面整体替换语义**——重采时按 `factKeys` 去重后整体落盘。实体 `ConfluenceRequirementEvent`（04 §3.16）：`accountId / requirementTitle / pageId / pageTitle / release / rowIndex`。

### 决策 2：`release` = 祖先链中「Release Planning」之下的一级；解析不到为 `null`

沿用需求页的既有结构选择器（ADR-0009）：页须位于 `Release Planning` 之下（排除 `Releases` 下的同名模板页）。`release` 取**直接父级**（如 `26.4`）；解析不到时事实**照常落盘**、`release=null`——明细层显式「—」供人工核对，**不做 guess**（与全站「缺失可见」原则一致）。

### 决策 3：恒全历史，无时间维度

事实**不带**时间戳，读侧不接 `from` / `to`。理由：需求行的「时间」在源系统不存在——页级 `createdDate` 是整页共享元数据，挂到行上会暗示「这条需求在那一天提出」（行是后补的），误导性大于可用性。这与 Confluence 账号级计数「恒全量」是同一裁定的行级推广（ADR-0018 决策 5）。

### 决策 4：校验恒等 + 失败即拒写

写入前**采集期**校验恒等式：`requirementFacts` 条数 ≡ 本轮解析出的有效提及数——不等即拒绝写盘（保留上一轮）。与 ADR-0009 的「需求 / 议题分享两维全 0 中止」同策略：宁可保留旧数据，不让半轮数据污染读侧。⚠️ 该恒等式以**提及数**为分母：行内重复提及被幂等键折叠、纯文本联系人不产事实，断言覆盖这两种折叠。

### 决策 5：纯文本联系人只进 `unresolvedContacts`，不产事实

正文里写成纯文本的 `@人`（解析不出 accountId）与 ADR-0009 同路径——只写入状态文件 `unresolvedContacts[]` 供运营补录，**不产生需求事实**（事实键需要 accountId）。

### 决策 6：URL 读时派生，采集期不落盘页面链接

事实**刻意不落盘** `url`：读侧按 `{confluence.baseUrl}/wiki/pages/viewpage.action?pageId={pageId}` 派生；baseUrl 未配置时 `url` 为空串、前端退化为纯文本。避免 baseUrl 变更导致全量重写，也避免在事实层存环境相关字段。

### 决策 7：缺失语义 = 「待采集」而非错误

与 P9（`github-events.json`，缺失 → 读侧 `50001`）**刻意不同**：`confluence-requirements.json` 缺失（首次 `collect:wiki` 前）捕获「数据文件缺失」降级为**空数组 + `updatedAt=null`**，前端渲染「待采集」空态（提示运行 `npm run collect:wiki`）；启动自检只 WARN。文件**存在但结构非法**仍是 `50001`（真故障不降档）。

### 决策 8：落盘形态与观测

- `JsonFileEnvelope<ConfluenceRequirementEvent[]>`（schemaVersion **1**），记录按 `pageId → rowIndex → accountId` 排序（读侧二分 / 调试 diff 友好）；
- `confluence-snapshot` / `.sync-state.confluence.json` 增加 `requirementFactCount` / `requirementFactsCount` 观测字段；采集日志统计行加 @ 前缀计数分档；
- fixture：`confluence-records.requirements.sample.json`（含 release 命中 / 无 release 层 / 模板页排除 / 纪要页议题分享不误入需求事实四种场景）；`confluence-check.mjs` 新增 14 项断言（73 → **91** 项）。

## 影响

| 面 | 内容 |
| --- | --- |
| 数据 | 新增 `confluence-requirements.json`（v1）；`confluence-accounts.json` **不变**（账号级累计仍是 A3 / A7 的读源） |
| API | 唯一读路径 `GET /api/person-confluence-requirements`（ADR-0020）；组织级接口零改动 |
| 前端 | 个人模式需求事实卡（A12）：恒全历史标注、release「—」空值、待采集空态、读时 `url` 深链 |
| 采集 | `collect:wiki` 同轮两阶段提取 + 恒等自检；失败即拒写（保留旧文件）；状态文件 +2 观测字段 |
| 自检 | `collect:wiki:check` 73 → **91** 项；启动自检 WARN 集合新增；`person:check` 覆盖缺失降级与 URL 派生 |
| 遗留 | 议题分享 / 版本作者仍是账号级累计（ADR-0018 遗留债 1 仅**部分**结清，07 §4 已更新）；A3 / A7 与 A12 口径并存差异已登记 |

## 备择方案（Why not）

- **直接扩 `confluence-accounts.json` 挂需求清单**：账号级文件的读侧是组织级聚合（A3）——在账号条目里嵌需求数组会让组织级求和承担明细传输成本，且 schemaVersion 迁移波及 A3 / A7 既有断言；独立事实文件是 ADR-0017「一份原子事实」的直接应用。
- **事实带 `createdDate`（页级时间）支持区间**：见决策 3——行级时间在源系统不存在，伪造时间维度比没有更糟。
- **缺失也走 `50001`**：`github-events.json` 缺失即 500 是因为 GitHub 侧派生端点**全部**依赖它；需求事实只有一个读路径且是增强型明细——把「还没跑过新版采集器」当 500 会阻断个人模式其余全部功能（GitHub 明细与画像都不依赖它）。降级 + 显式空态是能力渐进放出的正确语义。

# ADR-0007：Confluence 需求数据按「标签 ∪ 标题」判定、按「人 → 组织」归属，且聚合为全量替换

- **状态**：**部分被取代**（决策 1「判定口径」与决策 5「`bestPractices` 恒 0」由 [ADR-0009](./0009-confluence-two-dimension-extraction-from-page-body.md) 取代；决策 2/3/4/6/7/8/9 仍然有效）
- **日期**：2026-09-28
- **关联文档**：05 §3 / §5.3 / §5.4、04 §3.3 / §3.9 / §3.10、08 A3；**修订** 05 §3 原设计的标签假设
- **取代说明**：本文的判定口径是**页面级启发式**（标题关键字命中即算 1 条），实测后发现真正的计数单位是
  「`Contacts` 单元格里的账号」，且第二个维度应为会议议题分享而非最佳实践 —— 详见 ADR-0009。
  阅读本文时请注意下述决策 1、5 已被改写。
- **命名说明**：本文保留决策当时的文件名；`data/wiki.json` / `seed-data/wiki.json` 已更名为 `confluence-organizations.json`，对照见 ADR-0008。

## 背景

阶段三要给社区活跃度页的 Confluence 维度填上「需求数」。原设计（05 §3）建立在三条假设上：

1. 空间内已约定 `需求` / `best-practice` 标签，采集器「只认标签」；
2. 页面有「所属组织」自定义字段，可直接取；
3. 可照 GitHub 的做法用 `lastmodified >= lastSyncAt` 做增量。

2026-09-28 对真实空间 `OpenAN` 的只读取数（53 页，创建于 2026-05-29 ~ 2026-09-22）显示**三条假设全部不成立**：

- 标签全集仅 `tsc-minutes`(14) / `pac-minutes`(3) / `marketing-minutes`(1)，35 页无任何标签，**没有任何需求标签**。「只认标签」会让需求数恒为 0。
- 需求内容以**页面树**形式存在：`OpenAN Project Home / Releases / Release Planning / OpenAN 26.12 / Requirement Proposal`（另有 `Requirement Proposal Template`）。
- 页面级**没有组织概念**，只有个人账号 `creatorAccountId`；创建者是 5 名自然人。

同时，04 §3.9 / §3.10 早已把「归属」定义了唯一真相：`Person.orgId`，并明确 `IdentityClaim.accountKey` 对 `confluence` 来源取 accountId。也就是说「平台账号 → 自然人 → 组织」这条通路**本就存在，只是没人接**。

另有一处实现约束：`GithubSyncStateStore.write()` 是**整体覆盖**写 `data/.sync-state.json`，Confluence 若复用会清掉 GitHub 游标。

## 决策

1. **判定口径 = 标签白名单 ∪ 标题关键字白名单**，两者均可经环境变量覆盖（`CONFLUENCE_REQUIREMENT_LABELS` / `CONFLUENCE_REQUIREMENT_TITLE_KEYWORDS`）。一页命中多次只计一次 —— 需求数统计的是**页面数**，不是标签出现次数。
2. **CQL 只负责「取全」**：`space in (...) and type=page order by created asc`，**不在检索侧过滤标签**。口径收敛留在聚合层，口径一变只需重算，不必重新请求平台。
3. **归属走既有档案通路**：`aliases.confluence`（组织级显式信号，匹配创建者 accountId / 展示名 / 空间 key）→ 身份认领边（`source=confluence` + `accountKey=accountId` → `Person.orgId`）→ 伪组织 `unattributed`。**不按展示名模糊匹配**。
4. **未归属即输出待补清单**：未命中的创建者按页数排序写入状态文件 `unattributedCreators`（accountId + 展示名 + 页数），并在采集日志里逐条列出。
5. **`bestPractices` 恒为 0**：best-practices 不在 Confluence wiki 内（用户确认）。字段按 04 §3.3 必填保留，但**不伪造来源**，待另立来源后再填。
6. **不做增量，恒全量重算**：聚合是「按 orgId 整体重写」的全量替换语义，只取增量页面会把未变更页面的计数一起洗掉。安全增量需要一份「已计入页面」的按页账本，当前量级不值当。显式传 `--mode=incremental` **直接报错**，不静默降级。
7. **状态文件独立**：`data/.sync-state.confluence.json`。
8. **写入前校验**（05 §5.1）：结构（计数为非负整数）、空值（一页未取到、或无一页命中口径即中止）、回退保护（真实组织归属结果全为 0 而既有数据非 0 时拒绝覆盖）。
9. **原始快照落 `data/source/confluence/`**（非契约文件，接口与前端不可见），仅在 `--report-only` / `--snapshot` 时落盘，避免目录无意义累积。

## 理由与取舍

| 选项 | 结论 |
| --- | --- |
| 判定口径：只认标签 / 标签 ∪ 标题 / 只认标题 | **标签 ∪ 标题**。实测无需求标签，只认标签恒为 0；只认标题则平台将来规范标签后要改代码。两个白名单都可配置，改口径不动代码 |
| CQL 是否在检索侧过滤标签 | **不过滤**。检索侧过滤把口径焊死在请求里，口径一变就要全量重跑平台请求 |
| 归属：展示名模糊匹配 / 认领边精确匹配 | **精确匹配**。同名会静默错归，而认领边机制正是为规避这一点存在 |
| 增量 / 全量 | **全量**。省下的是 1 次请求（实测整空间 1 次请求取全 53 页），换来的是「增量必然洗掉未变更计数」的静默数据损坏风险 |
| 状态文件：复用 `.sync-state.json` / 独立 | **独立**。复用会被 GitHub 的整体覆盖写清掉 |
| 空结果：写 0 / 中止并保留旧数据 | **中止**。全 0 更可能是口径或权限出错，而不是「真的没有需求」 |

## 后果

**正面**

- 活跃度页的 Confluence 需求数从恒为 0 变为真实可得，且口径可解释、可复算（快照在手）。
- 需求数与 GitHub 维度共用同一套「人 → 组织」档案，组织身份不会在两个来源间分裂。
- 口径失配、权限失败、归零回退都有明确的中止与日志，不会静默污染看板。

**负面（明知并接受的负债）**

- **判定口径是启发式的**：标题关键字默认 `requirement` 会把 `Requirement Proposal Template`（模板页）一并计入。当前 2 页命中里有 1 页是模板 —— 运营确认口径后可用环境变量收紧。
- **归属当前几乎全空**：`identity-claims.json` 尚无 `source=confluence` 的认领边，首次采集 2 页全部落在独立开发者。这不是缺陷而是「数据尚未补」，待补清单已在状态文件中。
- **全量重算**：页面量级到上万时需要重新评估。
- **快照按时间戳命名会累积**：未做自动保留策略，需人工清理。
- `CONFLUENCE_LOOKBACK_DAYS` 当前是**未使用的配置项**，为将来按页账本的增量模式保留。

**不受影响**

- `data/wiki.json` 契约与 `schemaVersion` 不变；API 只读链路、Controller/Service/DTO、前端均零改动。
- GitHub 采集与其状态文件不变。本次另补齐了 `seed-data/wiki.json`，顺手修好原先因缺该种子而**必然失败**的 `npm run collect:github:check`。

## 备注

- 实测踩坑：v1 search 默认不回传 `space`，`expand` 漏了它会导致 `spaceKey` 全为空（首次取数即中招，已修）。
- 实测踩坑：CQL 的 `order by` 是**独立子句**，不能用 `and` 连接，否则报 `Could not parse cql`。
- 08 文档 P7（Confluence 账号级候选池）仍无来源：`candidate.service.ts` 的 `loadConfluence()` 仍返回空。本轮最小范围不含它，但采集器已掌握产出候选所需的事实（accountId + 展示名 + 页数）。

# ADR-0010：人工认领覆盖 Confluence 展示口径（生效归属读时派生）

- **状态**：✅ 已接受（2026-09-28）
- **日期**：2026-09-28
- **关联文档**：04 §1 / §3.11 / §4.10 / §5.2 / §5.3.4 / §5.3.11 / §5.3.16 / §6.2；02 §4 / §7.1 / §8.2；08 §1.2 / §2.2 / §3.2.1 / §4；ADR-0008（决策 3 部分被本 ADR 取代）/ ADR-0009
- **决策者**：项目负责人（R2-1～R2-7、R3-1～R3-6 逐条拍板）

## 背景

ADR-0008 决策 3 让「采集器自动归属（展示口径）」与「人工 `Person.orgId`（控制台口径）」**并存、互不覆盖、不自动仲裁**，展示不受人工归属影响。本轮（前端展示 Confluence 数据）确认该结论**对 Confluence 侧不再适用**：

1. 首次真实采集时 `aliases.confluence` 与 `source=confluence` 认领边**均为空**，两个维度的计数**全部落在伪组织 `unattributed`**；若认领不能改变展示归属，活跃度页的 Confluence 视图将永远只有「独立开发者」一块，功能失去意义。
2. 运营去认领账号的动机**正是**纠正自动归属，人工应为权威。

事实核查（2026-09-28）：`confluence-collector.service.ts` 的 `resolveAccountOrg` **已有**认领边路径，但（a）优先级排在 `aliases` **之后**，（b）结果被烘焙进账号级文件的 `orgId`，（c）只在 `npm run collect:wiki` **全量重算**时刷新。故现状下认领「既不一定生效、也不立即生效」。

## 决策

| # | 问题 | 决策 |
| --- | --- | --- |
| 1 | 裁决优先级 | **人工认领优先**：`effectiveOrgId = claimOrg(accountId) ?? 采集器结果(alias → 空间 → unattributed)` |
| 2 | 生效时机 / 实现层级 | **读时派生**：接口请求时用「账号级事实 + 认领边」现算；采集器不再裁决认领 |
| 3 | 落盘 vs 对外语义 | 落盘 `orgId` 保持**采集口径**；接口与候选池一律输出**生效口径** `effectiveOrgId`，并附 `orgSource` 标明来源 |
| 4 | 边界规则 | 认领到**无 `orgId` 自然人** → 回落采集器结果（不清零）；**解除认领** / **改 `Person.orgId`** → 立即回落 / 跟随 |
| 5 | 范围 | **本轮只做 Confluence**；抽共享纯函数 `resolveEffectiveOrg`，GitHub 将来复用 |
| 6 | 采集器的认领逻辑 | **移出**采集器；`unattributedAccounts[]` 语义转为「未经认领 / 别名归属的待办清单」 |

### 生效归属（决策 1～3）

```
账号级原子事实（confluence-accounts.json）
  ├─ orgId       落盘 = 采集器自动归属（alias → 空间 → null），每轮重算
  ├─ orgSource   落盘 = 'alias' | 'space' | 'unattributed'
  └─ confluence  { requirements, topicShares }

读时派生（resolveEffectiveOrg）
  claimOrg           = 认领边(source=confluence, accountKey=accountId) → Person.orgId
  effectiveOrgId     = claimOrg ?? orgId ?? 'unattributed'
  effectiveOrgSource = claimOrg ? 'claim' : orgSource
```

- `orgSource` 取值 `'alias' | 'claim' | 'space' | 'unattributed'`；落盘只写 `alias / space / unattributed`，读时在认领命中时覆写为 `'claim'`。
- 认领边按 `accountId`（小写归一）精确匹配，**不做展示名模糊匹配**（同名会静默错归，认领边机制的存在正是为了规避这一点）。

### 组织级聚合（决策 2）

`GET /api/wiki` 不再读 `confluence-organizations.json`，改为：读账号级 `confluence-accounts.json` + 认领边 + 组织档案 → 按 `effectiveOrgId` 求和 → 覆盖组织档案全部组织（含伪组织 `unattributed`），未命中记 0。于是「组织级 = 账号级按 org 求和」由**口头约定**升级为**结构上恒成立**（不依赖任何重算时机）。

`confluence-organizations.json` 仍由采集器写入，但**退化为无认领基线快照**（供离线核对，读路径不再依赖）。

## 理由与取舍

- **为什么人工优先**：运营认领的动机就是纠正自动归属；若自动别名压过人工，「认领」对展示毫无作用。代价是自动归属被人工覆盖——这正是期望行为。
- **为什么读时派生而非写时回写**：认领立即生效，无需与采集器争抢对 `confluence-organizations.json` 的写入（避免双写方互相覆盖）；单一事实源（账号级 + 认领边）；不变式结构上恒成立。代价是每次请求多做一次 join（账号量级数十～数百，可忽略）。
- **为什么采集器仍保留 `orgId`**：账号级 `orgId` 是「无认领时的兜底归属」，也是「采集器看到了什么」的审计线索；把兜底留在落盘、把「生效归属」放在读时，职责清晰、可解释。
- **为什么只做 Confluence**：本轮范围由 Confluence 展示驱动；GitHub 侧同构改造牵涉其组织级 / 账号级双写（ADR-0008 遗留债 2），需另行评估。
- **为什么新增 `effectiveOrgId` 而非直接改写 `orgId`**：与落盘 `orgId`（采集口径）区分，避免同名两义。

## 后果

### 受影响面

- **契约（破坏性）**：`ConfluenceAccount` 新增必填 `orgSource`（采集器落盘）→ 账号级 `schemaVersion` **2 → 3**；接口出参新增 `effectiveOrgId`、`orgSource`（读时计算，不改落盘 schema）。
- **`GET /api/wiki`**：改为读账号级派生（不读 `confluence-organizations.json`）；响应仍为 `OrganizationWiki[]`，`confluence` 口径不变。
- **`GET /api/confluence-accounts`**：改输出生效口径，新增 `effectiveOrgId` / `orgSource`，并可携带 `personId`。
- **`GET /api/identity/candidates`**：`confluence` 分组改读**账号级**（不再读组织级、不再恒空），并返回 `metrics`；`IdentityCandidate` 改为**来源判别联合**：`github` 带 `{pullRequests,commits,issues,linesChanged}`、`confluence` 带 `{requirements,topicShares}`、`meeting` 无 `metrics`。
- **采集器**：`buildClaimIndex` 与认领优先级从 `resolveAccountOrg` 移除；账号级落盘新增 `orgSource`。
- **前端**：活跃度页新增来源切换器（`?source=`）与 Confluence 视图及三态空态；身份控制台候选池接入 Confluence 分组并支持深链 `?source=confluence`。
- **文档**：本 ADR；ADR-0008 决策 3 标注被取代；04、02、08、`CONTEXT.md`。

### 不变

- `OrganizationWiki` 实体字段与 `GET /api/wiki` 响应形状不变（仅数据来源改为读时派生）。
- `IdentityClaim` / `Person` / `Organization` 结构不变。
- 采集口径（`requirements` / `topicShares` 的计数规则）不变，见 ADR-0009。
- 写接口仅存在于 `/api/identity/*`；鉴权与缓存约定不变。

### 遗留技术债（登记）

1. GitHub 侧仍是「认领不影响展示」+ 组织级 / 账号级双写，与本 ADR 的 Confluence 处理**不一致**；收敛需另立 ADR。
2. `confluence-organizations.json` 降级为快照后，若被误当权威会读到旧口径；已在 04 / 08 标注「非读路径来源」。

## 备注

- 本 ADR 由一轮「拷问式评审」（grill-with-docs）产生：先给建议与取舍，再由决策者逐条拍板。
- 关键证据：`apps/api/src/collector/confluence/confluence-collector.service.ts`（`resolveAccountOrg` / `buildClaimIndex` / `lookupAlias`）、`apps/api/src/modules/identity/candidate.service.ts`、`apps/api/src/contract/entities.ts`（`ConfluenceAccount` / `IdentityCandidate` / `IdentitySource`）、`apps/api/src/repositories/repositories.module.ts`（`schemaVersion`）。

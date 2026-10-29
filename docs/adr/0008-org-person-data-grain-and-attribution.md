# ADR-0008：数据粒度（组织级 / 账号级）与组织归属的并存口径

- **状态**：✅ 已接受（2026-09-28）— **决策 3「归属并存」已被部分取代**：Confluence 侧由 [ADR-0010](./0010-claim-overrides-confluence-display-attribution.md)、GitHub 侧由 [ADR-0017](./0017-github-effective-attribution-read-time-derivation.md) 改为「人工认领优先、读时派生生效归属」。双粒度（决策 2）、命名收敛（决策 4）、身份候选池范围（决策 5）**继续有效**。
- **日期**：2026-09-28
- **关联文档**：04 §3.2 / §3.3 / §3.7 / §4.4 / §4.5；05 §3；07（A1–A3 / P2 / P5 / P7）；ADR-0003 / ADR-0007
- **决策者**：项目负责人（对下述 6 个问题逐条拍板）

## 背景

起因：原方案中 `wiki.json` 只有组织级、GitHub 侧却是「组织级 + 个人级」两套，且两侧命名与粒度不齐。评审确认了以下现状：

1. **GitHub 已是两层，只是没按两层设计**：组织级 `contributions.json`（`OrganizationContribution`，→ `GET /api/contributions` → `ActivityTable`）与个人级 `contributors.json`（`Contributor`，→ `GET /api/contributor-contributions` → `ContributorRankCard`）。
2. **Confluence 只有一层**：`wiki.json`（`OrganizationWiki`）仅落 `orgId` 计数；每页 `creatorAccountId` 取到后在聚合时丢弃。
3. **命名易混**：`contributions.json`（组织）vs `contributors.json`（个人），一个字母之差。
4. **「个人」有歧义**：`Contributor` 是**平台账号**档案，`Person` 是**自然人**。
5. **组织归属有 3 条并行路径、零校验**：采集器自动归属（`aliases` + `emailDomains`）、身份控制台人工 `Person.orgId`、组织级独立再算一遍。彼此之间无任何比对代码。
6. **「个人之和 = 组织之和」只是口头约定**（07 §A2），无断言保证。

## 决策

| # | 问题 | 决策 |
| --- | --- | --- |
| 1 | 个人级 Confluence 是否要展示 | **要**。需产出账号级契约数据与读接口（前端展示另排期，本轮不动前端） |
| 2 | 「个人」的落点 | **平台账号级为事实**（GitHub `githubId` / Confluence `accountId`）；**自然人由手动匹配（认领边）派生**，未匹配前只到账号。账号级事实**不落** `personId` 作为键 |
| 3 | 归属唯一真相 | **并存**：保留采集器自动归属（展示口径）与人工 `Person.orgId`（控制台口径），不合一；新增交叉比对。（**已全部修订**：Confluence 侧由 [ADR-0010](./0010-claim-overrides-confluence-display-attribution.md)、GitHub 侧由 [ADR-0017](./0017-github-effective-attribution-read-time-derivation.md) 先后改为「人工认领优先、读时派生生效归属」，本行「并存、互不覆盖、展示不受人工影响」的结论**对两个来源均不再适用**；本 ADR 的双粒度结论（决策 2）继续有效） |
| 4 | 命名收敛 | **改文件路径**：统一为 `<source>-<grain>.json` |
| 5 | 一致性校验 | **提醒（WARN），不打断**进程、不清零、不改数据 |
| 6 | 本轮范围 | **不动前端** |

### 命名收敛（决策 4）

| 旧路径 | 新路径 | 契约实体 | 粒度 |
| --- | --- | --- | --- |
| `data/contributions.json` | `data/github-organizations.json` | `OrganizationContribution` | 组织级 |
| `data/contributors.json` | `data/github-accounts.json` | `Contributor`（GitHub 账号） | 账号级 |
| `data/wiki.json` | `data/confluence-organizations.json` | `OrganizationWiki` | 组织级 |
| （无） | `data/confluence-accounts.json` | `ConfluenceAccount`（新增） | 账号级 |

规则：`<source>` ∈ {`github`, `confluence`}；`<grain>` ∈ {`organizations`, `accounts`}。**用 `accounts` 而非 `persons`**，因为个人级事实的主体是**平台账号**（决策 2），不是自然人 —— 避免与既有 `data/persons.json`（自然人档案）混淆。

### 粒度模型

```
             组织级（组织视图）              账号级（个人视图）
GitHub       github-organizations.json  ←→  github-accounts.json
Confluence   confluence-organizations.json ←→ confluence-accounts.json
```

- **组织级**读者：社区活跃度页、首页卡片墙、贡献聚合总量。
- **账号级**读者：个人贡献排行、候选池（P7）、身份匹配控制台（P5/P6）。

### 不变式（决策 5：提醒而非断言失败）

对每个来源：`组织级[orgId].requirements == Σ 账号级(归属为该 orgId 的账号).requirements`（含伪组织 `unattributed`）。不满足时打印 WARN + 差异明细，**进程照常成功退出**，数据照常写入。

### 归属并存（决策 3）

| 口径 | 维护方式 | 用途 | 是否被采集器改写 |
| --- | --- | --- | --- |
| 采集器自动归属（`aliases` + `emailDomains`） | 自动 | 展示口径 | 是（每轮重算） |
| 人工 `Person.orgId`（经 `identity-claims.json` 认领边） | 人工 | 控制台口径 | 否 |

同一账号在两个口径下归属不一致时 → WARN 列出冲突（不覆盖、不阻断）。

> **修订（2026-09-28）**：上表对 **Confluence** 已不再成立。经 [ADR-0010](./0010-claim-overrides-confluence-display-attribution.md) 决策，Confluence 的展示口径改为「人工认领优先、读时派生」：账号级落盘 `orgId` 仍记采集口径，但接口与候选池一律输出 `effectiveOrgId = 认领边派生的 Person.orgId ?? 采集器结果`。GitHub 侧维持本表结论不变。

> **修订（2026-10-28）**：上表对 **GitHub** 亦已不再成立。经 [ADR-0017](./0017-github-effective-attribution-read-time-derivation.md) 决策，GitHub 侧收敛为与 Confluence 同构的一套生效归属（`effectiveOrgId = 认领边派生的 Person.orgId ?? 账号级 orgId ?? 'unattributed'`，读时派生），首页独立开发者人数、组织卡 commits 与 top3、活跃度页个人排行全部改用该口径。**至此「两套归属并存、展示不受人工影响」的结论在全库失效**，本 ADR 仅保留双粒度（决策 2）与命名收敛（决策 4）等结论。采集器仍写账号级 `orgId` 与组织级 `github-organizations.json`，二者**降级为基线快照**（兜底归属 + 审计线索 + 漂移告警），读路径不再依赖。
>
> **补记（同日，ADR-0017 决策 15）**：本 ADR 决策 2「**平台账号级为事实**」被进一步强化——GitHub 账号级文件自此也是**仓库集合的唯一真相**：`github` 下新增必填 `repoIds`（去重仓库全名清单），`github-accounts.json` `schemaVersion` **1 → 2**；组织级「参与仓库数」由**求和**改为取桶内 `repoIds` 的**并集大小**（求和会把跨账号共用的仓库重复计数：`huawei` 曾显示 51 而范围内仓库只有 13）。增量基线也改由业务文件自持（`buildContributorSeed` 不再读 `.sync-state.json`），`.sync-state.json.personRepos` 降为审计 / 回填来源。「组织级 = 账号级派生」这一方向因此覆盖了 GitHub 侧**全部五项指标**，而不只是四项计数。

## 理由与取舍

- **为什么账号级而非自然人级为事实**：`personId` 可改名、可合并、可拆分，不是稳定事实键；账号是平台给的稳定标识。自然人归属是**判定结果**，随认领边变化，故作为派生值。
- **为什么 Confluence 也做账号级契约**：需求已明确「个人级 Confluence 要展示」，且账号级事实能同时喂候选池与身份控制台；只做内部产物会迫使将来返工。
- **为什么统一命名**：单个字母差异（`contributions` / `contributors`）是持续误读源；`<source>-<grain>` 可 grep、可推断。
- **为什么归属不合一**：合一要么让展示依赖人工录入（覆盖率下降），要么让控制台依赖自动规则（失去人工权威）。并存 + 交叉提醒是成本最低的折中；这是**有意的技术债**，见「后果」。
- **为什么一致性只提醒**：数据漂移的常见来源是运营正在补录的中间态，硬失败会卡住采集；提醒足以被运维发现。

## 后果

### 受影响面

- **契约文件重命名**（破坏性、但前后端零感知）：代码侧唯一改动点是 `repositories.module.ts` 中 3 处 `makeRepository('...')` 的文件名；采集器与 API 都经 `JsonRepository` 读写，故改名不影响调用方。离线自检脚本（`collector-check.mjs` / `confluence-check.mjs` / `identity-check.mjs`）与 `scripts/fixtures/seed-data/` 需同步文件名。
- **新增账号级 Confluence 契约**：`ConfluenceAccount` 实体、校验器、仓储 token、`confluence-accounts.json` 写入、读接口 `GET /api/confluence-accounts`（本轮不对接前端）。
- **归属逻辑收敛**：抽取共享归属函数，GitHub 与 Confluence 共用；新增两项 WARN（跨口径冲突、求和一致）。
- **文档**：04（粒度模型 + 新文件路径 + 新实体）、05、07（A3/P7/待办）、`CONTEXT.md` 术语表。

### 不变

- API 路由、DTO 出参字段、`schemaVersion`、前端：**全部不动**（决策 6）。
- `bestPractices` 仍恒为 0（来源不在 wiki 内，见 ADR-0007）。（**修订**：第二维已由 [ADR-0009](./0009-confluence-two-dimension-extraction-from-page-body.md) 改为真实可得的 `topicShares`；本 ADR 的**双粒度与归属结论不受影响**，仅字段名与取值来源变更。）

### 遗留技术债（登记）

1. 归属双口径并存 → 长期存在冲突可能，靠 WARN 兜底；未做自动仲裁。（**已结清**：Confluence 侧由 [ADR-0010](./0010-claim-overrides-confluence-display-attribution.md)、GitHub 侧由 [ADR-0017](./0017-github-effective-attribution-read-time-derivation.md) 先后改为人工认领优先、读时派生，两个来源均不再双口径并存。）
2. 组织级与账号级**双写**（GitHub 侧）；Confluence 侧改为「账号级聚合 → 派生组织级」，可消除该类漂移，GitHub 侧暂保留并在 WARN 中覆盖。（**部分结清**：[ADR-0017](./0017-github-effective-attribution-read-time-derivation.md) 已把 GitHub 组织级读路径改为账号级派生，**漂移不再影响展示**；但落盘双写结构仍在，彻底合并转登记为 ADR-0017 遗留债 1。该债的实际危害已由 ADR-0017 取证坐实——`github-organizations.json` 与 `github-accounts.json` 同为 2026-09-30 落盘，`huawei` 差 21 commits、`unattributed` 反向差 21，总量相等而分布漂移，长期无人察觉。）
3. 前端尚未消费账号级 Confluence（决策 1 的能力已备好，展示待排期）。

## 备注

- 本 ADR 由一轮「拷问式评审」（grill-with-docs）产生：先给必要性判定，再由决策者逐条拍板。
- 关键证据：`apps/api/src/repositories/repositories.module.ts`（文件路径绑定）、`apps/api/src/collector/github/github-collector.service.ts`（自动归属）、`apps/api/src/collector/confluence/confluence-collector.service.ts`（`resolveOrg` / `buildPersonOrgIndex`）、`apps/api/src/modules/identity/candidate.service.ts`、`apps/api/src/contract/entities.ts`。

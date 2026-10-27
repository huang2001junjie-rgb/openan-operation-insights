# 决策 0016：首页组织卡片改为「展示顺序」人工排位并直出原始贡献指标 + 各维度 top3（综合贡献分退役）

- 状态：**Accepted — 取代 [ADR-0001](./0001-homepage-org-wall-shows-all-orgs.md) 的决策 1（按综合贡献分排序）与决策 3（零分呈现判据），以及 [ADR-0011](./0011-confluence-edit-count-metric.md) 的决策 7（编辑量计入综合贡献分与阈值重标定）**；ADR-0001 的「展示全部组织」「`scope` 参数名不改」与 ADR-0011 的编辑量口径本身**继续有效**
- 日期：2026-10-27

## 背景

运营对首页「贡献的组织」卡片墙提出四项诉求（经三轮拷问逐条敲定）：

1. **组织卡片不按贡献排序**——展示排位是运营意志，与贡献数据解耦，改为人工指定；
2. **不用「综合贡献分」**——加权分是抽象合成值，卡片直接写出**代码贡献量（commit 数量）**与 **Confluence 贡献量**两个原始数；
3. **每个维度加上 top3 贡献者**——代码 / Confluence 两栏各自展示前三贡献者（头像 + 姓名 + 数字）；
4. **卡片文字放大**——logo 3:1 通栏横幅保持不变（运营明确「logo 不变」，推翻最初的「logo 稍微小一点」）。

现状的阻碍：排序走 `organization.service.ts` 的 `computeScore` 综合贡献分降序（ADR-0001 决策 1）；`OrganizationCard` 只有 `contributionScore` / `contributionLevel` 两个派生字段，不含原始指标，更没有 top3；`confluence-accounts` 接口的 `sortBy` 白名单不含 `edits`。数据源侧则一切齐备：组织级 `github.commits` 与 `confluence.edits` 已有口径，个人级 `github-accounts.json` / `confluence-accounts.json` 可推导每组织每维度 top3。

拷问中的数据对账还发现：运营指定的排位名单含**「联通」，而 `organizations.json` 无此档案**——需新增 `participant` 档案，连带首页「伙伴单位数」（`partnerCount`，人工维护、非实时计算）由 11 → 12。

## 决策

### 1. 人工排位字段 `displayOrder`（两个 scope 全站生效）

- `Organization` 新增**可选**字段 `displayOrder?: number`（整数，**越小越靠前**）。可选 + 校验器容忍缺失 → **向后兼容**，`schemaVersion` 不变。
- **排序规则全站统一**：`displayOrder` 升序；**同值或缺失者排最后，按 `name` 升序**（`localeCompare(…, 'zh-Hans-CN')`）兜底。`scope=all` 与 `scope=contributing` 都走这一套（组织下拉、组织墙顺序一致）；排序在 `json-organization.provider.ts` 一处实现，`organization.service.ts` 不再二次排序。
- **`TYPE_WEIGHT` 类型权重表删除**——组织类型不再参与排序（ADR-0001 决策 1 的贡献分排序、`scope=all` 的类型梯队同时废止）。枚举扩展同步清单由 **6 处减为 5 处**（04 §3.1 `type` 行与 §6.1.1 矩阵同步更新）。
- **初始排位**（运营 2026-10-27 点名，间隔 10 便于日后插队）：`cmcc` 10 → `huawei` 20 → `orange` 30 → `zte` 40 → `ais` 50 → `infosys` 60 → `asiainfo` 70 → `personal` 80 → `zain` 90 → `inspur` 100 → **`unicom` 110（新增）** → `lfn` 120 → `unattributed` 130。未被点名的 `lfn` 与独立开发者伪组织按运营裁定排最后（独立开发者卡片仍居墙末，惯例不变）。
- **新增 China Unicom 档案**：`orgId: 'unicom'`、`type: 'participant'`、`logoUrl: ''`（前端降级首字母色块，与 `unattributed` / `inspur` 同款）、`homepageUrl` 官网、`emailDomains: ['chinaunicom.cn', 'chinaunicom.com']`（供采集器邮箱域名归属，与 `zain` / `inspur` 的录入方式一致）。**连带**：`home.json` 的 `partnerCount` 11 → 12 并更新 `updatedAt`（该值人工维护，须与组织墙实时在榜数一致，见 07 §2.1 H1）。

### 2. 卡片指标直出原始值，「综合贡献分」体系彻底退役

- **代码贡献量 = `github.commits`**（已合并 PR 内提交总数，不含无 PR 直推提交，04 §3.3 既有口径）；**Confluence 贡献量 = `confluence.edits`**（页面版本作者条数，含创建那次，ADR-0011 口径）。运营选定 `edits` 而非三项合计 / 分列——与 top3 排序键一致，单一数字最直观。
- `OrganizationCard` **删除** `contributionScore` / `contributionLevel`，**新增**可选字段 `commits?: number`、`confluenceEdits?: number`、`topContributors?`（见决策 3），仅 `scope=contributing` 下发。
- **后端**：`computeScore`、`ContributionLevel` 类型、`SCORE_HIGH_THRESHOLD` / `SCORE_MEDIUM_THRESHOLD` 常量全部删除；`organization.service.ts` 不再注入 `ConfluenceWikiProvider` 的求和用途之外逻辑（`WIKI_PORT` 仍需读 `edits`）。
- **前端**：`ContributionLevelBadge`（高/中/低活跃徽章）连同 `LEVEL_META` 删除；分数进度条删除；「暂无贡献」徽章**保留**但判据由 `contributionScore === 0` 改为 **`commits === 0 && confluenceEdits === 0`**（承接 ADR-0001 决策 3 的呈现意图——无贡献档案不显示误导性的空态）。
- **已知数据现实**：当前真实组织的 Confluence 指标全为 0（仅 `unattributed` 非零，见 ADR-0011 后果与 07 §2.2 A3 待办），上线初期多数卡片的 Confluence 栏将显示 0 / 「—」；这是数据未归位，不是缺陷。
- 首页「口径说明」卡：「综合贡献分」条目删除，新增「代码贡献量」「Confluence 贡献量」条目；「贡献的组织」条目定义同步改写；组织墙副标题由「按综合贡献分从高到低排列」改为「按运营指定的展示顺序排列」。

### 3. 各维度 top3 贡献者（服务端聚合下发）

- **口径**：GitHub 维度按 `commits` 降序、Confluence 维度按 `edits` 降序，剔除 `value = 0` 的条目后各取前 3（与卡片两项贡献量口径一一对应）。并列稳定排序（保持文件原序）。
- **聚合位置：服务端**。`organization.service.ts` 注入 `CONTRIBUTOR_CONTRIBUTION_PORT` 与 `CONFLUENCE_ACCOUNT_PORT`（`ProvidersModule` 为 `@Global()`，无需改模块导入），各读一次全量账号、按组织分桶取 top3，随 `OrganizationCard` 一次下发——**否决**前端逐组织调 `/api/contributor-contributions` + `/api/confluence-accounts` 的方案（12 组织 × 2 请求 = N+1，且首页无筛选诉求）。
- **归属分组**：GitHub 账号按 `orgId ?? 'unattributed'`（与 `json-contributor-contribution.provider.ts` 既有分桶口径一致）；Confluence 账号按 `effectiveOrgId`（ADR-0010 读时派生）。独立开发者卡的 top3 即 `unattributed` 桶内前三。
- **条目结构** `OrganizationTopContributor = { name, avatarUrl?, value }`：GitHub 取 `Contributor.name` / `avatarUrl`、`value = commits`；Confluence 取 `displayName`、**无头像字段**（`value = edits`），前端一律首字母色块降级。
- **展示**：卡片内分「代码 / Confluence」两栏，每栏 3 行：20px 圆形头像 + 姓名 + 数字，**不可点击**（首页组织卡不承担跳转，与 ADR-0001 决策 3「仅展示」精神一致）；某维度无人时显示「—」占位行。独立开发者卡同步改造（两项贡献量 + 各自 top3），保持全墙一致。
- **顺带**：`GET /api/confluence-accounts` 的 `sortBy` 白名单加入 `'edits'`（服务端排序能力与口径对齐；向后兼容，既有取值不变）。

### 4. 视觉：logo 不动，文字整体放大一档

- 3:1 通栏 logo 横幅**保持原样**（含首字母色块降级、独立开发者占位横幅）。
- 卡片文字放大：标题 `0.95rem → 1.05rem`、描述 `text-xs → text-sm`、标签 `text-[0.68rem] → text-[0.72rem]`、指标标签与官网链接 `text-[0.7rem] → text-xs`、top3 行文字 `0.72rem`。
- 卡片高度因两栏 top3 增加——运营已知悉并接受（选择了「信息最直观」选项）。

## 后果

- **收益**：排位由运营完全掌控（改一个数字即可插队，无需动代码）；卡片信息从抽象分数变为可核对的原始计数 + 具名 top3，可信度与可解释性提升；全站组织顺序（组织墙 / 下拉）一致；综合贡献分这套「公式 + 阈值 + 徽章」的维护面（ADR-0001 / 0011 反复调参的历史）整体消失。
- **代价 / 风险**：
  - `displayOrder` 是**人工维护字段**：新增组织档案忘填则落到末尾按名称排（可接受的默认行为，不会报错）；排位调整不留审计痕迹（`organizations.json` 无变更日志，依赖 git 历史）。
  - **`partnerCount` 双轨制风险再现**：新增 `unicom` 必须手工同步 `home.json`（已在本决策内完成 11 → 12）；根治仍是 07 §4 待办 H1「自动聚合」。
  - top3 聚合让 `GET /api/organizations?scope=contributing` 多读两个个人级 JSON 文件（数百条量级，单次内存分桶，性能可忽略；但**每次请求都读**，与该接口现状一致，无缓存层）。
  - 排序不再体现类型层级：TSC 成员单位若 `displayOrder` 靠后即显示靠后——这是运营明确要的语义（排位 ≠ 地位）。
- **同步面**（缺一即文档—代码漂移）：`contract/entities.ts` + 前端 `types/contract.ts`（逐字对齐）、`validators.ts`（`displayOrder` 可选数字）、`json-organization.provider.ts`（删 `TYPE_WEIGHT`、新排序）、`organization.service.ts`（退役评分、聚合 top3）、`activity-query.dto.ts`（`sortBy` 加 `edits`）、`Badge.tsx`（删 `ContributionLevelBadge`）、`OrganizationWall.tsx` / `HomePage.tsx`（重写卡片与文案）、`data/organizations.json`（13 条档案 + `displayOrder`）、`data/home.json`（`partnerCount` 12）；文档 `02` §3、`04` §3.1/§3.4/§4.2/§5.3.2/§5.3.16/§6.1.1/§6.2、`07` §1.1/§2.1/§2.2/§3.1/§3.3/§4、`README` §5 术语表（「贡献的组织」重定义、「运营单位」排序描述修正、「伙伴单位数」11 → 12，新增「展示顺序」「代码贡献量」「Confluence 贡献量」三条）+ §8 版本记录 v1.24。

## 备选方案（已否决）

- **按类型权重 + 名称 / 名称升序 / 加入时间排序**：全自动但运营无法指定「移动、华为…」的业务排位；`joinedAt` 还是可选字段（8/12 缺失），排序不可靠。
- **Confluence 贡献量用三项合计或分列**：合计是另一个「合成数」，与退役综合贡献分的初衷相悖；分列让卡片挤入三个数字 + 三个 top3 栏，信息过载。
- **只去分数、保留高/中/低活跃徽章**：徽章仍由 `computeScore` 驱动，评分体系无法真正下线，留下半套维护面。
- **前端逐组织拉取 top3**：N+1 请求（24 次/页），且两个接口的 `orgIds` 过滤、并列稳定性都要前端重复实现。

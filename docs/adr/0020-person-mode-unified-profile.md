# ADR-0020：个人模式——自然人跨来源统一画像 + 双明细下钻（活跃度页视角切换）

- **状态**：✅ 已接受（2026-11-03）— 活跃度页新增「组织视角 / 个人视角」切换；新增 4 个只读端点 `GET /api/person-contributions` / `person-github-events` / `person-confluence-requirements` / `person-candidates`（接口总数 21 → 25）。**沿用 ADR-0017「一份原子事实 + 读时派生」与 ADR-0018「区间是视图属性」两条主线**：所有人物级数字读时派生、不落盘、不新增派生文件；唯一新增数据文件是需求级事实（归 ADR-0021）。
- **日期**：2026-11-03
- **关联文档**：04 §1（新增 `confluence-requirements.json`）/ §3.16 / §4.13 / §5.2（第 22～25 项）/ §5.3.19～5.3.22 / §6.2；07 §1.2（A10～A13）/ §1.5（P10）/ §2.2 / §4；02 §4（活跃度页视角）；05 §5.1（离线自检新增 `person:check`）；CONTEXT.md
- **决策者**：项目负责人（锁定 spec 决策 1～11 逐条拍板）

## 背景

活跃度页此前只有**组织维度**（A1 / A3 / A9）与**账号维度**（A2、A7 榜）。但运营的直觉问题是「**这个人**干得怎么样」：核心维护者可能用 GitHub + Confluence 双账号、外包同学只出现在 Confluence、还有未认领的游离账号与 bot。账号 ≠ 自然人（many-to-many 认领已在 P5/P6 就绪），跨来源合并此前没有任何一个视图能做。

约束：

1. **只读时派生**：人物级聚合零落盘，复用 P9 事件明细 + 账号档案 + P6 认领边 + P5 自然人；唯一例外是 ADR-0021 的需求级事实；
2. **恒等式优先**：人物级四项 GitHub 计数 ≡ 名下账号求和，`repos` 取并集——与 ADR-0017 决策 15 同一口径精神；
3. **不引入真实 Confluence 凭据**做 E2E：fixture 离线校验（`person:check`，仿 `identity-check`）。

## 决策

### 决策 1：人物级聚合全部读时派生（`PersonInsightService`），不落盘

人物级画像、仓库并集、名下账号分解、生效归属**全部由 `GET /api/person-contributions` 在每请求重算**（`JsonRepository` 按 mtime 失效缓存，认领变更下一请求即生效）。禁止前端二次聚合——web 端只渲染后端出参。

### 决策 2：`repos` 取**并集**而非求和

`github.repos` = 名下账号 `repoIds` 的并集大小（升序数组一并给出）；同一仓库多人协作不重复计。`repoBreakdown`（按仓库拆分）四项合计恒等于 `metrics` 四项。这是对 ADR-0017「组织级 repos 取并集」在人物级的直接推广。

### 决策 3：认领 many-to-many 全并，无跨人物去重

一个账号被多个自然人认领时，其量在每个自然人下**全额计入**（不做分数拆分）；事件派生层遇到认领边 >1 的账号以**首条边**归属人物口径并打 WARN（与 5.3.8 派生族同规则）。端到端不做「人头口径」去重——若运营将来需要，另立 ADR。

### 决策 4：生效归属带 `orgSource`，档案未填组织时回落

`effectiveOrgId = person.orgId ?? 'unattributed'`；`orgSource: 'person' | 'account'`——档案未填组织时按名下账号生效归属回落。组织名解析不到（伪组织）时 `orgName = null`，前端显示「未归属」。逐账号条目也带自己的生效归属与 `orgSource`，多认领账号在不同自然人下的生效组织**可以不同**（各自按自己的认领边解析）。

### 决策 5：GitHub 事件明细——读时派生 + 深链 + 截断显式

`GET /api/person-github-events`：自然人 = 名下全部认领边事件**并集**；单账号 = 该账号事件流（`account` 接受 **login 或 githubId 字符串双键**——账号档案与事件作者两条路径都能命中）。半开区间 `[from, to)` 读时切片（唯一谓词 `filterEventsByRange`），`timestamp` 倒序，`limit`（默认 500、上限 1000）截断，出参显式 `truncated` + `total`（含被截断部分）。**事件 `url` 读时派生**（PR → `…/pull/{n}`、Issue → `…/issues/{n}`），前端不再拼链。

### 决策 6：画像接受 `from` / `to` 但**恒不过滤**；区间只作用于事件明细

Confluence 无时间维度、GitHub 画像按全历史口径展示——同页若给画像也套区间会出现两套口径。裁定：画像端点接受区间参数（前向兼容占位）但**不切片任何字段**；面板内的时间区间**只作用于 GitHub 事件明细**。差异可见：画像卡无区间文案、明细卡标题旁标注区间。

### 决策 7：Confluence 需求明细恒全历史，文件缺失降级「待采集」

`GET /api/person-confluence-requirements` 不接 `from` / `to`：需求行没有内在日期（页级 `createdAt` 整页共享，挂到行上会误导）。`confluence-requirements.json` **缺失不是错误**——捕获「数据文件缺失」降级为空数组 + `updatedAt=null`，前端渲染「待采集」空态（提示运行 `collect:wiki`）；文件存在但结构非法仍 `50001`（真故障不降档）。

### 决策 8：候选池口径 = 「有任一来源贡献」的自然人 + 全部账号

`GET /api/person-candidates` 返回选择器数据源：自然人候选 = GitHub（全历史事件判定）或 Confluence（账号档案判定）**任一有贡献**；账号候选 = **全部**来源账号（含未认领 / 多认领 / bot，认领 many-to-many 全列为 `{personId, displayName}[]`）。候选集与区间无关。⚠️ 已知折衷：GitHub 认领边存 `githubId`、候选视图按 `login` 键控——读时构建 `githubId → login` 映射（账号档案为主、事件作者兜底），两边都对不上时该认领边**静默不展示**（候选视图的最佳努力展示，不影响画像端点计数）。

### 决策 9：校验与错误码

`personId` / `account` 二选一（都传 / 都不传）→ `40001`（`VALIDATION_FAILED`）；`from > to` → `40002`；自然人不存在 → `40403`（`PERSON_NOT_FOUND`，新增错误码）；账号不存在**不是错误**（空结果 + `total=0`，账号层不是可寻址实体）。

### 决策 10：前端只读渲染 + URL 深链

- 视角切换为顶部 Segmented（`?mode=person`，replace 语义），个人模式下组织视图的查询**全部停发**（`enabled=false`）；
- 选择状态编码进 URL：`?mode=person&person={id}` 或 `?mode=person&account={key}&acctSrc=github|confluence`，可深链分享；返回组织视角时清理个人参数；
- 身份认领写操作统一失效 `['identity']` 与 `['person']` 两个 query 前缀（画像归属、候选池、明细即时联动）；
- bot 账号条目打徽标（计数保留在合计里）；`release` 解析不到的需求事实显式「—」；截断显式提示。

### 决策 11：fixture 离线校验 `person:check`

`scripts/person-check.mjs`（`npm run person:check -w @openan/api`）：dist + 临时 DATA_DIR + fixture 种子（多认领、org 兜底、bot、半开边界、双键、文件缺失降级、候选池），**66 项断言**全绿为验收门槛。不引入真实 Confluence 凭据。

## 影响

| 面 | 内容 |
| --- | --- |
| 数据 | 无新落盘聚合文件；唯一新数据文件是 `confluence-requirements.json`（ADR-0021）；`github-events.json` / `confluence-accounts.json` 等现有文件不变 |
| API | 接口总数 21 → 25；新增错误码 `40403`；个人端点家族与组织端点并存、口径各自独立（画像恒全历史 vs 组织视图可切区间） |
| 前端 | 活跃度页加视角切换 + `person/` 组件族（选择器 / 画像卡 / 两类明细卡）；无新导航项、无 i18n |
| 采集 | 零改动（复用 `collect:github:*` 与 `collect:wiki` 产物） |
| 自检 | 新增 `person:check`（66 项）；启动自检对 `confluence-requirements.json` 只 WARN |
| 配额 | 无影响 |

## 备择方案（Why not）

- **人物级聚合落盘（`person-contributions.json`）**：第二份真相，认领变更后还要处理失效与重算——ADR-0017 已在组织级用读时派生回答过同一问题，人物级没有量级差异（798 条事件），没有理由倒退。
- **前端拉账号数据自己 merge**：口径会随前端版本漂移，恒等式（求和 ≡ 合计、并集 ≡ repos）失去唯一实现者；与「只读时派生」约束直接冲突。
- **画像也按区间切片 GitHub 侧**：同页两套区间口径（画像区间 vs 明细区间）会让运营对不上数；且 Confluence 侧永远无法对齐，半成品口径比「恒全历史」更糟。
- **需求明细接 `from` / `to` 按页创建时间近似**：页级 `createdDate` 是整页共享元数据，挂到行上会暗示「这条需求在那一天提出」——事实并非如此（行是后补的），误导性大于可用性。

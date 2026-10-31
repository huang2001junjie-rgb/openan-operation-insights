# ADR-0018：时间区间筛选改为读时切片（区间口径是视图属性，不是事实属性）

- **状态**：✅ 已接受（2026-10-31）— **推翻 04 §5.3.3「时间筛选（遗留债）」与 07 §2.1 A6 里「激活点只在派生层、契约与前端无需改动」的旧判断**（契约与前端**都改了**，见决策 2 / 3 / 4）；**结清 [ADR-0017](./0017-github-effective-attribution-read-time-derivation.md) 之后一直挂 🟡 的 A6**；**把事件明细落盘契约的 `timestamp` 由「可空备用」升为「必填」**，`github-events.json` `schemaVersion` **1 → 2**。ADR-0017 的读时派生、生效归属与恒等式**继续有效并被强化**：恒等式「组织级 ≡ 账号级 ≡ 仓库级求和」自此在**任意区间**下成立，不只在全量下成立。
- **日期**：2026-10-31
- **关联文档**：04 §3.12 / §5.3.3 / §5.3.4 / §5.3.5 / §5.3.8 / §5.3.16 / §5.3.17；07 §2.1 A6、§2.2 P9、§2.2 A1 / A2 / A9、§2.4；02 §4.1 / §4.2；05 §5.4（离线自检数字：GitHub 70 → **76**、身份 58 → **68**、Confluence 仍 73）；06（Confluence 事件级事实遗留债）；09；README §5 术语表 + §9 版本记录；`apps/api/scripts/bump-github-events-schema.mjs`（决策 4 的一次性迁移工具，`npm run migrate:github-events-v2`）；`CONTEXT.md`（全量口径 / 区间口径 / 事件时间戳 / 默认区间）；ADR-0003 / 0004 / 0010 / 0011 / 0016 / 0017
- **决策者**：项目负责人（Q1–Q8 逐条给出推荐答案后一次性拍板「全部按推荐执行」）

## 背景

社区活跃度页的区间筛选器已经摆了三个迭代：`from` / `to` 一路从前端传到后端 DTO、经 `assertRange()` 校验、进 provider——然后在派生层**被原地丢弃**，provider 只记一条 `debug` 日志并返回全量。07 §2.1 A6 因此长期挂 🟡「接收但不生效」。

三件事同时到期，让「继续不激活」不再是零成本：

1. **事件明细已落 `timestamp`**。ADR-0017 把 GitHub 侧收敛为「一份事件 + 三段读时派生」后，798 条事件（PR 618 / Issue 180）的 `timestamp` **无一为 `null`**，跨度 `2026-06-05T21:42:09Z` ～ `2026-10-29T13:35:23Z`（99 天）。A6 原先登记的「采集侧需保留时间维度明细」这一前置**已被消除**，缺口只剩派生层一个谓词。
2. **默认值是硬编码的**。前端 `DEFAULT_FILTERS` 写死 `from = '2026-01-01'` / `to = '2026-12-31'`。今天它不生效所以无害；一旦激活，2027-01-01 那天页面会静默变成一个**全 0 的空视图**，而用户看不出原因。
3. **`to` 的翻译是错的**。日期框的 `YYYY-MM-DD` 曾被翻成**当日零点**，而契约要的是半开区间——用户选「1 月 1 日 ～ 12 月 31 日」会整天吞掉 12 月 31 日；日界还按 **UTC** 切，北京时间 08:00 之前合并的 PR 会被划到前一天。

### 激活会让数字骤变吗

不会——**前提是默认口径定义为「不带区间 ≡ 全量」**。存量事件全部落在 2026 年内，故「全历史」与「2026 全年」在当前数据上是**同一个集合**：`pullRequests` 618 / `commits` 1813 / `issues` 180 / `linesChanged` 1445781，激活前后逐位相同。骤变的风险不在激活本身，而在**默认值**：只要默认不带区间，老用户看到的就是今天看到的数字。

### 真正的难点是跨来源口径混排

GitHub 侧有事件级时间维度，Confluence 侧**没有**：`confluence-accounts.json`（v4，23 账号）落的是账号级累计计数（`requirements` 38 / `topicShares` 24 / `edits` 680），**无任何日期字段**。原始抓取的 53 页确实跨 `2026-05-29` ～ `2026-09-22`，但采集器**没有把页级时间落成事实**——ADR-0009 / 0011 的口径是「结构选页 + 正文取数 + 版本作者计数」，时间从来不在其中。

于是同一张活跃度表里 GitHub 列随区间变、Confluence 列不变，用户会读成「这段时间 Confluence 没动静」。这不是 bug，是**两个来源的事实粒度不同**；能做的只有让差异**可见**。

## 决策

### 决策 1：区间口径归读时切片，事件文件永存全量原子事实

**推翻** 04 §5.3.3 与 07 A6 里「由采集器在落盘时按区间切片」的阶段三预告。新增 `apps/api/src/common/time-range.ts`：

| 导出 | 职责 |
| --- | --- |
| `TimeRangeFilter` | `{ fromMs?: number; toMs?: number }`，**已解析的 epoch 毫秒**，不含字符串与时区 |
| `toTimeRangeFilter(from?, to?)` | 字符串 → 过滤器；两侧都空时返回 `undefined`（≡ 全量口径） |
| `isWithinRange(timestamp, range)` | 半开判定 `fromMs <= ts < toMs`；**不可解析的时间一律 `false`**（脏数据不让聚合变 `NaN`） |

`common/github-event-derivation.ts` 增加**唯一谓词**：

```ts
export function filterEventsByRange(events, range?) {
  if (!range) return events;            // 全量口径：同引用返回，不遍历、不复制
  return events.filter((e) => isWithinRange(e.timestamp, range));
}
```

三个 GitHub provider（`json-contribution` / `json-contributor-contribution` / `json-repo-contribution`）一律在调 `deriveGithubFromEvents` **之前**切这一刀。`github-events.json` 不带任何区间属性，永远存全量。

> 区间是**视图属性**，不是**事实属性**。事实只有一份，视图可以有任意多个。把区间下沉到落盘，等于为每个可能的窗口存一份事实：要么退化成「采集器按固定窗口写多份」，要么让事件文件变成滚动窗口而**永久丢失历史**。ADR-0017 已经证明「一份原子事实 + 读时派生」能靠函数形状保住恒等式，本决策只是给那把刀加一个前置谓词。

### 决策 2：默认不带区间 ≡ 全量口径，预设替代硬编码年份

- `DEFAULT_FILTERS` 的 `from` / `to` 改为空串；空 ≡ 该侧无界。
- `filterEventsByRange` 对 `range === undefined` **原数组同引用返回**——「不带区间 ≡ 全量口径」不只是语义约定，是**可被 `===` 断言的实现事实**（`identity-check` 场景 7 直接断言同一引用）。
- 筛选器加三个预设：**全部时间** / **本年** / **近 90 天**（`RANGE_PRESETS`）。「本年」按 `new Date().getFullYear()` 现算，**不硬编码年份**；「近 90 天」= 含今天在内的 90 个整天（下界 = 今天 − 89 天）。
- 预设按钮的选中态由 `activePreset` **反推**（比对当前 `from` / `to` 是否等于某个预设值），不额外存状态，避免「按钮说选了近 90 天、输入框却是别的日期」的分叉。

### 决策 3：半开区间 + 北京日界，翻译责任在前端

| 项 | 裁定 |
| --- | --- |
| 区间形状 | **半开** `from <= timestamp < to` |
| `from > to` | `40002`（沿用既有 `assertRange()`） |
| `from == to` | **合法**，命中 0 条（空区间），各项为 0；**不报错** |
| 单侧缺省 | 该侧无界（只给 `from` ⇒ 上界开放） |
| 日界时区 | **Asia/Shanghai**（`+08:00`） |
| 谁翻译 | **前端**。后端只比 epoch 毫秒、不解析时区、不认识「日期」 |

前端 `lib/format.ts`：`rangeStartInstant(value)` = 该日期在 `+08:00` 的零点；`rangeEndInstant(value)` = **次日**零点。`+08:00` 无夏令时，按固定毫秒数进位是精确的。

> 后端契约收的是 ISO 8601 **时刻**。「用户眼里的一天」必须由某一方定义清楚——放在前端，是因为只有前端知道用户看的是哪个日期框；放在后端就得让后端猜时区，而运营、社区、数据源（GitHub `mergedAt` 是 UTC）三方时区各不相同。`to` 取次日零点是半开区间的**必然推论**，不是可调参数：当日零点会整天吞掉结束日。

### 决策 4：`timestamp` 升为必填，`github-events.json` `schemaVersion` 1 → 2

| 改动点 | 内容 |
| --- | --- |
| `contract/entities.ts` | `timestamp: string \| null` → **`timestamp: string`** |
| `repositories/validators.ts` | 新增 `ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z\|[+-]\d{2}:\d{2})$/`；`isGithubContributionEvent` 要求 `isString(timestamp) && PATTERN.test(...) && !Number.isNaN(Date.parse(...))` |
| `repositories.module.ts` | `makeRepository('github-events.json', isGithubContributionEventArray, **2**)` |
| 采集器 | `splitByTimestamp(records)` 把本轮记录分成 timed / untimed；`persistEvents` **只收 timed**；聚合也只吃 timed |
| 可观测性 | 一条 `WARN`：本轮拒绝数 + `.sync-state.json` 的 **`untimedEvents` 累计** + 前 3 条样例（`kind repository#number`）；`logSummary` 输出「本轮接受 N / M 条」；CLI 打印拒绝数 |
| 迁移 | `scripts/bump-github-events-schema.mjs`（`npm run migrate:github-events-v2`，已 `--write` 执行）；只抬信封 `schemaVersion`，**不动任何记录** |

> 一个 `timestamp: null` 的事件在**区间口径**下只能被丢弃（`isWithinRange` 对不可解析时间返回 `false`），但在**全量口径**下会被计入。同一个文件、两种读法给出两个总量，恒等式当场破产——而且破在**默认视图**上，最难被发现。与其让读路径二义，不如在写边界拒绝。
>
> 真通道结构上**产不出**这种记录：PR 只查 `states: MERGED` ⇒ `mergedAt` 必存在；Issue 必有 `createdAt`。所以这条拒绝是**回归护栏**（数据源改口径、fixture 写错、离线修文件手滑），不是日常路径。护栏必须**响**：静默丢一条事件的后果是聚合数字悄悄少一，比报错难查一个数量级。

### 决策 5：Confluence 侧恒为全量口径，差异必须可见

Confluence 侧（`GET /api/wiki`、`GET /api/confluence-accounts`）接受 `from` / `to` 但**恒不过滤**，且**不报错、不隐藏**：

| 位置 | 处置 |
| --- | --- |
| Confluence 视图的区间筛选器 | **禁用**——整块换成说明文案「恒为全历史累计：Confluence 侧无时间维度明细」 |
| GitHub 视图的三个 Confluence 列 | 表头打**「全历史」角标**（带 `title` 解释），脚注分支说明混合口径 |
| Confluence 个人榜卡 | 「本榜为全历史累计——该侧落盘的是账号级计数、无时间维度明细，区间筛选不生效」 |
| 请求层 | Confluence 侧的 query key **不纳入** `from` / `to`（改区间不会白白 refetch） |
| 数据侧 | 「Confluence 事件级事实（页级时间维度）」登记为**遗留债**（06 / 09），补上后再开放该侧区间 |

> 摆一个不生效的日期框等于对用户撒谎。但**报错或隐藏列**同样错：Confluence 数据是真实有效的，只是没有那个维度。「禁用 + 角标」是承认差异的最小代价方案。

### 决策 6：仓库维度表跟随区间，失效筛选不静默消失

- `useRepoContributions(params)` 接受 `from` / `to`，`queryKeys.repoContributions(params)` 把两者纳入 **query key**——仓库表与组织表、个人榜在**同一区间**下取数。
- 区间收紧后仓库表行数变少，用户先前勾选的仓库可能整行消失。此时**保留为候选项**并标注 `<owner> · 区间内无活动`（`repoOptions` 追加 stale 项），页面给琥珀色提示「已选仓库在当前区间内无活动」（`staleRepoIds`）。

> 前半是恒等式的要求：三段数字同源，只让两段跟随区间，等于在同一页面上摆两个不同区间的合计并宣称它们相等——正是 ADR-0017 花大力气消除的那类静默漂移。
>
> 后半是「不静默」的要求：若让候选项跟着行数消失，勾选状态就成了看不见的幽灵（表里没这一行，筛选条件却还在生效），用户会以为筛选被清掉了。

### 决策 7：首页与组织卡恒为累计（全量口径）

- 首页**没有**区间筛选器，所有数字卡与组织卡恒为累计；组织卡标签加「**（累计）**」二字（`代码贡献量（累计）` / `Confluence 贡献量（累计）`）。
- 首页指标解释文案与 `CONTEXT.md` 术语「时间口径」写明这条分叉：**首页恒全量，活跃度页 GitHub 侧可按区间**。
- ⚠️ 活跃度页头 `GET /api/contributions/summary` 的 `totals` 是**混合口径**：GitHub 四项跟随区间、Confluence 三项恒全量。这是决策 5 的直接推论，`ActivityService.getSummary` 注释已写明。

### 决策 8：术语入 `CONTEXT.md`

`## Language` 段追加 **全量口径** / **区间口径** / **事件时间戳** / **默认区间** 四条（见该文件）。术语先于实现固定下来，是因为「时间筛选」这个词在本仓库里曾同时指三种东西：入参、遗留债、以及本 ADR 之后的视图属性。

## 验收基线（按上述规则对现有数据实测，2026-10-31）

| 项 | 值 |
| --- | --- |
| 事件总数 | **798**（PR 618 / Issue 180） |
| `timestamp` 为 `null` / 缺失 | **0** 条（迁移脚本 `--write` 后信封 `schemaVersion` = 2，记录逐条未变） |
| 事件时间跨度 | `2026-06-05T21:42:09Z` ～ `2026-10-29T13:35:23Z`（**99 天**） |
| 全量口径四项合计 | `pullRequests` **618** / `commits` **1813** / `issues` **180** / `linesChanged` **1445781** |
| 激活前后差异 | **0**（默认不带区间 ⇒ 全量 ≡ 今天看到的数字） |
| 恒等式 | 全量与任意区间下均成立：组织级 ≡ 账号级 ≡ 仓库级求和（`repos` 除外，取并集，见 ADR-0017 决策 15） |
| Confluence 侧 | 恒全量：`requirements` **38** / `topicShares` **24** / `edits` **680**，任何区间下不变 |
| 离线自检 | GitHub **70 → 76**（新增场景 8「缺时间戳整条拒绝」6 项）；身份 **58 → 68**（新增场景 7「区间口径」10 项）；Confluence 仍 **73** |

## 理由与取舍

1. **为什么不让后端解析时区**：后端只比 epoch 毫秒是**无状态、无配置、无歧义**的。一旦后端认识「日期」，就得决定用服务器时区、请求头时区还是配置时区——三者都会在某次部署后悄悄改变数字。
2. **为什么 `from == to` 不报错**：它是**合法的空区间**，语义清晰（命中 0 条）。报 `40002` 会让「同一天」这个再正常不过的用户输入变成错误，且与半开区间的数学定义自相矛盾。
3. **为什么在采集期拒绝而不是读时忽略**：读时忽略意味着同一份文件在不同口径下有两个总量（见决策 4）。写边界拒绝把二义性消灭在数据进入系统之前，代价只是一条 `WARN` 与一个游标计数。
4. **为什么不把 Confluence 列从表里拿掉**：那会让「跨来源对比」这个页面存在的理由消失。角标 + 脚注保留了信息，也保留了 caveat。
5. **为什么仓库表必须跟随区间**：见决策 6。这是**恒等式的完整性**问题，不是产品偏好。
6. **可观测性优先于正确性**（决策 4 / 5 / 6 的共同取舍）：三处都选择了「让差异可见」而不是「让差异消失」。消失的差异不会被人报告，可见的差异会。

## 后果

### 受影响面

| 层 | 文件 | 变化 |
| --- | --- | --- |
| 契约 | `contract/entities.ts` | `timestamp` 必填 |
| 校验 | `repositories/validators.ts` | ISO 时刻正则 + 可解析性 |
| 仓储 | `repositories/repositories.module.ts` | `github-events.json` 期望版本 **2** |
| 公共 | `common/time-range.ts`（**新建**） | `TimeRangeFilter` / `toTimeRangeFilter` / `isWithinRange` |
| 公共 | `common/github-event-derivation.ts` | 新增 `filterEventsByRange`（唯一谓词） |
| Provider | 三个 GitHub provider | 派生前切片；组织级删掉原「忽略 from/to」的 `debug` 分支 |
| 端口 | `contribution.port.ts` / `contributor-contribution.port.ts` / `repo-contribution.port.ts` | 契约注释：半开 + 缺省全量 |
| 端口 | `confluence-account.port.ts` / `wiki.port.ts` | 契约注释：**接受但恒不过滤** |
| 采集 | `github-collector.service.ts` | `TimedContributionRecord` / `splitByTimestamp` / `untimedCount` / `persistEvents` 只收 timed / WARN 样例 |
| 采集 | `github-sync-state.store.ts`、`github-main.ts` | `untimedEvents` 累计；CLI 打印拒绝数 |
| DTO | `activity-query.dto.ts` | 注释写明半开、前端翻译、缺省全量、仅 GitHub 侧生效；`assertRange` 说明 `from == to` 合法 |
| Service | `activity.service.ts` | `getSummary` 注释写明 `totals` 为混合口径 |
| 迁移 | `scripts/bump-github-events-schema.mjs`（**新建**） | `npm run migrate:github-events-v2` |
| 自检 | `scripts/collector-check.mjs` | 场景 **[8]** 缺时间戳整条拒绝（6 项）；原隔离性场景改 **[9]**；D1 恒等式比对标注**仅全量口径成立** |
| 自检 | `scripts/identity-check.mjs` | 场景 **[7]** 区间口径（10 项）：半开边界 / 同引用 / 单侧无界 / 空区间 / 三态判定 / 同区间恒等式 / 空区间桶 / 仓库行收缩 / 校验器正负向 |
| 前端 | `lib/format.ts` | `RANGE_TZ_OFFSET` / `instantOfDay` / `rangeStartInstant` / `rangeEndInstant`（次日零点）/ `toLocalDateInput` |
| 前端 | `hooks/query-keys.ts`、`hooks/useActivity.ts` | 仓库表 query key 纳入 `from` / `to` |
| 前端 | `features/activity/ActivityFilters.tsx` | `RANGE_PRESETS` / `presetRange` / `activePreset` / `rangeDisabled` / `staleRepoIds` |
| 前端 | `pages/ActivityPage.tsx` | 默认空区间；`rangeParams`（仅 GitHub）与 `params`（Confluence，不含区间）分离；`isRangeActive`；stale 候选与提示 |
| 前端 | `features/activity/ActivityTable.tsx` | Confluence 列 `allTime` 标记 + 「全历史」角标 + 脚注分支 |
| 前端 | `ContributorRankCard.tsx` / `ConfluenceAccountRankCard.tsx` | 删除「阶段一时间区间筛选暂不生效」，改为各自真实口径 |
| 前端 | `features/home/OrganizationWall.tsx`、`pages/HomePage.tsx` | 标签加「（累计）」；指标解释写明恒全量；新增术语条目「时间口径」 |

### 对外契约是否 breaking

**是，但影响面为零。** 此前传 `from` / `to` 得到全量，此后得到子集——对**依赖旧行为**的调用方是 breaking change。实测：前端是唯一调用方，且它此前传的硬编码 `2026-01-01..2026-12-31` 恰好覆盖全部存量事件，故**同一个请求在改动前后返回逐位相同的数据**。无第三方调用方、无公开 API 承诺、无历史查询书签依赖旧语义。按 04 §6.1 走**契约变更**流程记录，不单独发 breaking 版本号。

### 不变

- **响应形状一律不变**：`OrganizationContribution[]` / `ContributorContributionView[]` / `RepoContribution[]` 字段一个没加、一个没删，变的只是**数值与行数**。
- **原子事实只有一份**：`github-events.json` 仍是 GitHub 侧唯一原子事实，仍是全量，仍不带区间属性。
- **恒等式**：三段派生仍共用 `deriveGithubFromEvents`，仍由函数形状保证；本 ADR 让它在**任意区间**下成立。
- **生效归属**：`effectiveOrgId` 派生链（认领边 → 采集口径 → `unattributed`）完全不变，区间切片发生在归属之前、与之正交。
- **机器人口径**：bot 的量仍计入其生效归属桶、仍不占人物位。
- **Confluence 侧读路径**：ADR-0010 / 0011 的口径、`confluence-accounts.json` v4 结构、组织级读时派生均不变。
- **首页**：仍无区间筛选器，仍是累计。
- **仓库表刻意不接受 `repoIds` / `orgIds`**：04 §5.3.17 的裁定不变（行指标不随筛选变化）；本 ADR 只让它接受 `from` / `to`。

### 遗留技术债（登记）

1. **Confluence 事件级事实缺失**（决策 5 的根因）：`confluence-accounts.json` 只有账号级累计计数，无页级时间维度，故该侧**永远**无法参与区间筛选。补法是把「需求页 @ / 议题分享 @ / 版本作者」三类事实落成事件（各带时间），与 GitHub 侧同构；成本在采集器与 `schemaVersion` 再升一级。登记于 06 / 09。
2. **混合口径的页头汇总**（决策 7）：`GET /api/contributions/summary` 的 `totals` 里 GitHub 四项跟随区间、Confluence 三项恒全量，一个对象两种口径。前端已用文案与角标兜住，但**出参本身不携带口径标记**——若将来有第三方消费该接口，需要给出参加口径字段（属契约变更）。
3. **日界时区不可配置**（决策 3）：`+08:00` 写死在 `lib/format.ts` 的 `RANGE_TZ_OFFSET`。海外运营者看「今天」会与实际差一天。等真有该需求再抽成配置，**不要**提前抽象。
4. **区间不进缓存键之外的任何一层**：`filterEventsByRange` 每次请求都全量遍历一遍事件（现 798 条，成本可忽略）。事件量级上到十万后需要预分桶（按月）或索引；届时**谓词必须仍是唯一实现**，不得在 provider 里另写一份过滤。
5. **`untimedEvents` 只累计、不告警**：游标里的计数会随轮次单调增长，没有阈值告警。真通道产不出缺时间戳的记录，故按「护栏不响就是没事」处理；若某轮出现非零增量，靠 `WARN` 日志发现。

## 备选方案（已否决）

| 方案 | 否决理由 |
| --- | --- |
| **采集器落盘时按区间切片**（04 §5.3.3 原预告） | 要为每个窗口存一份事实，或让事件文件变成滚动窗口而永久丢失历史。区间是视图属性，不是事实属性 |
| **默认区间 = 本年**（保留硬编码 `2026-01-01..2026-12-31`） | 激活当天所有数字骤变，且跨年那天页面静默变全 0。预设已经能满足「一键看本年」 |
| **闭区间 `from <= ts <= to`** | 与「结束日期的次日零点」组合会多算一天；与「结束日期当日零点」组合会整天吞掉结束日。半开是唯一自洽选择 |
| **后端解析日期与时区** | 后端就得决定用哪个时区，三者（服务器 / 请求头 / 配置）都会在某次部署后悄悄改变数字 |
| **`from == to` 报 `40002`** | 「同一天」是正常用户输入；空区间语义清晰，报错反而制造特例 |
| **Confluence 侧区间报错 / 隐藏列** | 数据真实有效，只是没有那个维度。报错会让整个视图不可用，隐藏列会毁掉跨来源对比 |
| **Confluence 侧假装跟随区间（前端过滤掉整列）** | 用一个假象掩盖另一个假象，且用户无法区分「没数据」与「被过滤」 |
| **仓库表不跟随区间（保持全量）** | 同一页面上两个不同区间的合计互不相等，恒等式当场破产 |
| **失效仓库筛选静默丢弃** | 勾选状态变成看不见的幽灵；用户会以为筛选被清掉了 |
| **读时忽略缺时间戳的事件** | 同一份文件在全量与区间两种读法下给出两个总量，且破在默认视图上 |
| **`timestamp` 保持可空、区间内 `null` 视为命中** | 让「不知道什么时候发生」的事件出现在**每一个**时间窗口里，比丢弃更错 |

## 备注

- **一句话口径**：`github-events.json` 存**全量**事实，区间是**读时**切的一刀；不带区间 ≡ 全量；半开 `from <= 事件时间 < to`，日界按北京时间、由前端翻成时刻；Confluence 侧恒为全历史且**把这件事写在脸上**。
- **改这块代码前必读**：`filterEventsByRange` 是**唯一**谓词。任何 provider、脚本或新端点想按时间过滤事件，都必须调它——在它之外另写一份 `events.filter(...)` 会让恒等式在两个实现之间悄悄分叉，而这类分叉**不会让任何测试变红**（ADR-0017 的双写漂移就是这么来的）。
- **迁移工具**：`npm run migrate:github-events-v2 -w @openan/api`（`--write` 落盘，缺省 dry-run 只报告）。它只抬信封 `schemaVersion`，**不校验也不改写记录**；若存量数据里真有 `timestamp` 缺失的记录，抬版本后 `JsonRepository` 会以 `50001` fail-fast，届时按决策 4 重跑 `collect:github:full`。
- **自检怎么跑**：`npm run build -w @openan/api` 后依次 `collect:github:check`（76）/ `identity:check`（68）/ `collect:wiki:check`（73）。区间口径的断言集中在 `identity-check` 场景 7，缺时间戳拒绝在 `collector-check` 场景 8。
- ⚠️ **`collector-check` 的 D1 恒等式比对只在全量口径下成立**：基线快照 `github-organizations.json` 是采集器写死的累计值，不带任何区间。拿它去对区间切片后的事件合计必然「漂移」——那不是数据坏了，是口径错了。区间口径下的同一条恒等式由 `identity-check` 场景 7 覆盖。

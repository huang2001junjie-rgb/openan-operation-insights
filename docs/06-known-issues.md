# 06 已知问题

> **本文档只登记未解决 / 开放的问题与缺口。**
>
> 问题一旦确认解决，即从本文档**删除**（运营约定，2026-10-26）。现象、取证、结论与处置过程留痕于 `README §9` 版本记录与 `docs/adr/` 的决策记录，本文档不保留已解决条目——否则「已知问题」清单会被历史噪音淹没，读者无法一眼看出**还有什么没修**。
>
> 已按此约定移除的条目（仅存标题以备追溯，明细见 `README §9`）：
>
> - 2026-09-23 IDE WebView 控制台报错
> - 2026-09-27 身份匹配控制台「账号认领」完全不可用（决策见 [ADR-0006](./adr/0006-identity-console-selection-vs-detail.md)）
> - 2026-09-28 身份匹配控制台「新建」自然人点击无反应
> - 2026-10-16 `Organization.type` 枚举：文档与代码是两套值
> - `partnerCount` 的 10 vs 11 冲突（2026-10-26 裁定 `lfn` 计入组织）
> - `personal` 档案 `name` 的大小写（2026-10-26 运营确认为 `Personal`，已改）
> - 2026-10-30 Bot（GitHub App）作者丢键 ⇒ `github-events.json` 整体判废 ⇒ GitHub 派生端点全量 `50001`（采集与落盘侧已修 + 离线自检场景 [7] 锁住；**结构性风险仍开放**，见 §5）
>
> ⚠️ 从本文档移除条目前，先检查其中是否夹带**仍然有效的前瞻性约束**（对未实现功能的实现要求、对历史数据的处置禁忌等）。这类内容不属于「已解决的问题」，必须迁往其目标读者会读到的位置。已迁移的一处见 `07 §2.1 H1` 的「实现 ② 时的硬约束」。

## 1. 组织档案 `aliases` 覆盖率为 0（运营决定暂不处理）

13 条档案的 `aliases.github` / `aliases.confluence` **全部为空**，而 `aliases` 是归属判定（`07 §3.2`）的第一优先级信号——该信号当前完全空转，归属 100% 依赖 `emailDomains` 兜底（12/13 条已配，仅伪组织 `unattributed` 为空，符合预期；v1.24 新增的 `unicom` 已配 `chinaunicom.cn` / `chinaunicom.com`）。

之所以可安全延后：该缺口**不会静默失真**。`confluence-collector.service.ts:879` 每轮采集都会打印告警「`aliases.confluence` 全部为空：本轮全部计数将归入『独立开发者』」。若日后独立开发者数异常偏高，先查这条告警。

⚠️ 但该告警描述的是**采集口径**，不等于对外数字：Confluence 侧 23 个账号的采集口径 `orgSource` 确实全为 `unattributed`，而**生效归属**已被 **22** 条 `source=confluence` 认领边接管（2026-10-30 实测：`huawei` 16 / `zte` 2 / `infosys` 1 / `orange` 1 / `lfn` 1 / `ais` 1，仅 **1** 个账号仍落 `unattributed`）。GitHub 侧同理（16 条 `source=github` 认领边，派生 `orgSource` 分布 claim 16 / collection 13 / unattributed 11）。**仍然有效的部分是**：`aliases` 空转 ⇒ ①采集口径分桶失真，基线快照与漂移比对失去意义（见 §2）；②未被认领的账号只能靠认领边或邮箱域名兜底，新增贡献者默认全落独立开发者。

## 2. GitHub 组织级基线快照与账号级派生**漂移无告警**

`data/github-organizations.json` 自 [ADR-0017](./adr/0017-github-effective-attribution-read-time-derivation.md) 起已不被读路径使用，降级为**基线快照**；账号档案 `github-accounts.json` 的 `github` 指标自事件明细（`07 §2.5 P9`）上线后同样降级为快照。两者都仍由采集器每轮写入，且**没有任何机制比对它们与读时派生的结果**。实测漂移（2026-10-30 全量采集，798 条事件；快照与事件同轮写入，`updatedAt` 仅差约 1 秒）：

| 桶 | 落盘快照 | 账号档案按**采集口径**（`orgId`）聚合 | 事件按**生效归属**派生（对外值） |
| --- | --- | --- | --- |
| `huawei` | 1504 | 1533（**−29**） | **1578**（+45 认领） |
| `unattributed` | 157 | 128（**+29**） | **58**（−70 认领） |
| `lfn` | 无此桶 | 无此桶 | **25**（+25 认领） |
| `cmcc` / `zte` | 148 / 4 | 148 / 4 | **148 / 4** |
| 桶数 / commits 合计 | 4 / **1813** | — / **1813** | **13** / **1813** |

差异**总量守恒**（三侧合计均 **1813**），可拆成两类：

- **认领边搬家 70 commits**（`unattributed → huawei` 45 = `wangyanlin1996` 40 + `eiedty` 5；`unattributed → lfn` 25 = `wrathwolf`）——这是**设计使然**，生效归属本来就该盖过采集口径，**不应告警**。
- **真漂移 29 commits**（`huang2001junjie-rgb`：快照按当轮采集口径记 `unattributed`，而账号档案 `orgId` 为 `huawei`）——⚠️ 两者是**同一轮**写入的，故这不是历史漂移，而是**同轮内两份落盘对同一账号给出不同归属**；该账号同时有认领边，对外值恰好正确，问题被掩盖。

影响：**页面数字不受影响**（读路径只剩事件明细一份原子事实），但快照会误导排查——照着它核对会得出「`huawei` 少了 74」的错误结论，而真实原因是上面两类叠加。**告警必须能区分这两类**，否则一上线就长期噪音化（这也是漂移告警至今未实现的实际门槛）。

处置建议（ADR-0017 遗留债 2）：采集器每轮比对两者、漂移即 `WARN`；或在合并双写落盘（遗留债 1）时一并消灭该文件。在此之前，核对一律以账号级 + 生效归属为准（`04 §4.3`）。

> ⚠️ **本条比对只在「全量口径」下有意义**（[ADR-0018](./adr/0018-time-range-read-time-slicing.md) 之后新增）：基线快照与账号档案快照都是**累计值**、不带任何区间。区间筛选激活后，若拿快照去核对某个 `from` / `to` 下的派生结果，必然「漂移」——**那不是数据坏了，是口径错了**（区间内的合计本就该小于等于全量）。核对区间口径请用「组织级 ≡ 账号级 ≡ 仓库级求和」这条**同区间内**的恒等式（`identity-check.mjs` 场景 [7]），不要跨口径比数。同理，`collector-check.mjs` 的 D1 恒等式断言也**只在全量口径下成立**（脚本内已就地加注）。

## 3. 首页「数据更新于 X」与派生指标的新鲜度不同步

`GET /api/home/summary` 的 `updatedAt` 仍取 `home.json` 的**文件**时间，而独立开发者数（H2）自 ADR-0017 起由 **`github-events.json`（事件明细）** + 账号档案 + 认领边 + 自然人**读时派生**。运营在身份控制台补认领边后，**数字立刻变、首页时间戳却不动**，页面呈现「数字新、时间旧」。

⚠️ 事件明细上线后该问题**多了一处不同源**：`GET /api/contributions/summary` 的 `updatedAt` 已改取**事件文件信封**时间戳（GitHub 侧）与 `confluence-accounts.json` 的**记录级最大** `updatedAt`（Confluence 侧）的较晚者，而首页时间戳仍是 `home.json` 的文件时间——同一屏可能同时出现「首页 X」「活跃度 Y」两个互不相干的时间戳。

处置建议（ADR-0017 遗留债 7）：二选一——各指标自带 `updatedAt`，或首页时间戳取各来源的最大值。需先裁定时间戳语义（「数据文件最后写入时间」还是「页面数字最后变化时间」）。

## 4. Confluence 侧读时派生的告警**不对称**（静默）

GitHub 侧派生会记 WARN（未知 `orgId`、同一账号多条认领边），Confluence 侧不会：`JsonWikiProvider` **没有 `Logger`**，`toConfluenceAccountViews()` 返回的 `warnings`（认领冲突）被直接丢弃，`GET /api/wiki` 收到未知 `orgIds` 时也只是静默过滤（对比 `json-contribution.provider.ts:84-90`）。

影响：Confluence 账号被认领到两个自然人、或前端传错 `orgId` 时**无任何痕迹**，只能靠数字对不上倒查。

处置建议：给 `JsonWikiProvider` 加 `Logger`，把 `warnings` 与未知 `orgIds` 按 GitHub 侧同样格式记 WARN（两侧行为对齐，`07 §4` 已登记为待办）。

## 5. 事件明细的**整文件级 fail-fast** + 增量不可修复（结构性风险）

现象（2026-10-30 实测）：`data/github-events.json` 的 798 条里有 **3** 条 `dependabot` PR 的作者对象缺 `githubId` / `name` 两键——Bot（GitHub App）不匹配 GraphQL 的 `... on User` 内联片段 ⇒ 响应里这些键**根本不存在**（`undefined` 而非 `null`）⇒ 透传落盘时被 `JSON.stringify` 丢键。由于 `JsonRepository` 的校验是**整文件级 fail-fast**，3 条坏事件让 798 条全部判废，`GET /api/home/summary`、`/api/organizations?scope=contributing`、`/api/contributions`、`/api/contributor-contributions`、`/api/repo-contributions` **一律 `50001`**，首页与组织页整页空白。

两个放大因子：

1. **无逐条容错 / 隔离**：坏记录不跳过、不剔除、不单独记 WARN，而是让整份文件不可用——单条脏数据的爆炸半径是「全部 GitHub 派生端点」。
2. **增量采集修不了**：`collect:github` 按幂等键（`kind + repository + number`）**跳过已存在**的事件，坏记录永远命中跳过 ⇒ 只能重跑 `collect:github:full`（全量重采，时间与限流成本都更高）；仓库里**没有**「按实体归一 / 补齐已落盘数据」的离线修复命令。

⚠️ **代码侧已修**（`GithubGraphqlSource.toAuthor()` 在采集源边界归一为「键齐全、缺失落 `null`」，三条构造路径统一；`GithubCollectorService.toEvent()` 逐字段 `?? null` 兜底；`collector-check.mjs` 场景 [7] 用临时 fixture + 负向对照锁住写读一致性，断言 **76/76**）。此处登记的是**仍然开放的结构性风险**：任何未来的新字段、新 `kind`、新作者形态都可能重演同类事故，而当前唯一防线是「离线自检的 fixture 覆盖」——fixture 没覆盖到的形态会**先污染落盘、再被发现**，且恢复只能靠全量重采。

> ⚠️ **[ADR-0018](./adr/0018-time-range-read-time-slicing.md) 把这条风险的触发面又扩大了一格**：`github-events.json` 的期望 `schemaVersion` 由 **1** 抬到 **2**（`timestamp` 由可空升为必填）。任何仍是 v1 的存量文件会被 `JsonRepository` 直接判废 ⇒ **所有** GitHub 派生端点 `50001`、首页与组织页整页空白——**爆炸半径与本条完全相同**，而且这次是**版本升级必然触发**、不是脏数据偶发。
>
> 缓解已就位：① 一次性迁移脚本 `apps/api/scripts/bump-github-events-schema.mjs`（`npm run migrate:github-events-v2 -w @openan/api`，默认 **dry-run**，加 `--write` 落盘）只抬信封版本、**记录逐条不动**；② 存量 798 条实测 `timestamp` **无一为 `null`**，故迁移是安全的；③ 迁移脚本**刻意不校验记录**——若真有缺失值，抬版本后由读侧 fail-fast 暴露，届时重跑 `collect:github:full`（采集期会整条拒绝缺时间的记录 + `WARN` + 游标 `untimedEvents` 计数）。
>
> ⚠️ 但**放大因子 2 仍未解**：迁移脚本只能修「信封版本」这一类问题，修不了**记录级**脏数据（增量按幂等键跳过已存在事件）。它算是「离线修复命令」的一个**特例实现**，不是通用方案——通用方案仍见下方处置建议。

处置建议（择一或组合，均需先与 `04 §1.1` 的 fail-fast 约定对齐）：

- **读侧**：`JsonRepository` 支持逐条隔离（非法记录跳过 + 记 WARN + 暴露计数），把「整份判废」降级为「坏记录不可见」；⚠️ 代价是可能掩盖数据损坏，需裁定。
- **写侧**：新增离线修复命令（读文件 → 按实体归一 → 回写 + 重新校验），使坏数据不必全量重采。
- **防线前移**：落盘**前**对整批跑 `isGithubContributionEventArray`，失败则**不覆盖**旧文件并把非法样本打进日志（当前是写盘后由读侧发现）。

## 6. 同一张活跃度表里**两套时间口径混排**（Confluence 侧无法参与区间筛选）

现象：区间筛选（`from` / `to`）激活后（[ADR-0018](./adr/0018-time-range-read-time-slicing.md)），社区活跃度页的 GitHub 四列（已合并 PR / PR 内提交 / Issue / 代码量）随区间变化，而三个 Confluence 列（需求 / 议题分享 / 编辑）**恒为全历史累计**。选一个短区间（如「近 90 天」）后，同一行里两组数字回答的**不是同一个问题**，用户容易读成「这段时间 Confluence 没动静」。

根因（不是 bug，是**事实粒度不同**）：GitHub 侧有**事件级**原子事实（`github-events.json`，每条带 `timestamp`），Confluence 侧只有**账号级累计计数**（`confluence-accounts.json` v4：`requirements` 38 / `topicShares` 24 / `edits` 680，**无日期字段**）。原始抓取的 53 页虽跨 `2026-05-29` ～ `2026-09-22`，但采集器**没有把页级时间落成事实**——ADR-0009 / 0011 的口径是「结构选页 + 正文取数 + 版本作者计数」，时间从来不在其中。

已做的处置（**让差异可见，不消除差异**）：Confluence 视图**整块禁用**区间筛选器（换说明文案）、GitHub 视图给三个 Confluence 列表头打**「全历史」角标**（带 `title`）+ 脚注分支、Confluence 个人榜卡注明「本榜为全历史累计」。⚠️ 刻意**不报错也不隐藏列**：数据真实有效，报错会让整个视图不可用，隐藏列会毁掉跨来源对比这个页面存在的理由。

仍开放的两处：

1. **`GET /api/contributions/summary` 的 `totals` 是混合口径且出参不携带口径标记**（GitHub 四项跟随区间、Confluence 三项恒全量）。前端已用文案兜住，但**第三方消费方无法自证**哪几项跟随区间。若将来有外部消费方，需给出参加口径字段（属契约变更，走 `04 §6.1`）。
2. **Confluence 事件级事实缺失**（上面根因的正面）。补法：把「需求页 @ / 议题分享 @ / 版本作者」三类事实落成**带时间的事件**，与 GitHub 侧同构，之后该侧才能参与区间筛选并享受同一套读时派生。成本：采集器改造 + `confluence-accounts.json` 再升一级 `schemaVersion`（或新增事件文件）、`07 §1.2 A3 / A7` 与 §2.2 / §2.3 重写、`confluence-check.mjs` 扩容；**需另立 ADR**。开工前须先回答：页级时间取**创建时间**还是**版本时间**（同一账号在多版页面上会被重复计数吗），以及需求页 `Contacts` 列的 @ 该挂哪个时间。

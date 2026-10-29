# ADR-0017：GitHub 侧生效归属改为读时派生（认领优先，与 Confluence 侧同构）

- **状态**：✅ 已接受（2026-10-28）— **取代 [ADR-0008](./0008-org-person-data-grain-and-attribution.md) 决策 3 在 GitHub 侧的效力**（「采集口径与人工归属并存、互不覆盖、展示不受人工影响」对 GitHub 不再适用）；**结清 [ADR-0010](./0010-claim-overrides-confluence-display-attribution.md) 遗留技术债 1**；**修订 [ADR-0016](./0016-org-card-display-order-and-raw-metrics.md) 决策 3 的 GitHub 归属分组口径**（`orgId ?? 'unattributed'` → `effectiveOrgId`）。ADR-0008 的双粒度结论、ADR-0016 的其余决策、ADR-0010 的 Confluence 口径**继续有效**。**同日追加决策 15**：账号级 `github` 新增必填 `repoIds`、`github-accounts.json` `schemaVersion` **1 → 2**、组织级 `repos` 改取并集——**推翻本 ADR 决策 2 的「组织级落盘文件本轮不重构结构」与「不变」小节里「`github-accounts.json` `schemaVersion` 不动」那句**（下文均已就地修正）。
- **日期**：2026-10-28（决策 1–14）／2026-10-28（决策 15，代码落地后复核追加）
- **关联文档**：04 §1.1 / §3.2 / §3.4 / §3.6 / §3.7 / §4.3 / §5.3.1 / §5.3.2 / §5.3.3 / §5.3.8 / §6.1.1；07 §2.1 H2 / H6、§2.2 P1 / A1、§3.2 / §3.3 / §3.4、§4；02 §3 / §4；05（离线自检数字：GitHub 46 → 50、身份 38 → 50）；06；README §5 术语表（独立开发者 / 贡献者 / 代码贡献量）+ §7 运营行动清单第 4 项 + §9 版本记录 v1.25（版本记录原挂在 §8 末尾，本轮提升为独立的 §9）；ADR-0014 头部修订段；`apps/api/scripts/backfill-github-repo-ids.mjs`（决策 15 的一次性迁移工具，`npm run backfill:github-repo-ids`）；`CONTEXT.md`（归属 / 生效归属 / 独立开发者 / 原子事实与派生投影 / 读时派生 / 全覆盖派生 / 双写 / 基线快照）；ADR-0003 / 0004 / 0008 / 0010 / 0011 / 0016
- **决策者**：项目负责人（第 1 轮 Q1–Q7、第 2 轮 Q8–Q14 逐条拍板「全部按推荐」；决策 15 由项目负责人在「组织级 `repos` 置 0 / 前端自行去重 / 账号级补 `repoIds`」三个修法中选定**账号级补 `repoIds`（正确修法）**）

## 背景

运营报告：首页「独立开发者」卡仍列出 **Casey Cain** 与 **Tingyu Ding**，两人早已在身份控制台认领给有归属的自然人。取证（2026-10-28，下表全部可复核）表明这**不是缓存问题**，而是 GitHub 侧缺「生效归属」这一层——归属只存在于**自然人层**，而 GitHub 侧全部读路径都读**账号层**，两层之间没有桥：

| 层 | 文件 | Casey Cain | Tingyu Ding |
| --- | --- | --- | --- |
| 认领边 | `data/identity-claims.json` | `github` / `accountKey=4486747` → `casey-cain` | `github` / `35390334` → `tingyu-ding` |
| 自然人归属 | `data/persons.json` | `orgId = "lfn"` | `orgId = "huawei"` |
| **GitHub 账号归属** | `data/github-accounts.json` | **`orgId = null`** | **`orgId = null`** |

三条断链各自成立、叠加即致命：

1. ADR-0010 的读时派生**显式排除 GitHub 边**——`effective-org.ts:43-44` 的 `if (claim.source !== 'confluence') continue;`；
2. 采集器归属只走 `aliases.github` → `emailDomains`，**全程不读认领边**；而 `aliases.github` 在 13 条组织档案中**全部为空**（07 §2.5 P1 已登记，运营决定暂不处理），即 100% 依赖邮箱域名兜底；
3. `PersonService.updatePerson` 改归属**只写 `persons.json`**，不回写账号层。

于是账号层 `orgId` 永远为 `null`，首页独立开发者人数永远为 13。

### 三处「写时派生 + 双写」

| # | 读路径 | 实现 | 数据来源 |
| --- | --- | --- | --- |
| 1 | 首页「独立开发者」数字卡 | `github-collector.service.ts:518-533` 采集时算好写入 `home.json`，`home.service.ts:21` 原样透传 | 写时派生 + 落盘 |
| 2 | 组织卡「代码贡献量」 | `json-contribution.provider.ts:16-36` 直读 | `github-organizations.json`（采集器双写） |
| 3 | 组织卡 GitHub top3 / 活跃度页个人排行 | `organization.service.ts:70-81`、`json-contributor-contribution.provider.ts:42,49`、`ContributorRankCard.tsx:150-153` 按 `orgId ?? 'unattributed'` 分桶 | `github-accounts.json` 的**采集口径** |

对照 Confluence 侧：`json-wiki.provider.ts:23-43` **不读** `confluence-organizations.json`，而是「账号级 + 认领边 + 组织档案」现场派生（ADR-0010 决策 2）。**同一平台两套真相。**

### 双写已实测漂移（非理论风险）

`github-organizations.json` 与 `github-accounts.json` 同为 2026-09-30 落盘：

| 桶 | 组织级落盘 | 账号级按采集口径聚合 | 差 |
| --- | --- | --- | --- |
| `huawei` | 1057 | 1078 | **−21** |
| `unattributed` | 90 | 69 | **+21** |
| `cmcc` / `zte` | 148 / 1 | 148 / 1 | 0 |
| **合计** | **1296** | **1296** | **0** |

总量对得上、分布对不上：**21 个 commits 在组织级记为「未归属」，在账号级已归 `huawei`**。无任何测试失败、无页面报错——因为组织级数字与账号级 top3 来自**两个不同端口**（`organization.service.ts:94` vs `:73`），互不核对。根因是 `github-organizations.json` 只有 4 个桶（**部分覆盖**），「组织级 = 账号级求和」这条恒等式在结构上不成立，漂移因此无人察觉。

### 影响面比两个人大

`orgId = null` 的 13 个账号中，**5 个已认领到「有归属」的自然人**：`wrathwolf`(25 commits → `lfn`)、`eiedty`(5 → `huawei`)、`wangyanlin1996`(3 → `huawei`)、`wangyonglong12111`(0 → `huawei`)、`kweveen`(0 → `huawei`)。其余 **8 个未归属** = 7 个真人（`cnafan` 19、`qxz123456` 5、`kuangmi-bit` 3、`20030512` 2、`tangzhiqiang` 2、`hanyu0504` 2、`zhangxltx` 0）+ 机器人 **`dependabot`**（`githubId = 0`、3 commits、3 PRs、头像为 GitHub App 路径 `/in/29110`）。机器人当前既计入「独立开发者 13 人」，也进入独立开发者卡 top3 候选（07 §2.1 H6 待办 ② 已登记未处理）。

同时挖出三处数据 / 语义问题，本轮一并裁定：

1. **认领边缺失**：`23572557 (唐志强 / tangzhiqiang)` **无任何认领边**（实测 `identity-claims.json` 的 16 条 GitHub 边中无此账号），而自然人 `zhiqiang-tang` 已存在、同样**无任何认领边**且 `orgId = null`——二者显系同一人却未被连上（`jinjin-chen` 名下只有 `22369073 (cjj205)`）。本 ADR 初稿记为「`jinjin-chen` 名下同时挂 `22369073` 与 `23572557`」的**错认领**；该边在本 ADR 落地当日已不存在（`identity-claims.json` mtime `2026-10-28T07:09:21Z`），故决策 6 的「解除」动作**已无对象**，只剩「新建边 + 裁定 `orgId`」；
2. **疑似重复自然人**：`eduardo-panciera-molanes`（`orgId = personal`，Confluence 边）与 `eduardo-m-panciera-molanes`（`orgId = null`，Meeting 边）；
3. **术语冲突**：真组织 `personal`（Personal，`type = tsc`）与伪组织 `unattributed`（独立开发者，`type = individual`）并存，「归属到 Personal 的人算不算独立开发者」此前**无定义**。

## 决策

| # | 问题 | 决策 |
| --- | --- | --- |
| 1 | 判定主体 | **生效归属**：`effectiveOrgId = 认领边派生的 Person.orgId ?? 账号级 orgId ?? 'unattributed'`，与 ADR-0010 同构；账号级 `orgId` 降为兜底 |
| 2 | 收敛范围 | GitHub 侧**全部读路径**一次收敛（首页数字卡 / 组织卡 commits / 组织卡 top3 / `GET /api/contributions` / `GET /api/contributor-contributions` 的组织筛选 / 活跃度页个人排行）；组织级落盘文件本轮**不重构结构**，只切断读路径依赖（⚠️ 账号级结构已被**决策 15** 追加 `repoIds`，见下） |
| 3 | 生效时机 | **硬要求：改完即生效**——不重跑 `collect:github`、不重启 API 进程 |
| 4 | 认领边冲突 | 沿用 Confluence 侧规则：同一 `accountKey` 多边 → 取**首条**并记 `WARN`；认领到**无 `orgId` 自然人** → **回落**采集口径，不清零 |
| 5 | 机器人 | 从**人物口径**（独立开发者人数、top3 人物列表、活跃度页个人排行）排除；**不从量口径**（commits / PRs 等求和）排除 |
| 6 | 唐志强归属 | 判为**认领边缺失**（非错认领）：新建 `zhiqiang-tang ← github/23572557`；原 `jinjin-chen ← github/23572557` 边在落地时已不存在，无需解除；`zhiqiang-tang.orgId` 留空待运营裁定 |
| 7 | 重复自然人 | 本轮**合并**：保留 `eduardo-panciera-molanes`，Meeting 边迁移后物理删除 `eduardo-m-panciera-molanes` |
| 8 | 停写后的响应形状 | **`GET /api/home/summary` 出参形状不变**（仍为 `MetricValue`），仅 `value` 改读时派生；`home.json` **删字段**、`schemaVersion` **1 → 2**；`unit` 保留 `'人'`，**不带 `delta` / `deltaDirection`**（环比属 07 §2.2 P1 待办 ②，不得由当前值与上次值相减伪造） |
| 9 | 组织级派生覆盖范围 | **全覆盖**组织档案（当前 13 条，含 8 个 0 值桶）；`updatedAt` 取账号级**文件**时间戳（`github-accounts.json` 记录级无 `updatedAt` 字段，故无从取「最新记录」） |
| 10 | 零贡献组织是否出现 | **出现**，与 `deriveOrganizationWiki` 同构；`scope=contributing` 仍按「两项贡献量均为 0」判「暂无贡献」（ADR-0016 决策 2 不变） |
| 11 | bot commits 归桶 | 仍归其**生效归属桶**（当前 = `unattributed`），保证求和恒等式与总量 1296 不变；仅人物列表排除 |
| 12 | 缓存 | `JsonRepository` 增加**基于文件 mtime 的失效**（`stat` 比对，不引入 TTL）；HTTP `max-age=60` 与前端 `staleTime: 60_000` **维持不动** |
| 13 | 采集器 | **继续写** `github-organizations.json` 与账号级 `orgId`，二者降级为**基线快照**（审计 / 人工比对用；**自动漂移告警尚未实现**，见遗留债 2），读路径不再依赖；只**停写** `home.json` 的 `externalDeveloperCount`（连带摘掉 `HOME_REPOSITORY` 注入） |
| 14 | `Personal` 与独立开发者边界 | **独立开发者 ≡ 生效归属为 `unattributed`**；`personal` 是正常组织，归属其下者**不算**独立开发者 |
| 15 | 组织级 `repos` 怎么派生（落地后追加） | **推翻决策 2 的「本轮不重构落盘结构」/「`github-accounts.json` `schemaVersion` 不动」**：账号级 `github` 新增**必填** `repoIds`（去重后的仓库全名列表）、`github-accounts.json` `schemaVersion` **1 → 2**；派生层四项（`pullRequests` / `commits` / `issues` / `linesChanged`）仍求和，`repos` 改取桶内 `repoIds` 的**并集大小**（恒等式的唯一例外）。存量数据用 `npm run backfill:github-repo-ids` 从 `.sync-state.json.personRepos` **一次性离线回填**，无需重跑采集器 |

### 生效归属（决策 1 / 4）

新增于 `apps/api/src/common/effective-org.ts`，与既有 `buildConfluenceClaimIndex` / `resolveEffectiveOrg` 并列（Confluence 侧函数一行不动）：

```
账号级原子事实（github-accounts.json）
  ├─ orgId       落盘 = 采集口径（aliases.github → emailDomains → null），每轮重算
  ├─ githubId    认领边匹配键（IdentityClaim.accountKey 存的是 githubId 的字符串形式）
  └─ github      { pullRequests, commits, issues, linesChanged, repos, repoIds }
                                                    ↑ repos ≡ repoIds.length（v2 起可校验，决策 15）

读时派生（resolveGithubEffectiveOrg）
  claimOrg        = 认领边(source='github', accountKey=String(githubId)) → Person.orgId
  effectiveOrgId  = claimOrg ?? orgId ?? ORG_UNATTRIBUTED
  orgSource       = claimOrg ? 'claim' : (orgId ? 'collection' : 'unattributed')
  personId        = 认领到的自然人（无则 null）
```

- 匹配键用 **`githubId`**（数字账号 ID，认领边 `accountKey` 的实际取值），**不用 login**——login 可改名，`githubId` 稳定；与 Confluence 侧用 `accountId` 同理。
- **不做展示名模糊匹配**（沿用 ADR-0010：同名会静默错归，认领边机制的存在正是为规避这一点）。
- 对外新增视图类型 `ContributorContributionView = ContributorContribution & { personId, effectiveOrgId, orgSource }`，`GithubOrgSource = 'claim' | 'collection' | 'unattributed'`。**追加字段，向后兼容**，落盘结构不动。
- 更细的 `orgSource`（区分 `alias` / `emailDomain`）需给 `Contributor` 增加落盘字段，属破坏性变更，本轮**不做**（登记为遗留债 5）。

### 组织级投影（决策 2 / 9 / 10 / 11 / 15）

`GET /api/contributions` 与组织卡「代码贡献量」改为读时派生：账号级 + 认领边 + 组织档案 → 按 `effectiveOrgId` 求和 `GithubMetrics` 的**四项计数**（`pullRequests` / `commits` / `issues` / `linesChanged`）、`repos` 取账号级 `repoIds` 的**并集大小** → **覆盖组织档案全部组织**，未命中记 0。于是

> 组织级各项 ≡ 账号级按生效归属求和（`repos` 除外：≡ 并集去重数）

从口头约定升级为**结构上恒成立**（不依赖任何重算时机），`lfn` 卡片不可能再出现「commits = 0 但 top3 有人」。

- 桶序 = 组织档案顺序（已按 `displayOrder` 排好，ADR-0016），不在派生层二次排序；
- `updatedAt` = 账号级**文件**时间戳（`JsonRepository.read()` 返回的信封 `updatedAt`）——`github-accounts.json` 的**记录级**没有 `updatedAt` 字段，故 `latestAccountUpdatedAt`（Confluence 侧用）**不适用**，也没有「泛化到 `Contributor`」这回事；
- top3 分桶键同步改为 `effectiveOrgId`；
- **顺带收掉重复字面量**：`'unattributed'` 目前在 API 侧有 4 处独立定义（`common/effective-org.ts:13`、`collector/collector.constants.ts:9`、`json-contributor-contribution.provider.ts:11`、`organization.service.ts:73` 内联），统一引用 `common/effective-org.ts` 的 `ORG_UNATTRIBUTED`（前端 `org-display.ts:4` 已有同名常量，跨包不合并）。

### 账号级 `repoIds`：组织级 `repos` 的并集来源（决策 15）

代码落地后复核发现的**真实回归**（不是文档问题）：`repos` 的语义是「参与过的仓库**去重数**」，而决策 2 把组织级改为「按生效归属求和」后 `repos` 也跟着求和——跨账号共用的仓库被重复计数，`huawei` 从落盘的 **13** 变成 **51**，而采集范围内的仓库总数只有 **13**（对外可见处：活跃度页组织行「N 个仓库」，`ActivityTable.tsx:163` ← `merge.ts` ← `GET /api/contributions`）。求和在这一项上**语义就不成立**（修复后各桶并集为 `huawei` 13 / `unattributed` 8 / `lfn` 6 / `cmcc` 3 / `zte` 1，合计 31 > 13，正因为同一仓库可有多组织成员参与——它本就是并集而非分片）。要让派生层能去重，账号级必须带**清单**而不只是计数：

- **契约（破坏性，落盘）**：新增 `AccountGithubMetrics extends GithubMetrics { repoIds: string[] }`（排序后的仓库全名 `owner/repo`），`Contributor.github` 收窄为该类型；`github.repos ≡ repoIds.length` 成为**可校验的不变量**。`github-accounts.json` `schemaVersion` **1 → 2**，`validators.ts` 的 `isGithubMetrics` 把 `repoIds` 列为必填（`isStringArray`）——`entities.ts` / `validators.ts` / `repositories.module.ts`（`makeRepository(…, 2)`）/ 数据信封**同批原子切换**，漏改即启动自检记 `DATA_CORRUPTED`（`50001`）fail-fast，不会静默显示错数字（与决策 8 的 `home.json` 处置方式一致）；
- **采集器**：`metricsOf` 输出 `repoIds = [...bucket.repos].sort()`、`repos = repoIds.length`；**个人维度的 `repoFloor` 兜底随之删除**（恒传 0）——`repoFloor` 只剩**组织维度**需要（`github-organizations.json` 只存计数，集合不可用时退化为已入库值）；
- **增量基线自持**：`buildContributorSeed(baseline)` 直接 `new Set(item.github.repoIds)`，**不再接收 `previousState`**；`.sync-state.json` 的 `personRepos` 自此降级为**审计 / 回填来源**，读路径与采集路径都不依赖它（状态文件丢失也不会让个人仓库数退化）；
- **存量数据一次性回填**：`npm run backfill:github-repo-ids`（`apps/api/scripts/backfill-github-repo-ids.mjs`）从 `personRepos` 回填，默认 dry-run、`--write` 落盘（临时文件 + rename 原子切换，命名与 `JsonRepository.writeToDisk` 一致），幂等（已有 `repoIds` 只做一致性核对，重跑不会掩盖既有漂移）；元信息缺某 login 时**退出码 1** 并提示改跑 `collect:github`——宁可不回填，也不能让 `repos` 凭空变小。无需重跑采集器（`personRepos` 与业务文件的 `repos` 计数同源）；
- **出参不裁剪**：`GET /api/contributor-contributions` 的 `ContributorContributionView.github` 原样透传 `repoIds`，前端 `types/contract.ts` 同步镜像——35 个带指标账号的仓库全名总量可忽略，而裁剪会让「`repos ≡ repoIds.length`」在出参上无法自检；
- **自检**：`identity-check.mjs` 新增「场景 5 生效归属派生」，断言 `repos` 取并集（2 而非求和 3）、v1 文件被拒（`50001`）；`collector-check.mjs` 断言全量 / 增量两条路径都落盘 `repoIds` 且 `repos === repoIds.length`，并**刻意把 `personRepos` 留空**以验证基线自持。

否决的两个替代：**另开一个仓库级文件**（`repoIds` 的去重键就在账号级指标里，另开文件等于再制造一份需与账号级对齐的派生数据，正是本 ADR 要消灭的双写）；**由前端自行去重**（口径下沉，与其余四项服务端下发不一致）。

### 机器人口径（决策 5 / 11）

判定为纯函数 `isBotAccount(account)`，取**三信号并集**（当前数据下三者收敛于同一账号 `dependabot`，取并集以防漏判）：`githubId === 0`；`avatarUrl` 含 `avatars.githubusercontent.com/in/`（GitHub App 头像路径，人类用户是 `/u/`）；`contributorId` 匹配 `bot`。

- **人物口径排除**：独立开发者人数、组织卡 top3、活跃度页个人排行；
- **量口径不排除**：commits / PRs / issues / linesChanged 求和照旧计入其生效归属桶——**总量恒为 1296**，与 `data/.snapshots/` 历史快照可比（快照刻意不改写，07 §2.2 P1 硬约束）；
- 不新增配置文件、不给 `Contributor` 加 `isBot` 落盘字段；若将来出现误判再落名单（遗留债 3）。

### 缓存（决策 3 / 12）

现状：`JsonRepository` 内存缓存**无 TTL**、`read()` 命中即返回（`json-repository.ts:33,53-61`），`invalidate()` 全库**零调用方**（`:91-93`）；采集器是独立进程，写完文件后运行中的 API 仍返回旧值。

改为：`read()` 先 `stat` 文件 mtime 与缓存记录的 mtime 比对，不一致则重读重解析。

- 缓存的是**原子事实文件**，不是派生结果——派生每请求重算（35 账号 × 13 组织，可忽略）；
- `write()` / `update()` 同步刷新自身 mtime 记录，避免自写自读命中陈旧缓存；
- `stat` 失败（文件缺失）走既有 fail-fast 路径，不吞异常；
- HTTP 与前端两层 60 秒缓存**不动**：可接受的传播延迟，且不是「改了不生效」的根因。

### 采集器职责收缩（决策 13）

- **停写**：`github-collector.service.ts:527-534` 的 `home.json` 回写整段删除（连带 `:519` 的 `counters`），07 §3.4「派生数据不得反向写回业务 JSON（唯一例外：采集器把 `externalDeveloperCount` 写入 `home.json`）」的例外随之消失；
- **继续写**：`github-accounts.json` 的 `orgId`（无认领时的兜底归属 + 「采集器看到了什么」的审计线索）、`github-organizations.json`（基线快照）；
- `github-organizations.json` 与 `confluence-organizations.json` 状态**对齐**：采集器仍写、读路径不依赖（ADR-0010 遗留债 2 的处置方式）；
- `.sync-state.json` 的 `unattributedLogins` **保留**，语义按 ADR-0010 决策 6 收敛为「未经认领 / 别名归属的待办清单」——注意其条数（13）自此**不再等于**首页独立开发者人数（7），07 §2.1 H2「与 `unattributedLogins`（13 个登录名）一致」那句必须删除。

### 数据修复与代码修复分离（决策 6 / 7）

数据修复**只走 `/api/identity/*` 写接口**（保留审计流水 `data/.identity-audit.jsonl`），不手改 JSON、不搭车在代码提交里：

1. 新建 `zhiqiang-tang ← github/23572557`（原 `jinjin-chen ← github/23572557` 边在落地时已不存在，**无需解除**）；
2. 合并 eduardo 两条根：Meeting 边迁至 `eduardo-panciera-molanes`，物理删除 `eduardo-m-panciera-molanes`；
3. `zhiqiang-tang.orgId` **留空**，由运营裁定（若归 `huawei`，独立开发者人数 7 → 6，`huawei` commits 1086 → 1088）。

两类修复**分开验收**，避免把口径 bug 与数据 bug 混在一个改动里。下节验收基线**不以数据修复完成为前提**：`zhiqiang-tang.orgId` 留空时，第 1 步的边建与不建对任何展示数字都无影响（决策 4 回落规则——认领到无归属自然人则回落采集口径，仍为 `unattributed`）；第 2 步只影响 Meeting 维度，不触及 GitHub 求和。

## 验收基线（按上述规则对现有数据实测重算，2026-10-28）

| 项 | 现状 | 修复后 |
| --- | --- | --- |
| 首页「独立开发者」人数 | 13 | **7** |
| 独立开发者卡 GitHub top3 | Casey Cain(25)、cnafan(19)、Tingyu Ding(5) | **cnafan(19)、tommy(5)、Kuang Mi(3)** |
| `unattributed` commits | 90（落盘）/ 69（账号级） | **36** |
| `huawei` commits | 1057（落盘）/ 1078（账号级） | **1086** |
| `lfn` commits | 无此桶 | **25**（top3：Casey Cain 25） |
| `cmcc` / `zte` commits | 148 / 1 | **148 / 1**（top3 不变） |
| 0 值桶数 | — | **8**（`orange` / `ais` / `infosys` / `asiainfo` / `personal` / `zain` / `inspur` / `unicom`） |
| 组织级求和 | 1296（分布漂移 21） | **1296**（恒等式结构成立，漂移归零） |
| 组织级 `repos`（决策 15） | 13（落盘基线快照）/ **51**（首轮派生误按求和） | **13**（`repoIds` 并集；`unattributed` 8 / `lfn` 6 / `cmcc` 3 / `zte` 1，采集范围内仓库总数 13） |

独立开发者 7 人名单：`cnafan`(19)、`qxz123456`(5)、`kuangmi-bit`(3)、`20030512`(2)、`tangzhiqiang`(2)、`hanyu0504`(2)、`zhangxltx`(0)。

> **代码落地后复核（2026-10-28）**：以编译产物 `dist/common/effective-org.js` + `dist/common/org-order.js` 对真实 `data/` 实跑读时派生，上表除末行 `repos`（当时尚未修，见下段）外各行**逐项吻合**；恒等式「组织级 commits 合计 = 账号级合计 = 1296」**PASS**；机器账号仅 `dependabot` 命中；生效归属来源分布 `claim=16 / collection=11 / unattributed=8`（共 35 个带指标账号）；组织级投影输出 **13 桶**，0 值桶 8 个。三套离线自检同步全绿：GitHub 采集链路 **46/46**、Confluence 采集链路 **73**、身份链路 **38/38**。
>
> **决策 15 落地后二次复核（2026-10-28）**：回填脚本已对真实 `data/github-accounts.json` 执行（35 个带指标账号全部拿到 `repoIds`，信封升 v2，`repos ≡ repoIds.length` 无一处不一致）；同一条派生路径重跑，各桶 `repos` 与落盘基线快照**逐桶吻合**（`huawei` 13 / `cmcc` 3 / `zte` 1），新桶 `lfn` 6 / `unattributed` 8，仓库宇宙 13、独立开发者 7、commits 两侧合计仍 **1296**（求和恒等式未被并集例外破坏）。两套自检因新增断言而扩容：GitHub 采集链路 **46/46 → 50/50**、身份链路 **38/38 → 50/50**（Confluence 侧 **73** 不变）——`docs/05` §5.4 的期望输出数字已同步（复核确认 `04 §6` 契约治理不含自检数字，无需改；`ADR-0012` 落地时点的 46/46 已就地加注）。

## 理由与取舍

- **为什么人工优先**（同 ADR-0010）：运营认领的动机就是纠正自动归属；`aliases.github` 覆盖率为 0，采集口径 100% 依赖邮箱域名兜底，人工是唯一可靠信号。若自动别名压过人工，「认领」对展示毫无作用。
- **为什么读时派生而非让 `PersonService` 回写账号层**：回写会把展示口径烘进原子事实，下一轮采集又按采集口径覆盖，形成写侧互相打架；且改 `Person.orgId` 时还要反向遍历账号找边。读时派生单一真相源、改完即变。
- **为什么组织级也要改派生，而不只修首页数字**：只改首页会立刻与活跃度页排行、组织卡 top3 打架（同一人在首页属 Huawei、在排行里标「独立」），这种矛盾比原 bug 更难解释；组织级不改派生，21 commits 的漂移会永久存在且无人察觉。
- **为什么不彻底合并组织级 / 账号级双写（ADR-0008 遗留债 2）**：合并要改采集器落盘结构与 `.snapshots` 可比性，体量另算；本轮只切断**读路径依赖**，风险可控且已消除全部用户可见矛盾。
- **为什么 bot 只从人物口径排除**：把机器人称作「独立开发者」在对外页面是硬伤；但剔除其 commits 会改变总量、破坏与历史快照的可比性，属另一个决策，不搭车。
- **为什么 `home.json` 删字段而不是保留旧值 / 置 0**：保留旧值就是留着第二份真相（正是本次 bug 的成因）；`schemaVersion` 1 → 2 + `validators` 收紧，让漏改在**启动期 fail-fast**，而不是静默显示错数字。
- **为什么 `GET /api/home/summary` 出参形状不变**：前端 `StatCard` 消费 `MetricValue`，改形状要动前端类型与三处引用，收益为零；`StatCard.tsx:80` 已有 `metric.delta !== undefined` 守卫，去掉 `delta` 后趋势徽章自然消失，**前端零改动**。
- **为什么用 mtime 而不用 TTL**：TTL 只能保证「最多延迟 N 秒」，无法满足决策 3 的「改完即生效」；mtime 比对成本一次 `stat`，更低且语义精确。

## 后果

### 受影响面

- **契约（破坏性，落盘）**：`HomeFileData` 删除 `externalDeveloperCount` → `home.json` `schemaVersion` **1 → 2**。`entities.ts`（`HomeFileData`）、`validators.ts`（`isHomeFileData`）、`repositories.module.ts`（`makeRepository(…, 2)`）、`data/home.json` 信封**必须同批原子切换**；漏改则启动自检记 `DATA_CORRUPTED`（`50001`）、`GET /api/home/summary` 报错，而**不会**静默返回旧数字。⚠️ 自检对每个仓库 `try/catch`，失败只 WARN「数据自检未通过（降级只读）」、**不阻断启动**，故这类漏改需要看日志才能发现。
- **契约（破坏性，落盘；决策 15）**：`Contributor.github` 由 `GithubMetrics` 收窄为 `AccountGithubMetrics`（新增必填 `repoIds: string[]`）→ `github-accounts.json` `schemaVersion` **1 → 2**。`entities.ts` / `validators.ts`（`isGithubMetrics` 加 `isStringArray(value.repoIds)`）/ `repositories.module.ts`（`makeRepository(…, 2)`）/ 数据信封同样**必须同批原子切换**，漏改的暴露方式与 `home.json` 一致（自检 WARN + `50001`）。存量数据由 `npm run backfill:github-repo-ids` 回填，**已执行**（35 个带指标账号，`repos ≡ repoIds.length` 全量核对通过）。
- **契约（追加，兼容）**：`ContributorContributionView` 新增 `personId` / `effectiveOrgId` / `orgSource`；`OrganizationContribution` 字段形状不变（来源改为派生，`repos` 改按并集）。
- **`GET /api/home/summary`**：`externalDeveloperCount.value` 改读时派生，不再带 `delta` / `deltaDirection`。
- **`GET /api/contributions`**：改账号级派生，桶数 4 → 13。
- **`GET /api/organizations?scope=contributing`**：`commits` 与 `topContributors.github` 改按 `effectiveOrgId`；`lfn` 卡从「暂无贡献」变为 25 commits + 1 位 top3；独立开发者卡 top3 换人。
- **`GET /api/contributor-contributions`**：输出生效归属视图，`orgIds` 筛选同步改按 `effectiveOrgId`。
- **新增纯函数**（`common/effective-org.ts`）✅：`buildGithubClaimIndex` / `resolveGithubEffectiveOrg` / `toContributorViews` / `deriveOrganizationContributions` / `isBotAccount` / `isIndependentDeveloper`；视图类型 `ContributorContributionView` + `GithubOrgSource` 落在**契约层** `contract/entities.ts`（与 `ConfluenceAccountView` 的位置一致）。
- **`JsonRepository`** ✅：`read()` 按 `stat().mtimeMs` 判缓存失效；`write` / `update` 落盘后同步 `cacheMtimeMs`（省一次多余重读）；`invalidate()` 连带清空 mtime；`stat` 失败时**不复用缓存**，转由 `readFromDisk()` 统一 fail-fast（文件消失属必须暴露的故障，不能靠旧缓存悄悄兜住）。
- **采集器** ✅：删 `home.json` 回写段与 `externalDeveloperCount` 计数，连带摘掉 `HOME_REPOSITORY` 注入与 `HomeFileData` 导入——`github-collector.service.ts` 自此不再依赖首页文件；`metricsOf` 改返回 `AccountGithubMetrics`（落盘 `repoIds`，个人维度 `repoFloor` 恒 0）；`buildContributorSeed(baseline)` **不再接收 `previousState`**（增量基线改从业务文件的 `repoIds` 自持恢复）；`.sync-state.json` **结构不变**，但 `personRepos` 语义降级为审计 / 回填来源（决策 15）。
- **一次性迁移脚本** ✅：`apps/api/scripts/backfill-github-repo-ids.mjs`（`npm run backfill:github-repo-ids`，默认 dry-run、`--write` 落盘、元信息缺 login 时退出码 1）；`.gitignore` 补 `data/.*.tmp`（脚本与 `JsonRepository` 共用的临时文件命名）。
- **前端** ✅：`types/contract.ts`（**手写镜像，编译器不会报错，必须人工对齐**：新增 `GithubOrgSource` / `ContributorContributionView`，镜像 `AccountGithubMetrics`（`Contributor.github` 与 `ContributorContribution.github` 同步收窄），`HomeSummary.externalDeveloperCount` 注释改为读时派生且不带 `delta`）、`useActivity.ts`（出参类型改视图）、`ContributorRankCard.tsx`（`isIndependent` 判据改 `effectiveOrgId === ORG_UNATTRIBUTED`、归属标签一律取 `effectiveOrgId`、脚口径文案）、`HomePage.tsx`（「独立开发者」「代码贡献量」两条口径说明）、`OrganizationWall.tsx`（独立开发者卡注释）。
- **顺带修正（同族问题）** ✅：新增 `common/org-order.ts`（`byDisplayOrder` / `sortOrganizations`）统一组织展示顺序，`json-organization.provider.ts` 改为复用并删本地重复定义。实测 `organizations.json` 的物理顺序 **≠** `displayOrder` 顺序（`lfn` 的 `displayOrder = 120` 却排在文件首位），而 `json-wiki.provider.ts` 原先直接按文件顺序出行 → Confluence 组织级投影与组织墙顺序不一致，**已一并修正**（活跃度页 Confluence 维度的行序会变，属预期）。
- **离线自检与合成种子** ✅：`collector-check.mjs` 的两条断言（原「`externalDeveloperCount = 2`」「与账号级口径一致」）改写为「采集器不再写 `home.json`（与合成种子逐字节一致）」+「`home.json` 无该字段且采集口径未归属账号数 = 2」——此改动**断言总数不变**（GitHub 46、Confluence 73、身份 38）；`scripts/fixtures/seed-data/home.json` 同步升到 `schemaVersion: 2` 并删除该字段（否则采集器 CLI 启动自检会记「`home.json` 数据结构版本不兼容（期望 v2）」——注意 `DataBootstrapService` 对每个仓库 `try/catch`，自检失败**只 WARN 降级只读、不阻断启动**，本脚本的断言也不会因此变红，属静默劣化，故必须手工核对）。
- **离线自检扩容（决策 15）** ✅：`collector-check.mjs` 把 `personRepos` **刻意留空**（验证增量基线自持）并新增 `repoIdsSummary()` + 全量 / 增量两条路径的 `repoIds` 落盘、并集、`repos === repoIds.length` 断言；`identity-check.mjs` 新增「场景 5 生效归属派生」（`makeRepo(dir, file, validator, schemaVersion)` 支持逐文件版本），断言 v1 文件被拒（`50001`）、认领改写归属、全覆盖桶数、commits 恒等式、**`repos` 取并集（2 而非求和 3）**、bot 的量计入桶、独立开发者计数。两套自检数字因此**变化**：GitHub 采集链路 **46 → 50**、身份链路 **38 → 50**（Confluence **73** 不变），`docs/05` §5.4 的期望输出数字须同步（`04 §6` 契约治理不含自检数字，`ADR-0012` 的落地时点数字已就地加注）；`scripts/fixtures/seed-data/github-accounts.json` 同步升到 `schemaVersion: 2` 并补 `repoIds`（同上：种子不升级只会 WARN，不会让断言变红）。
- **文档（全部 ✅，代码落地后已逐项复核同步完毕）**：本 ADR（含决策 15 与落地后二次复核）✅；ADR-0003 状态段修订注记 ✅、ADR-0008 状态行 + 决策 3 + 「归属并存」修订段 + 遗留债 1/2 ✅、ADR-0010 状态行 + 遗留债 1 ✅、ADR-0014 头部修订段（GitHub 双轨终结、决策 3 冲突判定自此有实际后果）✅、ADR-0016 状态行 + 决策 3 归属分组 ✅；`CONTEXT.md`（「归属」「生效归属」「独立开发者」条目已含本 ADR 口径，新增「读时派生」「全覆盖派生」「双写」「基线快照」四条术语并修正「原子事实 / 派生投影」中已过时的双写描述）✅；04 §1.1 / §3.2 / §3.7 / §4.3 / §4.5 / §5.3.3 / §5.3.8 ✅；05 §2.1 映射表 + 采集流程图 + §3 兜底定位 + §5.3 `personRepos` 语义降级 + §5.4 自检期望数字 ✅；07 §2.1 H2 / H6、§2.2 P1 / A1 / A2 / A5 ✅；02 指标卡 + 卡片墙三口径 + §4.2 GitHub 视图与个人排行 ✅；06 三方对照表（落盘快照 / 采集口径聚合 / 生效归属派生）+ 3 条新开放缺口 ✅；04 §3.4（`HomeSummary` 来源分层）/ §3.6（`externalDeveloperCount` 移除说明）/ §5.3.1 / §5.3.2 / §6.1.1（新增「**归属口径**」同步行）✅；README §5 术语表（「独立开发者」重定义、「贡献者」的「`orgId` 为空表示独立贡献者」修正、「代码贡献量」来源修正）+ §7 运营行动清单第 4 项 + §9 版本记录 v1.25 ✅。
  > **顺带修正（README v1.26）**：版本记录在 README 中此前**无独立章节号**（挂在「§8 文档维护约定」末尾），而全库有 **15 处**引用写作 `README §9`、**4 处**写作 `README §8`（本文档关联文档行与受影响面行、ADR-0016 同步面、04 §6.1.1「落盘结构变更」行），两种写法都指向同一张表。本轮以多数引用为准把版本记录提升为 **`## 9. 版本记录`**：15 处 `§9` 自此成立，4 处 `§8` 已改为 `§9`，§8 第 2 条的「本节末的版本记录」改为「§9 版本记录」。

### 不变

- `Organization` / `Person` / `IdentityClaim` 落盘结构不变；`Contributor` 除决策 15 追加的 `github.repoIds` 外**逐字段不变**（`github-accounts.json` `schemaVersion` 已随决策 15 由 **1 → 2**，其余数据文件版本不动）。
- 采集口径的判定顺序（`aliases.github` → `emailDomains` → `null`）与 commits / PR 计数规则不变（ADR-0003 / 0004）。
- Confluence 侧全部口径与实现不变（ADR-0009 / 0010 / 0011）。
- 组织卡排序（`displayOrder`）、卡片视觉、`OrganizationTopContributor` 结构不变（ADR-0016）。
- `partnerCount` / `summitCount` / `useCaseCount` / `nextSummit` 口径与来源不变。
- 写接口仍仅存在于 `/api/identity/*`；鉴权与审计流水不变。

### 遗留技术债（登记）

1. `github-organizations.json` 与 `github-accounts.json` 的**组织级 / 账号级双写结构仍在**（ADR-0008 遗留债 2）：本轮只切断读路径依赖，落盘仍两份，彻底合并需另立 ADR。
2. `github-organizations.json` 降级为基线快照后，若被误当权威会读到旧口径（4 桶、21 commits 漂移）。**应补**：采集器侧自检断言，比对「落盘组织级」与「按采集口径聚合的账号级」，漂移即 `WARN`——本次 21 commits 的漂移正是无人比对才存活至今。
3. bot 判定是**启发式**（三信号并集），无显式名单；若出现「人类账号 login 含 bot」或「App 头像但应计入」的误判，需落 `data/bot-accounts.json`（07 §2.1 H6 待办 ② 由此关闭并转为本条）。
4. mtime 失效只解决**单进程内**的陈旧读；跨进程依赖文件系统 mtime 精度，网络盘 / FAT 可能秒级截断。本轮数据目录在本地 NTFS，风险可接受；若按 08 迁 LAN 共享目录需复核。
5. `GithubOrgSource` 只区分 `claim` / `collection` / `unattributed`，无法说明采集口径究竟命中 `alias` 还是 `emailDomain`（`Contributor` 无落盘 `orgSource`，Confluence 侧有）。补齐属破坏性变更，待有实际排查需求再做——不过决策 15 已把 `github-accounts.json` 升到 v2 并跑通「逐文件 `schemaVersion` + 一次性回填脚本」的迁移路径，将来补 `orgSource` 可直接复用该约定（v2 → v3），成本已比本轮之前低。
6. `zhiqiang-tang.orgId` 留空未裁定（决策 6），裁定后独立开发者人数与 `huawei` commits 会再变一次。
7. `GET /api/home/summary` 的 `updatedAt` 仍取 `home.json` 的文件时间，而 `externalDeveloperCount` 的新鲜度取决于 `github-accounts.json` + 认领边——运营认领 / 改归属后**数字立刻变，首页「数据更新于 X」却不动**。本轮不改（改则牵动 4 张卡的统一时间戳语义），登记待裁定：要么各指标自带时间戳，要么首页时间戳取各来源的最大值。
8. `repoIds` 让账号级文件体积随「账号数 × 仓库数」增长（当前 35 个带指标账号 × 采集范围内 13 个仓库，可忽略）；若采集范围扩到数百仓库 / 数千账号，需重新评估是继续内嵌清单，还是改为仓库维度的倒排文件（届时另立 ADR）。
9. `backfill-github-repo-ids.mjs` 是**一次性**迁移工具，已对现网 `data/` 执行完毕，保留只为可复现；若 `.sync-state.json` 丢失且业务文件仍是 v1，回填脚本会以退出码 1 **拒绝猜测**，唯一出路是重跑 `collect:github` 全量重建仓库集合。
10. 组织级基线快照 `github-organizations.json` 的 `repos` 仍靠 `repoFloor`（上一轮已入库值）兜底——个人维度自 v2 起自持清单已删除该兜底，组织维度因「只存计数、不存清单」而保留；随遗留债 1 的双写合并一并消失。

## 备选方案（已否决）

- **让 `PersonService` 在改归属 / 认领时回写 `github-accounts.json` 的 `orgId`**：写侧与采集器争抢同一字段，下轮采集按采集口径覆盖，人工归属丢失；改 `Person.orgId` 时还要反向遍历账号找边。
- **只修首页数字卡，其余读路径不动**：立刻与活跃度页排行、组织卡 top3 自相矛盾，比原 bug 更难解释。
- **采集器读认领边，把生效归属烘进账号级 `orgId`**：ADR-0010 决策 6 已否决同构方案——认领必须立即生效，不能绑定采集周期；且会让「采集器看到了什么」这条审计线索消失。
- **给 `Contributor` 增加落盘字段 `effectiveOrgId`**：制造第三份真相，且每次改归属都要回写全量账号文件。
- **把 `dependabot` 从 commits 总量中一并剔除**：改变总量 1296，破坏与 `data/.snapshots/` 历史快照的可比性。
- **把独立开发者人数改为前端从 `GET /api/contributor-contributions` 自行统计**：口径下沉到前端，与首页其余三项指标（服务端下发）不一致，且 `StatCard` 与 `OrganizationWall` 会各算一遍。
- **保留 `home.json` 字段、置 0 或写 `-1` 作哨兵**：留着一份永不被读的死数据，下一个读文档的人会照着它排查。
- **组织级 `repos` 沿用求和、不为它破例（决策 15 否决）**：会让 `huawei` 显示 51 而采集范围内只有 13 个仓库——对去重语义而言求和天然不成立，「恒等式好看」不能压过「数字是错的」。
- **读路径现场读 `.sync-state.json.personRepos` 求并集，不改 schema（决策 15 否决）**：让展示依赖采集器元信息（点文件、无 `schemaVersion` 校验、可随时被清理），且增量模式下它是仓库集合的**唯一副本**——状态文件一丢，仓库数永久退化且无人察觉；决策 15 反过来让业务文件自持清单、把元信息降级为审计来源。
- **只把 `repos` 从组织级出参里摘掉（决策 15 否决）**：`OrganizationContribution.github` 是公开契约，活跃度页组织行正在展示「N 个仓库」（`ActivityTable.tsx:163`，数据来自 `merge.ts` 合并的 `GET /api/contributions`），摘字段等于砍功能，且 `GithubMetrics` 五项与 Confluence 侧的对称性被破坏。

## 备注

- 本 ADR 由两轮「拷问式评审」（`grill-with-docs`）产生：第 1 轮 Q1–Q7（判定主体 / 收敛范围 / 生效时机 / 错认领 / bot / `Personal` 边界 / 文档产出），第 2 轮 Q8–Q14（契约与落盘 / 全覆盖 / 零贡献组织 / bot 归桶 / 缓存 / 采集器 / 数据修复），决策者逐条采纳推荐。
- **决策 15 不来自评审**，而来自代码落地后的**文档同步复核**：回写 04 §3.2「组织级 ≡ 账号级求和」时发现 `repos` 这一项求和在语义上就不成立（去重数 ≠ 计数之和），实测 `huawei` 51 vs 仓库宇宙 13，遂追加决策并推翻决策 2 的「组织级落盘文件本轮不重构结构」。这也是「口径必须写进文档」的实证：数字被写成一句话时，矛盾才藏不住。
- 关键证据：`apps/api/src/common/effective-org.ts`（Confluence 侧读时派生与 `deriveOrganizationWiki` 全覆盖样板）、`apps/api/src/collector/github/github-collector.service.ts:518-534`、`apps/api/src/modules/home/home.service.ts:16-27`、`apps/api/src/providers/json/json-contribution.provider.ts:16-36`、`apps/api/src/providers/json/json-wiki.provider.ts:23-43`、`apps/api/src/providers/json/json-contributor-contribution.provider.ts:11,42,49`、`apps/api/src/modules/organization/organization.service.ts:59-112`、`apps/api/src/repositories/json-repository.ts:33,53-61,91-93,149-158`、`apps/api/src/repositories/repositories.module.ts:63-108`、`apps/api/src/repositories/validators.ts:227-235`、`apps/api/src/contract/entities.ts:29-47,118-131,155-182`、`apps/web/src/types/contract.ts:163-171`、`apps/web/src/features/activity/ContributorRankCard.tsx:149-153,222`、`apps/web/src/features/home/OrganizationWall.tsx:185-254`、`apps/web/src/components/ui/StatCard.tsx:54-99`、`data/github-accounts.json`、`data/github-organizations.json`、`data/identity-claims.json`、`data/persons.json`、`data/home.json`。决策 15 另见：`apps/api/src/contract/entities.ts`（`AccountGithubMetrics`）、`apps/api/src/repositories/validators.ts:142-158`（`repoIds` 必填）、`apps/api/src/collector/github/github-collector.service.ts:48-57,286-311,577-592`（`repoFloor` 收缩 / 基线自持 / `metricsOf`）、`apps/api/src/common/effective-org.ts:306-356`（并集派生）、`apps/api/scripts/backfill-github-repo-ids.mjs`、`apps/api/scripts/collector-check.mjs`、`apps/api/scripts/identity-check.mjs`、`apps/web/src/features/activity/ActivityTable.tsx:161-165`、`apps/web/src/features/activity/merge.ts:55-75`、`data/.sync-state.json`（`personRepos`）。

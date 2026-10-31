# OpenAN 运营洞察平台

汇聚 GitHub、Confluence、例会台账等来源的 OpenAN 社区协作数据，落盘为 `data/*.json`，对外提供洞察接口：看板接口只读；**身份匹配控制台是唯一写入口**，其写接口仅存在于 `/api/identity/*`（见 `docs/04` §5.3）。

## Language

**空间 (Space)**: Confluence 的顶层容器，也是本项目 Confluence 采集的唯一单位（如 `OpenAN`）。"从 Confluence 的目标仓库取数"中的"仓库"指的就是它。
_Avoid_: 仓库, repo, 项目

**页面 (Page)**: 空间内的一篇文档。每页有创建者（creator）、一条版本历史（每次编辑记一个版本，作者为 version author）与若干标签。
_Avoid_: 文章, 文档条目, 内容

**标签 (Labels)**: 挂在页面上的自由文本标记。**不参与 Confluence 计数口径**：真实空间 `OpenAN` 只有 `tsc-minutes` / `pac-minutes` / `marketing-minutes` 三种会议纪要标签，**没有需求标签**；故需求与议题分享的选页一律改用**结构选择器**（标题 + 祖先链），不看标签。
_Avoid_: 分类, 类目, tag

**需求 (Requirement)**: 在 `Requirement Proposal` 页（须位于 `Release Planning` 之下）**需求表格**的 `Contacts` 列里，**每个 @ 提及各算 1 条**（一行两位联系人即两位各 1 条，故条数 = 提及数，不等于页数/行数）。选页与列名可用 `CONFLUENCE_REQUIREMENT_PAGE_TITLE` / `CONFLUENCE_REQUIREMENT_ANCESTOR_TITLE` / `CONFLUENCE_REQUIREMENT_CONTACT_COLUMN` 覆盖（留空取内置默认）。见 ADR-0009。
_Avoid_: 工单, 任务, issue

**议题分享 (Topic Share)**: 会议纪要页（标题匹配 `^\d{4}-\d{2}-\d{2} TSC Minutes$` 且父页匹配 `^\d{4} - TSC Minutes$`）`Agenda` 段**内**的全部 @ 提及（段落里的与表格行里的都算，实测分享人写在「议题标题 + @分享人」的段落里），**同一期同一账号最多算 1 次**（≈ 参加了几期会议的议题分享）。**只取该段**：同页 `Attendees & Representation` 段的 @ 是出席签到（占全页 80%），计入会得到"出席次数"。取代原先恒 0 的 `bestPractices`。见 ADR-0009 及其「后续修订」。
_Avoid_: 分享, 演讲, 议题, best practice

**认领 (Claim)**: 运营人工把某个来源账号（GitHub `githubId` / Confluence `accountId` / 例会人名原文）判定为某个自然人，结果作为一条**认领边**写入人工维护的 `data/identity-claims.json`（由 `source` + `accountKey` 指称来源账号）。采集器只读该表，不做自动匹配。**解除认领 = 物理删除该边**，账号随即回到候选池。
_Avoid_: 绑定, 关联, 自动匹配, 合并

**自然人 (Person)**: 跨来源被认定为同一个人的身份根，由不可变的人工分配标识 `personId` 指称（取可读 slug，重名时末尾加数字）；档案存于 `data/persons.json`，含展示名 `displayName` 与归属组织 `orgId`（可空）。一经创建仅可改名与调整归属，删除为不可逆物理删除（仅限误建）。
_Avoid_: 用户, 账号, contributor

**贡献者 (Contributor)**: **GitHub 账号维度**的个人档案（**账号档案**），存于 `data/github-accounts.json`，主键 `contributorId`（≈ GitHub login 小写）、稳定键 `githubId`。是「人工档案（`joinedAt`/`description`）+ 采集回填指标（`github`）」的混合实体，但自**事件明细**上线后读路径只取**展示与归属字段**（`name` / `avatarUrl` / `githubId` / 采集口径 `orgId`），其 `github` 指标与 `repoIds` 降级为**基线快照**（对外数字一律由事件派生）。**不是**自然人：多个 Contributor 可认领为同一 Person，一个 Contributor 只对一个 GitHub 账号。与「自然人 (Person)」严格区分，勿混用「用户/成员」指代。⚠️ 有档案但本轮无事件的账号**不进任何出参**；反之事件里有、档案里没有的 login 由派生层用事件 `author` 快照**兜底合成**（不会丢）。
_Avoid_: 用户, 成员, 自然人

**数据粒度（事件级 / 个人级 / 组织级）**: 同一来源按多种粒度落盘 —— **事件级**（一条 = 一个已合并 PR 或一条 Issue，`github-events.json`，**GitHub 侧唯一原子事实**）、**个人级**（按**平台账号**，如 `github-accounts.json`；Confluence 侧为 `confluence-accounts.json`）与**组织级**（按 `orgId` 聚合，如 `github-organizations.json` / `confluence-organizations.json`）。命名规则 `<source>-<grain>.json`。个人级的**主体是平台账号**（GitHub `githubId` / Confluence `accountId`），自然人归属是由认领边**派生**的结果，故个人级文件用 `accounts` 而非 `persons`。粒度由**读者**决定，但**权威只有一层**：GitHub 侧组织级 / 个人级 / 仓库级三段全部由事件级**读时派生**，个人级与组织级落盘文件退为账号档案与基线快照；Confluence 侧无事件级，个人级即原子事实、组织级派生（ADR-0008 / ADR-0010 / ADR-0017）。
_Avoid_: 汇总表/明细表（易与页面混淆）, 三层都当权威

**原子事实 (Atomic Fact) / 派生投影 (Derived Projection)**: 原子事实是平台**最细的可复算粒度**（GitHub：**事件**——一条已合并 PR 或一条 Issue；Confluence：账号 × 维度计数），**删掉后算不回来**（要重跑采集器打外部 API）；派生投影是由原子事实聚合出的层级（账号级视图、仓库级行、组织级计数、候选人池、独立开发者人数），**删掉后能算回来**。原则：**只写原子事实，层级差异一律用派生表达**，避免同一份数字被双写而悄悄漂移。GitHub 侧已收敛到**单一原子事实** `github-events.json`：账号级（`github-accounts.json` 的 `github` 指标）与组织级（`github-organizations.json`）的双写都已**切断读路径依赖**（对外只认派生值），落盘副本降级为账号档案 / 基线快照；彻底合并另立 ADR（ADR-0008 遗留债 2 → ADR-0017 遗留债 1）。
_Avoid_: 明细/汇总（措辞过泛）

**读时派生 (Read-time Derivation)**: 派生投影的**计算时机**——在请求处理过程中现算，结果**不落盘**。对立面是**写时派生**（采集 / 写入时算好并落盘，如已废止的 `home.json.externalDeveloperCount`）。读时派生的收益是**改完即生效**：认领 / 解除 / 改 `Person.orgId` 后下一个请求就是新值，不重跑采集器、不重启进程；代价是每请求重算，故需缓存**原子事实文件**（`JsonRepository` 按 mtime 失效，ADR-0017）而非缓存派生结果。派生函数必须是**纯函数**（同输入同输出、无副作用）。两个来源同构但**跳数不同**：Confluence 一跳（账号级 → 组织级，`deriveOrganizationWiki`，ADR-0010）；GitHub **两跳**（`deriveGithubFromEvents` 事件 → 账号级视图 + 仓库聚合，`deriveOrganizationContributions` 账号级 → 组织级，ADR-0017 + 事件明细收敛）——三段共用**同一次**第一跳，故「组织级 ≡ 账号级 ≡ 仓库级」由函数形状保证。
_Avoid_: 实时计算（未点明"不落盘"）, 落盘派生值

**全覆盖派生 (Full-coverage Derivation)**: 派生组织级投影时遍历**组织档案全集**，无账号命中的组织**记 0 而非跳过**。这样「组织级之和 ≡ 账号级之和」这条恒等式由**函数形状**保证（而非靠测试或重算时机），于是不会出现「`commits = 0` 但 top3 有人」的自相矛盾。部分覆盖是漂移得以长期存活的根因（`github-organizations.json` 只有 4 桶时，归属漂移无人察觉；现测快照 `huawei` 1504 vs 派生 1578，其中 29 commits 是真漂移、70 commits 是认领边搬家，详见 `docs/06` §2）。
_Avoid_: 有值才建桶, 稀疏聚合

**双写 (Dual Write)**: 同一事实存两份（一份原子、一份派生落盘），由**不同写入者在不同时刻**产生，而系统无机制强制一致 → **必然漂移**，且因两份数据常来自不同端口而互不核对。处置原则：切断读路径依赖、落盘副本降级为基线快照，而不是加同步逻辑（同步逻辑只是把漂移点搬家）。
_Avoid_: 冗余备份（暗示无害）, 缓存

**基线快照 (Baseline Snapshot)**: 采集器**仍写**、但读路径**不再作为对外真相**的落盘副本，只用于采集侧告警与漂移比对（`github-organizations.json`、`confluence-organizations.json`、`github-accounts.json` 里的 `github` 指标与 `repoIds`，以及账号档案上的采集口径 `orgId`——后者仍**参与**归属判定的第二优先级，故不是纯快照）。与 `data/.snapshots/**` 的**历史快照**严格区分：后者是某时刻的只读留痕，**刻意不改写**（改写等于伪造历史），故其中仍存的退休枚举不得用于校验当前数据（见 `docs/07` §2.2 P1 硬约束）。
_Avoid_: 权威数据, 缓存, 历史快照

**归属 (Org Assignment)**: 自然人所属的组织，**只存 `Person.orgId` 一处**，是该关系的唯一真相；为空表示未归属（前端归入「独立开发者」）。组织档案 `organizations.json` 上**不存**成员清单。与**账号级自动归属**（采集器按 `aliases` / `emailDomains` 写入平台账号档案的 `orgId`，即**采集口径**）是两套口径而非两套真相：采集口径只回答「采集器看到了什么」，**不再是对外展示值**；两者由「生效归属」仲裁（Confluence 见 ADR-0010，GitHub 见 ADR-0017）。`unattributed` 是伪组织，**不可**被指派为 `Person.orgId`，只能由生效归属兜底产生。
_Avoid_: 组织成员字段, 成员表

**生效归属 (Effective Org)**: 平台账号**对外展示**的组织归属，**读时派生**，两个来源同构：`effectiveOrgId = 认领边派生的 Person.orgId ?? 采集口径 orgId ?? unattributed`（Confluence 的采集口径是 alias → 空间，GitHub 是 `aliases.github` → `emailDomains`）。与落盘的 `orgId`（**采集口径**）严格区分：生效归属记「当前应展示给谁」。认领 / 解除 / 改 `Person.orgId` 后**立即变化**，无需重跑采集器；组织级投影（`GET /api/wiki`、`GET /api/contributions`）与首页「独立开发者人数」都按 `effectiveOrgId` 求和，故「组织级 = 账号级求和」结构上恒成立。见 ADR-0010（Confluence）、ADR-0017（GitHub）。
_Avoid_: 用 `orgId` 指代对外值, 采集归属

**独立开发者 (Independent Contributor)**: **生效归属**为伪组织 `unattributed` 的贡献者——既没被认领到有归属的自然人，采集口径也没命中任何组织。首页「独立开发者人数」即此计数，**机器人账号不计入人数**（其代码量仍计入总量，见 ADR-0017）。与真组织 `personal`（Personal，`type=tsc`）**互斥**：归属到 Personal 的人是已归属，不是独立开发者。
_Avoid_: 独立贡献者, 外部开发者, external developer, 未归属账号（后者专指 Confluence 采集状态文件里的 `unattributedAccounts[]`，是采集口径概念）

**活跃来源 (Activity Source)**: 社区活跃度页当前呈现的口径，二取一——`github`（代码协作指标：PR / 提交 / Issue / 代码量）或 `confluence`（成果文档指标：需求 / 议题分享）。由顶部切换器控制、写入 URL query `?source=`（默认 `github`），决定页面读哪套数据、明细表用哪些列；切换不改变其它筛选条件。
_Avoid_: 数据源, 来源（易与 `IdentitySource` 混）

**未归属账号 (Unattributed Account)**: Confluence 采集时**在正文里被 @ 到**（因此产生了 `requirements` / `topicShares` 计数）但未落到任何组织的账号，被写入独立状态文件 `data/.sync-state.confluence.json` 的 `unattributedAccounts[]`（含 `accountId` / 展示名 / 两个维度的量），供运营补 `aliases.confluence` 或补认领边后回归组织。其计数在补录前统一落在伪组织 `unattributed`。
_Avoid_: 未知用户, 黑名单, orphan

**未能解析的联系人 (Unresolved Contact)**: 需求表格 `Contacts` 列里写成**纯文本** `@某人`（而非真正的 mention）因而解析不出 `accountId` 的行；**不猜、不丢**，连同页 + 行号 + 需求标题 + handle 原文写入状态文件 `unresolvedContacts[]`，运营把正文改成真正的提及后重跑即可计入。
_Avoid_: 脏数据, 异常行

**组织花名册 (Org Roster)**: 「组织 → 其下开发者」的**派生视图**，由 `Person.orgId` 分组得到，不落盘。"查询组织下所有 dev"即读该视图，写入仍只经由 `Person.orgId`。
_Avoid_: 落盘的组织成员列表

**候选池 (Candidate Pool)**: 待认领 / 已认领的来源账号集合，由 `github-accounts.json`、`confluence-accounts.json`（账号级，ADR-0010）与 `meetings.json` **实时派生**，不落盘、零维护。按来源分三组，顺序固定为 **GitHub → Confluence → Meeting**；支持 `?source=confluence` 深链预选分组（供活跃页「去账号认领」入口落地）。每条 GitHub / Confluence 候选带**采集口径归属**（`orgId` / `orgName`，Confluence 另带 `orgSource`），`claimedBy` 带各认领自然人的归属（ADR-0014）；认领目标归属与候选采集归属不一致时，认领前弹模态确认（**提醒不阻断**），自然人未归属时提供「认领并归属到该组织」快捷路径（先认领、成功后再改归属）。
_Avoid_: 账号表

**认领目标 (Claim Target)**: 自然人模式下左栏花名册中被选中的自然人，是候选池「认领」动作的唯一对象；页面级瞬时状态，不落盘、不进 URL。与「详情抽屉」是两个**独立**状态：选中不打开抽屉，关抽屉不清空目标（ADR-0006）。
_Avoid_: 当前用户, 选中的人（用于指代详情对象）

**详情抽屉 (Person Detail Drawer)**: 自然人模式下由行内「详情」按钮单独打开的模态面板，用于改名 / 调整归属 / 解除认领 / 物理删除。开关不影响认领目标（ADR-0006）。
_Avoid_: 用「选中」兼指打开详情

**时间口径 (Time Basis)**: 一组数字回答的是「**全量**还是**某区间**」——本项目里同名的指标可能落在两种口径上，故**必须成对读出**：说「提交数 1813」而不说口径等于没说。当前分三档：① **全量口径**（不带区间，见下）；② **区间口径**（GitHub 侧，见下）；③ **混合口径**（`GET /api/contributions/summary` 的 `totals`——GitHub 四项跟随区间、Confluence 三项恒全量，出参不携带口径标记）。已知分叉：**首页与组织卡恒为累计（全量口径）**，活跃度页 GitHub 侧可按区间；Confluence 侧（`/api/wiki`、`/api/confluence-accounts`）**恒为全量**（无时间维度明细）。前端必须把口径**写在脸上**：Confluence 视图禁用区间筛选器、GitHub 视图给 Confluence 列打「全历史」角标、组织卡标签带「（累计）」（ADR-0018）。
_Avoid_: 时间范围（只指入参，不指口径）, 累计/区间（不加限定就说，易与首页的累计混）

**全量口径 (Full-history Basis)**: **不带 `from` / `to`** 时的读法，统计全部事件，是本项目**默认**口径。实现上不是「区间从 -∞ 到 +∞」，而是 `filterEventsByRange` 对 `undefined` **原数组同引用返回**（不遍历、不复制）——「不带区间 ≡ 全量」因此是可被 `===` 断言的实现事实，不只是语义约定（`identity-check` 场景 7 直接断言同一引用）。⚠️ 与 Confluence 侧的「恒为全量」**不同**：前者是**缺省**（给了区间就会切），后者是**不可切**（给了区间也恒不过滤）。
_Avoid_: 默认区间（那是前端 UI 概念，见下）, 全部时间（那是预设按钮的文案）

**区间口径 (Range Basis)**: 带 `from` / `to` 时只统计**事件时间戳**落在**半开区间** `from <= timestamp < to` 内的事件，是**视图属性**而非事实属性——`github-events.json` **恒存全量**，区间是**读时切片**（唯一谓词 `filterEventsByRange`，在 `deriveGithubFromEvents` 之前切一刀）。日界按 **Asia/Shanghai** 由**前端**翻成时刻（`rangeStartInstant` = 当日零点，`rangeEndInstant` = **次日**零点），后端只比 epoch 毫秒、不解析时区、不认识「日期」。`from > to` → `40002`；`from == to` **合法**（空区间，命中 0）；单侧缺省则该侧无界。**仅 GitHub 侧生效**：组织级 / 账号级 / 仓库级三段共用同一谓词，故恒等式「组织级 ≡ 账号级 ≡ 仓库级求和」在**任意区间**下成立（ADR-0018）。
_Avoid_: 时间筛选（曾同时指入参、遗留债与视图属性三种东西）, 阶段三（已结清）

**事件时间戳 (Event Timestamp)**: `github-events.json` 每条事件的 `timestamp`——PR 取 `mergedAt`、Issue 取 `createdAt`，ISO 8601 **时刻**。自 `schemaVersion` **2** 起为**必填**：它是区间口径的**唯一**切片依据，可空会让同一份文件在「全量 / 区间」两种读法下给出**两个总量**（恒等式当场破产，且破在默认视图上最难发现）。故缺时间的记录在**采集期整条拒绝**（不落盘、不进聚合）+ `WARN` + `.sync-state.json` 的 `untimedEvents` 累计。真通道结构上产不出这种记录（PR 只查 `states: MERGED` ⇒ `mergedAt` 必存在，Issue 必有 `createdAt`），拒绝是**回归护栏**而非日常路径（ADR-0018 决策 4）。
_Avoid_: 创建时间（Issue 才是 `createdAt`）, 采集时间（那是文件 `updatedAt` / 游标 `collectedAt`）

**默认区间 (Default Range)**: 前端活跃度页**未做任何选择**时的区间状态——`DEFAULT_FILTERS.from` / `.to` 均为**空串**，即**全量口径**。⚠️ 刻意**不硬编码年份**：此前写死的 `2026-01-01..2026-12-31` 在区间不生效时无害，一旦生效就会在 2027-01-01 让页面**静默变成全 0 空视图**。「本年」等快捷值改由 `RANGE_PRESETS` 预设按钮提供（全部时间 / 本年 / 近 90 天，「本年」按 `new Date().getFullYear()` 现算），选中态由 `activePreset` **反推**而不另存状态（ADR-0018 决策 2）。
_Avoid_: 初始时间范围, 默认时间（未点明它是"空 ≡ 全量"）

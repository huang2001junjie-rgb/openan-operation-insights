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

**贡献者 (Contributor)**: **GitHub 账号维度**的个人档案，存于 `data/github-accounts.json`，主键 `contributorId`（≈ GitHub login 小写）、稳定键 `githubId`。是「人工档案（`joinedAt`/`description`）+ 采集回填指标（`github`）」的混合实体，**不是**自然人：多个 Contributor 可认领为同一 Person，一个 Contributor 只对一个 GitHub 账号。与「自然人 (Person)」严格区分，勿混用「用户/成员」指代。
_Avoid_: 用户, 成员, 自然人

**数据粒度（组织级 / 个人级）**: 同一来源按两种粒度落盘 —— **组织级**（按 `orgId` 聚合，如 `github-organizations.json` / `confluence-organizations.json`）与**个人级**（按**平台账号**，如 `github-accounts.json`；Confluence 侧为 `confluence-accounts.json`）。命名规则 `<source>-<grain>.json`。个人级的**主体是平台账号**（GitHub `githubId` / Confluence `accountId`），自然人归属是由认领边**派生**的结果，故个人级文件用 `accounts` 而非 `persons`。粒度由**读者**决定：组织级服务活跃度页与卡片墙，个人级服务个人排行、候选池与身份控制台；两个来源均按两层设计（见 ADR-0008）。
_Avoid_: 汇总表/明细表（易与页面混淆）

**原子事实 (Atomic Fact) / 派生投影 (Derived Projection)**: 原子事实是平台原始粒度（GitHub 账号；Confluence 账号 × 维度计数），派生投影是由原子事实聚合出的层级（组织级计数、候选人池）。原则：**只写原子事实，层级差异尽量用派生表达**，避免同一份数字被双写而悄悄漂移（当前 `github-organizations.json` 组织级与 `github-accounts.json` 个人级即双写，一致性待收敛，见 ADR-0008）。
_Avoid_: 明细/汇总（措辞过泛）

**归属 (Org Assignment)**: 自然人所属的组织，**只存 `Person.orgId` 一处**，是该关系的唯一真相；为空表示未归属（前端归入「独立开发者」）。组织档案 `organizations.json` 上**不存**成员清单。与**账号级自动归属**（采集器按 `aliases` / `emailDomains` 写入平台账号档案的 `orgId`）是**两套并存口径**：互不覆盖、不自动仲裁，不一致时只告警（见 ADR-0008）。（**例外**：**Confluence** 的对外展示口径已由 ADR-0010 改为「人工认领优先」，见「生效归属」；GitHub 侧仍两套并存。）
_Avoid_: 组织成员字段, 成员表

**生效归属 (Effective Org)**: Confluence 账号**对外展示**的组织归属，**读时派生**：`effectiveOrgId = 认领边派生的 Person.orgId ?? 采集器结果(alias → 空间) ?? unattributed`。与落盘的 `orgId`（**采集口径**，记「采集器看到了什么」）严格区分：生效归属记「当前应展示给谁」。认领 / 解除 / 改 `Person.orgId` 后**立即变化**，无需重跑采集器；组织级 `GET /api/wiki` 正是按 `effectiveOrgId` 求和。见 ADR-0010。
_Avoid_: 用 `orgId` 指代对外值, 采集归属

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

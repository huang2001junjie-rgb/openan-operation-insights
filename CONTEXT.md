# OpenAN 运营洞察平台

汇聚 GitHub、Confluence、例会台账等来源的 OpenAN 社区协作数据，落盘为 `data/*.json`，对外提供洞察接口：看板接口只读；**身份匹配控制台是唯一写入口**，其写接口仅存在于 `/api/identity/*`（见 `docs/04` §5.3）。

## Language

**空间 (Space)**: Confluence 的顶层容器，也是本项目 Confluence 采集的唯一单位（如 `OpenAN`）。"从 Confluence 的目标仓库取数"中的"仓库"指的就是它。
_Avoid_: 仓库, repo, 项目

**页面 (Page)**: 空间内的一篇文档。每页有创建者（creator）、一条版本历史（每次编辑记一个版本，作者为 version author）与若干标签。
_Avoid_: 文章, 文档条目, 内容

**认领 (Claim)**: 运营人工把某个来源账号（GitHub `githubId` / Confluence `accountId` / 例会人名原文）判定为某个自然人，结果作为一条**认领边**写入人工维护的 `data/identity-claims.json`（由 `source` + `accountKey` 指称来源账号）。采集器只读该表，不做自动匹配。**解除认领 = 物理删除该边**，账号随即回到候选池。
_Avoid_: 绑定, 关联, 自动匹配, 合并

**自然人 (Person)**: 跨来源被认定为同一个人的身份根，由不可变的人工分配标识 `personId` 指称（取可读 slug，重名时末尾加数字）；档案存于 `data/persons.json`，含展示名 `displayName` 与归属组织 `orgId`（可空）。一经创建仅可改名与调整归属，删除为不可逆物理删除（仅限误建）。
_Avoid_: 用户, 账号, contributor

**归属 (Org Assignment)**: 自然人所属的组织，**只存 `Person.orgId` 一处**，是该关系的唯一真相；为空表示未归属（前端归入「独立开发者」）。组织档案 `organizations.json` 上**不存**成员清单。
_Avoid_: 组织成员字段, 成员表

**组织花名册 (Org Roster)**: 「组织 → 其下开发者」的**派生视图**，由 `Person.orgId` 分组得到，不落盘。"查询组织下所有 dev"即读该视图，写入仍只经由 `Person.orgId`。
_Avoid_: 落盘的组织成员列表

**候选池 (Candidate Pool)**: 待认领 / 已认领的来源账号集合，由 `contributors.json`、`meetings.json` 与 Confluence 来源**实时派生**，不落盘、零维护。
_Avoid_: 账号表

**认领目标 (Claim Target)**: 自然人模式下左栏花名册中被选中的自然人，是候选池「认领」动作的唯一对象；页面级瞬时状态，不落盘、不进 URL。与「详情抽屉」是两个**独立**状态：选中不打开抽屉，关抽屉不清空目标（ADR-0006）。
_Avoid_: 当前用户, 选中的人（用于指代详情对象）

**详情抽屉 (Person Detail Drawer)**: 自然人模式下由行内「详情」按钮单独打开的模态面板，用于改名 / 调整归属 / 解除认领 / 物理删除。开关不影响认领目标（ADR-0006）。
_Avoid_: 用「选中」兼指打开详情

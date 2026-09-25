# OpenAN 运营洞察平台

汇聚 GitHub、Confluence、例会台账等来源的 OpenAN 社区协作数据，落盘为 `data/*.json`，对外提供只读洞察接口。

## Language

**空间 (Space)**: Confluence 的顶层容器，也是本项目 Confluence 采集的唯一单位（如 `OpenAN`）。"从 Confluence 的目标仓库取数"中的"仓库"指的就是它。
_Avoid_: 仓库, repo, 项目

**页面 (Page)**: 空间内的一篇文档。每页有创建者（creator）、一条版本历史（每次编辑记一个版本，作者为 version author）与若干标签。
_Avoid_: 文章, 文档条目, 内容

**认领 (Claim)**: 运营人工把某个来源账号（Confluence accountId / GitHub login）判定为同一个人，结果写进一张人工维护的身份映射表；采集器只读该表，不做自动匹配。
_Avoid_: 绑定, 关联, 自动匹配

**自然人 (Person)**: 跨来源被认定为同一个人的身份根，由一个不可变的人工分配标识 `personId` 指称；取可读 slug，重名时在末尾加数字区分。
_Avoid_: 用户, 账号, contributor

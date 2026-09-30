# ADR-0001：首页组织卡片墙展示全部组织并按综合贡献分排序

- **状态**：已接受
- **日期**：2026-09-21
- **关联文档**：02 §3.1/3.2、03 §4.1 与请求时序、04 §5.3.2、README §5 术语表
- **命名说明**：本文保留决策当时的文件名；`contributions.json` / `wiki.json` 已更名为 `github-organizations.json` / `confluence-organizations.json`，对照见 ADR-0008。

## 背景

原设计中，首页"贡献的组织"卡片墙通过 `GET /api/organizations?scope=contributing` 获取数据，后端只保留在 `contributions.json` 或 `wiki.json` 中有记录的组织。实现后暴露两个问题：

1. **社区全貌不可见**：贡献数据尚未接入完整（GitHub 采集刚上线且仅产出 `unattributed` 一条），过滤逻辑导致首页只剩一张"独立开发者"伪组织卡片，其余 10 个组织档案完全不可见。
2. **种子数据遗留**：`wiki.json` 中 6 条记录的 `orgId`（openan-labs、nova-silicon 等）在 `organizations.json` 中无对应档案，属于早期占位种子数据，其贡献分被静默丢弃。

## 决策

经评审拷问，确定以下四点：

1. **展示逻辑**：首页组织墙默认展示 `organizations.json` **全量组织**，按**综合贡献分**降序排列；评分公式不变（`PR + Issue + 需求 + best-practice + 代码量(行)/10000`，四舍五入）。零分组织保留在末尾，同分之间保持默认顺序（`type` 权重 → `name` 升序，由稳定排序自然保证）。（**修订**：公式中的 `best-practice` 项已由 [ADR-0009](./0009-confluence-two-dimension-extraction-from-page-body.md) 更名为 `议题分享`；随后 [ADR-0011](./0011-confluence-edit-count-metric.md) 又在行为项中加入**编辑量**，并把等级阈值由 `300 / 100` 重标定为 `600 / 100`。）
2. **接口契约**：URL 参数 `scope=contributing` **名字保留、语义变更**——不再过滤无贡献组织，改为"返回全部组织 + 附带 `contributionScore` / `contributionLevel` + 按分降序"。`scope=all`（默认）行为不变。
3. **零分展示**：后端照旧对 0 分返回 `contributionLevel='low'`，**契约类型不变**；前端特判 `contributionScore === 0`，显示"暂无贡献"灰色徽章并将进度条置空。
4. **数据治理**：删除 `wiki.json` 中 6 条孤儿记录（`data` 置空），待真实 Confluence 数据接入后重新填充。

**附带清理**：删除 `OrganizationPort.ListOrganizationsQuery` 中从未被使用的 `scope` 字段（Service 从未向 Port 传递该字段，JSON Provider 也从未实现其语义，注释"仅返回有贡献记录的组织"与实际行为不符）。`scope` 是 **HTTP 接口层**参数，由 `OrganizationService` 组合贡献数据实现，与 Port 无关。

## 理由与取舍

| 选项 | 结论 |
| --- | --- |
| 排序口径：综合贡献分 / 纯行为数 / 仅 GitHub 数量 | **综合贡献分**（现状公式）。口径不变，前端文案与活跃度页口径一致，改动最小 |
| 契约方案：改语义 / 换名 `ranked` / 默认即排序 | **保留参数名只改语义**。内部项目仅两个调用方，换名收益不抵改动成本；**已知代价：`contributing` 名不符实**，后续若有破坏性契约变更时一并改名 |
| 零分展示：前端特判 / 维持 low 档 / 契约加 `none` 档 | **前端特判**。避免"0 分却显示 1/3 进度条"的视觉失真，且不动契约类型与后端 |
| 孤儿数据：不动 / 修映射 / 删除 | **删除**。占位数据无真实映射关系可修，留存只会误导排查；删除后首页可见效果与不删一致 |

## 后果

- **正面**：首页呈现社区全貌；零贡献组织可见（便于运营跟进）；数据文件与组织档案不再存在"幽灵记录"。
- **负面**：`scope=contributing` 参数名与行为不符（有意接受，见上表）；"贡献的组织"一词沿用为产品术语，语义已在 README 术语表重定义。
- **不受影响**：社区活跃度页（`scope=all`，组织下拉只取 `orgId/name`）、独立开发者伪组织卡片（`unattributed` 按分数参与排序）。（**修订**：贡献分**公式与阈值**并非长期不变——[ADR-0011](./0011-confluence-edit-count-metric.md) 起行为项含编辑量、阈值由 `high ≥ 300 / medium ≥ 100` 重标定为 `≥ 600 / ≥ 100`。）

/**
 * 采集器常量（见 docs/05-integration-roadmap.md 第 2 章）。
 */

/** 未归属到任何组织的贡献者，统一归入该伪组织（契约见 04 文档 §3.1） */
export const ORG_UNATTRIBUTED = 'unattributed';

/** 伪组织展示名（与 data/organizations.json 保持一致） */
export const UNATTRIBUTED_DISPLAY_NAME = '独立开发者';

/**
 * 搜索类接口「单查询最多返回结果数」硬上限。
 * 该上限与账号权限/等级无关，不因刷新或升级账号而提高。
 */
export const SEARCH_RESULT_LIMIT = 1000;

/** GraphQL 单页节点数（GitHub 上限为 100） */
export const PAGE_SIZE = 100;

/** GraphQL 配额安全下限：低于该值即中止本轮采集，保留上次数据 */
export const RATE_LIMIT_FLOOR = 500;

/** 串行请求间隔（毫秒），避免瞬时并发触发二级限流 */
export const REQUEST_SPACING_MS = 120;

/** 单个采集任务的最大翻页数，防止异常情况下的无限循环 */
export const MAX_PAGES = 200;

// ── Confluence（见 05 文档第 3 章）─────────────────────────────

/** CQL 分页单页条数（Confluence v1 search 上限为 100） */
export const CONFLUENCE_PAGE_SIZE = 100;

/** CQL 最大翻页数，防止异常情况下的无限循环 */
export const CONFLUENCE_MAX_PAGES = MAX_PAGES;

/**
 * 版本历史（v2 版本接口）单页条数，上限为 200。
 *
 * 实测真实空间最大单页 146 个版本（`Requirement Proposal`），200 已够；
 * 仍须实现游标翻页：将来单页版本数超过该值时会**静默少算编辑量**（见 ADR-0011）。
 */
export const CONFLUENCE_VERSION_PAGE_SIZE = 200;

/** 单页版本历史的翻页上限，防止异常情况下的无限循环 */
export const CONFLUENCE_VERSION_MAX_PAGES = 20;

// ── 口径选择器（2026-09-28 对真实空间只读实测确认）────────────────

/**
 * 「需求」来源页标题。
 *
 * 实测：真实空间**不存在任何需求标签**（标签只有 tsc-minutes / pac-minutes /
 * marketing-minutes 三种会议纪要标签），需求内容以**页面树**形式存在：
 * `Releases > Release Planning > <release> > Requirement Proposal`。
 * 故口径由"标签/关键字"改为**结构选择器**：标题精确等于该值，且祖先链含下一项。
 */
export const DEFAULT_REQUIREMENT_PAGE_TITLE = 'Requirement Proposal';

/** 「需求」来源页必须位于该祖先标题之下（用于排除 Releases 根目录下的同名模板页） */
export const DEFAULT_REQUIREMENT_ANCESTOR_TITLE = 'Release Planning';

/** 需求表格里"联系人"列的列名（按此列取 @ 提及，每个提及各算 1 条） */
export const DEFAULT_REQUIREMENT_CONTACT_COLUMN = 'Contacts';

/** 需求表格里"标题"列的列名（仅用于快照与日志可读性，不参与计数） */
export const DEFAULT_REQUIREMENT_TITLE_COLUMN = 'Requirement Title';

/**
 * 会议纪要页的父页标题模式（正则）。
 *
 * 用模式而非字面量：年份会滚动（`2026 - TSC Minutes` → `2027 - TSC Minutes`），
 * 写死字面量会导致跨年后静默取到 0 条。
 */
export const DEFAULT_MINUTES_PARENT_PATTERN = '^\\d{4} - TSC Minutes$';

/** 会议纪要页标题模式（正则，如 `2026-01-14 TSC Minutes`） */
export const DEFAULT_MINUTES_TITLE_PATTERN = '^\\d{4}-\\d{2}-\\d{2} TSC Minutes$';

/**
 * 「议题分享」所取的标题段名。
 *
 * 只统计该段**内**的 @（段落与表格行都算）：同页 `Attendees & Representation` 段的 @ 是出席签到
 * （占全页 @ 的 80%），若不排除，统计到的将是"出席次数"而非"议题分享次数"。
 */
export const DEFAULT_MINUTES_AGENDA_HEADING = 'Agenda';

/**
 * Confluence 采集状态文件：**独立于** GitHub 的 .sync-state.json。
 * 复用 GitHub 状态文件会整体覆盖其游标，故另立一份（删除即触发全量）。
 */
export const CONFLUENCE_STATE_FILE = '.sync-state.confluence.json';

/** 原始页面快照目录（相对 dataDir，非契约、接口与前端不可见） */
export const CONFLUENCE_SNAPSHOT_DIR = 'source/confluence';

/** 状态文件中保留的未归属账号上限，避免异常数据把状态文件撑大 */
export const CONFLUENCE_UNATTRIBUTED_LIMIT = 200;

/** 状态文件中保留的「未能解析的纯文本联系人」上限 */
export const CONFLUENCE_UNRESOLVED_LIMIT = 200;

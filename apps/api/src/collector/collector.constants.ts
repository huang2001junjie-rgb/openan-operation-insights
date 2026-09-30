/**
 * 采集器**跨来源共享**的常量（见 docs/05-integration-roadmap.md 第 2 章）。
 *
 * 只放 GitHub / Confluence 两条管线都用到的东西；来源专属常量分别见
 * `github/github.constants.ts` 与 `confluence/confluence.constants.ts`。
 */

/** 未归属到任何组织的贡献者，统一归入该伪组织（契约见 04 文档 §3.1） */
export const ORG_UNATTRIBUTED = 'unattributed';

/** 伪组织展示名（与 data/organizations.json 保持一致） */
export const UNATTRIBUTED_DISPLAY_NAME = '独立开发者';

/** 串行请求间隔（毫秒），避免瞬时并发触发二级限流（GitHub 与 Confluence 共用） */
export const REQUEST_SPACING_MS = 120;

/** 单个采集任务的最大翻页数，防止异常情况下的无限循环（GitHub 与 Confluence 共用） */
export const MAX_PAGES = 200;

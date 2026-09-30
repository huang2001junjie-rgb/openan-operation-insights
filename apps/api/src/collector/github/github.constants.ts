/**
 * GitHub 采集专属常量（见 docs/05-integration-roadmap.md 第 2 章）。
 *
 * 跨来源共享的常量在 `../collector.constants`（分页上限、请求间隔）。
 */

/**
 * 搜索类接口「单查询最多返回结果数」硬上限。
 * 该上限与账号权限/等级无关，不因刷新或升级账号而提高。
 */
export const SEARCH_RESULT_LIMIT = 1000;

/** GraphQL 单页节点数（GitHub 上限为 100） */
export const PAGE_SIZE = 100;

/** GraphQL 配额安全下限：低于该值即中止本轮采集，保留上次数据 */
export const RATE_LIMIT_FLOOR = 500;

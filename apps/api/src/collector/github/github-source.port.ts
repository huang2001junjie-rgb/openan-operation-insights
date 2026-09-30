/**
 * 采集源抽象：把「数据从哪来」与「怎么聚合落盘」解耦。
 *
 * - GithubGraphqlSource：真实 GitHub GraphQL 通道
 * - GithubFixtureSource：离线固定数据，用于无 token 环境下的端到端验证
 */

export type GithubRecordKind = 'pullRequest' | 'issue';

/** 记录作者（可能为 null：已删除账号 / 无作者） */
export interface GithubAuthorRef {
  login: string;
  githubId: number | null;
  name: string | null;
  avatarUrl: string;
  /** 主页 HTML 地址，如 https://github.com/octocat */
  url: string;
  /** 账户公开资料邮箱（多数用户未公开，为 null）；仅用于按域名判定归属，不落盘 */
  email?: string | null;
}

/** 一条归一化后的贡献记录 */
export interface GithubContributionRecord {
  kind: GithubRecordKind;
  /** nameWithOwner，如 openan-labs/core */
  repository: string;
  author: GithubAuthorRef | null;
  /** PR：additions + deletions；Issue 恒为 0 */
  linesChanged: number;
  /** PR：mergedAt；Issue：createdAt；不可用时为 null */
  timestamp: string | null;
  /** PR 首个提交的作者邮箱（企业邮箱主要来源）；Issue 为 null。仅用于按域名判定归属，不落盘 */
  commitEmail?: string | null;
  /** PR：PR 内提交总数（commits.totalCount）；Issue 恒为 0 */
  commitCount?: number;
}

export interface GithubFetchOptions {
  /**
   * incremental：按 since 过滤，走 search 通道；
   * full：忽略 since、按仓库全量遍历（无 1000 条上限）。
   */
  mode: 'incremental' | 'full';
  /** 增量游标（ISO 8601）；full 模式下忽略 */
  since: string | null;
}

export interface GithubFetchResult {
  records: GithubContributionRecord[];
  /**
   * 搜索通道自报的总数（search.issueCount）；逐仓库遍历时为 null。
   * 用于判断是否触及 SEARCH_RESULT_LIMIT 而被静默截断。
   */
  reportedTotalCount: number | null;
  /** 是否检测到「结果数达到上限，可能被截断」 */
  truncated: boolean;
  /** 本轮实际发出的 GraphQL 请求数（用于配额观测） */
  requestCount: number;
  /** 采集结束后 GitHub 侧剩余配额（GraphQL points） */
  rateLimitRemaining: number | null;
}

export interface GithubSource {
  readonly label: string;
  fetch(options: GithubFetchOptions): Promise<GithubFetchResult>;
}

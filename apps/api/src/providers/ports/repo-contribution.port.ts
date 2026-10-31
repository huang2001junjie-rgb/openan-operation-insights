import { RepoContribution } from '../../contract/entities';

export interface RepoContributionQuery {
  from?: string;
  to?: string;
  /** 排序字段；默认 `commits` */
  sortBy?: 'pullRequests' | 'commits' | 'issues' | 'linesChanged' | 'contributors' | 'orgs';
  order?: 'asc' | 'desc';
  limit?: number;
}

/**
 * 仓库维度贡献出参端口（`GET /api/repo-contributions`）。
 *
 * - 由 `github-events.json` **读时派生**（唯一原子事实），不落盘；
 * - `from` / `to` 生效（ADR-0018）：半开区间 `from <= timestamp < to`，缺省即全量口径，
 *   与组织级 / 账号级共用同一谓词（恒等式「仓库级求和 ≡ 组织级」在同区间下成立）；
 * - **不接受 `repoIds`**：repo 表的行指标不随筛选变化（选仓库只是挑行），前端客户端过滤。
 */
export interface RepoContributionPort {
  getRepoContributions(query: RepoContributionQuery): Promise<RepoContribution[]>;
}

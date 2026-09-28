import { ContributorContribution } from '../../contract/entities';

export type { ContributorContribution };

export interface ContributorContributionQuery {
  orgIds?: string[];
  /** ISO 8601；阶段一不生效，阶段三由采集器在落盘时决定区间 */
  from?: string;
  to?: string;
}

/**
 * 个人维度贡献端口（ADR-0003）：
 * 读取 github-accounts.json 中带 github 指标的条目，供「个人贡献排行」使用。
 */
export interface ContributorContributionPort {
  getContributorContributions(
    query: ContributorContributionQuery,
  ): Promise<ContributorContribution[]>;
}

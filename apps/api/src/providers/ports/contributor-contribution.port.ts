import { ContributorContribution, ContributorContributionView } from '../../contract/entities';

export type { ContributorContribution, ContributorContributionView };

export interface ContributorContributionQuery {
  orgIds?: string[];
  /** ISO 8601；阶段一不生效，阶段三由采集器在落盘时决定区间 */
  from?: string;
  to?: string;
}

/**
 * 个人维度贡献端口（ADR-0003 / ADR-0017）：
 * 读取 `github-accounts.json` 中带 `github` 指标的条目，叠加**读时派生的生效归属**，
 * 供「个人贡献排行」、组织卡 GitHub top3 与首页「独立开发者人数」使用。
 *
 * **人物口径**：机器账号（如 `dependabot`）不在返回结果中（ADR-0017 决策 5）；
 * 其代码量仍计入组织级求和（`ContributionPort`，决策 11）。
 * `orgIds` 筛选基于 `effectiveOrgId`（人工认领优先），未归属者即伪组织 `unattributed`。
 */
export interface ContributorContributionPort {
  getContributorContributions(
    query: ContributorContributionQuery,
  ): Promise<ContributorContributionView[]>;
}

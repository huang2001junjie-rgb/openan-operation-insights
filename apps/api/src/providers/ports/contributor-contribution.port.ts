import { ContributorContribution, ContributorContributionView } from '../../contract/entities';

export type { ContributorContribution, ContributorContributionView };

export interface ContributorContributionQuery {
  orgIds?: string[];
  /** 按仓库筛选（任意组合，`owner/repo` 全名）；缺省/空 ≡ 不过滤（全选）。仅 GitHub 侧生效 */
  repoIds?: string[];
  /**
   * ISO 8601 时刻，半开区间 `from <= timestamp < to`（ADR-0018）；缺省即全量口径。
   * 日界（Asia/Shanghai）由调用方翻成时刻，后端不解析时区。仅 GitHub 侧生效。
   */
  from?: string;
  to?: string;
}

/**
 * 个人维度贡献端口（ADR-0003 / ADR-0017 + 事件明细收敛）：
 * 由 `github-events.json`（唯一原子事实）**读时派生**账号级指标（`deriveGithubFromEvents`），
 * `github-accounts.json` 只提供展示与归属字段（姓名 / 头像 / `githubId` / 采集口径 `orgId`），
 * 叠加**读时派生的生效归属**，供「个人贡献排行」、组织卡 GitHub top3、
 * 首页「独立开发者人数」与仓库维度（`RepoContributionPort`）共用同一次派生。
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

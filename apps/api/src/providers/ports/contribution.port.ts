import { OrganizationContribution } from '../../contract/entities';

export type { OrganizationContribution };

export interface ContributionQuery {
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

export interface ContributionPort {
  getContributions(query: ContributionQuery): Promise<OrganizationContribution[]>;
}

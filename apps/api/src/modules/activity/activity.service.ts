import { Inject, Injectable } from '@nestjs/common';
import {
  ConfluenceAccountView,
  ContributionSummaryData,
  ContributorContribution,
  OrganizationContribution,
  OrganizationWiki,
} from '../../contract/entities';
import {
  CONFLUENCE_ACCOUNT_PORT,
  CONTRIBUTION_PORT,
  CONTRIBUTOR_CONTRIBUTION_PORT,
  WIKI_PORT,
} from '../../providers/tokens';
import { ConfluenceAccountPort } from '../../providers/ports/confluence-account.port';
import { ContributionPort } from '../../providers/ports/contribution.port';
import { ContributorContributionPort } from '../../providers/ports/contributor-contribution.port';
import { WikiPort } from '../../providers/ports/wiki.port';
import {
  ContributionSummaryQueryDto,
  ListConfluenceAccountsQueryDto,
  ListContributionsQueryDto,
  ListContributorContributionsQueryDto,
  ListWikiQueryDto,
} from './dto/activity-query.dto';

function latestDate(dates: string[]): string {
  return dates.reduce((latest, current) => (Date.parse(current) > Date.parse(latest) ? current : latest));
}

@Injectable()
export class ActivityService {
  constructor(
    @Inject(CONTRIBUTION_PORT) private readonly contributions: ContributionPort,
    @Inject(CONTRIBUTOR_CONTRIBUTION_PORT)
    private readonly contributorContributions: ContributorContributionPort,
    @Inject(WIKI_PORT) private readonly wiki: WikiPort,
    @Inject(CONFLUENCE_ACCOUNT_PORT)
    private readonly confluenceAccounts: ConfluenceAccountPort,
  ) {}

  async listContributions(query: ListContributionsQueryDto): Promise<OrganizationContribution[]> {
    query.assertRange();
    const list = await this.contributions.getContributions({
      orgIds: query.orgIds,
      from: query.from,
      to: query.to,
    });

    const sortBy = query.sortBy ?? 'pullRequests';
    const order = query.order ?? 'desc';
    const sorted = [...list].sort((a, b) => {
      // 旧数据可能缺失新增指标（如 commits）：按 0 归一化，避免 NaN 打乱排序
      const diff = (a.github[sortBy] ?? 0) - (b.github[sortBy] ?? 0);
      return order === 'asc' ? diff : -diff;
    });

    return query.limit ? sorted.slice(0, query.limit) : sorted;
  }

  /** 个人维度贡献明细（ADR-0003）：仅含带 github 指标的贡献者，默认按 commits 降序 */
  async listContributorContributions(
    query: ListContributorContributionsQueryDto,
  ): Promise<ContributorContribution[]> {
    query.assertRange();
    const list = await this.contributorContributions.getContributorContributions({
      orgIds: query.orgIds,
      from: query.from,
      to: query.to,
    });

    const sortBy = query.sortBy ?? 'commits';
    const order = query.order ?? 'desc';
    const sorted = [...list].sort((a, b) => {
      // 旧数据 github 内可能缺失 commits：按 0 归一化，避免 NaN 打乱排序
      const diff = (a.github[sortBy] ?? 0) - (b.github[sortBy] ?? 0);
      return order === 'asc' ? diff : -diff;
    });

    return query.limit ? sorted.slice(0, query.limit) : sorted;
  }

  async listWiki(query: ListWikiQueryDto): Promise<OrganizationWiki[]> {
    query.assertRange();
    const list = await this.wiki.getWiki({
      orgIds: query.orgIds,
      from: query.from,
      to: query.to,
    });

    const sortBy = query.sortBy ?? 'requirements';
    const order = query.order ?? 'desc';
    const sorted = [...list].sort((a, b) => {
      const diff = a.confluence[sortBy] - b.confluence[sortBy];
      return order === 'asc' ? diff : -diff;
    });

    return query.limit ? sorted.slice(0, query.limit) : sorted;
  }

  /**
   * 账号级 Confluence 明细（ADR-0008 / ADR-0010）：回答「谁在 Confluence 提交了需求」，
   * 与组织维度接口（5.3.4）互补——两者由同一批账号级事实派生（组织级按生效归属求和），合计恒等。
   * 出参为**生效口径**（人工认领优先）。
   */
  async listConfluenceAccounts(
    query: ListConfluenceAccountsQueryDto,
  ): Promise<ConfluenceAccountView[]> {
    query.assertRange();
    const list = await this.confluenceAccounts.getConfluenceAccounts({
      orgIds: query.orgIds,
      from: query.from,
      to: query.to,
    });

    const sortBy = query.sortBy ?? 'requirements';
    const order = query.order ?? 'desc';
    const sorted = [...list].sort((a, b) => {
      const diff = a.confluence[sortBy] - b.confluence[sortBy];
      return order === 'asc' ? diff : -diff;
    });

    return query.limit ? sorted.slice(0, query.limit) : sorted;
  }

  async getSummary(query: ContributionSummaryQueryDto): Promise<ContributionSummaryData> {
    query.assertRange();
    const [contributions, wiki] = await Promise.all([
      this.contributions.getContributions({
        orgIds: query.orgIds,
        from: query.from,
        to: query.to,
      }),
      this.wiki.getWiki({ orgIds: query.orgIds, from: query.from, to: query.to }),
    ]);

    const orgIds = new Set<string>([
      ...contributions.map((item) => item.orgId),
      ...wiki.map((item) => item.orgId),
    ]);

    const updatedDates = [
      ...contributions.map((item) => item.updatedAt),
      ...wiki.map((item) => item.updatedAt),
    ];

    return {
      totals: {
        pullRequests: contributions.reduce((sum, item) => sum + item.github.pullRequests, 0),
        // commits 为后续新增指标：旧数据文件可能缺失，按 0 归一化
        commits: contributions.reduce((sum, item) => sum + (item.github.commits ?? 0), 0),
        issues: contributions.reduce((sum, item) => sum + item.github.issues, 0),
        linesChanged: contributions.reduce((sum, item) => sum + item.github.linesChanged, 0),
        requirements: wiki.reduce((sum, item) => sum + item.confluence.requirements, 0),
        topicShares: wiki.reduce((sum, item) => sum + item.confluence.topicShares, 0),
        edits: wiki.reduce((sum, item) => sum + item.confluence.edits, 0),
      },
      orgCount: orgIds.size,
      updatedAt: updatedDates.length > 0 ? latestDate(updatedDates) : new Date().toISOString(),
    };
  }
}

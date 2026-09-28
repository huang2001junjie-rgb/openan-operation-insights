import { Inject, Injectable } from '@nestjs/common';
import {
  ContributionSummaryData,
  ContributorContribution,
  OrganizationContribution,
  OrganizationWiki,
} from '../../contract/entities';
import {
  CONTRIBUTION_PORT,
  CONTRIBUTOR_CONTRIBUTION_PORT,
  WIKI_PORT,
} from '../../providers/tokens';
import { ContributionPort } from '../../providers/ports/contribution.port';
import { ContributorContributionPort } from '../../providers/ports/contributor-contribution.port';
import { WikiPort } from '../../providers/ports/wiki.port';
import {
  ContributionSummaryQueryDto,
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
        bestPractices: wiki.reduce((sum, item) => sum + item.confluence.bestPractices, 0),
      },
      orgCount: orgIds.size,
      updatedAt: updatedDates.length > 0 ? latestDate(updatedDates) : new Date().toISOString(),
    };
  }
}

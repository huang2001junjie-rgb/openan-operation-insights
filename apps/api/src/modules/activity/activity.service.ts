import { Inject, Injectable } from '@nestjs/common';
import {
  ConfluenceAccountView,
  ContributionSummaryData,
  ContributorContributionView,
  OrganizationContribution,
  OrganizationWiki,
  RepoContribution,
} from '../../contract/entities';
import {
  CONFLUENCE_ACCOUNT_PORT,
  CONTRIBUTION_PORT,
  CONTRIBUTOR_CONTRIBUTION_PORT,
  REPO_CONTRIBUTION_PORT,
  WIKI_PORT,
} from '../../providers/tokens';
import { ConfluenceAccountPort } from '../../providers/ports/confluence-account.port';
import { ContributionPort } from '../../providers/ports/contribution.port';
import { ContributorContributionPort } from '../../providers/ports/contributor-contribution.port';
import { RepoContributionPort } from '../../providers/ports/repo-contribution.port';
import { WikiPort } from '../../providers/ports/wiki.port';
import {
  ContributionSummaryQueryDto,
  ListConfluenceAccountsQueryDto,
  ListContributionsQueryDto,
  ListContributorContributionsQueryDto,
  ListRepoContributionsQueryDto,
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
    @Inject(REPO_CONTRIBUTION_PORT)
    private readonly repoContributions: RepoContributionPort,
    @Inject(WIKI_PORT) private readonly wiki: WikiPort,
    @Inject(CONFLUENCE_ACCOUNT_PORT)
    private readonly confluenceAccounts: ConfluenceAccountPort,
  ) {}

  async listContributions(query: ListContributionsQueryDto): Promise<OrganizationContribution[]> {
    query.assertRange();
    const list = await this.contributions.getContributions({
      orgIds: query.orgIds,
      repoIds: query.repoIds,
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
  ): Promise<ContributorContributionView[]> {
    query.assertRange();
    const list = await this.contributorContributions.getContributorContributions({
      orgIds: query.orgIds,
      repoIds: query.repoIds,
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

  /**
   * 仓库维度贡献（D1）：由 github-events.json 读时派生；
   * 排序 / 截断在 Provider 内完成（排序字段跨 `github.*` 与顶层，Service 的通用排序不适用）。
   */
  async listRepoContributions(
    query: ListRepoContributionsQueryDto,
  ): Promise<RepoContribution[]> {
    query.assertRange();
    return this.repoContributions.getRepoContributions({
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      order: query.order,
      limit: query.limit,
    });
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

  /**
   * 合计口径注意（ADR-0018 决策 5）：带区间时 `totals` 是**混合口径**——
   * GitHub 侧按事件 `timestamp` 落在区间内统计，Confluence 侧无时间维度、恒为全量累计。
   * 前端在 Confluence 视图下不传区间（整页统一为全量口径），并在 GitHub 视图的 Confluence
   * 列上标注「全历史」，避免用户把两种口径当成同一个时间窗读。
   */
  async getSummary(query: ContributionSummaryQueryDto): Promise<ContributionSummaryData> {
    query.assertRange();
    const [contributions, wiki] = await Promise.all([
      // repoIds 仅作用于 GitHub 侧合计（Confluence 无仓库概念，不受影响）
      this.contributions.getContributions({
        orgIds: query.orgIds,
        repoIds: query.repoIds,
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

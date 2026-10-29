import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrganizationCard, OrganizationTopContributor } from '../../contract/entities';
import {
  CONTRIBUTION_PORT,
  WIKI_PORT,
  ORGANIZATION_PORT,
  CONTRIBUTOR_CONTRIBUTION_PORT,
  CONFLUENCE_ACCOUNT_PORT,
} from '../../providers/tokens';
import { ContributionPort } from '../../providers/ports/contribution.port';
import { WikiPort } from '../../providers/ports/wiki.port';
import { OrganizationPort } from '../../providers/ports/organization.port';
import { ContributorContributionPort } from '../../providers/ports/contributor-contribution.port';
import { ConfluenceAccountPort } from '../../providers/ports/confluence-account.port';

/** 组织卡片各维度 top 贡献者的取数条数（ADR-0016） */
const TOP_CONTRIBUTOR_LIMIT = 3;

/**
 * 过滤零贡献条目后按 `value` 降序取前 `TOP_CONTRIBUTOR_LIMIT`；并列稳定排序
 * （`Array.prototype.sort` 在 V8 下稳定，保持数据文件原序，ADR-0016）。
 */
function topContributors(entries: OrganizationTopContributor[]): OrganizationTopContributor[] {
  return entries
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_CONTRIBUTOR_LIMIT);
}

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @Inject(ORGANIZATION_PORT) private readonly organizations: OrganizationPort,
    @Inject(CONTRIBUTION_PORT) private readonly contributions: ContributionPort,
    @Inject(WIKI_PORT) private readonly wiki: WikiPort,
    @Inject(CONTRIBUTOR_CONTRIBUTION_PORT)
    private readonly contributorContributions: ContributorContributionPort,
    @Inject(CONFLUENCE_ACCOUNT_PORT)
    private readonly confluenceAccounts: ConfluenceAccountPort,
  ) {}

  async listOrganizations(query: {
    scope?: 'all' | 'contributing';
    type?: string;
    keyword?: string;
  }): Promise<OrganizationCard[]> {
    // provider 层已按 displayOrder 展示顺序排好（两个 scope 一致，ADR-0016），此处不二次排序
    const organizations = await this.organizations.listOrganizations({
      type: query.type as never,
      keyword: query.keyword,
    });

    if (query.scope !== 'contributing') {
      return organizations;
    }

    // 组织级指标与账号级 top3 事实都来自端口，Service 只做组合与聚合（ADR-0016）
    const [contributions, wiki, githubAccounts, confluenceAccounts] = await Promise.all([
      this.contributions.getContributions({}),
      this.wiki.getWiki({}),
      this.contributorContributions.getContributorContributions({}),
      this.confluenceAccounts.getConfluenceAccounts({}),
    ]);

    const contributionByOrg = new Map(contributions.map((item) => [item.orgId, item]));
    const wikiByOrg = new Map(wiki.map((item) => [item.orgId, item]));

    // GitHub 维度 top3 分桶：effectiveOrgId（读时派生的生效归属，ADR-0017），与 Confluence 维度同构。
    // 端口已排除机器账号（人物口径，ADR-0017 决策 5），故此处无需再过滤 bot。
    const githubTopByOrg = new Map<string, OrganizationTopContributor[]>();
    for (const account of githubAccounts) {
      const orgId = account.effectiveOrgId;
      const bucket = githubTopByOrg.get(orgId) ?? [];
      bucket.push({
        name: account.name,
        avatarUrl: account.avatarUrl,
        value: account.github.commits,
      });
      githubTopByOrg.set(orgId, bucket);
    }

    // Confluence 维度 top3 分桶：effectiveOrgId（读时派生的生效归属，ADR-0010）；账号无头像字段，前端首字母降级
    const confluenceTopByOrg = new Map<string, OrganizationTopContributor[]>();
    for (const account of confluenceAccounts) {
      const bucket = confluenceTopByOrg.get(account.effectiveOrgId) ?? [];
      bucket.push({ name: account.displayName, value: account.confluence.edits });
      confluenceTopByOrg.set(account.effectiveOrgId, bucket);
    }

    // 全量组织均参与：无贡献记录的组织指标为 0、top3 为空数组，仍保持展示顺序（ADR-0001 / ADR-0016）
    const cards: OrganizationCard[] = organizations.map((org) => ({
      ...org,
      commits: contributionByOrg.get(org.orgId)?.github.commits ?? 0,
      confluenceEdits: wikiByOrg.get(org.orgId)?.confluence.edits ?? 0,
      topContributors: {
        github: topContributors(githubTopByOrg.get(org.orgId) ?? []),
        confluence: topContributors(confluenceTopByOrg.get(org.orgId) ?? []),
      },
    }));

    if (
      cards.length > 0 &&
      cards.every((card) => card.commits === 0 && card.confluenceEdits === 0)
    ) {
      this.logger.warn(
        'scope=contributing 未发现任何有贡献记录的组织，请检查 contributions/wiki 的 orgId 是否与组织档案对齐',
      );
    }

    return cards;
  }
}

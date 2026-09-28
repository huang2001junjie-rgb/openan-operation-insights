import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ContributionLevel,
  OrganizationCard,
  OrganizationContribution,
  OrganizationWiki,
} from '../../contract/entities';
import { CONTRIBUTION_PORT, WIKI_PORT, ORGANIZATION_PORT } from '../../providers/tokens';
import { ContributionPort } from '../../providers/ports/contribution.port';
import { WikiPort } from '../../providers/ports/wiki.port';
import { OrganizationPort } from '../../providers/ports/organization.port';

const HIGH_THRESHOLD = 300;
const MEDIUM_THRESHOLD = 100;

/** 综合贡献度得分：协作行为数量为主，代码行数按万行折算，避免体量压倒频次 */
function computeScore(contribution?: OrganizationContribution, wiki?: OrganizationWiki): number {
  const behaviors =
    (contribution?.github.pullRequests ?? 0) +
    (contribution?.github.issues ?? 0) +
    (wiki?.confluence.requirements ?? 0) +
    (wiki?.confluence.bestPractices ?? 0);
  const volume = (contribution?.github.linesChanged ?? 0) / 10_000;
  return Math.round(behaviors + volume);
}

function toLevel(score: number): ContributionLevel {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @Inject(ORGANIZATION_PORT) private readonly organizations: OrganizationPort,
    @Inject(CONTRIBUTION_PORT) private readonly contributions: ContributionPort,
    @Inject(WIKI_PORT) private readonly wiki: WikiPort,
  ) {}

  async listOrganizations(query: {
    scope?: 'all' | 'contributing';
    type?: string;
    keyword?: string;
  }): Promise<OrganizationCard[]> {
    const organizations = await this.organizations.listOrganizations({
      type: query.type as never,
      keyword: query.keyword,
    });

    if (query.scope !== 'contributing') {
      return organizations;
    }

    // 贡献度与 wiki 成果都来自端口，Service 在这里做组合（不含查询逻辑）
    const [contributions, wiki] = await Promise.all([
      this.contributions.getContributions({}),
      this.wiki.getWiki({}),
    ]);

    const contributionByOrg = new Map(contributions.map((item) => [item.orgId, item]));
    const wikiByOrg = new Map(wiki.map((item) => [item.orgId, item]));

    // 全量组织均参与：无贡献记录的组织得 0 分，排在末尾（ADR-0001）
    const cards = organizations.map((org) => {
      const score = computeScore(contributionByOrg.get(org.orgId), wikiByOrg.get(org.orgId));
      return { ...org, contributionScore: score, contributionLevel: toLevel(score) };
    });

    if (cards.length > 0 && cards.every((card) => card.contributionScore === 0)) {
      this.logger.warn(
        'scope=contributing 未发现任何有贡献记录的组织，请检查 contributions/wiki 的 orgId 是否与组织档案对齐',
      );
    }

    return cards.sort((a, b) => (b.contributionScore ?? 0) - (a.contributionScore ?? 0));
  }
}

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

/**
 * 贡献度分档阈值（见 ADR-0011 的重校依据）。
 *
 * 加入编辑量后，行为项量级被整体抬高：实测组织分分布（含编辑量）
 * 非零值为 `[1, 45, 527, 802]`（p75≈527、p50≈45）。旧阈值 300/100 会把
 * 聚合了大量个人编辑的「独立开发者」桶一起推入最高档，分档失真。
 *
 * 现取 **HIGH=600 / MEDIUM=100**：只有体量明显领先的华为（802）为高贡献，
 * 「独立开发者」（527）落中档，移动（45）及以下仍为低档——与引入编辑量前
 * （ADR-0001：300/100）的分档成员**完全一致**，仅按新量级整体上调，避免
 * 编辑密集页把「高产个人汇聚的桶」误读为组织级最高贡献。
 */
const HIGH_THRESHOLD = 600;
const MEDIUM_THRESHOLD = 100;

/**
 * 综合贡献度得分：协作行为数量为主，代码行数按万行折算，避免体量压倒频次。
 *
 * 编辑量（`confluence.edits`）与 PR / Issue / 需求 / 议题分享同属"行为频次"，直接计入；
 * 但其量级明显更大（实测单空间合计 672），因此高低分档阈值另行标定（见 ADR-0011）。
 */
function computeScore(contribution?: OrganizationContribution, wiki?: OrganizationWiki): number {
  const behaviors =
    (contribution?.github.pullRequests ?? 0) +
    (contribution?.github.issues ?? 0) +
    (wiki?.confluence.requirements ?? 0) +
    (wiki?.confluence.topicShares ?? 0) +
    (wiki?.confluence.edits ?? 0);
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

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Contributor,
  ContributorContribution,
  ContributorContributionView,
  IdentityClaim,
  Person,
} from '../../contract/entities';
import { buildGithubClaimIndex, isBotAccount, resolveGithubEffectiveOrg } from '../../common/effective-org';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTORS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import {
  ContributorContributionPort,
  ContributorContributionQuery,
} from '../ports/contributor-contribution.port';

const hasMetrics = (item: Contributor): item is ContributorContribution => Boolean(item.github);

/**
 * 账号级 GitHub 读实现（ADR-0003 / ADR-0017）：返回采集器落盘的账号级事实，
 * 并叠加**读时派生**的生效归属（`effectiveOrgId` / `orgSource` / `personId`，人工认领优先）。
 *
 * 与 `JsonConfluenceAccountProvider`（ADR-0010）同构。本端口是**人物口径**，故：
 *
 * - 仅返回带采集指标的个人：纯档案条目（无 `github`）不参与排行；
 * - **机器账号（如 `dependabot`）不在返回结果中**（ADR-0017 决策 5）——其代码量仍计入组织级求和
 *   （`ContributionPort`，决策 11），只是不占「独立开发者人数」与 top3 / 排行的人物位；
 * - 组织筛选基于 **`effectiveOrgId`**：未归属账号即伪组织 `unattributed`（04 文档 §3.7）。
 */
@Injectable()
export class JsonContributorContributionProvider implements ContributorContributionPort {
  private readonly logger = new Logger(JsonContributorContributionProvider.name);

  constructor(
    @Inject(CONTRIBUTORS_REPOSITORY)
    private readonly repository: JsonRepository<Contributor[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly claims: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly persons: JsonRepository<Person[]>,
  ) {}

  async getContributorContributions(
    query: ContributorContributionQuery,
  ): Promise<ContributorContributionView[]> {
    const [{ data: accounts }, { data: claims }, { data: persons }] = await Promise.all([
      this.repository.read(),
      this.claims.read(),
      this.persons.read(),
    ]);

    if (query.from || query.to) {
      // 阶段一本地数据无时间维度明细，接受参数但返回全量（见 04 文档 5.3.3）
      this.logger.debug('阶段一忽略 from/to 过滤，返回全量个人贡献');
    }

    const { index, warnings } = buildGithubClaimIndex(claims, persons);
    for (const warning of warnings) {
      this.logger.warn(warning);
    }

    const views = accounts
      .filter(hasMetrics)
      .map((account) => resolveGithubEffectiveOrg(account, index))
      .filter((view) => !isBotAccount(view));

    if (!query.orgIds?.length) {
      return views;
    }

    const whitelist = new Set(query.orgIds);
    const knownIds = new Set(views.map((view) => view.effectiveOrgId));
    const unknown = query.orgIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      this.logger.warn(`忽略未知 orgId：${unknown.join(', ')}`);
    }

    return views.filter((view) => whitelist.has(view.effectiveOrgId));
  }
}

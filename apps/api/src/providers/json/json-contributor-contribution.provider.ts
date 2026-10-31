import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Contributor,
  ContributorContributionView,
  GithubContributionEvent,
  IdentityClaim,
  Person,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTORS_REPOSITORY,
  GITHUB_EVENTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import {
  ContributorContributionPort,
  ContributorContributionQuery,
} from '../ports/contributor-contribution.port';
import {
  deriveGithubFromEvents,
  filterEventsByRange,
} from '../../common/github-event-derivation';
import { toTimeRangeFilter } from '../../common/time-range';

/**
 * 个人维度贡献 JSON Provider（阶段一 / ADR-0003 / ADR-0017）。
 *
 * **D1 收敛**：账号级 GitHub 指标由 `github-events.json`（唯一原子事实）**读时派生**，
 * 叠加读时生效归属（认领边优先）；`github-accounts.json` 降级为**账号档案**——
 * 只提供展示与归属字段（姓名/头像/githubId/采集口径 orgId），其 `github` 指标不再参与读路径。
 *
 * 口径：
 * - **人物口径**：机器账号（dependabot 等）不在出参（ADR-0017 决策 5）；其量仍计入组织级（决策 11）；
 * - **组织过滤**：基于 `effectiveOrgId`（认领优先），`unattributed` 伪组织可显式筛选；
 * - **仓库过滤**：`repoIds` 任意组合（缺省/空 ≡ 全选），账号指标与 repoIds 均在筛选范围内重算；
 * - **区间口径**（ADR-0018）：`from/to` 按事件 `timestamp` 做半开过滤，缺省即全量口径；
 *   区间内无事件的账号**不出现在榜单**（与组织级的全覆盖派生不同——榜单是人物枚举，不是桶）。
 */
@Injectable()
export class JsonContributorContributionProvider implements ContributorContributionPort {
  private readonly logger = new Logger(JsonContributorContributionProvider.name);

  constructor(
    @Inject(GITHUB_EVENTS_REPOSITORY)
    private readonly eventsRepository: JsonRepository<GithubContributionEvent[]>,
    @Inject(CONTRIBUTORS_REPOSITORY)
    private readonly accountsRepository: JsonRepository<Contributor[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly claimsRepository: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly personsRepository: JsonRepository<Person[]>,
  ) {}

  async getContributorContributions(
    query: ContributorContributionQuery,
  ): Promise<ContributorContributionView[]> {
    const [eventsEnvelope, accountsEnvelope, claimsEnvelope, personsEnvelope] = await Promise.all([
      this.eventsRepository.read(),
      this.accountsRepository.read(),
      this.claimsRepository.read(),
      this.personsRepository.read(),
    ]);

    const derivation = deriveGithubFromEvents({
      // 区间口径（ADR-0018）：与组织级 / 仓库级共用同一谓词，恒等式在同区间下成立
      events: filterEventsByRange(eventsEnvelope.data, toTimeRangeFilter(query.from, query.to)),
      accounts: accountsEnvelope.data,
      claims: claimsEnvelope.data,
      persons: personsEnvelope.data,
      repoFilter: query.repoIds?.length ? new Set(query.repoIds) : null,
    });
    for (const warning of derivation.warnings) this.logger.warn(warning);

    // 组织白名单：按生效归属（effectiveOrgId）过滤；空数组表示不过滤
    const requestedOrgs = query.orgIds ?? [];
    if (requestedOrgs.length === 0) {
      return derivation.contributors as ContributorContributionView[];
    }
    const whitelist = new Set(requestedOrgs);
    return derivation.contributors.filter((view) =>
      whitelist.has(view.effectiveOrgId),
    ) as ContributorContributionView[];
  }
}

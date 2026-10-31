import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Contributor,
  GithubContributionEvent,
  IdentityClaim,
  Person,
  RepoContribution,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTORS_REPOSITORY,
  GITHUB_EVENTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import {
  RepoContributionPort,
  RepoContributionQuery,
} from '../ports/repo-contribution.port';
import { isBotAccount } from '../../common/effective-org';
import {
  deriveGithubFromEvents,
  filterEventsByRange,
} from '../../common/github-event-derivation';
import { toTimeRangeFilter } from '../../common/time-range';

/**
 * 仓库维度贡献 Provider（D1）：由 `github-events.json` **读时派生**、不落盘。
 *
 * - 口径混合（同组织级）：四项计数**含 bot**；`contributors` 为**人物口径**（排除 bot）；
 *   `orgs` = 按**生效归属**去重的组织数（含伪组织 `unattributed`，bot 量计入其归属桶）；
 * - **不接受 `repoIds`**：repo 表的行指标不随筛选变化（选仓库只是挑行），前端客户端过滤；
 * - **区间口径**（ADR-0018 决策 6）：`from/to` 生效，与组织级 / 账号级共用同一谓词——
 *   否则「仓库级求和 ≡ 组织级」会被同页两套口径破坏；区间内无事件的仓库**不出行**
 *   （仓库表是事件枚举，不是全覆盖的桶），前端筛选候选随区间收缩即由此而来。
 */
@Injectable()
export class JsonRepoContributionProvider implements RepoContributionPort {
  private readonly logger = new Logger(JsonRepoContributionProvider.name);

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

  async getRepoContributions(query: RepoContributionQuery): Promise<RepoContribution[]> {
    const [eventsEnvelope, accountsEnvelope, claimsEnvelope, personsEnvelope] = await Promise.all([
      this.eventsRepository.read(),
      this.accountsRepository.read(),
      this.claimsRepository.read(),
      this.personsRepository.read(),
    ]);

    const derivation = deriveGithubFromEvents({
      // 区间口径（ADR-0018）：仓库表与组织级/账号级同区间，恒等式才成立
      events: filterEventsByRange(eventsEnvelope.data, toTimeRangeFilter(query.from, query.to)),
      accounts: accountsEnvelope.data,
      claims: claimsEnvelope.data,
      persons: personsEnvelope.data,
      repoFilter: null,
    });
    for (const warning of derivation.warnings) this.logger.warn(warning);

    const rows: RepoContribution[] = derivation.repos.map((repo) => {
      let contributors = 0;
      const orgIds = new Set<string>();
      for (const login of repo.logins) {
        const view = derivation.viewByLogin.get(login);
        if (!view) continue;
        orgIds.add(view.effectiveOrgId);
        if (!isBotAccount(view)) contributors += 1;
      }
      return {
        repoId: repo.repoId,
        github: repo.github,
        contributors,
        orgs: orgIds.size,
        updatedAt: eventsEnvelope.updatedAt,
      };
    });

    const sortBy = query.sortBy ?? 'commits';
    const order = query.order ?? 'desc';
    const valueOf = (row: RepoContribution): number => {
      if (sortBy === 'contributors') return row.contributors;
      if (sortBy === 'orgs') return row.orgs;
      return row.github[sortBy] ?? 0;
    };
    rows.sort((a, b) => {
      const diff = valueOf(a) - valueOf(b);
      return (order === 'asc' ? diff : -diff) || a.repoId.localeCompare(b.repoId);
    });

    return query.limit ? rows.slice(0, query.limit) : rows;
  }
}

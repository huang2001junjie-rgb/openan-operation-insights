import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Contributor,
  GithubContributionEvent,
  IdentityClaim,
  Organization,
  OrganizationContribution,
  Person,
} from '../../contract/entities';
import { deriveOrganizationContributions } from '../../common/effective-org';
import {
  deriveGithubFromEvents,
  filterEventsByRange,
} from '../../common/github-event-derivation';
import { sortOrganizations } from '../../common/org-order';
import { toTimeRangeFilter } from '../../common/time-range';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTORS_REPOSITORY,
  GITHUB_EVENTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import { ContributionPort, ContributionQuery } from '../ports/contribution.port';

/**
 * 组织级 GitHub 读实现（ADR-0017 → **D1 收敛**）：**读时派生**。
 *
 * 原子事实自 `github-accounts.json` 的账号级汇总**下沉为 `github-events.json` 的事件级明细**：
 * 事件 → 账号级视图（生效归属解析：认领边优先）→ 组织级投影，与个人排行 / 仓库维度**同源**，
 * 「组织级 ≡ 账号级 ≡ 仓库级求和」由函数形状保证。`github-accounts.json` 降级为**账号档案**
 * （姓名/头像/githubId/采集口径 orgId），其 `github` 指标字段不再参与任何读路径；
 * `github-organizations.json` 维持基线快照（漂移告警 / 审计用）。
 *
 * - `repoIds`：仓库组合筛选（缺省/空 ≡ 全选），组织级数字在筛选范围内重算；
 * - `from/to`：**区间口径**（ADR-0018）——按事件 `timestamp` 做 `from <= ts < to` 半开过滤，
 *   缺省即**全量口径**；全覆盖派生不变，区间内无事件的组织仍出 0 值行；
 * - `updatedAt` 取**事件文件**的时间戳（唯一原子事实的落盘时间，与区间无关）。
 */
@Injectable()
export class JsonContributionProvider implements ContributionPort {
  private readonly logger = new Logger(JsonContributionProvider.name);

  constructor(
    @Inject(GITHUB_EVENTS_REPOSITORY)
    private readonly events: JsonRepository<GithubContributionEvent[]>,
    @Inject(CONTRIBUTORS_REPOSITORY)
    private readonly accounts: JsonRepository<Contributor[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly claims: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly persons: JsonRepository<Person[]>,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizations: JsonRepository<Organization[]>,
  ) {}

  async getContributions(query: ContributionQuery): Promise<OrganizationContribution[]> {
    const [{ data: events, updatedAt }, { data: accounts }, { data: claims }, { data: persons }, { data: organizations }] =
      await Promise.all([
        this.events.read(),
        this.accounts.read(),
        this.claims.read(),
        this.persons.read(),
        this.organizations.read(),
      ]);

    // 区间口径（ADR-0018）：在进入派生**之前**切一刀，与账号级 / 仓库级共用同一谓词，
    // 于是「组织级 ≡ 账号级 ≡ 仓库级求和」在同一区间下继续由函数形状保证
    const range = toTimeRangeFilter(query.from, query.to);

    // 量口径**不排除**机器人：其 commits / PRs 仍计入生效归属桶，保证求和恒等式（决策 11）
    const derivation = deriveGithubFromEvents({
      events: filterEventsByRange(events, range),
      accounts,
      claims,
      persons,
      repoFilter: query.repoIds?.length ? new Set(query.repoIds) : null,
    });
    for (const warning of derivation.warnings) {
      this.logger.warn(warning);
    }

    const contributions = deriveOrganizationContributions(
      sortOrganizations(organizations),
      derivation.views,
      updatedAt,
    );

    if (!query.orgIds?.length) {
      return contributions;
    }

    const whitelist = new Set(query.orgIds);
    // 全覆盖派生 ⇒ 组织档案内的 orgId 恒在结果中（哪怕 0 值），故未知 id 必是调用方传错
    const knownIds = new Set(contributions.map((item) => item.orgId));
    const unknown = query.orgIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      this.logger.warn(`忽略未知 orgId：${unknown.join(', ')}`);
    }

    return contributions.filter((item) => whitelist.has(item.orgId));
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Contributor,
  ContributorContribution,
  IdentityClaim,
  Organization,
  OrganizationContribution,
  Person,
} from '../../contract/entities';
import {
  buildGithubClaimIndex,
  deriveOrganizationContributions,
  resolveGithubEffectiveOrg,
} from '../../common/effective-org';
import { sortOrganizations } from '../../common/org-order';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTORS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import { ContributionPort, ContributionQuery } from '../ports/contribution.port';

const hasMetrics = (item: Contributor): item is ContributorContribution => Boolean(item.github);

/**
 * 组织级 GitHub 读实现（ADR-0017）：**读时派生**，不读 `github-organizations.json`。
 *
 * 读账号级原子事实 + 身份认领边 + 自然人档案 + 组织档案 → 按**生效归属**（人工认领优先）求和，
 * **覆盖组织档案全部组织**（含伪组织 `unattributed`），未命中记 0。于是
 * 「组织级 = 账号级按生效归属求和」在结构上恒成立，且补认领边 / 改归属后**下一请求即生效**。
 *
 * 与 `JsonWikiProvider`（Confluence 侧，ADR-0010）同构，两平台自此共用一套归属语义。
 *
 * 落盘的 `github-organizations.json` 仍由采集器写入，但已降级为**基线快照**（漂移告警 / 审计用）：
 * 它只有 4 个桶（部分覆盖），与账号级聚合实测差 21 commits（`huawei` −21 / `unattributed` +21），
 * 正是本轮要消除的双写漂移，读路径不再依赖。
 *
 * `updatedAt` 取账号级**文件**的时间戳（`github-accounts.json` 记录级无 `updatedAt` 字段）。
 */
@Injectable()
export class JsonContributionProvider implements ContributionPort {
  private readonly logger = new Logger(JsonContributionProvider.name);

  constructor(
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
    const [{ data: accounts, updatedAt }, { data: claims }, { data: persons }, { data: organizations }] =
      await Promise.all([
        this.accounts.read(),
        this.claims.read(),
        this.persons.read(),
        this.organizations.read(),
      ]);

    if (query.from || query.to) {
      // 阶段一本地数据无时间维度明细，接受参数但返回全量（见 04 文档 5.3.3）
      this.logger.debug('阶段一忽略 from/to 过滤，返回全量贡献数据');
    }

    const { index, warnings } = buildGithubClaimIndex(claims, persons);
    for (const warning of warnings) {
      this.logger.warn(warning);
    }

    // 量口径**不排除**机器人：其 commits / PRs 仍计入生效归属桶，保证求和恒等式与历史快照可比（决策 11）
    const views = accounts.filter(hasMetrics).map((account) => resolveGithubEffectiveOrg(account, index));
    const contributions = deriveOrganizationContributions(sortOrganizations(organizations), views, updatedAt);

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

import { Inject, Injectable } from '@nestjs/common';
import {
  ConfluenceAccount,
  IdentityClaim,
  Organization,
  OrganizationWiki,
  Person,
} from '../../contract/entities';
import {
  deriveOrganizationWiki,
  latestAccountUpdatedAt,
  toConfluenceAccountViews,
} from '../../common/effective-org';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONFLUENCE_ACCOUNTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import { WikiPort, WikiQuery } from '../ports/wiki.port';

/**
 * 组织级 Confluence 读实现（ADR-0010）：**读时派生**，不读 `confluence-organizations.json`。
 *
 * 读账号级原子事实 + 身份认领边 + 组织档案 → 按**生效归属**（人工认领优先）求和，
 * 覆盖组织档案全部组织（含伪组织 `unattributed`），未命中记 0。
 * 于是「组织级 = 账号级求和」在结构上恒成立，且补认领边后**下一请求即生效**。
 *
 * 落盘的 `confluence-organizations.json` 仍由采集器写入，但已降级为**基线快照**（仅供离线核对）。
 */
@Injectable()
export class JsonWikiProvider implements WikiPort {
  constructor(
    @Inject(CONFLUENCE_ACCOUNTS_REPOSITORY)
    private readonly accounts: JsonRepository<ConfluenceAccount[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly claims: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly persons: JsonRepository<Person[]>,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizations: JsonRepository<Organization[]>,
  ) {}

  async getWiki(query: WikiQuery): Promise<OrganizationWiki[]> {
    const [{ data: accounts }, { data: claims }, { data: persons }, { data: organizations }] =
      await Promise.all([
        this.accounts.read(),
        this.claims.read(),
        this.persons.read(),
        this.organizations.read(),
      ]);

    const { views } = toConfluenceAccountViews(accounts, claims, persons);
    const wiki = deriveOrganizationWiki(organizations, views, latestAccountUpdatedAt(accounts));

    if (!query.orgIds?.length) {
      return wiki;
    }

    const whitelist = new Set(query.orgIds);
    return wiki.filter((item) => whitelist.has(item.orgId));
  }
}

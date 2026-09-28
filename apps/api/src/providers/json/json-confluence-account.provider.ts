import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfluenceAccount, ConfluenceAccountView, IdentityClaim, Person } from '../../contract/entities';
import { toConfluenceAccountViews } from '../../common/effective-org';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONFLUENCE_ACCOUNTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import { ConfluenceAccountPort, ConfluenceAccountQuery } from '../ports/confluence-account.port';

/**
 * 账号级 Confluence 读实现（ADR-0008 / ADR-0010）：返回采集器落盘的账号级事实，
 * 并叠加**读时派生**的生效归属（`effectiveOrgId` / `orgSource` / `personId`，人工认领优先）。
 *
 * 文件内每条记录都来自**至少一个命中需求口径的页面**（采集器按命中页聚合），
 * 故此处不做「有无指标」过滤——`confluence` 字段恒有值。
 */
@Injectable()
export class JsonConfluenceAccountProvider implements ConfluenceAccountPort {
  private readonly logger = new Logger(JsonConfluenceAccountProvider.name);

  constructor(
    @Inject(CONFLUENCE_ACCOUNTS_REPOSITORY)
    private readonly repository: JsonRepository<ConfluenceAccount[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly claims: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly persons: JsonRepository<Person[]>,
  ) {}

  async getConfluenceAccounts(query: ConfluenceAccountQuery): Promise<ConfluenceAccountView[]> {
    const [{ data: accounts }, { data: claims }, { data: persons }] = await Promise.all([
      this.repository.read(),
      this.claims.read(),
      this.persons.read(),
    ]);

    if (query.from || query.to) {
      // 账号级记录无时间维度明细，接受参数但返回全量（与 5.3.8 同口径）
      this.logger.debug('阶段一忽略 from/to 过滤，返回全量 Confluence 账号');
    }

    const { views, warnings } = toConfluenceAccountViews(accounts, claims, persons);
    for (const warning of warnings) {
      this.logger.warn(warning);
    }

    if (!query.orgIds?.length) {
      return views;
    }

    // 组织筛选基于**生效归属**：未归属账号的 effectiveOrgId 即伪组织 unattributed（04 文档 §3.11）
    const whitelist = new Set(query.orgIds);
    const knownIds = new Set(views.map((view) => view.effectiveOrgId));
    const unknown = query.orgIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      this.logger.warn(`忽略未知 orgId：${unknown.join(', ')}`);
    }

    return views.filter((view) => whitelist.has(view.effectiveOrgId));
  }
}

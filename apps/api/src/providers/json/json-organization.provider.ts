import { Inject, Injectable, Logger } from '@nestjs/common';
import { Organization } from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import { ORGANIZATIONS_REPOSITORY } from '../../repositories/repository.tokens';
import { ListOrganizationsQuery, OrganizationPort } from '../ports/organization.port';

/**
 * `scope=all`（默认）列表的排序权重（数字越小越靠前）。`individual` 为伪组织，恒排末位。
 * `operation`（运营单位）与 `participant` 同级徽章配色，权重紧随其后。
 *
 * ⚠️ **首页组织墙不经过本表**：它走 `scope=contributing`，按 `contributionScore` 降序
 * （`useContributingOrganizations` → `organization.service.ts`，见 ADR-0001）。当前前端
 * **无 `scope=all` 调用方**，故调整这里的数字不改变任何现有页面的顺序；改权重前请先确认调用方。
 */
const TYPE_WEIGHT: Record<Organization['type'], number> = {
  tsc: 0,
  participant: 1,
  operation: 2,
  individual: 3,
};

@Injectable()
export class JsonOrganizationProvider implements OrganizationPort {
  private readonly logger = new Logger(JsonOrganizationProvider.name);

  constructor(
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly repository: JsonRepository<Organization[]>,
  ) {}

  async listOrganizations(query: ListOrganizationsQuery): Promise<Organization[]> {
    const { data } = await this.repository.read();
    let result = [...data];

    if (query.type) {
      result = result.filter((org) => org.type === query.type);
    }

    const keyword = query.keyword?.trim().toLowerCase();
    if (keyword) {
      result = result.filter((org) => org.name.toLowerCase().includes(keyword));
    }

    // 默认排序：type 权重（tsc → participant → operation → individual），同权重按 name 升序
    return result.sort((a, b) => {
      const weightDiff = TYPE_WEIGHT[a.type] - TYPE_WEIGHT[b.type];
      if (weightDiff !== 0) return weightDiff;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }

  async getOrganizationById(orgId: string): Promise<Organization | null> {
    const { data } = await this.repository.read();
    const found = data.find((org) => org.orgId === orgId) ?? null;
    if (!found) {
      this.logger.warn(`未找到组织档案：${orgId}`);
    }
    return found;
  }
}

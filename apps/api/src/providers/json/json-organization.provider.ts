import { Inject, Injectable, Logger } from '@nestjs/common';
import { Organization } from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import { ORGANIZATIONS_REPOSITORY } from '../../repositories/repository.tokens';
import { ListOrganizationsQuery, OrganizationPort } from '../ports/organization.port';

const TYPE_WEIGHT: Record<Organization['type'], number> = {
  tsc: 0,
  participant: 1,
  individual: 2,
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

    // 默认排序：type 权重（community → partner → external → individual），同权重按 name 升序
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

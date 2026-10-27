import { Inject, Injectable, Logger } from '@nestjs/common';
import { Organization } from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import { ORGANIZATIONS_REPOSITORY } from '../../repositories/repository.tokens';
import { ListOrganizationsQuery, OrganizationPort } from '../ports/organization.port';

/**
 * 全站组织列表排序（两个 scope 共用，ADR-0016）：`displayOrder` 升序（运营人工排位，越小越靠前）；
 * 同值或缺失者排最后，按 `name` 升序（`localeCompare(…, 'zh-Hans-CN')`）兜底，稳定可预测。
 *
 * ⚠️ 排序在本 provider 一处完成：`OrganizationService.listOrganizations()` 对 `scope=contributing`
 * 直接透传本顺序、不再二次排序（原 `TYPE_WEIGHT` 类型梯队与综合贡献分降序均已退役，见 ADR-0016）。
 */
const byDisplayOrder = (a: Organization, b: Organization): number => {
  const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
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

    // 默认排序：displayOrder 展示顺序升序，同值/缺失按 name 升序（ADR-0016）
    return result.sort(byDisplayOrder);
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

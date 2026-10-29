import { Inject, Injectable, Logger } from '@nestjs/common';
import { Organization } from '../../contract/entities';
import { byDisplayOrder } from '../../common/org-order';
import { JsonRepository } from '../../repositories/json-repository';
import { ORGANIZATIONS_REPOSITORY } from '../../repositories/repository.tokens';
import { ListOrganizationsQuery, OrganizationPort } from '../ports/organization.port';

/**
 * 全站组织列表排序（两个 scope 共用，ADR-0016）：见 `common/org-order.ts` 的 `byDisplayOrder`。
 *
 * ⚠️ 排序在本 provider 一处完成：`OrganizationService.listOrganizations()` 对 `scope=contributing`
 * 直接透传本顺序、不再二次排序（原 `TYPE_WEIGHT` 类型梯队与综合贡献分降序均已退役，见 ADR-0016）。
 * 组织级投影（`json-contribution` / `json-wiki`）复用同一比较器，保证三处顺序一致。
 */

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

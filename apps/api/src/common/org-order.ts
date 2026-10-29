import { Organization } from '../contract/entities';

/**
 * 全站组织展示顺序（ADR-0016 决策 1）：`displayOrder` 升序（运营人工排位，越小越靠前）；
 * 同值或缺失者排最后，按 `name` 升序（`localeCompare(…, 'zh-Hans-CN')`）兜底，稳定可预测。
 *
 * ⚠️ **组织级投影必须显式调用本函数排序**：`organizations.json` 的物理顺序**不等于**
 * `displayOrder` 顺序（实测 `lfn` 的 `displayOrder=120` 却排在文件首位）。凡按组织档案全集派生的
 * 投影——`json-organization`（组织列表 / 组织卡）、`json-contribution`（GitHub 组织级）、
 * `json-wiki`（Confluence 组织级）——都不得依赖文件顺序，否则同一批组织在不同页面顺序不一致。
 */
export const byDisplayOrder = (a: Organization, b: Organization): number => {
  const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
};

/** 按展示顺序返回组织档案**副本**（不修改入参数组） */
export function sortOrganizations(organizations: Organization[]): Organization[] {
  return [...organizations].sort(byDisplayOrder);
}

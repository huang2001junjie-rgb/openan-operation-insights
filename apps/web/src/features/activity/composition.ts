import { CHART_PALETTE } from '@/lib/chart-theme';
import type { DonutSlice } from '@/components/charts/DonutChart';

export interface CompositionResult {
  slices: DonutSlice[];
  /** 有非零计数的组织数 */
  orgCount: number;
  total: number;
}

export interface CompositionInput {
  name: string;
  value: number;
}

/**
 * 组织构成环形图口径：按给定指标的数值统计各组织占比，**每个组织各占一个具名扇区**。
 * 不再并入「其他」聚合扇区（原 ADR-0003 的 3% 阈值与 6 个具名扇区上限已取消，见 ADR-0013）；
 * 组织数超出调色板长度时按序循环取色。
 *
 * GitHub 视图传 `github.commits`，Confluence 视图传 `confluence.requirements`，共用此函数。
 */
export function buildComposition(items: CompositionInput[]): CompositionResult {
  const ranked = items
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = ranked.reduce((sum, item) => sum + item.value, 0);
  if (ranked.length === 0 || total === 0) {
    return { slices: [], orgCount: 0, total: 0 };
  }

  const slices: DonutSlice[] = ranked.map((item, index) => ({
    name: item.name,
    value: item.value,
    color: CHART_PALETTE[index % CHART_PALETTE.length],
  }));

  return { slices, orgCount: ranked.length, total };
}

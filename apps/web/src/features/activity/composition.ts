import { CHART_PALETTE } from '@/lib/chart-theme';
import type { DonutSlice } from '@/components/charts/DonutChart';

/** 占比低于该阈值的组织并入「其他」，避免细碎扇区淹没主要贡献方（ADR-0003） */
const MIN_SHARE = 0.03;
/** 具名扇区上限 = 调色板长度：超出部分即使占比达标也并入「其他」，保证配色不重复、图例不失控 */
const MAX_NAMED = CHART_PALETTE.length;
/** 「其他」聚合扇区固定使用中性色，与具名组织扇区区分 */
const OTHERS_NAME = '其他';
const OTHERS_COLOR = '#64748b';

export interface CompositionResult {
  slices: DonutSlice[];
  /** 有非零计数的组织数（含被并入「其他」的） */
  orgCount: number;
  total: number;
}

export interface CompositionInput {
  name: string;
  value: number;
}

/**
 * 组织构成环形图口径（ADR-0003）：按给定指标的数值统计各组织占比。
 * 占比低于 MIN_SHARE、或超出 MAX_NAMED 的组织并入「其他」；
 * 头部组织始终保留具名扇区，避免极端分布下整图只剩一个「其他」。
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

  const named: DonutSlice[] = [];
  let othersValue = 0;
  ranked.forEach((item, index) => {
    const share = item.value / total;
    if (index === 0 || (share >= MIN_SHARE && named.length < MAX_NAMED)) {
      named.push({
        name: item.name,
        value: item.value,
        color: CHART_PALETTE[named.length % CHART_PALETTE.length],
      });
    } else {
      othersValue += item.value;
    }
  });

  const slices =
    othersValue > 0 ? [...named, { name: OTHERS_NAME, value: othersValue, color: OTHERS_COLOR }] : named;

  return { slices, orgCount: ranked.length, total };
}

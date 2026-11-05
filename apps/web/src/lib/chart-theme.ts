import { echarts } from './echarts';

/**
 * 图表配色：与 Tailwind 主题中的 brand / accent / violet 保持一致。
 * 扩至 12 色，供「列出全部组织」的组织构成环形图使用，尽量延后循环取色（见 ADR-0013）。
 */
export const CHART_PALETTE = [
  '#4b96ff',
  '#3fdcc6',
  '#a78bfa',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#34d399',
  '#f472b6',
  '#22d3ee',
  '#fb923c',
  '#a3e635',
  '#c084fc',
] as const;

// v1.32 浅色主题：轴文字 / 分隔线 / 提示框全部反转为「浅底深字」
export const AXIS_TEXT = '#67748a';
export const SPLIT_LINE = 'rgba(22,35,61,0.09)';

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  borderColor: 'rgba(22,35,61,0.12)',
  borderWidth: 1,
  padding: [10, 12] as [number, number],
  textStyle: { color: '#26334d', fontSize: 12 },
  extraCssText: 'border-radius:12px;box-shadow:0 16px 36px -20px rgba(22,35,61,0.28);backdrop-filter:blur(6px);',
};

export const TOOLTIP_BASE = {
  ...TOOLTIP_STYLE,
  confine: true,
};

/** 竖直方向渐变（用于柱状图） */
export function verticalGradient(from: string, to: string): echarts.graphic.LinearGradient {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ]);
}

/** 水平方向渐变（用于横向排行榜柱条） */
export function horizontalGradient(from: string, to: string): echarts.graphic.LinearGradient {
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ]);
}

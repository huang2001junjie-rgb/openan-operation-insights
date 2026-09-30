import { useMemo } from 'react';
import { EChart } from './EChart';
import { CHART_PALETTE, TOOLTIP_BASE } from '@/lib/chart-theme';
import { formatNumber } from '@/lib/format';
import type { EChartsCoreOption } from '@/lib/echarts';

export interface DonutSlice {
  name: string;
  value: number;
  /** 可选：为单个扇区指定颜色，缺省时回退到全局调色板 */
  color?: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  /** 无障碍标签，描述当前图表语义（如「组织提交数分布环形图」） */
  ariaLabel?: string;
  onSliceClick?: (name: string) => void;
}

/** 环形图：中心展示总量，扇区展示构成分布 */
export function DonutChart({
  slices,
  height = 260,
  centerLabel = '总计',
  centerValue,
  ariaLabel = '构成环形图',
  onSliceClick,
}: DonutChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  const option = useMemo<EChartsCoreOption>(
    () => ({
      color: [...CHART_PALETTE],
      tooltip: {
        ...TOOLTIP_BASE,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number; marker: string };
          return `${p.marker} ${p.name}<br/><b style="font-size:13px">${formatNumber(p.value)}</b> · ${p.percent}%`;
        },
      },
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '44%',
          style: {
            text: centerValue ?? formatNumber(total),
            fill: '#e8eefc',
            fontSize: 26,
            fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '57%',
          style: {
            text: centerLabel,
            fill: '#8794ad',
            fontSize: 11,
            fontFamily: 'Inter, sans-serif',
          },
        },
      ],
      series: [
        {
          type: 'pie',
          radius: ['62%', '86%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          padAngle: 2,
          itemStyle: {
            borderRadius: 8,
            borderColor: 'rgba(8,11,22,0.9)',
            borderWidth: 2,
          },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: { shadowBlur: 24, shadowColor: 'rgba(36,114,245,0.45)' },
          },
          data: slices.map((slice) => ({
            name: slice.name,
            value: slice.value,
            itemStyle: slice.color ? { color: slice.color } : undefined,
          })),
        },
      ],
    }),
    [slices, centerLabel, centerValue, total],
  );

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={ariaLabel}
      onEvent={
        onSliceClick
          ? (params) => {
              const p = params as { name?: string };
              if (p?.name) onSliceClick(p.name);
            }
          : undefined
      }
    />
  );
}

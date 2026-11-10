import { useMemo } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonChart } from '@/components/ui/Skeleton';
import { IconTrendUp } from '@/components/icons';
import { EChart } from '@/components/charts/EChart';
import { AXIS_TEXT, SPLIT_LINE, TOOLTIP_BASE } from '@/lib/chart-theme';
import type { EChartsCoreOption } from '@/lib/echarts';
import type { MeetingAttendanceMatrix } from '@/types/contract';

export interface ParticipantsLineChartProps {
  matrix?: MeetingAttendanceMatrix | null;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * TSC 例会出席人数折线图（ADR-0022）：横轴 = 例会日期，纵轴 = 该场全场实到人数。
 * 数据源是矩阵行的 `participantCount`（运营在台账「出勤人数」列维护，含非成员列席者），
 * 仅渲染已填场次的点，保持台账原序、不重排；早期未填的行不出现在图中。
 * 平均 / 最大值为前端对同一点集的纯派生。
 */
export function ParticipantsLineChart({ matrix, isLoading, isError, error, onRetry }: ParticipantsLineChartProps) {
  /** 已填出席人数的场次（保持台账原序） */
  const points = useMemo(
    () =>
      (matrix?.rows ?? []).flatMap((row) =>
        row.participantCount === null || row.participantCount === undefined
          ? []
          : [{ date: row.date, count: row.participantCount }],
      ),
    [matrix],
  );

  const average = useMemo(
    () => (points.length > 0 ? points.reduce((total, point) => total + point.count, 0) / points.length : null),
    [points],
  );
  const maximum = useMemo(() => (points.length > 0 ? Math.max(...points.map((point) => point.count)) : null), [points]);

  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP_BASE,
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = params as Array<{ name: string; value: number }>;
          const item = list[0];
          return `${item.name}<br/><b style="font-size:13px">${item.value}</b> 人出席`;
        },
      },
      xAxis: {
        type: 'category',
        data: points.map((point) => point.date),
        boundaryGap: false,
        axisLine: { lineStyle: { color: SPLIT_LINE } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: SPLIT_LINE } },
        axisLabel: { color: AXIS_TEXT, fontSize: 14, fontWeight: 600 },
      },
      series: [
        {
          type: 'line',
          data: points.map((point) => point.count),
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          label: {
            show: true,
            position: 'top',
            color: '#9db7dd',
            fontSize: 13,
            fontWeight: 600,
            formatter: '{c}',
          },
          lineStyle: { width: 2.5, color: '#4b96ff' },
          itemStyle: { color: '#4b96ff', borderColor: '#ffffff', borderWidth: 1.5 },
          emphasis: { itemStyle: { color: '#2472f5' } },
          areaStyle: { color: 'rgba(75,150,255,0.10)' },
          markLine:
            average !== null
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: '#3fdcc6', type: 'dashed', width: 1.5 },
                  label: {
                    color: '#3fdcc6',
                    fontSize: 11,
                    formatter: `平均 ${average.toFixed(1)}`,
                  },
                  data: [{ yAxis: average }],
                }
              : undefined,
          animationDuration: 700,
          animationEasing: 'cubicOut',
        },
      ],
    };
  }, [points, average]);

  return (
    <Card className="reveal">
      <CardTitle
        title="Count of Participants of TSC"
        description="每场 TSC 例会的全场实到人数（含非成员列席者），由运营台账「出勤人数」列维护；仅统计已填场次。"
        icon={<IconTrendUp width={16} height={16} />}
      />

      {average !== null && maximum !== null ? (
        <div className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-4 border-b border-ink-950/[0.06] pb-6">
          <div>
            <div className="text-sm font-semibold text-slate-500">平均参会人数</div>
            <div className="numeric mt-1 text-6xl font-bold leading-none text-gradient-brand sm:text-7xl">
              {average.toFixed(1)}
              <span className="ml-2 text-2xl font-semibold text-slate-400 sm:text-3xl">人</span>
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-500">最大参会人数</div>
            <div className="numeric mt-1 text-6xl font-bold leading-none text-gradient-brand sm:text-7xl">
              {maximum}
              <span className="ml-2 text-2xl font-semibold text-slate-400 sm:text-3xl">人</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          isEmpty={points.length === 0}
          emptyTitle="暂无出席人数记录"
          emptyHint="运营在台账「出勤人数」列填写后，重新运行 collect:meetings 即可呈现。"
          skeleton={<SkeletonChart />}
        >
          <EChart option={option} height={300} ariaLabel="TSC 例会出席人数折线图" />
          {points.length > 0 ? (
            <p className="mt-4 border-t border-ink-950/[0.06] pt-3 text-xs leading-relaxed text-slate-500">
              参会人数从 {points[0].date.split('-').map(Number).join('.')} 开始统计。
            </p>
          ) : null}
        </AsyncState>
      </div>
    </Card>
  );
}

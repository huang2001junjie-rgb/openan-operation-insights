import { useMemo } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { IconCheck, IconUsers } from '@/components/icons';
import { AttendanceCell } from './AttendanceCell';
import type { MeetingAttendanceMatrix as MeetingAttendanceMatrixData } from '@/types/contract';

export interface MeetingAttendanceMatrixProps {
  matrix?: MeetingAttendanceMatrixData | null;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

/** 台账列头原文「人名(公司)」→ { name, company }；无括号时整串视为人名 */
export function splitMemberLabel(raw: string): { name: string; company?: string } {
  const matched = raw.trim().match(/^(.*?)\s*[(（]\s*(.*?)\s*[)）]\s*$/);
  if (!matched) return { name: raw.trim() };
  const name = matched[1]?.trim() ?? '';
  const company = matched[2]?.trim() ?? '';
  if (!name || !company) return { name: raw.trim() };
  return { name, company };
}

/**
 * 例会参会矩阵：行 = 日期、列 = 成员，严格保留台账原序，前端不可重排（ADR-0005）。
 * 为在「不可重排」的前提下仍能读出席率，个人出席率挂列头副标签、每场出席人数挂行头（见 02 文档 §6）。
 */
export function MeetingAttendanceMatrix({
  matrix,
  isLoading,
  isError,
  error,
  onRetry,
}: MeetingAttendanceMatrixProps) {
  const columns = matrix?.columns ?? [];
  const rows = matrix?.rows ?? [];
  const meetingCount = rows.length;

  /** 个人出席率：该成员出席场次 ÷ 台账总场次（空白格已按缺席计入分母） */
  const rates = useMemo(
    () =>
      columns.map((_, index) => {
        if (meetingCount === 0) return 0;
        const present = rows.reduce((total, row) => total + (row.attendance[index] ? 1 : 0), 0);
        return present / meetingCount;
      }),
    [columns, rows, meetingCount],
  );

  return (
    <Card className="reveal">
      <CardTitle
        title="参会矩阵"
        description="行 = 例会日期，列 = 成员，按运营台账原序排列；✓ 出席，— 缺席。"
        icon={<IconUsers width={16} height={16} />}
        action={
          <span className="hidden items-center gap-3 text-[0.7rem] text-slate-500 sm:inline-flex">
            <span className="inline-flex items-center gap-1.5">
              <IconCheck width={13} height={13} className="text-accent-300" />
              出席
            </span>
            <span className="numeric">— 缺席</span>
          </span>
        }
      />

      <div className="mt-5">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          isEmpty={columns.length === 0 || meetingCount === 0}
          emptyTitle="暂无例会记录"
          emptyHint="先运行采集脚本从运营台账生成 data/meetings.json。"
          skeleton={<SkeletonTable rows={8} />}
        >
          <div className="relative overflow-auto" style={{ maxHeight: '68vh' }}>
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">例会参会矩阵：行头为日期，列头为成员，格子标记是否出席</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 min-w-[7.5rem] border-b border-r border-white/[0.08] bg-ink-900/95 px-3 py-2.5 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur-md"
                  >
                    日期
                  </th>
                  {columns.map((column, index) => {
                    const member = splitMemberLabel(column);
                    return (
                      <th
                        key={`${column}-${index}`}
                        scope="col"
                        className="sticky top-0 z-20 min-w-[6.25rem] border-b border-white/[0.08] bg-ink-900/95 px-2.5 py-2 text-center align-bottom backdrop-blur-md"
                      >
                        <span
                          className="block max-w-[9rem] truncate text-xs font-semibold text-slate-300"
                          title={column}
                        >
                          {member.company ?? member.name}
                        </span>
                        {member.company ? (
                          <span
                            className="mt-0.5 block max-w-[9rem] break-words text-[0.7rem] font-normal leading-snug text-slate-400"
                            title={member.name}
                          >
                            {member.name}
                          </span>
                        ) : null}
                        <span className="numeric mt-0.5 block text-[0.66rem] font-normal text-accent-300/80">
                          {toPercent(rates[index] ?? 0)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const presentCount = row.attendance.filter(Boolean).length;
                  return (
                    <tr key={row.date} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-white/[0.06] bg-ink-900/95 px-3 py-2 text-left backdrop-blur-md transition-colors duration-200 group-hover:bg-ink-850/95"
                      >
                        <span className="numeric block text-[0.78rem] font-medium text-slate-200">{row.date}</span>
                        <span className="numeric mt-0.5 block text-[0.64rem] font-normal text-slate-500">
                          {presentCount}/{columns.length} 出席
                        </span>
                      </th>
                      {columns.map((column, index) => (
                        <AttendanceCell
                          key={`${row.date}-${column}-${index}`}
                          present={Boolean(row.attendance[index])}
                          person={column}
                          date={row.date}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[0.68rem] leading-relaxed text-slate-500">
            出席率 = 该成员出席场次 ÷ 台账总场次（{meetingCount} 场）；空白格按缺席计入分母。横向可滚动，
            行头与列头在滚动时保持可见。
          </p>
        </AsyncState>
      </div>
    </Card>
  );
}

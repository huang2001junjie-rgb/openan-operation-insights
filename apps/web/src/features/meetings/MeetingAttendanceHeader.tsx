import { PageHeading } from '@/components/layout/PageHeading';
import { Badge } from '@/components/ui/Badge';
import { IconAlert } from '@/components/icons';
import { formatDateTime } from '@/lib/format';
import type { MeetingAttendanceMatrix } from '@/types/contract';

export interface MeetingAttendanceHeaderProps {
  matrix?: MeetingAttendanceMatrix | null;
}

/**
 * 页面头部 + 常驻口径说明。
 * 口径说明是 ADR-0005「明知并接受的负债」的对外提示：空白=缺席会使后加入者被系统性冤枉，
 * 因此必须常驻于页面顶部（见 02 文档 §6.3）。
 */
export function MeetingAttendanceHeader({ matrix }: MeetingAttendanceHeaderProps) {
  const meetingCount = matrix?.rows.length ?? 0;
  const memberCount = matrix?.columns.length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeading
        eyebrow="Meeting Attendance"
        title="例会参会情况"
        description="TSC 例会出勤台账：按成员 × 日期逐格记录是否出席，照搬运营维护的原始表格，不做排序、聚合或列名改写。"
        meta={
          <>
            <Badge tone="accent">例会台账</Badge>
            {matrix ? (
              <span className="text-xs text-slate-500">
                共 <span className="numeric font-semibold text-slate-300">{meetingCount}</span> 场例会 · 覆盖{' '}
                <span className="numeric font-semibold text-slate-300">{memberCount}</span> 位成员
              </span>
            ) : null}
            {matrix?.updatedAt ? (
              <span className="text-xs text-slate-500">
                数据更新于 {formatDateTime(matrix.updatedAt)}
              </span>
            ) : null}
          </>
        }
      />

      <div className="reveal flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3.5">
        <IconAlert width={16} height={16} className="mt-0.5 shrink-0 text-amber-300" />
        <p className="text-xs leading-relaxed text-amber-700/80">
          <span className="font-semibold text-amber-700">口径说明：</span>
          空白格代表缺席并计入出席率分母；成员加入前的历史空白同样计为缺席，因此后加入成员的出席率会被系统性拉低，
          <span className="font-medium text-amber-700">不宜跨成员横向比较</span>
          。矩阵严格保留台账原序，不支持重排。
        </p>
      </div>
    </div>
  );
}

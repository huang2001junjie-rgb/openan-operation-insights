import { MeetingAttendanceHeader } from '@/features/meetings/MeetingAttendanceHeader';
import { MeetingAttendanceMatrix } from '@/features/meetings/MeetingAttendanceMatrix';
import { ParticipantsLineChart } from '@/features/meetings/ParticipantsLineChart';
import { useMeetingAttendance } from '@/hooks/useMeetingAttendance';

/**
 * 例会参会情况页（`/meetings`，见 02 文档 §6）。
 * 单一数据源：GET /api/meetings 透传的台账矩阵；口径说明常驻顶部。
 */
export function MeetingsPage() {
  const { data, isLoading, isError, error, refetch } = useMeetingAttendance();

  return (
    <div className="space-y-6">
      <MeetingAttendanceHeader matrix={data} />
      <ParticipantsLineChart
        matrix={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
      />
      <MeetingAttendanceMatrix
        matrix={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
      />
    </div>
  );
}

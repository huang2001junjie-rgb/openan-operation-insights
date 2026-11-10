import { IconCheck } from '@/components/icons';

export interface AttendanceCellProps {
  present: boolean;
  /** 人名（用于无障碍标签与悬浮提示） */
  person: string;
  /** 例会日期 */
  date: string;
}

/** 单个格子：✓ 出席 / — 缺席（空白格按缺席渲染，ADR-0005） */
export function AttendanceCell({ present, person, date }: AttendanceCellProps) {
  const label = `${person} 于 ${date} ${present ? '出席' : '缺席'}`;

  return (
    <td className="border-b border-ink-950/[0.05] px-2.5 py-2 text-center align-middle transition-colors duration-200 group-hover:bg-ink-950/[0.03]">
      {present ? (
        <span
          role="img"
          aria-label={label}
          title={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-accent-400/30 bg-accent-500/12 text-accent-600"
        >
          <IconCheck width={18} height={18} />
        </span>
      ) : (
        <span
          role="img"
          aria-label={label}
          title={label}
          className="numeric inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600"
        >
          —
        </span>
      )}
    </td>
  );
}

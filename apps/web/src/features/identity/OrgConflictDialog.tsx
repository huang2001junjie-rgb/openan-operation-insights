import { useEffect } from 'react';
import { Button } from '@/components/ui/Field';
import { IconAlert, IconBuilding, IconX } from '@/components/icons';

export interface OrgConflictDialogProps {
  open: boolean;
  /** 候选账号展示名 */
  accountLabel: string;
  /** 账号的采集口径归属组织名 */
  accountOrgName: string;
  /** 认领目标自然人展示名 */
  personName: string;
  /** 认领目标的归属组织名；null = 未归属（此时提供「认领并归属」快捷路径） */
  personOrgName: string | null;
  isMutating: boolean;
  onCancel: () => void;
  /** 仅认领：保持两套归属不一致（ADR-0008 的并存口径，提醒不阻断） */
  onClaimOnly: () => void;
  /** 认领并把自然人归属到该账号的采集归属组织（仅 personOrgName 为 null 时出现） */
  onClaimAndAssign: () => void;
}

/**
 * 认领冲突确认（ADR-0014）：账号的采集口径归属与所选自然人的归属不一致时弹出。
 * 纯提示、不阻断——「仅认领」始终可用；仅当自然人未归属时追加「认领并归属」快捷路径。
 */
export function OrgConflictDialog({
  open,
  accountLabel,
  accountOrgName,
  personName,
  personOrgName,
  isMutating,
  onCancel,
  onClaimOnly,
  onClaimAndAssign,
}: OrgConflictDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="归属不一致"
        className="glass-card animate-fade-up relative w-full max-w-md p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/12 text-amber-200">
              <IconAlert width={19} height={19} />
            </span>
            <div>
              <h2 className="text-[0.95rem] font-semibold text-white">归属不一致</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                账号「{accountLabel}」的自动匹配归属与所选自然人的归属不同，认领后两套口径将保持不一致（不自动仲裁）。
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <IconX width={16} height={16} />
          </button>
        </div>

        <div className="mt-5 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-xs">
          <p className="flex items-center gap-2 text-slate-300">
            <IconBuilding width={13} height={13} className="shrink-0 text-slate-500" />
            账号「{accountLabel}」· 自动匹配归属
            <span className="font-semibold text-slate-100">{accountOrgName}</span>
          </p>
          <p className="flex items-center gap-2 text-slate-300">
            <IconBuilding width={13} height={13} className="shrink-0 text-slate-500" />
            自然人「{personName}」· 当前归属
            <span className="font-semibold text-slate-100">{personOrgName ?? '未归属'}</span>
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isMutating}>
            取消
          </Button>
          {personOrgName === null ? (
            <>
              <Button variant="ghost" onClick={onClaimOnly} disabled={isMutating}>
                仅认领
              </Button>
              <Button variant="primary" onClick={onClaimAndAssign} disabled={isMutating}>
                认领并归属到 {accountOrgName}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onClaimOnly} disabled={isMutating}>
              仍要认领
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Field';
import { IconAlert, IconCheck, IconLink, IconUnlink } from '@/components/icons';
import { cn } from '@/lib/cn';
import type { IdentityCandidate, IdentityClaim } from '@/types/contract';
import { PersonAvatar } from './PersonAvatar';

export interface ClaimTarget {
  personId: string;
  displayName: string;
}

export interface ClaimRowProps {
  candidate: IdentityCandidate;
  claims: IdentityClaim[];
  targetPerson: ClaimTarget | null;
  onClaim: (candidate: IdentityCandidate) => void;
  onUnclaim: (claimId: string) => void;
  isMutating: boolean;
}

/** 单条候选：展示认领归属、冲突提示与认领 / 解除操作 */
export function ClaimRow({
  candidate,
  claims,
  targetPerson,
  onClaim,
  onUnclaim,
  isMutating,
}: ClaimRowProps) {
  const owners = candidate.claimedBy;
  const conflicted = owners.length > 1;
  const ownedByTarget = Boolean(targetPerson && owners.some((owner) => owner.personId === targetPerson.personId));

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5 transition-colors duration-200',
        conflicted
          ? 'border-amber-400/30 bg-amber-500/[0.05]'
          : owners.length > 0
            ? 'border-white/[0.07] bg-white/[0.025]'
            : 'border-white/[0.07] bg-white/[0.015]',
      )}
    >
      <div className="flex items-center gap-3">
        <PersonAvatar name={candidate.displayName} src={candidate.avatarUrl} fallbackId={candidate.accountKey} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{candidate.displayName || candidate.accountKey}</p>
          <p className="mt-0.5 truncate text-[0.7rem] text-slate-500">{candidate.accountKey}</p>
        </div>

        {ownedByTarget ? (
          <Badge tone="accent">
            <IconCheck width={12} height={12} />
            已认领
          </Badge>
        ) : (
          <Button
            variant="ghost"
            className="h-8 shrink-0 px-3 text-xs"
            disabled={isMutating || !targetPerson}
            title={targetPerson ? undefined : '请先在左侧选择自然人'}
            onClick={() => onClaim(candidate)}
          >
            <IconLink width={14} height={14} />
            认领
          </Button>
        )}
      </div>

      {owners.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-2">
          {conflicted ? (
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-amber-200">
              <IconAlert width={12} height={12} />
              冲突：被 {owners.length} 个自然人引用
            </span>
          ) : null}
          {owners.map((owner) => {
            const claim = claims.find((item) => item.personId === owner.personId);
            return (
              <span
                key={`${owner.personId}-${claim?.claimId ?? ''}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] py-0.5 pl-2.5 pr-1 text-[0.7rem] text-slate-200"
              >
                已归属 {owner.displayName}
                {claim ? (
                  <button
                    type="button"
                    title={`解除与 ${owner.displayName} 的匹配`}
                    aria-label={`解除 ${owner.displayName} 的认领`}
                    disabled={isMutating}
                    onClick={() => onUnclaim(claim.claimId)}
                    className="rounded-full p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-rose-200 disabled:opacity-40"
                  >
                    <IconUnlink width={12} height={12} />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

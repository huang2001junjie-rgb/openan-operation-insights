import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button, Field, TextInput } from '@/components/ui/Field';
import { IconTrash, IconUnlink, IconX } from '@/components/icons';
import { cn } from '@/lib/cn';
import type { IdentityCandidate, IdentityClaim } from '@/types/contract';
import type { PersonListItem } from '@/types/contract';
import type { OrgOption } from './OrgAssignSelect';
import { OrgAssignSelect } from './OrgAssignSelect';
import { PersonAvatar } from './PersonAvatar';
import { SourceBadge } from './SourceBadge';

export interface PersonDetailDrawerProps {
  open: boolean;
  person: PersonListItem | null;
  orgOptions: OrgOption[];
  claims: IdentityClaim[];
  candidateIndex: Map<string, IdentityCandidate>;
  onClose: () => void;
  onRename: (displayName: string) => void;
  onAssignOrg: (orgId: string | null) => void;
  onDeletePerson: () => void;
  onUnclaim: (claimId: string) => void;
  isMutating: boolean;
}

/** 自然人详情抽屉：归属、认领清单与物理删除（仅限误建/重复提取） */
export function PersonDetailDrawer({
  open,
  person,
  orgOptions,
  claims,
  candidateIndex,
  onClose,
  onRename,
  onAssignOrg,
  onDeletePerson,
  onUnclaim,
  isMutating,
}: PersonDetailDrawerProps) {
  const [draftName, setDraftName] = useState('');
  const [confirmHard, setConfirmHard] = useState(false);

  useEffect(() => {
    if (open && person) {
      setDraftName(person.displayName);
      setConfirmHard(false);
    }
  }, [open, person]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !person) return null;

  const nameChanged = draftName.trim() && draftName.trim() !== person.displayName;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${person.displayName} 详情`}
        className="glass-card relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-l-2xl rounded-r-none animate-fade-in"
      >
        <header className="flex items-start gap-3 border-b border-white/[0.07] p-5">
          <PersonAvatar name={person.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-white">{person.displayName}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{person.personId}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">已认领 {person.claimCount}</Badge>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <IconX width={16} height={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <Field label="展示名">
            <div className="flex items-center gap-2">
              <TextInput
                value={draftName}
                maxLength={64}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && nameChanged) onRename(draftName.trim());
                }}
              />
              <Button
                variant="ghost"
                className="h-10 shrink-0 px-3 text-xs"
                disabled={!nameChanged || isMutating}
                onClick={() => onRename(draftName.trim())}
              >
                保存
              </Button>
            </div>
          </Field>

          <Field label="归属组织" hint="与「组织 ↔ 开发者」模式共享同一份归属数据。">
            <OrgAssignSelect
              value={person.orgId}
              options={orgOptions}
              disabled={isMutating}
              onChange={(orgId) => onAssignOrg(orgId)}
            />
          </Field>

          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">已认领账号</p>
            <div className="mt-2.5 space-y-2">
              {claims.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
                  尚未认领任何账号，请在右侧候选池中认领。
                </p>
              ) : (
                claims.map((claim) => {
                  const candidate = candidateIndex.get(`${claim.source}:${claim.accountKey}`);
                  return (
                    <div
                      key={claim.claimId}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                    >
                      <PersonAvatar
                        name={candidate?.displayName ?? claim.displayName ?? claim.accountKey}
                        src={candidate?.source === 'github' ? candidate.avatarUrl : undefined}
                        fallbackId={claim.accountKey}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-100">
                          {candidate?.displayName ?? claim.displayName ?? claim.accountKey}
                        </p>
                        <p className="mt-0.5 truncate text-[0.7rem] text-slate-500">{claim.accountKey}</p>
                      </div>
                      <SourceBadge source={claim.source} />
                      <button
                        type="button"
                        title="解除认领"
                        aria-label="解除认领"
                        disabled={isMutating}
                        onClick={() => onUnclaim(claim.claimId)}
                        className="rounded-lg border border-white/10 bg-white/[0.05] p-1.5 text-slate-300 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40"
                      >
                        <IconUnlink width={14} height={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <footer className="space-y-3 border-t border-white/[0.07] p-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-rose-300/80">危险操作</p>
          {confirmHard ? (
            <div className="space-y-2 rounded-xl border border-rose-400/30 bg-rose-500/[0.07] px-3 py-3">
              <p className="text-xs leading-relaxed text-rose-100/85">
                物理删除不可恢复，且会解绑其全部认领记录。确认删除「{person.displayName}」？
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" className="h-8 flex-1 px-3 text-xs" onClick={() => setConfirmHard(false)}>
                  取消
                </Button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => onDeletePerson()}
                  className={cn(
                    'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium transition',
                    'bg-rose-500/85 text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <IconTrash width={13} height={13} />
                  确认删除
                </button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full border-rose-400/20 text-rose-200 hover:border-rose-400/40 hover:bg-rose-500/[0.08]"
              disabled={isMutating}
              onClick={() => setConfirmHard(true)}
            >
              <IconTrash width={15} height={15} />
              物理删除（误建时使用）
            </Button>
          )}
        </footer>
      </aside>
    </div>
  );
}

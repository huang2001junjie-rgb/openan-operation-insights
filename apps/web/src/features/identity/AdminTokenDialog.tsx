import { useEffect, useState } from 'react';
import { Button, Field, TextInput } from '@/components/ui/Field';
import { IconKey, IconShield, IconX } from '@/components/icons';
import { clearAdminToken, setAdminToken, useAdminToken } from '@/lib/admin-token';
import { pushToast } from '@/lib/toast';

export interface AdminTokenDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 管理令牌录入（04 §5.2）：仅存会话级存储，不写入 URL */
export function AdminTokenDialog({ open, onClose }: AdminTokenDialogProps) {
  const current = useAdminToken();
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const save = () => {
    setAdminToken(draft);
    pushToast({
      tone: draft.trim() ? 'success' : 'info',
      title: draft.trim() ? '已启用写操作' : '已清除管理令牌',
    });
    onClose();
  };

  const clear = () => {
    clearAdminToken();
    setDraft('');
    pushToast({ tone: 'info', title: '已清除管理令牌' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="管理令牌"
        className="glass-card animate-fade-up relative w-full max-w-md p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-brand-200">
              <IconShield width={19} height={19} />
            </span>
            <div>
              <h2 className="text-[0.95rem] font-semibold text-white">管理令牌</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                令牌仅存于当前会话，用于为写操作签名；关闭标签页即失效，绝不写入地址栏。
              </p>
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
        </div>

        <div className="mt-5">
          <Field label="访问令牌" hint="对应服务端环境变量 ADMIN_TOKEN；未配置时写接口整体禁用。">
            <TextInput
              type="password"
              autoFocus
              value={draft}
              placeholder="粘贴管理令牌"
              icon={<IconKey width={15} height={15} />}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={clear} disabled={!current}>
            清除
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" onClick={save}>
              保存并启用
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

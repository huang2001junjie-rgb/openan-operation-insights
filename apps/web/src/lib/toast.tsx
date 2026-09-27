import { useSyncExternalStore } from 'react';
import { cn } from './cn';
import { IconAlert, IconCheck, IconSparkle, IconX } from '@/components/icons';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

/** 推送一条轻量提示；error 停留更久 */
export function pushToast(toast: Omit<ToastItem, 'id'>): void {
  const id = ++seq;
  items = [...items, { id, ...toast }];
  emit();
  window.setTimeout(() => dismissToast(id), toast.tone === 'error' ? 6000 : 3600);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastItem[] {
  return items;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-accent-400/30 bg-accent-500/[0.12] text-accent-300',
  error: 'border-rose-400/30 bg-rose-500/[0.12] text-rose-200',
  info: 'border-brand-400/30 bg-brand-500/[0.12] text-brand-200',
};

const TONE_ICON: Record<ToastTone, typeof IconCheck> = {
  success: IconCheck,
  error: IconAlert,
  info: IconSparkle,
};

/** 全局提示条容器：挂载于 AppShell，右上角堆叠 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = TONE_ICON[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-card backdrop-blur-xl animate-fade-up',
              TONE_STYLES[toast.tone],
            )}
          >
            <Icon width={17} height={17} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-5">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-xs leading-relaxed opacity-80">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 rounded-md p-0.5 opacity-60 transition hover:opacity-100"
            >
              <IconX width={14} height={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

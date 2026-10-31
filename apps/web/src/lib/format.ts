const NBSP_NARROW = '\u202f';

/** 千分位；超过 10 万时以"万"为单位压缩，保留一位小数 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 100_000) {
    const compact = (value / 10_000).toFixed(abs >= 1_000_000 ? 0 : 1);
    return `${compact.replace(/\.0$/, '')}${NBSP_NARROW}万`;
  }
  return value.toLocaleString('zh-CN');
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

export function formatDelta(delta?: number): string {
  if (delta === undefined || delta === null || !Number.isFinite(delta)) return '—';
  return delta > 0 ? `+${formatNumber(delta)}` : formatNumber(delta);
}

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMATTER.format(date);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return DATETIME_FORMATTER.format(date);
}

export function formatDateRange(start: string, end: string): string {
  const startText = formatDate(start);
  const endText = formatDate(end);
  return startText === endText ? startText : `${startText} — ${endText}`;
}

export function daysUntil(iso: string, now = Date.now()): number {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 86_400_000));
}

/** 日期时间（YYYY-MM-DDTHH:mm:ssZ）→ <input type="date"> 需要的 YYYY-MM-DD */
export function toDateInput(iso?: string): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * 区间日界按 **Asia/Shanghai** 切（ADR-0018 决策 3）：把 `<input type="date">` 的
 * YYYY-MM-DD 翻成「该日期在 +08:00 的零点」对应的 UTC 时刻。
 *
 * 后端契约收的是 ISO 8601 **时刻**、只比 epoch 毫秒、不解析时区，所以「用户眼里的一天」
 * 必须由前端在这里定义清楚。若按 UTC 切日，北京时间 1 月 1 日 08:00 之前合并的 PR
 * 会被算进上一年——运营和社区都在国内，那不是用户想要的「一天」。
 */
const RANGE_TZ_OFFSET = '+08:00';
const MS_PER_DAY = 86_400_000;

function instantOfDay(value: string, dayOffset: number): string | undefined {
  if (!value) return undefined;
  const start = new Date(`${value}T00:00:00${RANGE_TZ_OFFSET}`);
  if (Number.isNaN(start.getTime())) return undefined;
  // +08:00 无夏令时，按固定毫秒数进位是精确的
  return new Date(start.getTime() + dayOffset * MS_PER_DAY).toISOString();
}

/** 区间下界（含）：开始日期当天零点 */
export function rangeStartInstant(value: string): string | undefined {
  return instantOfDay(value, 0);
}

/**
 * 区间上界（**不含**）：结束日期的次日零点。
 *
 * 契约是半开区间 `from <= timestamp < to`。若把结束日期直接翻成当日零点，
 * 用户选的「1 月 1 日 ～ 12 月 31 日」会整天吞掉 12 月 31 日。
 */
export function rangeEndInstant(value: string): string | undefined {
  return instantOfDay(value, 1);
}

/** Date → 本地时区的 YYYY-MM-DD（区间预设按钮用；不用 toISOString 以免跨日偏移） */
export function toLocalDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function initialsOf(name?: string, fallbackId?: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
  }
  const id = fallbackId?.trim();
  return id ? id.slice(0, 2).toUpperCase() : '?';
}

/**
 * 区间口径的唯一实现（ADR-0018）：`from <= timestamp < to` 的**半开区间**，比较用 epoch 毫秒。
 *
 * 三条刻意的设计取舍：
 *
 * 1. **半开而非闭区间**：结束日期由前端翻成「次日零点」，于是「1 月 1 日 ～ 1 月 31 日」
 *    恰好覆盖 31 个整天，不会吞掉最后一天，也不依赖「当日末尾 23:59:59.999」这种
 *    与毫秒精度耦合的魔法值。
 * 2. **后端不解析时区**：契约收的是 ISO 8601 **时刻**，日界（Asia/Shanghai）由前端在
 *    把日期翻成时刻时决定。后端只做毫秒比较，因此不需要知道调用方在哪个时区。
 * 3. **非法输入降级为「该侧无界」**：`from` / `to` 已由 DTO 的 `@IsISO8601` 与 `assertRange`
 *    把关（非法 → `40001` / `40002`），这里的 NaN 兜底只防内部调用方绕过 DTO，
 *    不额外抛错——避免读路径因为一个参数把整个接口打成 5xx。
 */

/** 区间过滤器：两侧均可缺省（缺省 = 该侧无界）；两者都缺省时整体为 undefined ≡ 全量口径 */
export interface TimeRangeFilter {
  /** 下界（含）：epoch 毫秒 */
  fromMs?: number;
  /** 上界（不含）：epoch 毫秒 */
  toMs?: number;
}

function parseInstant(value?: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** 契约参数 → 区间过滤器；两侧都缺省时返回 undefined（调用方据此走全量口径） */
export function toTimeRangeFilter(from?: string, to?: string): TimeRangeFilter | undefined {
  const fromMs = parseInstant(from);
  const toMs = parseInstant(to);
  if (fromMs === undefined && toMs === undefined) return undefined;
  return { fromMs, toMs };
}

/**
 * 事件时间戳是否落在区间内。
 *
 * 时间戳按落盘契约（`validators.isGithubContributionEvent`）必为可解析的 ISO 时刻；
 * 这里的 NaN 分支纯属防御——真遇到不可解析的值一律**排除**并视为区间外，
 * 不让一条脏数据把聚合结果变成 NaN。
 */
export function isWithinRange(timestamp: string, range: TimeRangeFilter): boolean {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return false;
  if (range.fromMs !== undefined && ms < range.fromMs) return false;
  if (range.toMs !== undefined && ms >= range.toMs) return false;
  return true;
}

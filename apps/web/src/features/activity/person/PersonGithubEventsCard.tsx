import { AsyncState } from '@/components/ui/AsyncState';
import { Card, CardTitle } from '@/components/ui/Card';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { IconExternal, IconGithub, IconIssue, IconPullRequest } from '@/components/icons';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { PersonGithubEventsData } from '@/types/contract';

/** GitHub 事件明细（ADR-0020 决策 5）：读时派生 + 深链 + 截断显式提示，前端不重排不重算 */
export function PersonGithubEventsCard({
  title,
  data,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  /** 账号模式下展示「GitHub 账号 · login」 */
  title: string;
  data: PersonGithubEventsData | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  return (
    <Card className="reveal" padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle
          title={title}
          description="PR 与 Issue 事件流按时间倒序，链接直达 GitHub 原文；区间口径为半开 [from, to)，与组织模式一致"
          icon={<IconGithub width={16} height={16} />}
          size="lg"
        />
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={!data || data.total === 0}
          onRetry={onRetry}
          compact
          emptyTitle="区间内没有 GitHub 事件"
          emptyHint="换个时间区间，或确认该账号/自然人名下是否真的没有活动。"
          skeleton={<SkeletonTable rows={6} />}
        >
          {data ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-ink-950/[0.07]">
                <table className="data-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th scope="col">时间</th>
                      <th scope="col">类型</th>
                      <th scope="col">事件</th>
                      <th scope="col" className="text-right">提交</th>
                      <th scope="col" className="text-right">代码行</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr key={`${event.repository}#${event.number}`}>
                        <td className="whitespace-nowrap text-xs text-slate-500">
                          {formatDateTime(event.timestamp)}
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                            {event.kind === 'pullRequest' ? (
                              <IconPullRequest width={13} height={13} className="text-brand-600" />
                            ) : (
                              <IconIssue width={13} height={13} className="text-amber-300" />
                            )}
                            {event.kind === 'pullRequest' ? 'PR' : 'Issue'}
                          </span>
                        </td>
                        <td>
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="group inline-flex max-w-full items-center gap-1.5 text-slate-200 transition-colors hover:text-brand-600"
                          >
                            <span className="truncate font-medium">
                              {event.repository}#{event.number}
                            </span>
                            <IconExternal width={12} height={12} className="shrink-0 text-slate-500 transition-colors group-hover:text-brand-600" />
                          </a>
                        </td>
                        <td className="numeric text-right">{formatNumber(event.commitCount)}</td>
                        <td className="numeric text-right">{formatNumber(event.linesChanged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[0.7rem] text-slate-500">
                {data.truncated
                  ? `仅展示前 ${formatNumber(data.events.length)} 条（区间内共 ${formatNumber(data.total)} 条）：收窄时间区间可看到更多。`
                  : `共 ${formatNumber(data.total)} 条。`}
                {data.updatedAt ? ` 数据更新 ${formatDateTime(data.updatedAt)}。` : ''}
              </p>
            </>
          ) : null}
        </AsyncState>
      </div>
    </Card>
  );
}

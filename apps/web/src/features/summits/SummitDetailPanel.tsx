import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { SkeletonList } from '@/components/ui/Skeleton';
import { IconCheck, IconExternal, IconFile, IconPin, IconUsers } from '@/components/icons';
import { formatDateRange, formatNumber } from '@/lib/format';
import type { SummitDetail } from '@/types/contract';

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.025] px-3.5 py-3">
      <p className="text-[0.68rem] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="numeric mt-1.5 text-base font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function BulletList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-2.5 text-xs text-slate-500">暂无记录</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-xs leading-relaxed text-slate-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400/70" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface SummitDetailPanelProps {
  summit: SummitDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export function SummitDetailPanel({
  summit,
  isLoading,
  isError,
  error,
  onRetry,
}: SummitDetailPanelProps) {
  if (isLoading) {
    return (
      <Card className="reveal">
        <CardTitle title="峰会详情" description="正在加载 /api/summits/:id …" />
        <div className="mt-5">
          <SkeletonList rows={4} />
        </div>
      </Card>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!summit) {
    return (
      <Card className="reveal" padded={false}>
        <EmptyState
          className="border-0 bg-transparent"
          title="选择一场峰会查看详情"
          hint="展开下方时间线中的任意峰会，即可查看议程、成果与参会组织名单。"
        />
      </Card>
    );
  }

  return (
    <Card className="reveal">
      <CardTitle
        title={summit.name}
        description={summit.description}
        icon={<IconFile width={16} height={16} />}
        action={
          summit.isUpcoming ? (
            <Badge tone="accent">即将召开</Badge>
          ) : (
            <Badge tone="neutral">已结束</Badge>
          )
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatPill label="会期" value={formatDateRange(summit.startDate, summit.endDate)} />
        <StatPill label="参会人数" value={formatNumber(summit.attendeeCount)} />
        <StatPill label="参会组织" value={String(summit.attendingOrganizations.length)} />
        <StatPill label="主办方" value={summit.host} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BulletList title="议程亮点" items={summit.agendaHighlights} icon={<IconCheck width={14} height={14} className="text-brand-600" />} />
        <BulletList title="峰会成果" items={summit.outcomes} icon={<IconCheck width={14} height={14} className="text-accent-600" />} />
      </div>

      <div className="mt-7">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <IconUsers width={14} height={14} />
          参会组织名单
        </h4>

        {summit.attendingOrganizations.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">暂无参会组织记录</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-ink-950/[0.07]">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col" className="w-16">
                    序号
                  </th>
                  <th scope="col">组织名称</th>
                  <th scope="col" className="w-32 text-right">
                    参与状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {summit.attendingOrganizations.map((name, index) => (
                  <tr key={`${name}-${index}`}>
                    <td className="numeric text-slate-500">{String(index + 1).padStart(2, '0')}</td>
                    <td className="font-medium text-slate-100">{name}</td>
                    <td className="text-right">
                      <Badge tone={summit.isUpcoming ? 'brand' : 'accent'}>
                        {summit.isUpcoming ? '已确认' : '已参与'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {summit.websiteUrl ? (
          <a
            href={summit.websiteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-950/12 bg-ink-950/[0.04] px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-ink-950/25 hover:bg-ink-950/[0.08]"
          >
            <IconExternal width={14} height={14} />
            峰会主页
          </a>
        ) : null}
        {summit.minutesUrl ? (
          <a
            href={summit.minutesUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-950/12 bg-ink-950/[0.04] px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-ink-950/25 hover:bg-ink-950/[0.08]"
          >
            <IconFile width={14} height={14} />
            峰会纪要
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <IconPin width={14} height={14} />
            纪要暂未归档
          </span>
        )}
      </div>
    </Card>
  );
}

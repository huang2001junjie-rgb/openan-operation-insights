import { AsyncState } from '@/components/ui/AsyncState';
import { EmptyState } from '@/components/ui/States';
import { Card, CardTitle } from '@/components/ui/Card';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { IconConfluence, IconExternal } from '@/components/icons';
import { formatDateTime } from '@/lib/format';
import type { PersonConfluenceRequirementsData } from '@/types/contract';

/**
 * Confluence 需求级事实明细（ADR-0021）：恒全历史（无区间参数），release 解析不到显式标「—」。
 * 文件缺失时 `updatedAt === null`，给「待采集」空态而非报错——明细功能要等 collect:wiki 跑过才可用。
 */
export function PersonConfluenceRequirementsCard({
  title,
  data,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  title: string;
  data: PersonConfluenceRequirementsData | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const pendingCollection = !isLoading && !isError && data !== undefined && data.updatedAt === null;

  return (
    <Card className="reveal" padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle
          title={title}
          description="需求行事实（Requirement Proposal 表格联系人 × @），恒全历史；链接直达 Confluence 原页"
          icon={<IconConfluence width={16} height={16} />}
          size="lg"
        />
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={!pendingCollection && (!data || data.total === 0)}
          onRetry={onRetry}
          compact
          emptyTitle="名下账号暂无需求事实"
          emptyHint="该自然人/账号还没有出现在任何 Requirement Proposal 的 Contacts 列。"
          skeleton={<SkeletonTable rows={5} />}
        >
          {pendingCollection ? (
            <EmptyState
              title="Confluence 需求事实待采集"
              hint="数据文件 confluence-requirements.json 还不存在：运行 npm run collect:wiki 后此明细自动可用。"
            />
          ) : null}
          {data && data.total > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                <table className="data-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th scope="col">需求</th>
                      <th scope="col">Release</th>
                      <th scope="col">所在页</th>
                      <th scope="col" className="text-right">行号</th>
                      <th scope="col">账号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requirements.map((fact) => (
                      <tr key={`${fact.pageId}:${fact.rowIndex}:${fact.accountId}`}>
                        <td className="font-medium text-slate-100">{fact.requirementTitle}</td>
                        <td>
                          {fact.release ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.7rem] text-slate-300">
                              {fact.release}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500" title="祖先链中未找到 Release Planning 之下的层级，原样给出供人工核对">
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          {fact.url ? (
                            <a
                              href={fact.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="group inline-flex max-w-full items-center gap-1.5 text-slate-200 transition-colors hover:text-brand-300"
                            >
                              <span className="truncate">{fact.pageTitle}</span>
                              <IconExternal width={12} height={12} className="shrink-0 text-slate-500 transition-colors group-hover:text-brand-300" />
                            </a>
                          ) : (
                            <span className="text-slate-400">{fact.pageTitle}</span>
                          )}
                        </td>
                        <td className="numeric text-right">{fact.rowIndex}</td>
                        <td className="text-xs text-slate-400">{fact.displayName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[0.7rem] text-slate-500">
                共 {data.total} 条需求事实{data.updatedAt ? `；数据更新 ${formatDateTime(data.updatedAt)}` : ''}。
              </p>
            </>
          ) : null}
        </AsyncState>
      </div>
    </Card>
  );
}

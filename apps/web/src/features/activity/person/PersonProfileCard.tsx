import { AsyncState } from '@/components/ui/AsyncState';
import { Avatar } from '@/components/ui/Avatar';
import { Card, CardTitle } from '@/components/ui/Card';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { IconConfluence, IconGithub, IconUsers } from '@/components/icons';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { Organization, PersonAccountItem, PersonContributionsData } from '@/types/contract';

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.03] px-4 py-3">
      <div className="numeric text-xl font-semibold text-slate-50">{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
        <span>{label}</span>
        {hint ? (
          <span className="rounded border border-ink-950/10 bg-ink-950/[0.04] px-1 py-px text-[0.65rem] leading-tight text-slate-400">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BotBadge() {
  return (
    <span
      className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[0.65rem] font-medium text-amber-700"
      title="githubId=0 的机器人账号：计数保留在画像合计里，但账号条目单独标注"
    >
      bot
    </span>
  );
}

function GithubAccountRow({ account }: { account: PersonAccountItem & { source: 'github' } }) {
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5">
          <Avatar src={account.avatarUrl ?? undefined} name={account.displayName} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-slate-100">{account.displayName}</span>
              {account.isBot ? <BotBadge /> : null}
            </div>
            <span className="text-xs text-slate-400">{account.accountKey}</span>
          </div>
        </div>
      </td>
      <td className="text-sm text-slate-400">{account.orgName ?? '未归属'}</td>
      <td className="numeric text-right">{formatNumber(account.github.pullRequests)}</td>
      <td className="numeric text-right">{formatNumber(account.github.commits ?? 0)}</td>
      <td className="numeric text-right">{formatNumber(account.github.issues)}</td>
      <td className="numeric text-right">{formatNumber(account.github.linesChanged)}</td>
      <td className="numeric text-right">{formatNumber(account.github.repoIds.length)}</td>
    </tr>
  );
}

function ConfluenceAccountRow({ account }: { account: PersonAccountItem & { source: 'confluence' } }) {
  return (
    <tr>
      <td>
        <div className="min-w-0">
          <span className="font-medium text-slate-100">{account.displayName}</span>
          <span className="ml-2 text-xs text-slate-400">{account.accountKey}</span>
        </div>
      </td>
      <td className="text-sm text-slate-400">{account.orgName ?? '未归属'}</td>
      <td className="numeric text-right">{formatNumber(account.confluence.requirements)}</td>
      <td className="numeric text-right">{formatNumber(account.confluence.topicShares)}</td>
      <td className="numeric text-right">{formatNumber(account.confluence.edits)}</td>
    </tr>
  );
}

/**
 * 自然人统一画像（ADR-0020）：跨来源合并的人物档案。
 * 人物级四项 GitHub 计数 ≡ 名下账号求和（后端保证）；仓库数为 repoIds **并集**（同一仓库多人协作不重复计）；
 * Confluence 侧为恒全历史累计，无时间维度。
 */
export function PersonProfileCard({
  data,
  isLoading,
  isError,
  error,
  onRetry,
  /** 组织档案（含 logoUrl）：画像头部按生效归属展示组织 logo，未归属不显示 */
  organizations = [],
}: {
  data: PersonContributionsData | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  organizations?: Organization[];
}) {
  return (
    <Card className="reveal" padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle
          title="自然人画像"
          description="跨 GitHub 与 Confluence 的统一档案：归属、双来源指标、名下账号分解均由后端读时派生"
          icon={<IconUsers width={16} height={16} />}
          size="lg"
        />
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={!data}
          onRetry={onRetry}
          compact
          emptyTitle="暂无画像"
          skeleton={<SkeletonTable rows={4} />}
        >
          {data ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar
                  src={data.person.avatarUrl ?? undefined}
                  name={data.person.displayName}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* v1.34 运营反馈：画像人名放大很多（原 text-lg 18px，现 32px） */}
                    <span className="text-[2rem] font-bold leading-tight tracking-tight text-slate-50">
                      {data.person.displayName}
                    </span>
                    {/* v1.35 运营反馈：人名右侧展示归属组织 logo；未归属（orgName 为空）不显示 */}
                    {data.orgName ? (
                      (() => {
                        const logoUrl = organizations.find(
                          (org) => org.orgId === data.effectiveOrgId,
                        )?.logoUrl;
                        return logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={`${data.orgName} logo`}
                            className="h-8 max-w-[8rem] object-contain"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null;
                      })()
                    ) : null}
                    <span className="rounded-full border border-ink-950/10 bg-ink-950/[0.04] px-2.5 py-0.5 text-xs text-slate-300">
                      {data.orgName ?? '未归属'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {data.orgSource === 'person'
                      ? '组织取自人物档案'
                      : '档案未填组织，按名下账号生效归属回落'}
                  </p>
                </div>
              </div>

              <section>
                <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <IconGithub width={14} height={14} className="shrink-0 text-slate-400" />
                  <span>GitHub 协作指标</span>
                  {data.github.updatedAt ? (
                    <span className="text-xs font-normal tracking-normal text-slate-400">
                      （更新 {formatDateTime(data.github.updatedAt)}）
                    </span>
                  ) : null}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  <MetricTile label="合并 PR" value={formatNumber(data.github.metrics.pullRequests)} />
                  <MetricTile label="提交数" value={formatNumber(data.github.metrics.commits)} />
                  <MetricTile label="Issue" value={formatNumber(data.github.metrics.issues)} />
                  <MetricTile label="代码行数" value={formatNumber(data.github.metrics.linesChanged)} />
                  <MetricTile label="参与仓库" value={formatNumber(data.github.metrics.repos)} hint="并集" />
                </div>
                {data.github.repoBreakdown.length > 0 ? (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-ink-950/[0.07]">
                    <table className="data-table min-w-[560px]">
                      <thead>
                        <tr>
                          <th scope="col">仓库</th>
                          <th scope="col" className="text-right">合并 PR</th>
                          <th scope="col" className="text-right">提交数</th>
                          <th scope="col" className="text-right">Issue</th>
                          <th scope="col" className="text-right">代码行数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.github.repoBreakdown.map((row) => (
                          <tr key={row.repoId}>
                            <td className="font-medium text-slate-100">{row.repoId}</td>
                            <td className="numeric text-right">{formatNumber(row.github.pullRequests)}</td>
                            <td className="numeric text-right">{formatNumber(row.github.commits ?? 0)}</td>
                            <td className="numeric text-right">{formatNumber(row.github.issues)}</td>
                            <td className="numeric text-right">{formatNumber(row.github.linesChanged)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">暂无仓库维度贡献。</p>
                )}
              </section>

              <section>
                <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <IconConfluence width={14} height={14} className="shrink-0 text-slate-400" />
                  <span>Confluence 成果指标</span>
                  <span
                    className="rounded border border-ink-950/10 bg-ink-950/[0.04] px-1 py-px text-[0.65rem] font-normal normal-case leading-tight text-slate-400"
                    title="Confluence 侧落盘的是账号级累计计数，没有可切片的时间维度"
                  >
                    全历史
                  </span>
                  {data.confluence.updatedAt ? (
                    <span className="text-xs font-normal tracking-normal text-slate-400">
                      （更新 {formatDateTime(data.confluence.updatedAt)}）
                    </span>
                  ) : null}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <MetricTile label="需求文档" value={formatNumber(data.confluence.metrics.requirements)} />
                  <MetricTile label="议题分享" value={formatNumber(data.confluence.metrics.topicShares)} />
                  <MetricTile label="编辑" value={formatNumber(data.confluence.metrics.edits)} />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  名下账号分解（{data.accounts.length}）
                </h3>
                {data.accounts.some((a) => a.source === 'github') ? (
                  <div className="overflow-x-auto rounded-xl border border-ink-950/[0.07]">
                    <table className="data-table min-w-[760px]">
                      <thead>
                        <tr>
                          <th scope="col">GitHub 账号</th>
                          <th scope="col">生效组织</th>
                          <th scope="col" className="text-right">合并 PR</th>
                          <th scope="col" className="text-right">提交数</th>
                          <th scope="col" className="text-right">Issue</th>
                          <th scope="col" className="text-right">代码行数</th>
                          <th scope="col" className="text-right">仓库</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.accounts
                          .filter((a): a is PersonAccountItem & { source: 'github' } => a.source === 'github')
                          .map((account) => <GithubAccountRow key={account.accountKey} account={account} />)}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {data.accounts.some((a) => a.source === 'confluence') ? (
                  <div className="overflow-x-auto rounded-xl border border-ink-950/[0.07]">
                    <table className="data-table min-w-[560px]">
                      <thead>
                        <tr>
                          <th scope="col">Confluence 账号</th>
                          <th scope="col">生效组织</th>
                          <th scope="col" className="text-right">需求文档</th>
                          <th scope="col" className="text-right">议题分享</th>
                          <th scope="col" className="text-right">编辑</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.accounts
                          .filter((a): a is PersonAccountItem & { source: 'confluence' } => a.source === 'confluence')
                          .map((account) => <ConfluenceAccountRow key={account.accountKey} account={account} />)}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {data.accounts.length === 0 ? (
                  <p className="text-sm text-slate-400">尚未关联任何账号：可在身份匹配控制台认领。</p>
                ) : null}
              </section>
            </div>
          ) : null}
        </AsyncState>
      </div>
    </Card>
  );
}

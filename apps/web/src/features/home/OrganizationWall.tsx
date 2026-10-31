import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, OrganizationTypeBadge } from '@/components/ui/Badge';
import { IconArrowRight, IconExternal, IconUsers } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatNumber, initialsOf } from '@/lib/format';
import type { OrganizationCard, OrganizationTopContributor } from '@/types/contract';

/**
 * 组织卡片墙（ADR-0016）：
 * - 顺序由后端按 displayOrder 排好，前端直接渲染、不做二次排序；
 * - 卡片直出代码贡献量（commits）与 Confluence 贡献量（编辑量）两个原始指标，
 *   二者恒为**全量口径**（累计），不受活跃度页区间筛选影响（ADR-0018 决策 7）；
 * - 每维度 top3 贡献者（两栏各 3 行：20px 头像 + 姓名 + 数字，不可点击）；
 * - 两项贡献量均为 0 的组织显示「暂无贡献」灰色徽章；
 * - 卡片文字在初版基础上再放大一档（标题 1.2rem、描述 text-base、指标行与 top3 text-sm）；
 * - 内容顶对齐：贡献面板紧跟徽章/描述区，剩余空白留在底部链接行上方（链接行仍钉底）。
 */

/** 20px 个人圆形头像：avatarUrl 缺失或加载失败时降级为首字母色块（Confluence 账号无头像字段，恒走降级） */
function TopAvatar({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const url = src?.trim();

  useEffect(() => {
    setBroken(false);
  }, [url]);

  const showImage = Boolean(url) && !broken;

  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[0.5rem] font-semibold leading-none',
        showImage
          ? 'border-white/12 bg-white/[0.05]'
          : 'border-brand-400/25 bg-gradient-to-br from-brand-400/30 to-accent-400/20 text-brand-100',
      )}
      title={name}
    >
      {showImage ? (
        <img
          src={url}
          alt={`${name} 的头像`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/** top3 单维度栏：列头 + 至多 3 行（头像 + 姓名 + 数字）；该维度无人时显示「—」占位 */
function TopColumn({ title, items }: { title: string; items: OrganizationTopContributor[] }) {
  return (
    <div className="min-w-0">
      <div className="text-[0.75rem] font-medium text-slate-500">{title}</div>
      <ul className="mt-1.5 space-y-1.5">
        {items.length === 0 ? (
          <li className="flex h-5 items-center text-sm text-slate-600">—</li>
        ) : (
          items.map((person, index) => (
            <li key={`${person.name}-${index}`} className="flex items-center gap-1.5">
              <TopAvatar src={person.avatarUrl} name={person.name} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300" title={person.name}>
                {person.name}
              </span>
              <span className="numeric shrink-0 text-sm font-semibold text-slate-200">
                {formatNumber(person.value)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** 指标行：标签 text-xs（放大一档），数字强调；value 缺失显示「—」 */
function MetricRow({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      {typeof value === 'number' ? (
        <span className="numeric font-semibold text-slate-200">
          {formatNumber(value)}
          <span className="ml-1 text-[0.75rem] font-normal text-slate-500">{unit}</span>
        </span>
      ) : (
        <span className="text-slate-500">—</span>
      )}
    </div>
  );
}

/** 两项贡献量 + 各维度 top3；header 用于独立开发者卡追加「人数」行 */
function ContributionPanel({ org, header }: { org: OrganizationCard; header?: ReactNode }) {
  return (
    <>
      <div className="space-y-2">
        {header}
        {/*
          首页恒为**全量口径**（本页没有区间筛选器，ADR-0018 决策 7）：标签带「累计」二字，
          免得用户在活跃度页选了区间后拿两页数字互相对不上时无从解释。
        */}
        <MetricRow label="代码贡献量（累计）" value={org.commits ?? 0} unit="次提交" />
        <MetricRow label="Confluence 贡献量（累计）" value={org.confluenceEdits ?? 0} unit="次编辑" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3.5">
        <TopColumn title="代码 top3" items={org.topContributors?.github ?? []} />
        <TopColumn title="文档 top3" items={org.topContributors?.confluence ?? []} />
      </div>
    </>
  );
}

/** 两项贡献量均为 0 = 暂无贡献（ADR-0016 判据，承接 ADR-0001 呈现意图） */
function hasNoContribution(org: OrganizationCard): boolean {
  return (org.commits ?? 0) === 0 && (org.confluenceEdits ?? 0) === 0;
}

function OrganizationTile({ org, index }: { org: OrganizationCard; index: number }) {
  return (
    <article
      className="glass-card glass-card--hover reveal group flex flex-col p-5"
      style={{ '--d': `${Math.min(index, 8) * 55}ms` } as CSSProperties}
    >
      {/* Logo 通栏横幅（3:1），占满卡片内容宽度，避免挤压下方信息 */}
      <Avatar src={org.logoUrl} name={org.name} size="banner" className="w-full" />

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[1.2rem] font-semibold text-white" title={org.name}>
            {org.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <OrganizationTypeBadge type={org.type} />
          </div>
        </div>
        {hasNoContribution(org) ? <Badge tone="neutral">暂无贡献</Badge> : null}
      </div>

      {org.description ? (
        <p className="mt-4 line-clamp-2 text-base leading-relaxed text-slate-400">{org.description}</p>
      ) : null}

      {org.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {org.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="chip text-[0.68rem]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* 内容顶对齐：贡献面板紧跟上方信息区，避免矮卡片把空白堆在徽章与指标之间 */}
      <div className="mt-5">
        <ContributionPanel org={org} />
      </div>

      <div className="mt-auto flex items-center justify-between pt-5">
        {org.homepageUrl ? (
          <a
            href={org.homepageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-brand-300"
          >
            组织主页
            <IconExternal width={13} height={13} />
          </a>
        ) : (
          <span className="text-sm text-slate-600">无公开主页</span>
        )}

        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-300/0 transition-all duration-300 group-hover:text-brand-300">
          贡献明细
          <IconArrowRight width={13} height={13} />
        </span>
      </div>
    </article>
  );
}

/**
 * 独立开发者卡片（伪组织 unattributed，type='individual'）。
 * 中性色 + 个人图标，与组织卡片视觉区分；人数来自 home/summary 的 externalDeveloperCount
 * （ADR-0017 起为**读时派生**：生效归属 = `unattributed` 且非机器人），
 * 两项贡献量与 top3 取 unattributed 桶（ADR-0016；top3 已由 API 侧排除机器账号，ADR-0017 决策 5）。
 */
function IndividualTile({
  org,
  memberCount,
  index,
}: {
  org: OrganizationCard;
  memberCount?: number;
  index: number;
}) {
  return (
    <article
      className="glass-card glass-card--hover reveal group flex flex-col border border-dashed border-white/15 p-5"
      style={{ '--d': `${Math.min(index, 8) * 55}ms` } as CSSProperties}
    >
      {/* 占位横幅：与组织 Logo 区同为 3:1 通栏，保持网格对齐 */}
      <span className="flex aspect-[3/1] w-full shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300">
        <IconUsers width={30} height={30} />
      </span>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[1.2rem] font-semibold text-white" title={org.name}>
            {org.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">未归属组织</Badge>
          </div>
        </div>
        {hasNoContribution(org) ? <Badge tone="neutral">暂无贡献</Badge> : null}
      </div>

      <p className="mt-4 line-clamp-2 text-base leading-relaxed text-slate-400">
        {org.description ?? '未归属到任何组织的独立贡献者聚合。'}
      </p>

      {/* 内容顶对齐：与组织卡一致，贡献面板紧跟上方信息区 */}
      <div className="mt-5">
        <ContributionPanel
          org={org}
          header={<MetricRow label="独立开发者人数" value={memberCount} unit="人" />}
        />
      </div>
    </article>
  );
}

export function OrganizationWall({
  organizations,
  individualCount,
}: {
  organizations: OrganizationCard[];
  /** 独立开发者人数（home/summary 的 externalDeveloperCount） */
  individualCount?: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {organizations.map((org, index) =>
        org.type === 'individual' ? (
          <IndividualTile
            key={org.orgId}
            org={org}
            memberCount={individualCount}
            index={index}
          />
        ) : (
          <OrganizationTile key={org.orgId} org={org} index={index} />
        ),
      )}
    </div>
  );
}

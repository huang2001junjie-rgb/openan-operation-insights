import {
  Contributor,
  ContributorContribution,
  GithubContributionEvent,
  GithubEventAuthorRef,
  GithubMetrics,
  IdentityClaim,
  Person,
} from '../contract/entities';
import {
  buildGithubClaimIndex,
  ContributorView,
  isBotAccount,
  resolveGithubEffectiveOrg,
} from './effective-org';
import { isWithinRange, TimeRangeFilter } from './time-range';

/**
 * GitHub 事件派生（D1 全面收敛）：`github-events.json` 是 GitHub 侧**唯一原子事实**，
 * 组织级 / 账号级 / 仓库级的一切数字都由本模块**读时派生**——
 * 「组织级 ≡ 账号级求和 ≡ 仓库级求和」由**函数形状**保证（同源同一次遍历），不存在双写漂移。
 *
 * 口径（与既有决策一致）：
 * - **人物口径**：作者缺失（已注销账号）的事件整体跳过，与采集聚合 Pass 2 口径一致；
 * - **bot**：量计入其生效归属桶（ADR-0017 决策 11），人物维度排除（决策 5）；
 * - **生效归属**：认领边优先于账号档案的采集口径 orgId（ADR-0017 决策 1）；
 * - **账号档案**（`github-accounts.json`）只提供展示与归属字段（姓名/头像/githubId/采集口径 orgId），
 *   其 `github` 指标字段**不再参与任何读路径**；档案缺失的账号用事件 author 快照兜底合成。
 * - **区间口径**（ADR-0018）：`from` / `to` 在**进入派生之前**用 `filterEventsByRange` 切一刀，
 *   三个读实现（组织级 / 账号级 / 仓库级）共用同一谓词，于是「组织级 ≡ 账号级 ≡ 仓库级」
 *   在**同一区间下**继续由函数形状保证。
 */

/**
 * 按区间口径切事件（半开：`from <= timestamp < to`）。
 *
 * `range` 为 undefined ≡ **全量口径**（不带区间），此时原数组直接返回，不做任何遍历。
 * 事件时间戳按落盘契约必填，故不存在「无时间的事件该算哪边」的分支——那类事件在采集期
 * 就已被拦下不落盘（ADR-0018 决策 4）。
 */
export function filterEventsByRange(
  events: GithubContributionEvent[],
  range?: TimeRangeFilter,
): GithubContributionEvent[] {
  if (!range) return events;
  return events.filter((event) => isWithinRange(event.timestamp, range));
}

export interface GithubEventDerivationInput {
  events: GithubContributionEvent[];
  /** 账号档案（github-accounts.json），contributorId 小写归一后与事件 author.login 匹配 */
  accounts: Contributor[];
  claims: IdentityClaim[];
  persons: Person[];
  /** 仓库过滤（repoIds 任意组合）：null/空集合 = 不过滤（≡ 全选） */
  repoFilter?: ReadonlySet<string> | null;
}

/** 仓库维度聚合中间量：计数含 bot，`logins` 供派生贡献者数（排 bot）与参与组织数 */
export interface RepoAggregation {
  repoId: string;
  github: Omit<GithubMetrics, 'repos'>;
  /** 贡献账号 login（小写归一，含 bot） */
  logins: Set<string>;
}

export interface GithubEventDerivation {
  /** 全部有贡献事件的账号视图（含 bot），按 commits/PRs/issues 降序 + id 升序 */
  views: ContributorView<ContributorContribution>[];
  /** 人物口径：排除 bot 的账号视图（个人排行 / 独立开发者等出参用） */
  contributors: ContributorView<ContributorContribution>[];
  /** 仓库维度聚合（未排序）；组织级投影继续走 deriveOrganizationContributions(views) */
  repos: RepoAggregation[];
  /** login（小写归一）→ 账号视图：仓库维度算贡献者数 / 参与组织数用 */
  viewByLogin: Map<string, ContributorView<ContributorContribution>>;
  warnings: string[];
}

interface LoginAggregation {
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  repos: Set<string>;
  /** 事件 author 快照（档案缺失时兜底合成展示字段），取最后一条 */
  authorRef: GithubEventAuthorRef | null;
}

export function deriveGithubFromEvents(
  input: GithubEventDerivationInput,
): GithubEventDerivation {
  const { events, accounts, claims, persons, repoFilter } = input;
  const filter = repoFilter && repoFilter.size > 0 ? repoFilter : null;

  const dossierById = new Map<string, Contributor>();
  for (const account of accounts) {
    const key = account.contributorId.trim().toLowerCase();
    if (key) dossierById.set(key, account);
  }

  const { index: claimIndex, warnings } = buildGithubClaimIndex(claims, persons);

  const loginAgg = new Map<string, LoginAggregation>();
  const repoAgg = new Map<string, RepoAggregation>();

  for (const event of events) {
    if (filter && !filter.has(event.repository)) continue;
    // 人物口径：作者缺失的事件整体跳过（与采集聚合口径一致）
    const rawLogin = event.author?.login.trim();
    if (!event.author || !rawLogin) continue;
    const login = rawLogin.toLowerCase();

    const bucket = loginAgg.get(login) ?? {
      pullRequests: 0,
      commits: 0,
      issues: 0,
      linesChanged: 0,
      repos: new Set<string>(),
      authorRef: null,
    };
    if (event.kind === 'pullRequest') {
      bucket.pullRequests += 1;
      bucket.commits += event.commitCount;
      bucket.linesChanged += event.linesChanged;
    } else {
      bucket.issues += 1;
    }
    bucket.repos.add(event.repository);
    bucket.authorRef = event.author;
    loginAgg.set(login, bucket);

    const repo = repoAgg.get(event.repository) ?? {
      repoId: event.repository,
      github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0 },
      logins: new Set<string>(),
    };
    if (event.kind === 'pullRequest') {
      repo.github.pullRequests += 1;
      repo.github.commits += event.commitCount;
      repo.github.linesChanged += event.linesChanged;
    } else {
      repo.github.issues += 1;
    }
    repo.logins.add(login);
    repoAgg.set(event.repository, repo);
  }

  const views: ContributorView<ContributorContribution>[] = [];
  const viewByLogin = new Map<string, ContributorView<ContributorContribution>>();
  loginAgg.forEach((bucket, login) => {
    const dossier = dossierById.get(login);
    const authorRef = bucket.authorRef;
    const profile: Contributor = dossier ?? {
      contributorId: authorRef?.login ?? login,
      githubId: authorRef?.githubId ?? 0,
      name: authorRef?.name || (authorRef?.login ?? login),
      orgId: null,
      avatarUrl: authorRef?.avatarUrl ?? '',
    };
    const repoIds = [...bucket.repos].sort();
    const account: ContributorContribution = {
      ...profile,
      github: {
        pullRequests: bucket.pullRequests,
        commits: bucket.commits,
        issues: bucket.issues,
        linesChanged: bucket.linesChanged,
        repos: repoIds.length,
        repoIds,
      },
    };
    const view = resolveGithubEffectiveOrg(account, claimIndex);
    views.push(view);
    viewByLogin.set(login, view);
  });

  views.sort(
    (a, b) =>
      b.github.commits - a.github.commits ||
      b.github.pullRequests - a.github.pullRequests ||
      b.github.issues - a.github.issues ||
      a.contributorId.localeCompare(b.contributorId),
  );

  return {
    views,
    contributors: views.filter((view) => !isBotAccount(view)),
    repos: [...repoAgg.values()],
    viewByLogin,
    warnings,
  };
}

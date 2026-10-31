import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountGithubMetrics,
  Contributor,
  GithubContributionEvent,
  Organization,
  OrganizationContribution,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTIONS_REPOSITORY,
  CONTRIBUTORS_REPOSITORY,
  GITHUB_EVENTS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import { ORG_UNATTRIBUTED, UNATTRIBUTED_DISPLAY_NAME } from '../collector.constants';
import { GITHUB_SOURCE } from '../collector.tokens';
import type { GithubContributionRecord, GithubSource } from './github-source.port';
import { GithubSyncStateStore } from './github-sync-state.store';
import type { GithubSyncState } from './github-sync-state.store';

export interface GithubCollectOptions {
  mode: 'incremental' | 'full';
  /** 增量游标（ISO 8601）；full 模式为 null */
  since: string | null;
  /** 只计算不落盘，用于首次接入前核对口径 */
  dryRun: boolean;
}

export interface GithubCollectOutcome {
  mode: 'incremental' | 'full';
  /** 本轮从数据源取到的记录数（含被拒的缺时间戳记录） */
  recordCount: number;
  /**
   * 因缺时间戳被**整条拒绝**的记录数（ADR-0018 决策 4）：不落事件文件、不进聚合。
   * 接受数 = `recordCount - untimedCount`；累计值另见 `.sync-state.json` 的 `untimedEvents`。
   */
  untimedCount: number;
  requestCount: number;
  truncated: boolean;
  orgCount: number;
  /** 本轮带 GitHub 指标的贡献者数（ADR-0003 个人维度口径） */
  personCount: number;
  unattributedCount: number;
  /** 本轮通过邮箱域名命中的贡献者数（用于核对归属回填效果） */
  emailAttributedCount: number;
  totals: { pullRequests: number; commits: number; issues: number; linesChanged: number };
  /** 事件文件（github-events.json）落盘统计：total=写后总数，appended=本轮新增，skipped=幂等键去重跳过 */
  events: { total: number; appended: number; skipped: number };
  written: string[];
}

/**
 * 通过时间戳校验的记录（`timestamp` 为非空可解析 ISO 时刻）：只有它能落盘为事件
 * （`GithubContributionEvent.timestamp` 必填，ADR-0018 决策 4）。
 */
type TimedContributionRecord = GithubContributionRecord & { timestamp: string };

/** 指标聚合桶：组织维度（orgId）与个人维度（contributorId）共用（ADR-0003） */
interface MetricsAggregate {
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  /** 已累计的仓库集合（增量模式下与基线求并集） */
  repos: Set<string>;
  /**
   * 兜底下限：集合不可用（如元信息缺失升级而来）时退化为已入库的仓库数。
   * 仅**组织维度**需要（`github-organizations.json` 只存计数）；个人维度自 v2 起集合随业务文件
   * 自持（`github.repoIds`），恒传 0（ADR-0017 决策 15）。
   */
  repoFloor: number;
}

interface ResolvedAuthor {
  contributorId: string;
  githubId: number | null;
  name: string;
  avatarUrl: string;
  orgId: string | null;
}

/**
 * GitHub 贡献采集器（见 05 文档第 2 章）。
 *
 * 读写分离：本服务是**唯一**写 data/*.json 的入口；API 请求链路永远只读本地落盘数据。
 *
 * 幂等与合并策略：
 * - `full`：以本轮全量结果**整体替换**贡献对象（唯一键 orgId）；
 * - `incremental`：以已入库的贡献为**基线**，把增量记录**叠加**上去，
 *   避免一次增量运行把历史累计清零；仓库集合由 .sync-state.json 的 orgRepos 求并集得出。
 */
@Injectable()
export class GithubCollectorService {
  private readonly logger = new Logger(GithubCollectorService.name);

  constructor(
    @Inject(GITHUB_SOURCE) private readonly source: GithubSource,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizations: JsonRepository<Organization[]>,
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly contributions: JsonRepository<OrganizationContribution[]>,
    @Inject(CONTRIBUTORS_REPOSITORY)
    private readonly contributors: JsonRepository<Contributor[]>,
    @Inject(GITHUB_EVENTS_REPOSITORY)
    private readonly events: JsonRepository<GithubContributionEvent[]>,
    private readonly syncState: GithubSyncStateStore,
  ) {}

  async run(options: GithubCollectOptions): Promise<GithubCollectOutcome> {
    const startedAt = new Date().toISOString();
    this.logger.log(
      `采集开始：mode=${options.mode} source=${this.source.label} since=${options.since ?? '(全量)'}`,
    );

    const organizationEnvelope = await this.organizations.read();
    // 聚合口径必须包含独立开发者伪组织（缺档案时内存补一条）：
    // 否则本轮 unattributed 的贡献记录会因档案缺失而被 buildContributions 丢弃。
    const organizations = this.withUnattributed(organizationEnvelope.data);
    const aliasIndex = this.buildAliasIndex(organizations);
    const emailDomainIndex = this.buildEmailDomainIndex(organizations);

    const previousState = await this.syncState.read();
    const baseline =
      options.mode === 'incremental' ? (await this.contributions.read()).data : null;
    // 个人维度基线（ADR-0003）：增量模式同样把已入库的 github 指标作为叠加初值
    const contributorBaseline =
      options.mode === 'incremental' ? (await this.contributors.read()).data : null;

    if (baseline) {
      this.logger.log(`增量基线：${baseline.length} 个组织已在库，本轮结果将叠加到基线上`);
    }

    const fetched = await this.source.fetch({ mode: options.mode, since: options.since });
    this.logger.log(
      `采集到 ${fetched.records.length} 条记录（请求 ${fetched.requestCount} 次，剩余配额 ${String(fetched.rateLimitRemaining)}）`,
    );

    // 时间戳是区间口径唯一的切片依据（ADR-0018 决策 4），故缺时间的记录**整条拒绝**：
    // 既不落事件文件也不进聚合（否则基线快照会与事件派生结果漂移），WARN + 计数暴露，不静默丢
    const { timed: records, untimed } = GithubCollectorService.splitByTimestamp(fetched.records);
    const untimedEvents = (previousState.untimedEvents ?? 0) + untimed.length;
    if (untimed.length > 0) {
      this.logger.warn(
        `拒绝 ${untimed.length} 条缺时间戳的记录（PR 需 mergedAt、Issue 需 createdAt）：不落盘、不计入聚合；` +
          `累计 untimedEvents=${untimedEvents}；样例=${untimed
            .slice(0, 3)
            .map((record) => `${record.kind} ${record.repository}#${record.number}`)
            .join(', ')}`,
      );
    }

    const seed = this.buildSeed(previousState, baseline);
    const personSeed = this.buildContributorSeed(contributorBaseline);
    const { aggregates, personAggregates, authors, unattributedLogins, emailAttributedCount } =
      this.aggregate(records, aliasIndex, emailDomainIndex, seed, personSeed);

    const contributions = this.buildContributions(organizations, aggregates);
    const totals = this.sumTotals(aggregates);
    const mergedUnattributed =
      options.mode === 'incremental'
        ? this.unionLogins(previousState.unattributedLogins, unattributedLogins)
        : unattributedLogins;

    const outcome: GithubCollectOutcome = {
      mode: options.mode,
      recordCount: fetched.records.length,
      untimedCount: untimed.length,
      requestCount: fetched.requestCount,
      truncated: fetched.truncated,
      orgCount: contributions.length,
      personCount: personAggregates.size,
      unattributedCount: mergedUnattributed.length,
      emailAttributedCount,
      totals,
      events: { total: 0, appended: 0, skipped: 0 },
      written: [],
    };

    this.logSummary(outcome);

    if (options.dryRun) {
      this.logger.warn('dry-run：未写入任何文件');
      return outcome;
    }

    outcome.written.push(
      ...(await this.persist(
        organizationEnvelope.data,
        contributions,
        authors,
        personAggregates,
        options.mode,
      )),
    );

    // 事件落盘（GitHub 侧唯一原子事实）：组织/账号/仓库级读路径全部由它派生
    outcome.events = await this.persistEvents(records, options.mode);
    outcome.written.push('github-events.json');
    this.logger.log(
      `事件落盘：共 ${outcome.events.total} 条（本轮新增 ${outcome.events.appended}，幂等跳过 ${outcome.events.skipped}）`,
    );

    const nextState: GithubSyncState = {
      ...previousState,
      schemaVersion: 1,
      lastSyncAt: startedAt,
      lastRunAt: startedAt,
      lastMode: options.mode,
      status: fetched.truncated ? 'partial' : 'success',
      rateLimitRemaining: fetched.rateLimitRemaining,
      unattributedLogins: mergedUnattributed,
      recordCount: fetched.records.length,
      untimedEvents,
      orgRepos: this.buildReposIndex(aggregates),
      personRepos: this.buildReposIndex(personAggregates),
    };
    delete nextState.lastError;

    await this.syncState.write(nextState);
    outcome.written.push(this.syncState.label);

    this.logger.log(`采集完成，已写入：${outcome.written.join(', ')}`);
    return outcome;
  }

  /** 失败收尾：只记录状态，绝不清空既有业务数据 */
  async recordFailure(options: GithubCollectOptions, error: Error): Promise<void> {
    const previous = await this.syncState.read();
    await this.syncState.write({
      ...previous,
      schemaVersion: 1,
      lastRunAt: new Date().toISOString(),
      lastMode: options.mode,
      status: 'failed',
      lastError: error.message,
    });
  }

  // ── 归属映射 ───────────────────────────────────────────────

  /** 构建 aliases.github（小写）→ orgId 索引；精确匹配，未命中即独立开发者 */
  private buildAliasIndex(organizations: Organization[]): Map<string, string> {
    const index = new Map<string, string>();
    organizations.forEach((org) => {
      const github = org.aliases?.github?.trim().toLowerCase();
      if (github && !index.has(github)) {
        index.set(github, org.orgId);
      }
    });
    return index;
  }

  /**
   * 构建 邮箱域名（小写）→ orgId 索引。
   * 同一域名配置到多个组织时按档案顺序先到先得，并输出 WARN 提示修订数据。
   */
  private buildEmailDomainIndex(organizations: Organization[]): Map<string, string> {
    const index = new Map<string, string>();

    organizations.forEach((org) => {
      org.emailDomains?.forEach((raw) => {
        const domain = raw.trim().toLowerCase().replace(/^@/, '');
        if (!domain) return;

        const existing = index.get(domain);
        if (existing && existing !== org.orgId) {
          this.logger.warn(
            `邮箱域名 ${domain} 同时配置在 ${existing} 与 ${org.orgId}，按档案顺序归属 ${existing}；请修订 organizations.json`,
          );
          return;
        }
        index.set(domain, org.orgId);
      });
    });

    return index;
  }

  /** 邮箱域名命中组织：精确匹配优先，其次按 `.域名` 后缀匹配（支持子域，如 mail.huawei.com → huawei.com） */
  private matchOrgByEmail(email: string, index: Map<string, string>): string | undefined {
    const domain = this.extractEmailDomain(email);
    if (!domain) return undefined;

    const exact = index.get(domain);
    if (exact) return exact;

    for (const [candidate, orgId] of index) {
      if (domain.endsWith(`.${candidate}`)) return orgId;
    }
    return undefined;
  }

  /** 取邮箱 @ 后的域名并小写化；非邮箱形态返回 null */
  private extractEmailDomain(email: string): string | null {
    const at = email.lastIndexOf('@');
    if (at <= 0 || at === email.length - 1) return null;
    const domain = email
      .slice(at + 1)
      .trim()
      .toLowerCase();
    return domain || null;
  }

  /** 增量基线：把已入库的累计值作为聚合初值 */
  private buildSeed(
    previousState: GithubSyncState,
    baseline: OrganizationContribution[] | null,
  ): Map<string, MetricsAggregate> {
    const seed = new Map<string, MetricsAggregate>();
    if (!baseline) return seed;

    const repoIndex = previousState.orgRepos ?? {};
    baseline.forEach((item) => {
      seed.set(item.orgId, {
        pullRequests: item.github.pullRequests,
        // 旧 github-organizations.json 可能无 commits 字段：按 0 兼容
        commits: item.github.commits ?? 0,
        issues: item.github.issues,
        linesChanged: item.github.linesChanged,
        repos: new Set(repoIndex[item.orgId] ?? []),
        repoFloor: item.github.repos,
      });
    });
    return seed;
  }

  /**
   * 个人维度增量基线（ADR-0003）：把 github-accounts.json 已入库的 github 指标作为聚合初值。
   *
   * 不读 `GithubSyncState`：仓库集合自 v2 起随业务文件落盘（`github.repoIds`，ADR-0017 决策 15），
   * 基线自持 ⇒ 元信息里的 `personRepos` 不再是必需输入（丢失状态文件也不会让个人仓库数退化）。
   */
  private buildContributorSeed(baseline: Contributor[] | null): Map<string, MetricsAggregate> {
    const seed = new Map<string, MetricsAggregate>();
    if (!baseline) return seed;

    baseline.forEach((item) => {
      if (!item.github) return;
      seed.set(item.contributorId, {
        pullRequests: item.github.pullRequests,
        // 旧 github-accounts.json 的 github 可能无 commits 字段：按 0 兼容
        commits: item.github.commits ?? 0,
        issues: item.github.issues,
        linesChanged: item.github.linesChanged,
        // 仓库集合自 v2 起随业务文件落盘（ADR-0017 决策 15），不再依赖元信息里的 personRepos；
        // 集合已自持 ⇒ 个人维度无需 repoFloor 兜底（恒 0），repos 严格 = repoIds.length
        repos: new Set(item.github.repoIds),
        repoFloor: 0,
      });
    });
    return seed;
  }

  private aggregate(
    records: GithubContributionRecord[],
    aliasIndex: Map<string, string>,
    emailDomainIndex: Map<string, string>,
    seed: Map<string, MetricsAggregate>,
    personSeed: Map<string, MetricsAggregate>,
  ): {
    aggregates: Map<string, MetricsAggregate>;
    personAggregates: Map<string, MetricsAggregate>;
    authors: Map<string, ResolvedAuthor>;
    unattributedLogins: string[];
    emailAttributedCount: number;
  } {
    const aggregates = new Map<string, MetricsAggregate>();
    seed.forEach((bucket, orgId) => {
      aggregates.set(orgId, { ...bucket, repos: new Set(bucket.repos) });
    });

    const personAggregates = new Map<string, MetricsAggregate>();
    personSeed.forEach((bucket, contributorId) => {
      personAggregates.set(contributorId, { ...bucket, repos: new Set(bucket.repos) });
    });

    const authors = new Map<string, ResolvedAuthor>();
    const unattributed = new Set<string>();

    // Pass 1：按 login 汇总邮箱候选。提交邮箱（企业邮箱主要来源）优先于账户公开资料邮箱
    const commitEmails = new Map<string, string>();
    const profileEmails = new Map<string, string>();
    const logins = new Set<string>();

    records.forEach((record) => {
      const login = record.author?.login?.trim().toLowerCase();
      if (!login) return;
      logins.add(login);

      const commitEmail = record.commitEmail?.trim();
      if (commitEmail && !commitEmails.has(login)) {
        commitEmails.set(login, commitEmail);
      }

      const profileEmail = record.author?.email?.trim();
      if (profileEmail && !profileEmails.has(login)) {
        profileEmails.set(login, profileEmail);
      }
    });

    // Pass 1.5：解析每个 login 的归属：登录名别名 → 邮箱域名 → 待定（独立开发者兜底）
    const orgByLogin = new Map<string, string>();
    const emailAttributed = new Set<string>();

    logins.forEach((login) => {
      const byAlias = aliasIndex.get(login);
      if (byAlias) {
        orgByLogin.set(login, byAlias);
        return;
      }

      const email = commitEmails.get(login) ?? profileEmails.get(login);
      const byDomain = email ? this.matchOrgByEmail(email, emailDomainIndex) : undefined;
      if (byDomain) {
        orgByLogin.set(login, byDomain);
        emailAttributed.add(login);
      }
    });

    // Pass 2：按归属逐记录累计指标
    records.forEach((record) => {
      const author = record.author;
      if (!author?.login) {
        return;
      }

      const contributorId = author.login.trim().toLowerCase();
      const orgId = orgByLogin.get(contributorId) ?? ORG_UNATTRIBUTED;

      if (orgId === ORG_UNATTRIBUTED) {
        unattributed.add(contributorId);
      }

      if (!authors.has(contributorId)) {
        authors.set(contributorId, {
          contributorId,
          githubId: author.githubId ?? null,
          name: author.name?.trim() || author.login,
          avatarUrl: author.avatarUrl ?? '',
          orgId: orgId === ORG_UNATTRIBUTED ? null : orgId,
        });
      }

      const bucket = aggregates.get(orgId) ?? {
        pullRequests: 0,
        commits: 0,
        issues: 0,
        linesChanged: 0,
        repos: new Set<string>(),
        repoFloor: 0,
      };
      const personBucket = personAggregates.get(contributorId) ?? {
        pullRequests: 0,
        commits: 0,
        issues: 0,
        linesChanged: 0,
        repos: new Set<string>(),
        repoFloor: 0,
      };

      if (record.kind === 'pullRequest') {
        bucket.pullRequests += 1;
        bucket.commits += record.commitCount ?? 0;
        bucket.linesChanged += record.linesChanged;
        personBucket.pullRequests += 1;
        personBucket.commits += record.commitCount ?? 0;
        personBucket.linesChanged += record.linesChanged;
      } else {
        bucket.issues += 1;
        personBucket.issues += 1;
      }
      bucket.repos.add(record.repository);
      personBucket.repos.add(record.repository);

      aggregates.set(orgId, bucket);
      personAggregates.set(contributorId, personBucket);
    });

    return {
      aggregates,
      personAggregates,
      authors,
      unattributedLogins: [...unattributed].sort(),
      emailAttributedCount: emailAttributed.size,
    };
  }

  private buildContributions(
    organizations: Organization[],
    aggregates: Map<string, MetricsAggregate>,
  ): OrganizationContribution[] {
    const updatedAt = new Date().toISOString();
    const result: OrganizationContribution[] = [];

    organizations.forEach((org) => {
      const bucket = aggregates.get(org.orgId);
      if (!bucket) return;
      result.push({
        orgId: org.orgId,
        orgName: org.name,
        logoUrl: org.logoUrl,
        homepageUrl: org.homepageUrl,
        github: {
          pullRequests: bucket.pullRequests,
          commits: bucket.commits,
          issues: bucket.issues,
          linesChanged: bucket.linesChanged,
          repos: Math.max(bucket.repos.size, bucket.repoFloor),
        },
        updatedAt,
      });
    });

    return result;
  }

  /**
   * 事件落盘（github-events.json）：
   * - `full`：本轮事件**整体替换**（与聚合文件的替换语义一致）；
   * - `incremental`：读已落盘事件为基线，按幂等键 `kind|repository|number` 去重后**追加**、整文件重写；
   *   文件缺失（首次增量）视为空基线，本轮记录全量落入。
   */
  /**
   * 按时间戳切分记录（ADR-0018 决策 4）。
   *
   * 落盘契约要求事件 `timestamp` 为**可解析的 ISO 时刻**，故这里把「拿不到时间」的记录挡在
   * 落盘之前——真通道结构上产不出这种记录（PR 只查 `states: MERGED` ⇒ `mergedAt` 必存在，
   * Issue 必有 `createdAt`），它只可能来自数据源回归或 fixture，属于**数据错误**而非业务分支。
   */
  private static splitByTimestamp(records: GithubContributionRecord[]): {
    timed: TimedContributionRecord[];
    untimed: GithubContributionRecord[];
  } {
    const timed: TimedContributionRecord[] = [];
    const untimed: GithubContributionRecord[] = [];
    for (const record of records) {
      const timestamp = record.timestamp;
      if (
        typeof timestamp === 'string' &&
        timestamp.length > 0 &&
        !Number.isNaN(Date.parse(timestamp))
      ) {
        timed.push({ ...record, timestamp });
      } else {
        untimed.push(record);
      }
    }
    return { timed, untimed };
  }

  private async persistEvents(
    records: TimedContributionRecord[],
    mode: 'incremental' | 'full',
  ): Promise<{ total: number; appended: number; skipped: number }> {
    const incoming = records.map(GithubCollectorService.toEvent);

    if (mode === 'full') {
      await this.events.write(incoming);
      return { total: incoming.length, appended: incoming.length, skipped: 0 };
    }

    let existing: GithubContributionEvent[];
    try {
      existing = (await this.events.read()).data;
    } catch {
      existing = [];
    }

    const seen = new Set(existing.map(GithubCollectorService.eventKey));
    const appended: GithubContributionEvent[] = [];
    let skipped = 0;
    for (const event of incoming) {
      const key = GithubCollectorService.eventKey(event);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      appended.push(event);
    }

    await this.events.write([...existing, ...appended]);
    return { total: existing.length + appended.length, appended: appended.length, skipped };
  }

  /** 事件幂等键：同一 PR/issue 在同一仓库内编号唯一 */
  private static eventKey(event: GithubContributionEvent): string {
    return `${event.kind}|${event.repository}|${event.number}`;
  }

  /**
   * 记录 → 落盘事件：剥离 `email` / `commitEmail` / `url`（「仅用于采集时归属判定，不落盘」的既有决策），
   * 仅保留展示与读时归属解析所需字段；作者缺失时 author 为 null（读路径按人物口径跳过）。
   */
  private static toEvent(record: TimedContributionRecord): GithubContributionEvent {
    return {
      kind: record.kind,
      repository: record.repository,
      number: record.number,
      // 逐字段兜底为 null：Bot（dependabot 等 GitHub App）在 GraphQL 侧缺 githubId / name，
      // 直接透传会得到 undefined，JSON 序列化**丢键**→ 落盘文件过不了 isGithubContributionEvent 校验
      author: record.author
        ? {
            login: record.author.login,
            githubId: record.author.githubId ?? null,
            name: record.author.name ?? null,
            avatarUrl: record.author.avatarUrl ?? '',
          }
        : null,
      linesChanged: record.linesChanged,
      timestamp: record.timestamp,
      commitCount: record.commitCount ?? 0,
    };
  }

  /** 仓库集合索引：组织（orgRepos）与个人（personRepos）共用 */
  private buildReposIndex(aggregates: Map<string, MetricsAggregate>): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    aggregates.forEach((bucket, key) => {
      result[key] = [...bucket.repos].sort();
    });
    return result;
  }

  private sumTotals(aggregates: Map<string, MetricsAggregate>): GithubCollectOutcome['totals'] {
    const totals = { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0 };
    aggregates.forEach((bucket) => {
      totals.pullRequests += bucket.pullRequests;
      totals.commits += bucket.commits;
      totals.issues += bucket.issues;
      totals.linesChanged += bucket.linesChanged;
    });
    return totals;
  }

  private unionLogins(previous: string[], current: string[]): string[] {
    return [...new Set([...(previous ?? []), ...current])].sort();
  }

  // ── 落盘 ───────────────────────────────────────────────────

  private async persist(
    organizations: Organization[],
    contributions: OrganizationContribution[],
    authors: Map<string, ResolvedAuthor>,
    personAggregates: Map<string, MetricsAggregate>,
    mode: GithubCollectOptions['mode'],
  ): Promise<string[]> {
    const written: string[] = [];

    if (this.isMissingUnattributed(organizations)) {
      await this.organizations.update((current) =>
        this.isMissingUnattributed(current) ? [...current, this.createUnattributed()] : current,
      );
      written.push(this.organizations.label);
    }

    await this.contributions.write(contributions);
    written.push(this.contributions.label);

    // 账号级原子事实：orgId 是**采集口径**（aliases.github → emailDomains → null），
    // 自此只作兜底归属与审计线索；对外展示值一律由 API **读时派生**（ADR-0017 决策 4 / 13）。
    await this.contributors.update((current) =>
      this.mergeContributors(current, authors, personAggregates, mode),
    );
    written.push(this.contributors.label);

    // 独立开发者人数**不再由采集器回填**（ADR-0017 决策 13）：
    // 该指标已改为 API 读时派生（生效归属为 unattributed 且非机器人的账号数），
    // `home.json` 亦已移除该字段（schemaVersion 2）。采集器不再持有 HOME_REPOSITORY，
    // 职责收缩为「只写原子事实 + 基线快照」，不再承担展示口径的计算。

    return written;
  }

  private isMissingUnattributed(organizations: Organization[]): boolean {
    return !organizations.some((org) => org.orgId === ORG_UNATTRIBUTED);
  }

  /**
   * 在内存中确保存在独立开发者伪组织，供本轮聚合/贡献构造使用。
   * 已有档案时原样返回（引用不变），便于调用方判断是否需要落盘。
   */
  private withUnattributed(organizations: Organization[]): Organization[] {
    return this.isMissingUnattributed(organizations)
      ? [...organizations, this.createUnattributed()]
      : organizations;
  }

  /** 独立开发者伪组织档案（契约见 04 文档 §3.1） */
  private createUnattributed(): Organization {
    return {
      orgId: ORG_UNATTRIBUTED,
      name: UNATTRIBUTED_DISPLAY_NAME,
      logoUrl: '',
      homepageUrl: '',
      type: 'individual',
      tags: [UNATTRIBUTED_DISPLAY_NAME],
      description: '未归属到任何组织的独立贡献者聚合（伪组织）。',
    };
  }

  /**
   * 合并贡献者：保留人工维护字段（joinedAt / description），只补齐采集得到的字段。
   * GitHub 指标（ADR-0003）：本轮有记录 → 写入聚合结果（增量已含基线叠加）；
   * 本轮无记录 → 增量模式保留已入库指标，全量模式移除（与组织贡献"整体替换"语义对称）。
   */
  private mergeContributors(
    current: Contributor[],
    authors: Map<string, ResolvedAuthor>,
    personAggregates: Map<string, MetricsAggregate>,
    mode: GithubCollectOptions['mode'],
  ): Contributor[] {
    const merged = [...current];
    const index = new Map(merged.map((item, position) => [item.contributorId, position]));

    const metricsOf = (contributorId: string): AccountGithubMetrics | undefined => {
      const bucket = personAggregates.get(contributorId);
      if (!bucket) return undefined;
      // 仓库清单落盘（ADR-0017 决策 15）：组织级 repos 是去重数，只能由账号级清单取并集得出。
      // 账号级 repos 恒等于 repoIds.length（个人维度不再需要 repoFloor 兜底：集合已随业务文件自持，
      // 增量基线直接从中恢复，不依赖 .sync-state.json 的 personRepos）
      const repoIds = [...bucket.repos].sort();
      return {
        pullRequests: bucket.pullRequests,
        commits: bucket.commits,
        issues: bucket.issues,
        linesChanged: bucket.linesChanged,
        repos: repoIds.length,
        repoIds,
      };
    };

    authors.forEach((author, contributorId) => {
      const metrics = metricsOf(contributorId);
      const position = index.get(contributorId);
      if (position === undefined) {
        merged.push({
          contributorId: author.contributorId,
          githubId: author.githubId ?? 0,
          name: author.name,
          orgId: author.orgId,
          avatarUrl: author.avatarUrl,
          ...(metrics ? { github: metrics } : {}),
        });
        index.set(contributorId, merged.length - 1);
        return;
      }

      const existing = merged[position];
      const nextGithub = metrics ?? (mode === 'incremental' ? existing.github : undefined);
      const updated: Contributor = {
        ...existing,
        githubId: author.githubId ?? existing.githubId,
        // 人工维护过的名称/归属优先保留，避免采集覆盖人工校对结果
        name: existing.name || author.name,
        orgId: existing.orgId ?? author.orgId,
        avatarUrl: existing.avatarUrl || author.avatarUrl,
      };
      if (nextGithub) {
        updated.github = nextGithub;
      } else {
        delete updated.github;
      }
      merged[position] = updated;
    });

    // 全量模式：本轮无记录的人指标归零移除（含仅人工维护的档案），档案字段保留
    if (mode === 'full') {
      merged.forEach((item, position) => {
        if (!personAggregates.has(item.contributorId)) {
          delete merged[position].github;
        }
      });
    }

    return merged;
  }

  private logSummary(outcome: GithubCollectOutcome): void {
    this.logger.log(
      `聚合结果（mode=${outcome.mode}）：${outcome.orgCount} 个组织 / 带指标贡献者 ${outcome.personCount} 人（独立开发者 ${outcome.unattributedCount} 人）；` +
        `PR ${outcome.totals.pullRequests}，提交 ${outcome.totals.commits}，Issue ${outcome.totals.issues}，行数 ${outcome.totals.linesChanged}`,
    );
    this.logger.log(
      `归属判定：${outcome.emailAttributedCount} 人通过邮箱域名命中组织，其余按登录名别名或独立开发者兜底`,
    );
    if (outcome.untimedCount > 0) {
      this.logger.log(
        `本轮接受 ${outcome.recordCount - outcome.untimedCount} / ${outcome.recordCount} 条记录（拒绝 ${outcome.untimedCount} 条缺时间戳）`,
      );
    }
    if (outcome.truncated) {
      this.logger.warn('本轮结果已触及搜索结果上限，数据可能被截断（status=partial）');
    }
  }
}

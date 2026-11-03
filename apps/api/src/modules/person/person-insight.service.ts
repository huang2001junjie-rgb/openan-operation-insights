import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-code';
import {
  isBotAccount,
  ORG_UNATTRIBUTED,
  toConfluenceAccountViews,
} from '../../common/effective-org';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  deriveGithubFromEvents,
  filterEventsByRange,
} from '../../common/github-event-derivation';
import { toTimeRangeFilter } from '../../common/time-range';
import {
  ConfluenceAccount,
  ConfluenceMetrics,
  ConfluenceRequirementEvent,
  Contributor,
  GithubContributionEvent,
  GithubMetrics,
  IdentityClaim,
  Organization,
  Person,
  PersonAccountCandidateItem,
  PersonAccountItem,
  PersonCandidateItem,
  PersonConfluenceRequirementItem,
  PersonConfluenceRequirementsData,
  PersonContributionsData,
  PersonGithubEventItem,
  PersonGithubEventsData,
  PersonCandidatesData,
  PersonRepoBreakdownItem,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONFLUENCE_ACCOUNTS_REPOSITORY,
  CONFLUENCE_REQUIREMENTS_REPOSITORY,
  CONTRIBUTORS_REPOSITORY,
  GITHUB_EVENTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import {
  PersonContributionsQueryDto,
  PersonConfluenceRequirementsQueryDto,
  PersonGithubEventsQueryDto,
} from './dto/person-query.dto';

/** 事件明细默认返回上限（契约默认 limit=500，超限返回 truncated=true） */
const DEFAULT_EVENTS_LIMIT = 500;

/** 账号键归一（与 effective-org / 派生层同一口径：trim + 小写） */
function accountKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 个人模式读时派生（ADR-0020）：自然人 / 单账号两种口径的三组端点。
 *
 * 与 identity 模块同款装配：`RepositoriesModule` 为 `@Global()`，直接注入仓储，
 * **不新增数据文件、不预聚合**——所有数字都从既有原子事实现场派生：
 *
 * - 名下账号集合 = `identity-claims.json` 认领边按 personId 过滤（多对多，允许一个账号
 *   被多个自然人认领 → 账号视图的「所属自然人」可能是多个）；
 * - GitHub 侧走 `deriveGithubFromEvents`（组织级/账号级/仓库级同一实现，D1 收敛），
 *   **repos 取名下账号 repoIds 的并集**——绝不能把各账号 repos 求和
 *   （同一仓库两人协作会被数两次，ADR-0017 决策 15 的教训在自然人维度重演）；
 * - Confluence 账号级恒全历史（无日期维度，ADR-0018 决策 5）；需求级事实同样恒全历史；
 * - 明细 URL 一律**读时派生**、不落盘（站点地址不进数据文件）。
 */
@Injectable()
export class PersonInsightService {
  private readonly logger = new Logger(PersonInsightService.name);

  constructor(
    @Inject(GITHUB_EVENTS_REPOSITORY)
    private readonly events: JsonRepository<GithubContributionEvent[]>,
    @Inject(CONTRIBUTORS_REPOSITORY)
    private readonly dossiers: JsonRepository<Contributor[]>,
    @Inject(CONFLUENCE_ACCOUNTS_REPOSITORY)
    private readonly confluenceAccounts: JsonRepository<ConfluenceAccount[]>,
    @Inject(CONFLUENCE_REQUIREMENTS_REPOSITORY)
    private readonly requirementFacts: JsonRepository<ConfluenceRequirementEvent[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly claims: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly persons: JsonRepository<Person[]>,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizations: JsonRepository<Organization[]>,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/person-contributions（04 §5.3.19）：自然人一屏画像的数据面。
   * GitHub 跟随 from/to（半开区间），Confluence 恒全历史。
   */
  async getPersonContributions(
    query: PersonContributionsQueryDto,
  ): Promise<PersonContributionsData> {
    const [eventsFile, dossiersFile, claimsFile, personsFile, orgsFile, cfAccountsFile] =
      await Promise.all([
        this.events.read(),
        this.dossiers.read(),
        this.claims.read(),
        this.persons.read(),
        this.organizations.read(),
        this.confluenceAccounts.read(),
      ]);
    const { claims, persons } = { claims: claimsFile.data, persons: personsFile.data };

    const person = findPerson(persons, query.personId);
    const range = toTimeRangeFilter(query.from, query.to);
    const rangedEvents = filterEventsByRange(eventsFile.data, range);

    const { views, warnings } = deriveGithubFromEvents({
      events: rangedEvents,
      accounts: dossiersFile.data,
      claims,
      persons,
    });
    for (const warning of warnings) this.logger.warn(warning);
    const personViews = views.filter((view) => view.personId === person.personId);

    // repos 必须是名下账号 repoIds 的**并集**（决策见类注释）
    const repoIds = [...new Set(personViews.flatMap((view) => view.github.repoIds))].sort();
    const githubTotals: Omit<GithubMetrics, 'repos'> = {
      pullRequests: 0,
      commits: 0,
      issues: 0,
      linesChanged: 0,
    };
    for (const view of personViews) {
      githubTotals.pullRequests += view.github.pullRequests;
      githubTotals.commits += view.github.commits;
      githubTotals.issues += view.github.issues;
      githubTotals.linesChanged += view.github.linesChanged;
    }

    // 仓库分布：对该自然人的事件子集再走一次同一派生实现（单实现来源，禁止另写聚合）
    const loginKeys = new Set(personViews.map((view) => accountKey(view.contributorId)));
    const personEvents = rangedEvents.filter(
      (event) => event.author && loginKeys.has(accountKey(event.author.login)),
    );
    const { repos } = deriveGithubFromEvents({
      events: personEvents,
      accounts: dossiersFile.data,
      claims,
      persons,
    });
    const repoBreakdown: PersonRepoBreakdownItem[] = repos
      .map((repo) => ({ repoId: repo.repoId, github: repo.github }))
      .sort((a, b) => b.github.commits - a.github.commits || a.repoId.localeCompare(b.repoId));

    const { views: cfViews, warnings: cfWarnings } = toConfluenceAccountViews(
      cfAccountsFile.data,
      claims,
      persons,
    );
    for (const warning of cfWarnings) this.logger.warn(warning);
    const personCfViews = cfViews.filter((view) => view.personId === person.personId);

    const cfMetrics: ConfluenceMetrics = { requirements: 0, topicShares: 0, edits: 0 };
    let cfUpdatedAt: string | null = null;
    for (const view of personCfViews) {
      cfMetrics.requirements += view.confluence.requirements;
      cfMetrics.topicShares += view.confluence.topicShares;
      cfMetrics.edits += view.confluence.edits;
      if (cfUpdatedAt === null || view.updatedAt > cfUpdatedAt) cfUpdatedAt = view.updatedAt;
    }

    const orgNameById = new Map(orgsFile.data.map((org) => [org.orgId, org.name]));
    const nameOfOrg = (orgId: string): string | null =>
      orgId === ORG_UNATTRIBUTED ? null : (orgNameById.get(orgId) ?? null);

    const githubItems: PersonAccountItem[] = personViews
      .map((view) => ({
        source: 'github' as const,
        accountKey: view.contributorId,
        displayName: view.name,
        ...(view.avatarUrl ? { avatarUrl: view.avatarUrl } : {}),
        effectiveOrgId: view.effectiveOrgId,
        effectiveOrgName: nameOfOrg(view.effectiveOrgId),
        orgSource: view.orgSource,
        isBot: isBotAccount(view),
        github: view.github,
      }))
      .sort(
        (a, b) =>
          (b.github?.commits ?? 0) - (a.github?.commits ?? 0) ||
          a.accountKey.localeCompare(b.accountKey),
      );
    const confluenceItems: PersonAccountItem[] = personCfViews
      .map((view) => ({
        source: 'confluence' as const,
        accountKey: view.accountId,
        displayName: view.displayName,
        effectiveOrgId: view.effectiveOrgId,
        effectiveOrgName: nameOfOrg(view.effectiveOrgId),
        orgSource: view.orgSource,
        isBot: false as const,
        confluence: view.confluence,
      }))
      .sort(
        (a, b) =>
          (b.confluence?.requirements ?? 0) - (a.confluence?.requirements ?? 0) ||
          a.accountKey.localeCompare(b.accountKey),
      );

    return {
      person,
      orgName: person.orgId ? (orgNameById.get(person.orgId) ?? null) : null,
      // 自然人生效归属（读时派生，不落盘）：orgId 非空取档案值（'person'）；
      // 为空回落伪组织 unattributed（'account'）——名下账号各自归属在 accounts 分解里展示，不强行合并
      effectiveOrgId: person.orgId ?? ORG_UNATTRIBUTED,
      orgSource: person.orgId ? ('person' as const) : ('account' as const),
      github: {
        metrics: { ...githubTotals, repos: repoIds.length },
        repoIds,
        repoBreakdown,
        updatedAt: personViews.length > 0 ? eventsFile.updatedAt : null,
      },
      confluence: { metrics: cfMetrics, updatedAt: cfUpdatedAt },
      accounts: [...githubItems, ...confluenceItems],
    };
  }

  /**
   * GET /api/person-github-events（04 §5.3.20）：名下（或指定账号）事件明细下钻。
   * 半开区间 [from, to)，timestamp 倒序；超过 limit 截断并声明 truncated。
   */
  async getPersonGithubEvents(query: PersonGithubEventsQueryDto): Promise<PersonGithubEventsData> {
    const [eventsFile, dossiersFile, claimsFile, personsFile] = await Promise.all([
      this.events.read(),
      this.dossiers.read(),
      this.claims.read(),
      this.persons.read(),
    ]);

    const range = toTimeRangeFilter(query.from, query.to);
    const rangedEvents = filterEventsByRange(eventsFile.data, range);
    const loginKeys = resolveGithubLoginKeys(
      query,
      rangedEvents,
      dossiersFile.data,
      claimsFile.data,
      personsFile.data,
    );

    const matched = rangedEvents.filter(
      (event) =>
        event.author &&
        (loginKeys.has(accountKey(event.author.login)) ||
          loginKeys.has(String(event.author.githubId ?? ''))),
    );
    // timestamp 倒序；并列时 repository 升序 + number 升序，保证翻页/截断的确定性
    matched.sort(
      (a, b) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
        a.repository.localeCompare(b.repository) ||
        a.number - b.number,
    );

    const limit = query.limit ?? DEFAULT_EVENTS_LIMIT;
    const total = matched.length;
    const truncated = total > limit;
    const events: PersonGithubEventItem[] = matched
      .slice(0, limit)
      .map((event) => ({ ...event, url: githubEventUrl(event) }));
    return { events, total, limit, truncated };
  }

  /**
   * GET /api/person-confluence-requirements（04 §5.3.21）：需求级事实明细下钻。
   * **恒全历史**（事实无日期维度），故没有 from/to；URL 读时派生。
   */
  async getPersonConfluenceRequirements(
    query: PersonConfluenceRequirementsQueryDto,
  ): Promise<PersonConfluenceRequirementsData> {
    // 需求事实文件本期新建：重跑 collect:wiki 前可能缺失（或只有空信封）。
    // 「尚未采集」是预期状态而非故障——降级为空清单（前端渲染「待采集」空态），不抛 50001；
    // 结构性损坏（校验失败 / 信封非法）仍照常报错，不静默吞掉
    let facts: ConfluenceRequirementEvent[] = [];
    let factsUpdatedAt: string | null = null;
    try {
      const factsFile = await this.requirementFacts.read();
      facts = factsFile.data;
      factsUpdatedAt = factsFile.updatedAt;
    } catch (error) {
      if (
        error instanceof DomainException &&
        error.message.includes('数据文件缺失')
      ) {
        this.logger.warn(
          'confluence-requirements.json 尚未采集：person-confluence-requirements 返回空清单（待采集空态），重跑 collect:wiki 后自动填充',
        );
      } else {
        throw error;
      }
    }

    const [cfAccountsFile, claimsFile, personsFile] = await Promise.all([
      this.confluenceAccounts.read(),
      this.claims.read(),
      this.persons.read(),
    ]);

    let accountKeys: ReadonlySet<string>;
    if (query.account?.trim()) {
      accountKeys = new Set([accountKey(query.account)]);
    } else {
      const person = findPerson(personsFile.data, query.personId ?? '');
      const { views } = toConfluenceAccountViews(
        cfAccountsFile.data,
        claimsFile.data,
        personsFile.data,
      );
      accountKeys = new Set(
        views
          .filter((view) => view.personId === person.personId)
          .map((view) => accountKey(view.accountId)),
      );
    }

    const displayNameByKey = new Map(
      cfAccountsFile.data.map((account) => [accountKey(account.accountId), account.displayName]),
    );
    // 站点根地址来自配置（尾部斜杠已在 configuration.ts 归一）；未配置时 url 置空串，前端不渲染链接
    const baseUrl = this.config.get<string>('confluence.baseUrl') ?? '';

    const requirements: PersonConfluenceRequirementItem[] = facts
      .filter((fact) => accountKeys.has(accountKey(fact.accountId)))
      .map((fact) => ({
        ...fact,
        url: baseUrl
          ? `${baseUrl}/wiki/pages/viewpage.action?pageId=${encodeURIComponent(fact.pageId)}`
          : '',
        displayName: displayNameByKey.get(accountKey(fact.accountId)) ?? fact.accountId,
      }));

    return { requirements, total: requirements.length, updatedAt: factsUpdatedAt };
  }

  /**
   * GET /api/person-candidates（04 §5.3.22）：个人模式选择器候选。
   * 只列「有贡献」的实体——GitHub 账号取事件派生的账号视图（区间恒全历史），Confluence 账号取
   * 账号级事实表（入表即 ≥1 次命中）；自然人取其名下认领账号至少一个有贡献者。
   * 账号候选附认领自然人（多对多，全列），供账号视图「切换到所属自然人」入口。
   */
  async getPersonCandidates(): Promise<PersonCandidatesData> {
    const [eventsFile, dossiersFile, claimsFile, personsFile, orgsFile, cfAccountsFile] =
      await Promise.all([
        this.events.read(),
        this.dossiers.read(),
        this.claims.read(),
        this.persons.read(),
        this.organizations.read(),
        this.confluenceAccounts.read(),
      ]);
    const { claims, persons } = { claims: claimsFile.data, persons: personsFile.data };

    // GitHub 账号候选：全历史事件派生（选择器与区间无关，账号是否有贡献按全历史判定）
    const { views: ghViews } = deriveGithubFromEvents({
      events: eventsFile.data,
      accounts: dossiersFile.data,
      claims,
      persons,
    });
    // 认领边 GitHub 侧的 accountKey 是 githubId 字符串，而账号视图按 login 键控——
    // 先把 githubId 解析回 login（账号档案优先、其次事件作者，与派生层口径一致），
    // 否则「自然人是否有 GitHub 贡献」与「账号候选的认领自然人」会双双落空
    const githubLoginById = new Map<string, string>();
    for (const event of eventsFile.data) {
      if (event.author && !githubLoginById.has(String(event.author.githubId ?? ''))) {
        githubLoginById.set(String(event.author.githubId ?? ''), accountKey(event.author.login));
      }
    }
    for (const dossier of dossiersFile.data) {
      githubLoginById.set(String(dossier.githubId), accountKey(dossier.contributorId));
    }
    // Confluence 账号候选：账号级事实表 + 生效归属派生
    const { views: cfViews } = toConfluenceAccountViews(cfAccountsFile.data, claims, persons);

    const orgNameById = new Map(orgsFile.data.map((org) => [org.orgId, org.name]));
    const nameOfOrg = (orgId: string): string | null =>
      orgId === ORG_UNATTRIBUTED ? null : (orgNameById.get(orgId) ?? null);
    const personNameById = new Map(persons.map((p) => [p.personId, p.displayName]));

    const contributingLogins = new Set(ghViews.map((view) => accountKey(view.contributorId)));
    const contributingCfKeys = new Set(cfViews.map((view) => accountKey(view.accountId)));
    const githubClaimantsByLogin = new Map<string, { personId: string; displayName: string }[]>();
    for (const claim of claims) {
      if (claim.source !== 'github') continue;
      const login = githubLoginById.get(accountKey(claim.accountKey));
      if (!login) continue;
      const list = githubClaimantsByLogin.get(login) ?? [];
      list.push({
        personId: claim.personId,
        displayName: personNameById.get(claim.personId) ?? claim.personId,
      });
      githubClaimantsByLogin.set(login, list);
    }
    const personHasGithub = new Set<string>();
    const personHasConfluence = new Set<string>();
    const confluenceClaimantsByKey = new Map<string, { personId: string; displayName: string }[]>();
    for (const claim of claims) {
      if (claim.source === 'github') {
        const login = githubLoginById.get(accountKey(claim.accountKey));
        if (login && contributingLogins.has(login)) personHasGithub.add(claim.personId);
        continue;
      }
      if (claim.source === 'confluence') {
        const key = accountKey(claim.accountKey);
        const list = confluenceClaimantsByKey.get(key) ?? [];
        list.push({
          personId: claim.personId,
          displayName: personNameById.get(claim.personId) ?? claim.personId,
        });
        confluenceClaimantsByKey.set(key, list);
        if (contributingCfKeys.has(key)) personHasConfluence.add(claim.personId);
      }
    }

    const personsOut: PersonCandidateItem[] = persons
      .filter((p) => personHasGithub.has(p.personId) || personHasConfluence.has(p.personId))
      .map((p) => ({
        personId: p.personId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl ?? null,
        effectiveOrgId: p.orgId ?? ORG_UNATTRIBUTED,
        orgName: p.orgId ? nameOfOrg(p.orgId) : null,
        github: personHasGithub.has(p.personId),
        confluence: personHasConfluence.has(p.personId),
      }));

    const githubAccounts: PersonAccountCandidateItem[] = ghViews.map((view) => ({
      source: 'github',
      accountKey: view.contributorId,
      displayName: view.name,
      avatarUrl: view.avatarUrl ?? null,
      isBot: isBotAccount(view),
      effectiveOrgId: view.effectiveOrgId,
      orgName: nameOfOrg(view.effectiveOrgId),
      persons: githubClaimantsByLogin.get(accountKey(view.contributorId)) ?? [],
    }));
    const confluenceAccounts: PersonAccountCandidateItem[] = cfViews.map((view) => ({
      source: 'confluence',
      accountKey: view.accountId,
      displayName: view.displayName,
      avatarUrl: null,
      isBot: false,
      effectiveOrgId: view.effectiveOrgId,
      orgName: nameOfOrg(view.effectiveOrgId),
      persons: confluenceClaimantsByKey.get(accountKey(view.accountId)) ?? [],
    }));

    return {
      persons: personsOut,
      githubAccounts,
      confluenceAccounts,
      updatedAt: eventsFile.updatedAt,
    };
  }
}

/** 自然人必须存在（40403）；personId/account 二选一的口径校验在 DTO 层（40001） */
function findPerson(persons: Person[], personId: string): Person {
  const person = persons.find((entry) => entry.personId === personId.trim());
  if (!person) {
    throw new DomainException(ErrorCode.PERSON_NOT_FOUND, `自然人不存在：${personId}`);
  }
  return person;
}

/**
 * personId → 名下 GitHub login 集合：走 `deriveGithubFromEvents` 同一派生实现
 * （认领边 githubId → 事件作者匹配，覆盖「无账号档案但事件带 githubId」的注销账号）。
 *
 * account 模式则收「login 小写 + githubId 原样」双键：匹配时两口径都试
 * （认领边 accountKey 是 githubId 字符串，候选池给的是 login，两者都应能查）。
 */
function resolveGithubLoginKeys(
  query: PersonGithubEventsQueryDto,
  rangedEvents: GithubContributionEvent[],
  dossiers: Contributor[],
  claims: IdentityClaim[],
  persons: Person[],
): ReadonlySet<string> {
  if (query.account?.trim()) {
    const raw = query.account.trim();
    return new Set([accountKey(raw), raw]);
  }
  const person = findPerson(persons, query.personId ?? '');
  const { views } = deriveGithubFromEvents({ events: rangedEvents, accounts: dossiers, claims, persons });
  return new Set(
    views
      .filter((view) => view.personId === person.personId)
      .map((view) => accountKey(view.contributorId)),
  );
}

/** PR → /pull/{number}，Issue → /issues/{number}（GitHub 站内两种对象的真实路径） */
function githubEventUrl(event: GithubContributionEvent): string {
  const kind = event.kind === 'pullRequest' ? 'pull' : 'issues';
  return `https://github.com/${event.repository}/${kind}/${event.number}`;
}

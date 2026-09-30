import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConfluenceAccount,
  ConfluenceMetrics,
  ConfluenceOrgSource,
  IdentityClaim,
  Organization,
  OrganizationWiki,
  Person,
} from '../../contract/entities';
import { buildConfluenceClaimIndex, type ConfluenceClaimIndex } from '../../common/effective-org';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONFLUENCE_ACCOUNTS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
  PERSONS_REPOSITORY,
  WIKI_REPOSITORY,
} from '../../repositories/repository.tokens';
import { ORG_UNATTRIBUTED } from '../collector.constants';
import {
  CONFLUENCE_UNATTRIBUTED_LIMIT,
  CONFLUENCE_UNRESOLVED_LIMIT,
  DEFAULT_MINUTES_AGENDA_HEADING,
  DEFAULT_MINUTES_PARENT_PATTERN,
  DEFAULT_MINUTES_TITLE_PATTERN,
  DEFAULT_REQUIREMENT_ANCESTOR_TITLE,
  DEFAULT_REQUIREMENT_CONTACT_COLUMN,
  DEFAULT_REQUIREMENT_PAGE_TITLE,
  DEFAULT_REQUIREMENT_TITLE_COLUMN,
} from './confluence.constants';
import { CONFLUENCE_SOURCE } from '../collector.tokens';
import { parseAgendaShares, parseRequirementContacts } from './confluence-content.parser';
import type {
  ConfluencePageRecord,
  ConfluencePageVersionRecord,
  ConfluenceSource,
} from './confluence-source.port';
import {
  buildConfluenceReport,
  renderConfluenceReport,
  type ConfluenceReport,
} from './confluence-report';
import { writeConfluenceSnapshot } from './confluence-snapshot';
import { ConfluenceStateStore } from './confluence-state.store';
import type {
  ConfluenceSyncState,
  UnattributedAccount,
  UnresolvedContact,
} from './confluence-state.store';

export interface ConfluenceCollectOptions {
  /**
   * 恒为 full。Confluence 聚合是**全量替换**语义（按 orgId 整体重写 confluence-organizations.json），
   * 只取增量页面会把未变更页面的计数一起洗掉；安全增量需按页账本，尚未实现（见 ADR-0009）。
   */
  mode: 'full';
  /** 只计算不落盘（业务数据与状态文件都不写），用于首次接入前核对口径 */
  dryRun: boolean;
  /** 只取数 + 解析 + 落快照 + 出口径摘要，不写 confluence-organizations.json 与账号级文件 */
  reportOnly: boolean;
  /** 是否落抽取快照（reportOnly 下强制为 true） */
  writeSnapshot: boolean;
}

export interface ConfluenceCollectOutcome {
  mode: 'full';
  pageCount: number;
  requestCount: number;
  /** 命中「需求」来源页选择器的页面数 */
  requirementPageCount: number;
  /** 命中会议纪要页选择器的页面数 */
  minutesPageCount: number;
  /** 会议纪要里找不到 Agenda 段的页数（口径自检：正常应为 0） */
  minutesWithoutAgendaCount: number;
  /** 需求表格的数据行数（不参与计数，仅观测） */
  requirementRowCount: number;
  /** 版本历史总条数（含创建版本与无法归属的版本，仅观测；口径见 ADR-0011） */
  editVersionCount: number;
  /** 有版本历史的页面数（仅观测） */
  editedPageCount: number;
  totals: ConfluenceMetrics;
  /** 落入伪组织（独立开发者）的量 */
  unattributed: ConfluenceMetrics;
  accountCount: number;
  unattributedAccountCount: number;
  unresolvedContactCount: number;
  orgCount: number;
  report: ConfluenceReport;
  written: string[];
}

/** 解析后的口径选择器（正则已编译，调用方不再处理默认值） */
interface ResolvedCriteria {
  requirementPageTitle: string;
  requirementAncestorTitle: string;
  requirementContactColumn: string;
  requirementTitleColumn: string;
  minutesParentPattern: RegExp;
  minutesTitlePattern: RegExp;
  minutesAgendaHeading: string;
}

/** 账号级聚合中间态 */
interface AccountGroup {
  accountId: string;
  displayName: string;
  requirements: number;
  topicShares: number;
  /** 该账号作为**页面版本作者**的次数（含创建那一次，见 ADR-0011） */
  edits: number;
  /** 该账号出现过的空间 key（供空间兜底判定） */
  spaces: Set<string>;
}

/** 正文解析产物（聚合的输入） */
interface ParsedContent {
  groups: Map<string, AccountGroup>;
  /** accountId → 正文里读到的展示名（ri:username） */
  displayHints: Map<string, string>;
  /** pageId → 该需求页解析出的联系人账号（快照留档用，不参与计数） */
  pageContacts: Map<string, string[]>;
  /** pageId → 该期会议解析出的议题分享人（快照留档用，不参与计数） */
  pageSharers: Map<string, string[]>;
  /** pageId → 该页版本作者（编辑量口径的行级事实，升序去重；快照留档用） */
  pageEditors: Map<string, string[]>;
  requirementRowCount: number;
  requirementContactCount: number;
  topicShareCount: number;
  /** 版本历史总条数（含无法归属的版本） */
  editVersionCount: number;
  /** 可归属到账号的版本条数（= 账号级 edits 合计，校验基准） */
  attributableEditCount: number;
  /** 有版本历史的页面数 */
  editedPageCount: number;
  /** Agenda 段内 @ 的原始处数（未按期去重；与 topicShareCount 的差值即同期重复提及数） */
  topicShareMentionCount: number;
  minutesWithoutAgenda: string[];
  unresolvedContacts: UnresolvedContact[];
  /** 未取到正文、本轮按缺页跳过的页面标题（非空说明有权限问题） */
  missingBodies: string[];
}

/**
 * Confluence 采集器（见 05 文档第 3 章）。
 *
 * 读写分离：与 GitHub 采集器并列，是 `data/confluence-organizations.json` 的**唯一**写入方；
 * API 请求链路只读落盘数据。
 *
 * 粒度（ADR-0008 / ADR-0010）：产出**两个粒度**，真相只有一处 ——
 * 1. 账号级 `confluence-accounts.json`：按 Confluence 账号聚合的**原子事实**；
 * 2. 组织级 `confluence-organizations.json`：由账号级按 `orgId` **派生**的投影视图。
 * 两者同轮整体替换；组织级不再独立统计，从构造上消除双写漂移。
 *
 * 注意（ADR-0010）：这里的 `orgId` / `orgSource` 与组织级投影都是**采集口径**，
 * 组织级文件已**降级为基线快照**——接口一律按读时派生的生效归属（人工认领优先）计算，
 * 见 `common/effective-org.ts`。故补认领边后活跃页立即生效，无需重跑本采集器。
 *
 * 两个维度的取数口径（2026-09-28 对真实空间只读实测定稿，见 ADR-0009）：
 *
 * - **需求 requirements**：`Releases > Release Planning > <release> > Requirement Proposal`
 *   页面里唯一表格的 `Contacts` 列，**每个 @ 提及各算 1 条**（一行两位联系人则各得 1 条）。
 *   只用结构选页（标题 + 祖先链），不用标签：实测空间里不存在任何需求标签。
 * - **议题分享 topicShares**：会议纪要页 `Agenda` 段**内**的 @（段落与表格行都算），**按期去重**
 *   （同一期同一账号最多 1 次）。不取该页其它位置的 @：`Attendees & Representation`
 *   段的 @ 是出席签到，占全页 80%，取错会变成"出席次数"。
 *
 * 归属规则（**采集口径**，顺序即优先级，ADR-0010）：
 * 1. `aliases.confluence` 精确匹配 accountId 或展示名 → `orgSource='alias'`；
 * 2. 空间兜底：该账号的全部计数都落在同一个被 `aliases.confluence` 认领的空间内 → `orgSource='space'`；
 * 3. 都未命中即归入伪组织 → `orgSource='unattributed'`。
 *
 * **认领边不再参与这里的归属裁决**（已移出到读时派生层，ADR-0010）；本采集器只用认领边写
 * 账号级 `personId` 快照。先跑通、再看数据补别名/认领边，而不是先臆造映射。
 */
@Injectable()
export class ConfluenceCollectorService {
  private readonly logger = new Logger(ConfluenceCollectorService.name);

  constructor(
    @Inject(CONFLUENCE_SOURCE) private readonly source: ConfluenceSource,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizations: JsonRepository<Organization[]>,
    @Inject(WIKI_REPOSITORY)
    private readonly wiki: JsonRepository<OrganizationWiki[]>,
    @Inject(CONFLUENCE_ACCOUNTS_REPOSITORY)
    private readonly accounts: JsonRepository<ConfluenceAccount[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly identityClaims: JsonRepository<IdentityClaim[]>,
    @Inject(PERSONS_REPOSITORY)
    private readonly persons: JsonRepository<Person[]>,
    private readonly stateStore: ConfluenceStateStore,
    private readonly config: ConfigService,
  ) {}

  async run(options: ConfluenceCollectOptions): Promise<ConfluenceCollectOutcome> {
    const startedAt = new Date().toISOString();
    const spaces = this.config.get<string[]>('confluence.spaces') ?? [];
    const criteria = this.readCriteria();

    this.logger.log(
      `采集开始：mode=${options.mode} source=${this.source.label} spaces=${spaces.join(', ') || '(未配置)'}`,
    );
    this.logger.log(`口径 · 需求：${this.describeRequirementCriteria(criteria)}`);
    this.logger.log(`口径 · 议题分享：${this.describeMinutesCriteria(criteria)}`);

    // since 恒为 null：全量重算。采集源保留了 since 能力，将来实现按页账本时再启用
    const fetched = await this.source.fetch({ since: null, spaces });
    let requestCount = fetched.requestCount;

    const report = buildConfluenceReport(fetched.pages);
    this.logConfluenceReport(report, this.describeCriteria(criteria));

    const requirementPages = this.selectRequirementPages(fetched.pages, criteria);
    const minutesPages = this.selectMinutesPages(fetched.pages, criteria);
    this.logger.log(
      `页面选择：需求页 ${requirementPages.length} 页、会议纪要页 ${minutesPages.length} 页（空间内共 ${fetched.pages.length} 页）`,
    );
    if (requirementPages.length === 0) {
      this.logger.warn(
        '未选到任何需求页：标题/祖先链口径可能与实际不符（可调 CONFLUENCE_REQUIREMENT_PAGE_TITLE / _ANCESTOR_TITLE）',
      );
    }
    if (minutesPages.length === 0) {
      this.logger.warn(
        '未选到任何会议纪要页：父页/标题模式可能与实际不符（可调 CONFLUENCE_MINUTES_PARENT_PATTERN / _TITLE_PATTERN）',
      );
    }

    // 编辑量（ADR-0011）：版本历史覆盖**空间内全部页面**，因此先取版本、再据此定正文范围
    const allPageIds = fetched.pages.map((page) => page.pageId);
    const versionResult = await this.source.fetchPageVersions(allPageIds);
    requestCount += versionResult.requestCount;

    const pageSpaceKeys = new Map(fetched.pages.map((page) => [page.pageId, page.spaceKey]));
    const pageTitleById = new Map(fetched.pages.map((page) => [page.pageId, page.title]));
    // 补名差集：v2 版本接口只给 authorId，展示名只能从正文渲染视图里换出来；
    // 故把"尚无名字来源的作者"编辑过的页也并入正文请求，避免为补名多跑一轮全量正文
    const unnamedAuthorIds = this.selectUnnamedVersionAuthors(
      versionResult.versions,
      this.collectCreatorNames(fetched.pages),
    );
    const bodyTargets = this.selectBodyTargetPages({
      requirementPages,
      minutesPages,
      versions: versionResult.versions,
      unnamedAuthorIds,
    });
    if (bodyTargets.extraIds.length > 0) {
      this.logger.log(
        `补名：${unnamedAuthorIds.size} 位版本作者暂无名字来源，额外拉取 ${bodyTargets.extraIds.length} 页正文以换取展示名`,
      );
    }

    // 正文只对目标页按需拉取（需求页 + 纪要页 + 补名差集），不做全空间展开
    const bodyResult = await this.source.fetchPageBodies(bodyTargets.targetIds);
    requestCount += bodyResult.requestCount;

    const parsed = this.parseContent({
      requirementPages,
      minutesPages,
      bodies: bodyResult.bodies,
      versions: versionResult.versions,
      pageSpaceKeys,
      criteria,
    });
    this.logParsedContent(parsed);

    if (options.reportOnly) {
      return this.finishReportOnly(options, {
        pages: fetched.pages,
        requestCount,
        requirementPages,
        minutesPages,
        parsed,
        report,
        spaces,
        criteria,
      });
    }

    const organizations = (await this.organizations.read()).data;
    const aliasIndex = this.buildConfluenceAliasIndex(organizations);
    const spaceOrgIndex = this.buildSpaceOrgIndex(aliasIndex, spaces);
    // 认领边只用于写账号级 personId 快照；归属裁决在读时派生层（ADR-0010）
    const { index: claimIndex, warnings: claimWarnings } = buildConfluenceClaimIndex(
      (await this.identityClaims.read()).data,
      (await this.persons.read()).data,
    );
    for (const warning of claimWarnings) this.logger.warn(warning);
    this.logger.log(
      `身份认领索引：confluence 认领边 ${claimIndex.personByKey.size} 条（其中带组织归属 ${claimIndex.orgByKey.size} 条）`,
    );

    const resolved = await this.resolveAccounts({
      parsed,
      pages: fetched.pages,
      renderedUserNames: bodyResult.renderedUserNames,
      aliasIndex,
      spaceOrgIndex,
      claimIndex,
    });
    requestCount += resolved.requestCount;

    this.logUnattributed(resolved.unattributedAccounts);

    const previous = (await this.wiki.read()).data;
    const nextWiki = this.buildWiki(organizations, resolved.counts, new Date().toISOString());

    this.validate({
      pageCount: fetched.pages.length,
      requirementPageCount: requirementPages.length,
      minutesPageCount: minutesPages.length,
      minutesWithoutAgendaCount: parsed.minutesWithoutAgenda.length,
      requirementContactCount: parsed.requirementContactCount,
      topicShareCount: parsed.topicShareCount,
      editVersionCount: parsed.editVersionCount,
      attributableEditCount: parsed.attributableEditCount,
      editedPageCount: parsed.editedPageCount,
      accounts: resolved.accounts,
      counts: resolved.counts,
      previous,
    });

    const outcome: ConfluenceCollectOutcome = {
      mode: options.mode,
      pageCount: fetched.pages.length,
      requestCount,
      requirementPageCount: requirementPages.length,
      minutesPageCount: minutesPages.length,
      minutesWithoutAgendaCount: parsed.minutesWithoutAgenda.length,
      requirementRowCount: parsed.requirementRowCount,
      editVersionCount: parsed.editVersionCount,
      editedPageCount: parsed.editedPageCount,
      totals: this.sumTotals(nextWiki),
      unattributed: resolved.unattributed,
      accountCount: resolved.accounts.length,
      unattributedAccountCount: resolved.accounts.filter((item) => item.orgId === null).length,
      unresolvedContactCount: parsed.unresolvedContacts.length,
      orgCount: nextWiki.length,
      report,
      written: [],
    };

    this.logSummary(outcome);

    if (options.dryRun) {
      this.logger.warn('dry-run：未写入任何文件');
      return outcome;
    }

    if (options.writeSnapshot) {
      outcome.written.push(
        await writeConfluenceSnapshot({
          dataDir: this.config.getOrThrow<string>('dataDir'),
          pages: fetched.pages,
          spaces,
          criteria: this.describeCriteria(criteria),
          derived: {
            requirementPages: requirementPages.map((page) => ({
              pageId: page.pageId,
              title: page.title,
              contacts: [...(parsed.pageContacts.get(page.pageId) ?? [])],
            })),
            minutesPages: minutesPages.map((page) => ({
              pageId: page.pageId,
              title: page.title,
              topicSharers: [...(parsed.pageSharers.get(page.pageId) ?? [])],
            })),
            // 编辑量是**全空间**口径（不止需求页/纪要页），故单独留一份行级事实供人工核对
            pageEdits: [...parsed.pageEditors.entries()].map(([pageId, editors]) => ({
              pageId,
              title: pageTitleById.get(pageId) ?? '',
              editors,
            })),
          },
        }),
      );
    }

    // 先落账号级（原子事实）、再落组织级（派生投影）：任一步失败，下一轮全量重跑即可收敛
    await this.accounts.write(resolved.accounts);
    outcome.written.push(this.accounts.label);

    await this.wiki.write(nextWiki);
    outcome.written.push(this.wiki.label);

    const previousState = await this.stateStore.read();
    const nextState: ConfluenceSyncState = {
      ...previousState,
      schemaVersion: 2,
      lastSyncAt: startedAt,
      lastRunAt: startedAt,
      lastMode: options.mode,
      status: 'success',
      pageCount: fetched.pages.length,
      requestCount,
      accountCount: resolved.accounts.length,
      spaces,
      requirementPageCount: requirementPages.length,
      minutesPageCount: minutesPages.length,
      editVersionCount: parsed.editVersionCount,
      minutesWithoutAgenda: parsed.minutesWithoutAgenda.slice(0, CONFLUENCE_UNATTRIBUTED_LIMIT),
      unattributedAccounts: resolved.unattributedAccounts.slice(0, CONFLUENCE_UNATTRIBUTED_LIMIT),
      unresolvedContacts: parsed.unresolvedContacts.slice(0, CONFLUENCE_UNRESOLVED_LIMIT),
    };
    delete nextState.lastError;

    await this.stateStore.write(nextState);
    outcome.written.push(this.stateStore.label);

    this.logger.log(`采集完成，已写入：${outcome.written.join(', ')}`);
    return outcome;
  }

  /** 失败收尾：只记录状态，绝不清空既有业务数据 */
  async recordFailure(options: ConfluenceCollectOptions, error: Error): Promise<void> {
    const previous = await this.stateStore.read();
    await this.stateStore.write({
      ...previous,
      schemaVersion: 2,
      lastRunAt: new Date().toISOString(),
      lastMode: options.mode,
      status: 'failed',
      lastError: error.message,
    });
  }

  // ── 口径 ───────────────────────────────────────────────────

  /** 读取配置并套用内置默认（配置项为"留空取默认"，改口径不必改代码） */
  private readCriteria(): ResolvedCriteria {
    const read = (key: string, fallback: string): string =>
      this.config.get<string>(`confluence.${key}`)?.trim() || fallback;

    return {
      requirementPageTitle: read('requirementPageTitle', DEFAULT_REQUIREMENT_PAGE_TITLE),
      requirementAncestorTitle: read(
        'requirementAncestorTitle',
        DEFAULT_REQUIREMENT_ANCESTOR_TITLE,
      ),
      requirementContactColumn: read(
        'requirementContactColumn',
        DEFAULT_REQUIREMENT_CONTACT_COLUMN,
      ),
      requirementTitleColumn: read('requirementTitleColumn', DEFAULT_REQUIREMENT_TITLE_COLUMN),
      minutesParentPattern: this.compilePattern(
        read('minutesParentPattern', DEFAULT_MINUTES_PARENT_PATTERN),
        'CONFLUENCE_MINUTES_PARENT_PATTERN',
      ),
      minutesTitlePattern: this.compilePattern(
        read('minutesTitlePattern', DEFAULT_MINUTES_TITLE_PATTERN),
        'CONFLUENCE_MINUTES_TITLE_PATTERN',
      ),
      minutesAgendaHeading: read('minutesAgendaHeading', DEFAULT_MINUTES_AGENDA_HEADING),
    };
  }

  /** 正则在启动期已校验过一次，这里再兜一层并给出可操作的错误信息 */
  private compilePattern(pattern: string, envKey: string): RegExp {
    try {
      return new RegExp(pattern, 'i');
    } catch (error) {
      throw new Error(`${envKey} 不是合法正则："${pattern}"（${(error as Error).message}）`);
    }
  }

  private describeRequirementCriteria(criteria: ResolvedCriteria): string {
    return `标题="${criteria.requirementPageTitle}" ∧ 祖先含="${criteria.requirementAncestorTitle}"，取列 "${criteria.requirementContactColumn}" 的 @（每个各 1 条）`;
  }

  private describeMinutesCriteria(criteria: ResolvedCriteria): string {
    return `父页匹配 ${criteria.minutesParentPattern.source} ∧ 标题匹配 ${criteria.minutesTitlePattern.source}，取 "${criteria.minutesAgendaHeading}" 段内的 @（段落与表格行都算，按期去重）`;
  }

  private describeCriteria(criteria: ResolvedCriteria): string {
    return `需求 ${this.describeRequirementCriteria(criteria)}；议题分享 ${this.describeMinutesCriteria(criteria)}`;
  }

  /**
   * 需求来源页：标题精确匹配，且祖先链里含 Release Planning。
   *
   * 必须带祖先条件：Releases 根目录下另有一张同名模板页（实测），
   * 只按标题匹配会把它算进来。
   */
  private selectRequirementPages(
    pages: ConfluencePageRecord[],
    criteria: ResolvedCriteria,
  ): ConfluencePageRecord[] {
    const wantedTitle = criteria.requirementPageTitle.trim().toLowerCase();
    const wantedAncestor = criteria.requirementAncestorTitle.trim().toLowerCase();

    return pages.filter(
      (page) =>
        page.title.trim().toLowerCase() === wantedTitle &&
        page.ancestorTitles.some((title) => title.trim().toLowerCase() === wantedAncestor),
    );
  }

  /**
   * 会议纪要页：标题与**直接父页**同时匹配（父页条件用于排除其它位置下的同名页面）。
   * 直接父页取祖先链最后一项。
   */
  private selectMinutesPages(
    pages: ConfluencePageRecord[],
    criteria: ResolvedCriteria,
  ): ConfluencePageRecord[] {
    return pages.filter((page) => {
      const parent = page.ancestorTitles[page.ancestorTitles.length - 1]?.trim() ?? '';
      return (
        criteria.minutesTitlePattern.test(page.title.trim()) &&
        criteria.minutesParentPattern.test(parent)
      );
    });
  }

  // ── 编辑量：版本历史（见 ADR-0011）────────────────────────

  /**
   * 收集"零成本即可得名"的账号：页面事实里的创建者展示名。
   *
   * 与 `resolveDisplayNames` 的第 3 优先来源共用同一份判定，避免两处规则漂移。
   */
  private collectCreatorNames(pages: ConfluencePageRecord[]): Map<string, string> {
    const names = new Map<string, string>();
    for (const page of pages) {
      const id = page.creatorAccountId?.trim();
      const name = page.creatorDisplayName?.trim();
      if (id && name && name !== '(unknown)') names.set(id, name);
    }
    return names;
  }

  /**
   * 挑出"尚无名字来源"的版本作者。
   *
   * 为什么要先算这个：v2 版本接口只回 `authorId`，展示名只能在**正文渲染视图**里换；
   * 而正文是"按需拉取"的，所以必须先知道"谁还没名字"，才能只对差集页补正文。
   */
  private selectUnnamedVersionAuthors(
    versions: Map<string, ConfluencePageVersionRecord[]>,
    creatorNames: Map<string, string>,
  ): Set<string> {
    const unnamed = new Set<string>();
    for (const list of versions.values()) {
      for (const version of list) {
        const authorId = version.authorId?.trim();
        if (!authorId || creatorNames.has(authorId)) continue;
        unnamed.add(authorId);
      }
    }
    return unnamed;
  }

  /**
   * 汇总本轮要拉正文的页面：需求页 + 纪要页 + **补名差集页**（去重，保持原顺序）。
   *
   * 差集页 = 未命名版本作者编辑过的页，减去已在列表里的页：
   * 这样补名不会演变成全量拉正文（实测真实空间只多 18 页）。
   */
  private selectBodyTargetPages(input: {
    requirementPages: ConfluencePageRecord[];
    minutesPages: ConfluencePageRecord[];
    versions: Map<string, ConfluencePageVersionRecord[]>;
    unnamedAuthorIds: Set<string>;
  }): { targetIds: string[]; extraIds: string[] } {
    const targetIds: string[] = [];
    const seen = new Set<string>();
    for (const page of [...input.requirementPages, ...input.minutesPages]) {
      if (seen.has(page.pageId)) continue;
      seen.add(page.pageId);
      targetIds.push(page.pageId);
    }

    const extraIds: string[] = [];
    if (input.unnamedAuthorIds.size > 0) {
      for (const [pageId, list] of input.versions) {
        if (seen.has(pageId)) continue;
        const hasUnnamedAuthor = list.some((version) => {
          const authorId = version.authorId?.trim();
          return Boolean(authorId) && input.unnamedAuthorIds.has(authorId as string);
        });
        if (!hasUnnamedAuthor) continue;
        seen.add(pageId);
        extraIds.push(pageId);
      }
      targetIds.push(...extraIds);
    }

    return { targetIds, extraIds };
  }

  // ── 正文解析 ───────────────────────────────────────────────

  /**
   * 逐页解析正文与版本历史，产出**账号级**中间态
   * （`accountId → { requirements, topicShares, edits }`）。
   *
   * 三个维度共用同一张账号表：一个账号可能既有需求、又有议题分享、还编辑过页面，
   * 分开存会在合并时产生"同一个账号多条记录"的歧义。
   *
   * 编辑量（`edits`）来自**版本历史**而非正文：口径按版本条数计，含页面创建那一次，
   * 覆盖空间内全部页面（见 ADR-0011）。
   */
  private parseContent(input: {
    requirementPages: ConfluencePageRecord[];
    minutesPages: ConfluencePageRecord[];
    bodies: Map<string, string>;
    /** pageId → 版本历史（全空间页面；取不到的页面按"该页无编辑量"处理） */
    versions: Map<string, ConfluencePageVersionRecord[]>;
    /** pageId → spaceKey：版本历史只回 pageId，而空间兜底判定需要空间身份 */
    pageSpaceKeys: Map<string, string>;
    criteria: ResolvedCriteria;
  }): ParsedContent {
    const { requirementPages, minutesPages, bodies, versions, pageSpaceKeys, criteria } = input;

    const groups = new Map<string, AccountGroup>();
    const displayHints = new Map<string, string>();
    const pageContacts = new Map<string, string[]>();
    const pageSharers = new Map<string, string[]>();
    const pageEditors = new Map<string, string[]>();
    const minutesWithoutAgenda: string[] = [];
    const unresolvedContacts: UnresolvedContact[] = [];
    const missingBodies: string[] = [];
    let requirementRowCount = 0;
    let requirementContactCount = 0;
    let topicShareCount = 0;
    let topicShareMentionCount = 0;
    let editVersionCount = 0;
    let attributableEditCount = 0;

    const bump = (
      accountId: string,
      dimension: 'requirements' | 'topicShares' | 'edits',
      spaceKey: string,
    ): void => {
      const existing = groups.get(accountId);
      if (existing) {
        existing[dimension] += 1;
        if (spaceKey) existing.spaces.add(spaceKey);
        return;
      }
      groups.set(accountId, {
        accountId,
        displayName: accountId,
        requirements: dimension === 'requirements' ? 1 : 0,
        topicShares: dimension === 'topicShares' ? 1 : 0,
        edits: dimension === 'edits' ? 1 : 0,
        spaces: new Set(spaceKey ? [spaceKey] : []),
      });
    };

    for (const page of requirementPages) {
      const storage = bodies.get(page.pageId);
      if (storage === undefined) {
        missingBodies.push(page.title);
        continue;
      }

      const parsed = parseRequirementContacts(storage, {
        contactsColumn: criteria.requirementContactColumn,
        titleColumn: criteria.requirementTitleColumn,
      });

      if (!parsed.found) {
        this.logger.warn(
          `需求页「${page.title}」未找到表头含 "${criteria.requirementContactColumn}" 的表格，该页不计入（口径可能需校正）`,
        );
        continue;
      }

      requirementRowCount += parsed.rows.length;
      requirementContactCount += parsed.contactAccountIds.length;
      pageContacts.set(page.pageId, parsed.contactAccountIds);
      for (const [accountId, name] of parsed.displayHints) displayHints.set(accountId, name);

      for (const accountId of parsed.contactAccountIds) {
        bump(accountId, 'requirements', page.spaceKey);
      }

      // 有 @ 文本却没解析出账号的行：暴露给运营去把纯文本改成真正的提及（不猜、不丢）
      for (const row of parsed.rows) {
        if (row.accountIds.length === 0 && row.plainTextHandles.length > 0) {
          unresolvedContacts.push({
            pageId: page.pageId,
            pageTitle: page.title,
            source: 'requirements',
            rowIndex: row.rowIndex,
            requirementTitle: row.title,
            handles: row.plainTextHandles,
          });
        }
      }
    }

    for (const page of minutesPages) {
      const storage = bodies.get(page.pageId);
      if (storage === undefined) {
        missingBodies.push(page.title);
        continue;
      }

      const parsed = parseAgendaShares(storage, { heading: criteria.minutesAgendaHeading });
      if (!parsed.found) {
        minutesWithoutAgenda.push(page.title);
        continue;
      }

      pageSharers.set(page.pageId, parsed.accountIds);
      for (const [accountId, name] of parsed.displayHints) displayHints.set(accountId, name);
      topicShareCount += parsed.accountIds.length;
      topicShareMentionCount += parsed.mentionCount;
      for (const accountId of parsed.accountIds) {
        bump(accountId, 'topicShares', page.spaceKey);
      }

      // Agenda 段内写成纯文本的 @人：解析不出账号，同样暴露给运营（不猜、不丢）
      if (parsed.plainTextHandles.length > 0) {
        unresolvedContacts.push({
          pageId: page.pageId,
          pageTitle: page.title,
          source: 'minutes',
          rowIndex: null,
          requirementTitle: '',
          handles: parsed.plainTextHandles,
        });
      }
    }

    // 编辑量：逐版本归属到该版本的作者（口径：每个版本计 1 次，含创建那一次）
    // 官方依据：GET /wiki/api/v2/pages/{id}/versions → item.authorId（见 ADR-0011）
    for (const [pageId, list] of versions) {
      const spaceKey = pageSpaceKeys.get(pageId) ?? '';
      const editors = new Set<string>();

      for (const version of list) {
        editVersionCount += 1;
        const authorId = version.authorId?.trim();
        // 已注销/匿名作者：计入总量观测，但不归属任何人（不猜）
        if (!authorId) continue;
        attributableEditCount += 1;
        editors.add(authorId);
        bump(authorId, 'edits', spaceKey);
      }

      if (editors.size > 0) pageEditors.set(pageId, [...editors].sort());
    }

    return {
      groups,
      displayHints,
      pageContacts,
      pageSharers,
      pageEditors,
      requirementRowCount,
      requirementContactCount,
      topicShareCount,
      topicShareMentionCount,
      editVersionCount,
      attributableEditCount,
      editedPageCount: pageEditors.size,
      minutesWithoutAgenda,
      unresolvedContacts,
      missingBodies,
    };
  }

  /**
   * report-only：落快照（可选）+ 出口径摘要，**不聚合、不写任何契约文件**。
   *
   * 用途是"接入口径核对"：在把数字写进看板之前，先看清选到了哪些页、解析出多少人。
   */
  private async finishReportOnly(
    options: ConfluenceCollectOptions,
    input: {
      pages: ConfluencePageRecord[];
      requestCount: number;
      requirementPages: ConfluencePageRecord[];
      minutesPages: ConfluencePageRecord[];
      parsed: ParsedContent;
      report: ConfluenceReport;
      spaces: string[];
      criteria: ResolvedCriteria;
    },
  ): Promise<ConfluenceCollectOutcome> {
    const { pages, requestCount, requirementPages, minutesPages, parsed, report } = input;
    const written: string[] = [];
    const pageTitleById = new Map(pages.map((page) => [page.pageId, page.title]));

    if (!options.dryRun) {
      written.push(
        await writeConfluenceSnapshot({
          dataDir: this.config.getOrThrow<string>('dataDir'),
          pages,
          spaces: input.spaces,
          criteria: this.describeCriteria(input.criteria),
          derived: {
            requirementPages: requirementPages.map((page) => ({
              pageId: page.pageId,
              title: page.title,
              contacts: [...(parsed.pageContacts.get(page.pageId) ?? [])],
            })),
            minutesPages: minutesPages.map((page) => ({
              pageId: page.pageId,
              title: page.title,
              topicSharers: [...(parsed.pageSharers.get(page.pageId) ?? [])],
            })),
            pageEdits: [...parsed.pageEditors.entries()].map(([pageId, editors]) => ({
              pageId,
              title: pageTitleById.get(pageId) ?? '',
              editors,
            })),
          },
        }),
      );
      this.logger.log('report-only：已落抽取快照，未聚合、未写组织级与账号级文件');
    }

    return {
      mode: options.mode,
      pageCount: pages.length,
      requestCount,
      requirementPageCount: requirementPages.length,
      minutesPageCount: minutesPages.length,
      minutesWithoutAgendaCount: parsed.minutesWithoutAgenda.length,
      requirementRowCount: parsed.requirementRowCount,
      editVersionCount: parsed.editVersionCount,
      editedPageCount: parsed.editedPageCount,
      // report-only 不做归属，totals 给的是"正文/版本解析出的量"，不是组织级合计
      totals: {
        requirements: parsed.requirementContactCount,
        topicShares: parsed.topicShareCount,
        edits: parsed.attributableEditCount,
      },
      unattributed: { requirements: 0, topicShares: 0, edits: 0 },
      accountCount: parsed.groups.size,
      unattributedAccountCount: 0,
      unresolvedContactCount: parsed.unresolvedContacts.length,
      orgCount: 0,
      report,
      written,
    };
  }

  // ── 归属映射 ───────────────────────────────────────────────

  /**
   * 构建 Confluence 归属索引：`aliases.confluence` → orgId。
   *
   * alias 可按 `,` `;` `，` `；` 拆成多个 token（不按空格拆，避免把姓名拆坏），
   * 每个 token 小写后同时可匹配 **accountId / 展示名 / 空间 key**。
   * 这样无论真实空间里的组织信号是账号、人名还是空间，都能用同一份档案表达。
   */
  private buildConfluenceAliasIndex(organizations: Organization[]): Map<string, string> {
    const index = new Map<string, string>();

    organizations.forEach((org) => {
      const raw = org.aliases?.confluence ?? '';
      const tokens = raw
        .split(/[,;，；]/)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0);

      tokens.forEach((token) => {
        const existing = index.get(token);
        if (existing && existing !== org.orgId) {
          this.logger.warn(
            `aliases.confluence 的 "${token}" 同时配置在 ${existing} 与 ${org.orgId}，按档案顺序归属 ${existing}；请修订 organizations.json`,
          );
          return;
        }
        index.set(token, org.orgId);
      });
    });

    if (index.size === 0) {
      this.logger.warn(
        'organizations.json 的 aliases.confluence 全部为空：本轮全部计数将归入「独立开发者」；' +
          '请据状态文件的 unattributedAccounts 补 aliases.confluence 或 identity-claims.json',
      );
    }

    return index;
  }

  /**
   * 构建「空间 key → orgId」兜底索引：`aliases.confluence` 的 token 若等于某个被采集空间的 key，
   * 视为「整个空间归属该组织」。仅在该账号没有任何账号级信号时启用（见 resolveAccountOrg）。
   */
  private buildSpaceOrgIndex(
    aliasIndex: Map<string, string>,
    spaces: string[],
  ): Map<string, string> {
    const index = new Map<string, string>();
    for (const space of spaces) {
      const key = space.trim().toLowerCase();
      if (!key) continue;
      const orgId = aliasIndex.get(key);
      if (orgId) index.set(key, orgId);
    }
    return index;
  }

  /** 按候选串依次查别名索引，命中即返回（候选顺序即优先级） */
  private lookupAlias(
    aliasIndex: Map<string, string>,
    ...candidates: (string | undefined)[]
  ): string | undefined {
    for (const candidate of candidates) {
      const key = candidate?.trim().toLowerCase();
      if (!key) continue;
      const orgId = aliasIndex.get(key);
      if (orgId) return orgId;
    }
    return undefined;
  }

  /**
   * 账号 → **采集口径**归属（见类注释）：别名 → 空间兜底 → 伪组织。
   * 认领边**不**参与（读时派生层负责，ADR-0010）。
   */
  private resolveAccountOrg(input: {
    accountId: string;
    displayName: string;
    spaces: Set<string>;
    aliasIndex: Map<string, string>;
    spaceOrgIndex: Map<string, string>;
  }): { orgId: string | null; orgSource: ConfluenceOrgSource } {
    const { accountId, displayName, spaces, aliasIndex, spaceOrgIndex } = input;

    const byAlias = this.lookupAlias(aliasIndex, accountId, displayName);
    if (byAlias) return { orgId: byAlias, orgSource: 'alias' };

    const bySpace = this.resolveSpaceOrg(spaces, spaceOrgIndex);
    if (bySpace) return { orgId: bySpace, orgSource: 'space' };

    return { orgId: null, orgSource: 'unattributed' };
  }

  /**
   * 空间兜底：要求该账号的**全部**计数都落在同一个被认领的空间内才生效；
   * 跨空间（含未认领空间）视为歧义，返回 undefined，交由伪组织兜底。
   */
  private resolveSpaceOrg(
    spaces: Set<string>,
    spaceOrgIndex: Map<string, string>,
  ): string | undefined {
    if (spaces.size === 0) return undefined;

    let resolved: string | undefined;
    for (const space of spaces) {
      const orgId = spaceOrgIndex.get(space.trim().toLowerCase());
      if (!orgId) return undefined;
      if (resolved !== undefined && resolved !== orgId) return undefined;
      resolved = orgId;
    }
    return resolved;
  }

  // ── 聚合 ───────────────────────────────────────────────────

  /**
   * 展示名解析（只影响可读性，不影响任何计数与归属），按「谁最像页面上显示的名字」排序：
   * 1. **渲染视图 `body.view` 换出的展示名**（随正文一并取回，零额外请求；实测唯一有效来源）；
   * 2. 正文 mention 里的 `ri:username`（零成本，实测真实页面基本不写）；
   * 3. 页面事实里的创建者展示名（零成本，同人时可直接用）；
   * 4. `GET /rest/api/user?accountId=`（每账号一次请求；实测真实站点 403，仅作补漏）；
   * 5. 仍取不到就用 accountId 本身 —— 归属与计数不受影响。
   */
  private async resolveDisplayNames(
    parsed: ParsedContent,
    pages: ConfluencePageRecord[],
    renderedUserNames: Map<string, string>,
  ): Promise<{ names: Map<string, string>; requestCount: number }> {
    const creatorNames = this.collectCreatorNames(pages);

    const names = new Map<string, string>();
    const missing: string[] = [];
    const sources = { rendered: 0, username: 0, creator: 0, lookup: 0 };

    for (const group of parsed.groups.values()) {
      const accountId = group.accountId;
      const rendered = renderedUserNames.get(accountId)?.trim();
      const hint = parsed.displayHints.get(accountId)?.trim();
      const creator = creatorNames.get(accountId);

      if (rendered) {
        names.set(accountId, rendered);
        sources.rendered += 1;
      } else if (hint) {
        names.set(accountId, hint);
        sources.username += 1;
      } else if (creator) {
        names.set(accountId, creator);
        sources.creator += 1;
      } else {
        missing.push(accountId);
      }
    }

    const lookup = missing.length > 0 ? await this.source.fetchUserNames(missing) : null;
    if (lookup) {
      for (const [accountId, name] of lookup.names) {
        names.set(accountId, name);
        sources.lookup += 1;
      }
    }

    const stillMissing = missing.filter((id) => !names.has(id));
    this.logger.log(
      `展示名来源：渲染视图 ${sources.rendered}｜正文 username ${sources.username}｜创建者 ${sources.creator}｜账号查询 ${sources.lookup}｜降级 accountId ${stillMissing.length}`,
    );
    if (stillMissing.length > 0) {
      this.logger.warn(
        `${stillMissing.length} 个账号取不到展示名，降级显示 accountId（不影响计数与归属）：${stillMissing.slice(0, 5).join(', ')}${stillMissing.length > 5 ? ' …' : ''}`,
      );
    }

    return { names, requestCount: lookup?.requestCount ?? 0 };
  }

  /**
   * 账号级聚合 + 归属判定：产出账号级数组与组织级计数。
   *
   * 组织级**由账号级求和派生**（不再逐页统计），两者天然一致；
   * 未归属的账号统一计入伪组织，并原样返回清单供运营补认领边。
   */
  private async resolveAccounts(input: {
    parsed: ParsedContent;
    pages: ConfluencePageRecord[];
    renderedUserNames: Map<string, string>;
    aliasIndex: Map<string, string>;
    spaceOrgIndex: Map<string, string>;
    /** 认领边索引：只用于写 `personId` 快照，不参与归属裁决（ADR-0010） */
    claimIndex: ConfluenceClaimIndex;
  }): Promise<{
    accounts: ConfluenceAccount[];
    counts: Map<string, ConfluenceMetrics>;
    unattributed: ConfluenceMetrics;
    unattributedAccounts: UnattributedAccount[];
    requestCount: number;
  }> {
    const { parsed, pages, renderedUserNames, aliasIndex, spaceOrgIndex, claimIndex } = input;

    const resolvedNames = await this.resolveDisplayNames(parsed, pages, renderedUserNames);

    const updatedAt = new Date().toISOString();
    const accounts: ConfluenceAccount[] = [];
    const counts = new Map<string, ConfluenceMetrics>();
    const unattributedAccounts: UnattributedAccount[] = [];
    const unattributed: ConfluenceMetrics = { requirements: 0, topicShares: 0, edits: 0 };

    for (const group of parsed.groups.values()) {
      const displayName = resolvedNames.names.get(group.accountId) ?? group.accountId;
      const { orgId, orgSource } = this.resolveAccountOrg({
        accountId: group.accountId,
        displayName,
        // group.spaces 已含该账号编辑过的页面空间：空间兜底对编辑量同样成立（见 ADR-0011）
        spaces: group.spaces,
        aliasIndex,
        spaceOrgIndex,
      });

      const account: ConfluenceAccount = {
        accountId: group.accountId,
        displayName,
        orgId,
        orgSource,
        personId: claimIndex.personByKey.get(group.accountId.trim().toLowerCase()) ?? null,
        confluence: {
          requirements: group.requirements,
          topicShares: group.topicShares,
          edits: group.edits,
        },
        updatedAt,
      };
      accounts.push(account);

      const bucket = counts.get(orgId ?? ORG_UNATTRIBUTED) ?? {
        requirements: 0,
        topicShares: 0,
        edits: 0,
      };
      bucket.requirements += group.requirements;
      bucket.topicShares += group.topicShares;
      bucket.edits += group.edits;
      counts.set(orgId ?? ORG_UNATTRIBUTED, bucket);

      if (!orgId) {
        unattributed.requirements += group.requirements;
        unattributed.topicShares += group.topicShares;
        unattributed.edits += group.edits;
        unattributedAccounts.push({
          accountId: group.accountId,
          displayName,
          requirements: group.requirements,
          topicShares: group.topicShares,
          edits: group.edits,
        });
      }
    }

    // 输出稳定：需求降序 → 议题分享降序 → 编辑量降序 → accountId 升序，保证幂等与 diff 可读
    accounts.sort(
      (a, b) =>
        b.confluence.requirements - a.confluence.requirements ||
        b.confluence.topicShares - a.confluence.topicShares ||
        b.confluence.edits - a.confluence.edits ||
        a.accountId.localeCompare(b.accountId),
    );
    unattributedAccounts.sort(
      (a, b) =>
        b.requirements - a.requirements ||
        b.topicShares - a.topicShares ||
        b.edits - a.edits ||
        a.accountId.localeCompare(b.accountId),
    );

    return {
      accounts,
      counts,
      unattributed,
      unattributedAccounts,
      requestCount: resolvedNames.requestCount,
    };
  }

  /**
   * 组织清单取 organizations.json（档案即真相）：
   * 覆盖全部组织（含伪组织），未命中的记 0，保证与活跃度页 join 后不出现空洞。
   */
  private buildWiki(
    organizations: Organization[],
    counts: Map<string, ConfluenceMetrics>,
    updatedAt: string,
  ): OrganizationWiki[] {
    return organizations.map((org) => {
      const metrics = counts.get(org.orgId) ?? { requirements: 0, topicShares: 0, edits: 0 };
      return {
        orgId: org.orgId,
        orgName: org.name,
        logoUrl: org.logoUrl,
        confluence: {
          requirements: metrics.requirements,
          topicShares: metrics.topicShares,
          edits: metrics.edits,
        },
        updatedAt,
      };
    });
  }

  private sumTotals(wiki: OrganizationWiki[]): ConfluenceMetrics {
    return wiki.reduce<ConfluenceMetrics>(
      (acc, item) => ({
        requirements: acc.requirements + item.confluence.requirements,
        topicShares: acc.topicShares + item.confluence.topicShares,
        edits: acc.edits + item.confluence.edits,
      }),
      { requirements: 0, topicShares: 0, edits: 0 },
    );
  }

  private static sumMetrics(items: ConfluenceMetrics[]): ConfluenceMetrics {
    return items.reduce<ConfluenceMetrics>(
      (acc, item) => ({
        requirements: acc.requirements + item.requirements,
        topicShares: acc.topicShares + item.topicShares,
        edits: acc.edits + item.edits,
      }),
      { requirements: 0, topicShares: 0, edits: 0 },
    );
  }

  // ── 校验（05 文档 §5.1）──────────────────────────────────────

  /**
   * 写入前校验：任一不过即中止，**保留旧数据**。
   *
   * - 结构：计数为非负整数（buildWiki 保证，这里做兜底断言）
   * - 派生一致性：组织级 = 账号级求和 = 正文/版本解析出的原始数（三者只允许一处统计入口）
   * - 选页：一页都没取到、或两个选择器任一命中 0 页 → 疑似配置/口径问题
   * - 口径：需求提及数为 0，或所有会议页都没有 Agenda 段 → 口径与正文结构不符
   * - 回退保护：本轮"真实组织"归属结果全为 0 而既有数据非 0 → 疑似归属规则失效，
   *   拒绝把好数据洗成 0（首次接入时旧数据为空，此条不触发）
   */
  private validate(input: {
    pageCount: number;
    requirementPageCount: number;
    minutesPageCount: number;
    minutesWithoutAgendaCount: number;
    requirementContactCount: number;
    topicShareCount: number;
    /** 版本历史总条数（含无法归属的版本），仅观测 */
    editVersionCount: number;
    /** 可归属到账号的版本条数，= 账号级 edits 合计的校验基准 */
    attributableEditCount: number;
    editedPageCount: number;
    accounts: ConfluenceAccount[];
    counts: Map<string, ConfluenceMetrics>;
    previous: OrganizationWiki[];
  }): void {
    const {
      pageCount,
      requirementPageCount,
      minutesPageCount,
      minutesWithoutAgendaCount,
      requirementContactCount,
      topicShareCount,
      editVersionCount,
      attributableEditCount,
      editedPageCount,
      accounts,
      counts,
      previous,
    } = input;
    const problems: string[] = [];

    for (const [orgId, metrics] of counts) {
      for (const [dimension, value] of Object.entries(metrics)) {
        if (!Number.isInteger(value) || value < 0) {
          problems.push(`组织 ${orgId} 的 ${dimension} 非法：${String(value)}`);
        }
      }
    }

    for (const account of accounts) {
      for (const [dimension, value] of Object.entries(account.confluence)) {
        if (!Number.isInteger(value) || value < 0) {
          problems.push(`账号 ${account.accountId} 的 ${dimension} 非法：${String(value)}`);
        }
      }
    }

    const accountTotals = ConfluenceCollectorService.sumMetrics(
      accounts.map((account) => account.confluence),
    );
    const orgTotals = ConfluenceCollectorService.sumMetrics([...counts.values()]);

    if (
      accountTotals.requirements !== orgTotals.requirements ||
      accountTotals.topicShares !== orgTotals.topicShares ||
      accountTotals.edits !== orgTotals.edits
    ) {
      problems.push(
        `账号级合计（需求 ${accountTotals.requirements} / 议题分享 ${accountTotals.topicShares} / 编辑 ${accountTotals.edits}）` +
          `与组织级合计（需求 ${orgTotals.requirements} / 议题分享 ${orgTotals.topicShares} / 编辑 ${orgTotals.edits}）不一致：组织级必须由账号级派生`,
      );
    }
    if (accountTotals.requirements !== requirementContactCount) {
      problems.push(
        `账号级需求合计 ${accountTotals.requirements} 与正文解析出的联系人提及数 ${requirementContactCount} 不一致`,
      );
    }
    if (accountTotals.topicShares !== topicShareCount) {
      problems.push(
        `账号级议题分享合计 ${accountTotals.topicShares} 与正文解析出的议题分享人数 ${topicShareCount} 不一致`,
      );
    }
    if (accountTotals.edits !== attributableEditCount) {
      problems.push(
        `账号级编辑量合计 ${accountTotals.edits} 与版本历史中可归属的版本数 ${attributableEditCount} 不一致（版本总数 ${editVersionCount}，覆盖 ${editedPageCount} 页）`,
      );
    }

    if (pageCount === 0) {
      problems.push('本轮未取到任何页面，疑似空间配置或权限问题');
    }
    if (pageCount > 0 && requirementPageCount === 0) {
      problems.push(
        '未选到任何需求页，疑似页面结构口径不符（可调 CONFLUENCE_REQUIREMENT_PAGE_TITLE / _ANCESTOR_TITLE）',
      );
    }
    if (pageCount > 0 && minutesPageCount === 0) {
      problems.push(
        '未选到任何会议纪要页，疑似标题/父页口径不符（可调 CONFLUENCE_MINUTES_PARENT_PATTERN / _TITLE_PATTERN）',
      );
    }
    if (requirementPageCount > 0 && requirementContactCount === 0) {
      problems.push(
        `需求页全部解析不出联系人提及，疑似表格列名或提及写法不符（可调 CONFLUENCE_REQUIREMENT_CONTACT_COLUMN，当前解析出 ${requirementContactCount} 条）`,
      );
    }
    if (minutesPageCount > 0 && minutesWithoutAgendaCount >= minutesPageCount) {
      problems.push(
        `全部 ${minutesPageCount} 个会议纪要页都没有 Agenda 段，疑似段名或层级不符（可调 CONFLUENCE_MINUTES_AGENDA_HEADING）`,
      );
    }
    if (
      minutesPageCount > 0 &&
      minutesWithoutAgendaCount < minutesPageCount &&
      topicShareCount === 0
    ) {
      problems.push(
        `会议纪要 Agenda 段解析出 0 个议题分享人（${minutesPageCount} 页中 ${minutesPageCount - minutesWithoutAgendaCount} 页含 Agenda 段）：` +
          '疑似段内 @ 写法与口径不符 —— 分享人须是正文提及，写成纯文本 @人的会被记入 unresolvedContacts（可调 CONFLUENCE_MINUTES_AGENDA_HEADING）',
      );
    }

    const realCounts = [...counts.entries()].filter(([orgId]) => orgId !== ORG_UNATTRIBUTED);
    const realTotal = ConfluenceCollectorService.sumMetrics(
      realCounts.map(([, metrics]) => metrics),
    );
    const previousReal = previous.filter((item) => item.orgId !== ORG_UNATTRIBUTED);
    const previousRealTotal = ConfluenceCollectorService.sumMetrics(
      previousReal.map((item) => item.confluence),
    );

    for (const dimension of ['requirements', 'topicShares'] as const) {
      if (realTotal[dimension] === 0 && previousRealTotal[dimension] > 0) {
        problems.push(
          `本轮真实组织的 ${dimension} 全为 0，而既有 confluence-organizations.json 非 0（${previousRealTotal[dimension]}）：疑似归属规则失效，已拒绝覆盖`,
        );
      }
    }

    // 编辑量**故意不进入**上面的"拒绝覆盖"保护：版本接口或翻页失败只应降级为"该页无编辑量"，
    // 不该连带阻断开需求与议题分享两个既有维度的落盘（见 ADR-0011）。因此这里只告警、不抛错。
    if (realTotal.edits === 0 && previousRealTotal.edits > 0) {
      this.logger.warn(
        `本轮真实组织编辑量全为 0，而既有 confluence-organizations.json 为 ${previousRealTotal.edits}：` +
          '疑似版本接口不可用或翻页失败，将按 0 写入，请核对上方"版本历史"日志',
      );
    }
    if (editVersionCount > attributableEditCount) {
      this.logger.warn(
        `${editVersionCount - attributableEditCount} 个版本取不到作者（已注销/匿名账号），已计入总量观测但不归属任何人`,
      );
    }

    if (problems.length > 0) {
      throw new Error(`采集结果未通过校验，保留既有数据：\n  - ${problems.join('\n  - ')}`);
    }
  }

  // ── 日志 ───────────────────────────────────────────────────

  private logConfluenceReport(report: ConfluenceReport, criteria: string): void {
    this.logger.log('── 取数观察报告 ──────────────────────────');
    for (const line of renderConfluenceReport(report, criteria)) {
      this.logger.log(line);
    }
    this.logger.log('─────────────────────────────────────────');
  }

  private logParsedContent(parsed: ParsedContent): void {
    this.logger.log('── 正文口径解析 ──────────────────────────');
    this.logger.log(
      `需求表格：${parsed.requirementRowCount} 行 → ${parsed.requirementContactCount} 条（每个 @ 各 1 条）`,
    );
    this.logger.log(
      `会议议题：${parsed.topicShareCount} 次分享（Agenda 段内 @，按期去重；段内原始 ${parsed.topicShareMentionCount} 处）`,
    );
    this.logger.log(
      `页面编辑：${parsed.editVersionCount} 个版本 / ${parsed.editedPageCount} 页（含创建版本，不减 1）`,
    );
    this.logger.log(
      '口径提示：编辑量按版本条数计，**不修正**多人共编的大页（个别聚合页可能占全空间两成以上），' +
        '排行解读时请结合页数看（见 ADR-0011）',
    );
    this.logger.log(`涉及账号：${parsed.groups.size} 个`);

    if (parsed.minutesWithoutAgenda.length > 0) {
      this.logger.warn(
        `${parsed.minutesWithoutAgenda.length} 个会议页未找到 Agenda 段，已跳过：${parsed.minutesWithoutAgenda.slice(0, 5).join('；')}${parsed.minutesWithoutAgenda.length > 5 ? ' …' : ''}`,
      );
    }
    if (parsed.missingBodies.length > 0) {
      this.logger.warn(
        `${parsed.missingBodies.length} 个目标页取不到正文，本轮按缺页跳过（可能无权限）：${parsed.missingBodies.slice(0, 5).join('；')}${parsed.missingBodies.length > 5 ? ' …' : ''}`,
      );
    }
    if (parsed.unresolvedContacts.length > 0) {
      this.logger.warn(
        `${parsed.unresolvedContacts.length} 处正文写了纯文本 @人（无法解析为账号），已记入状态文件待运营修正，例如：` +
          parsed.unresolvedContacts
            .slice(0, 3)
            .map((item) =>
              item.source === 'minutes'
                ? `「${item.pageTitle}」Agenda 段 ${item.handles.join(' ')}`
                : `「${item.requirementTitle || item.pageTitle}」行 ${String(item.rowIndex)} ${item.handles.join(' ')}`,
            )
            .join('；'),
      );
    }
    this.logger.log('─────────────────────────────────────────');
  }

  /** 把"该补哪条认领边"直接摆到日志里：这是运营闭环的唯一入口 */
  private logUnattributed(unattributed: UnattributedAccount[]): void {
    if (unattributed.length === 0) return;

    const total = ConfluenceCollectorService.sumMetrics(
      unattributed.map((item) => ({
        requirements: item.requirements,
        topicShares: item.topicShares,
        edits: item.edits,
      })),
    );
    this.logger.warn(
      `未归属账号 ${unattributed.length} 个（需求 ${total.requirements} 条 / 议题分享 ${total.topicShares} 次 / 编辑 ${total.edits} 次）；` +
        '可在 data/identity-claims.json 补 source=confluence 的认领边后重跑：',
    );
    for (const item of unattributed.slice(0, 10)) {
      this.logger.warn(
        `  ${item.displayName}｜accountId=${item.accountId}｜需求 ${item.requirements} / 议题分享 ${item.topicShares} / 编辑 ${item.edits}`,
      );
    }
  }

  private logSummary(outcome: ConfluenceCollectOutcome): void {
    this.logger.log('── 采集结果 ──────────────────────────────');
    this.logger.log(`页面总数    : ${outcome.pageCount}`);
    this.logger.log(`需求页/行/条: ${outcome.requirementPageCount} 页 / ${outcome.requirementRowCount} 行 / ${outcome.totals.requirements} 条`);
    this.logger.log(
      `会议页      : ${outcome.minutesPageCount} 页${outcome.minutesWithoutAgendaCount > 0 ? `（其中 ${outcome.minutesWithoutAgendaCount} 页无 Agenda 段）` : ''}`,
    );
    this.logger.log(
      `页面编辑    : ${outcome.editVersionCount} 个版本 / ${outcome.editedPageCount} 页（含创建版本）`,
    );
    this.logger.log(
      `独立开发者  : 需求 ${outcome.unattributed.requirements} / 议题分享 ${outcome.unattributed.topicShares} / 编辑 ${outcome.unattributed.edits}`,
    );
    this.logger.log(
      `账号数      : ${outcome.accountCount}（其中未归属 ${outcome.unattributedAccountCount}）`,
    );
    this.logger.log(`组织数      : ${outcome.orgCount}`);
    this.logger.log(
      `合计        : 需求 ${outcome.totals.requirements} / 议题分享 ${outcome.totals.topicShares} / 编辑 ${outcome.totals.edits}`,
    );
    this.logger.log('─────────────────────────────────────────');
  }
}

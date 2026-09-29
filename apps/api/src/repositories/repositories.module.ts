import { Global, Logger, Module, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import {
  ConfluenceAccount,
  Contributor,
  HomeFileData,
  IdentityClaim,
  MeetingAttendanceMatrix,
  Person,
  SummitDetail,
  Organization,
  OrganizationContribution,
  OrganizationWiki,
} from '../contract/entities';
import { JsonRepository } from './json-repository';
import {
  CONFLUENCE_ACCOUNTS_REPOSITORY,
  CONTRIBUTIONS_REPOSITORY,
  CONTRIBUTORS_REPOSITORY,
  HOME_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  WIKI_REPOSITORY,
  MEETINGS_REPOSITORY,
  PERSONS_REPOSITORY,
  SUMMITS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
} from './repository.tokens';
import {
  isConfluenceAccountArray,
  isContributionArray,
  isContributorArray,
  isHomeFileData,
  isIdentityClaimArray,
  isWikiArray,
  isMeetingAttendanceMatrix,
  isPersonArray,
  isSummitDetailArray,
  isOrganizationArray,
} from './validators';

type RepositoryFactory<T> = (
  config: ConfigService,
) => JsonRepository<T>;

function makeRepository<T>(
  fileName: string,
  isValidData: (value: unknown) => value is T,
  /**
   * 数据结构版本：字段增删/改名即为不兼容变更，必须提升。
   * 与 envelope 里的 schemaVersion 不一致会直接读失败（fail-fast，不静默错读）。
   */
  schemaVersion = 1,
): RepositoryFactory<T> {
  return (config: ConfigService) =>
    new JsonRepository<T>(join(config.getOrThrow<string>('dataDir'), fileName), {
      fileName,
      schemaVersion,
      isValidData,
    });
}

const repositoryProviders = [
  {
    provide: HOME_REPOSITORY,
    useFactory: makeRepository<HomeFileData>('home.json', isHomeFileData),
    inject: [ConfigService],
  },
  {
    provide: ORGANIZATIONS_REPOSITORY,
    useFactory: makeRepository<Organization[]>('organizations.json', isOrganizationArray),
    inject: [ConfigService],
  },
  {
    provide: CONTRIBUTIONS_REPOSITORY,
    useFactory: makeRepository<OrganizationContribution[]>(
      'github-organizations.json',
      isContributionArray,
    ),
    inject: [ConfigService],
  },
  {
    provide: WIKI_REPOSITORY,
    // v2：ConfluenceMetrics 的 bestPractices 更名为 topicShares（口径重定，见 ADR-0009）
    // v3：新增 edits（页面版本作者计数，见 ADR-0011）
    useFactory: makeRepository<OrganizationWiki[]>(
      'confluence-organizations.json',
      isWikiArray,
      3,
    ),
    inject: [ConfigService],
  },
  {
    provide: CONFLUENCE_ACCOUNTS_REPOSITORY,
    // v3：新增 orgSource（采集口径归属来源，ADR-0010）
    // v4：confluence 新增 edits（页面版本作者计数，见 ADR-0011）
    useFactory: makeRepository<ConfluenceAccount[]>(
      'confluence-accounts.json',
      isConfluenceAccountArray,
      4,
    ),
    inject: [ConfigService],
  },
  {
    provide: CONTRIBUTORS_REPOSITORY,
    useFactory: makeRepository<Contributor[]>('github-accounts.json', isContributorArray),
    inject: [ConfigService],
  },
  {
    provide: SUMMITS_REPOSITORY,
    useFactory: makeRepository<SummitDetail[]>('summits.json', isSummitDetailArray),
    inject: [ConfigService],
  },
  {
    provide: MEETINGS_REPOSITORY,
    useFactory: makeRepository<MeetingAttendanceMatrix>(
      'meetings.json',
      isMeetingAttendanceMatrix,
    ),
    inject: [ConfigService],
  },
  {
    provide: PERSONS_REPOSITORY,
    useFactory: makeRepository<Person[]>('persons.json', isPersonArray),
    inject: [ConfigService],
  },
  {
    provide: IDENTITY_CLAIMS_REPOSITORY,
    useFactory: makeRepository<IdentityClaim[]>(
      'identity-claims.json',
      isIdentityClaimArray,
    ),
    inject: [ConfigService],
  },
];

/**
 * 启动期数据自检：校验十个业务 JSON 文件的结构合法性。
 * 校验失败不阻断启动（降级只读），由具体接口返回 50001。
 */
export class DataBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DataBootstrapService.name);

  constructor(
    @Inject(HOME_REPOSITORY) private readonly home: JsonRepository<HomeFileData>,
    @Inject(ORGANIZATIONS_REPOSITORY) private readonly organizations: JsonRepository<Organization[]>,
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly contributions: JsonRepository<OrganizationContribution[]>,
    @Inject(WIKI_REPOSITORY) private readonly wiki: JsonRepository<OrganizationWiki[]>,
    @Inject(CONFLUENCE_ACCOUNTS_REPOSITORY)
    private readonly confluenceAccounts: JsonRepository<ConfluenceAccount[]>,
    @Inject(CONTRIBUTORS_REPOSITORY) private readonly contributors: JsonRepository<Contributor[]>,
    @Inject(SUMMITS_REPOSITORY) private readonly summits: JsonRepository<SummitDetail[]>,
    @Inject(MEETINGS_REPOSITORY)
    private readonly meetings: JsonRepository<MeetingAttendanceMatrix>,
    @Inject(PERSONS_REPOSITORY) private readonly persons: JsonRepository<Person[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY)
    private readonly identityClaims: JsonRepository<IdentityClaim[]>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const repositories = [
      this.home,
      this.organizations,
      this.contributions,
      this.wiki,
      this.confluenceAccounts,
      this.contributors,
      this.summits,
      this.meetings,
      this.persons,
      this.identityClaims,
    ] as const;

    const results = await Promise.all(
      repositories.map(async (repo) => {
        try {
          await repo.read();
          return { label: repo.label, ok: true };
        } catch (error) {
          this.logger.error(`启动自检失败：${repo.label} → ${(error as Error).message}`);
          return { label: repo.label, ok: false };
        }
      }),
    );

    const failed = results.filter((item) => !item.ok).map((item) => item.label);
    if (failed.length > 0) {
      this.logger.warn(`数据自检未通过（降级只读）：${failed.join(', ')}`);
    } else {
      this.logger.log(`数据自检通过：${results.map((item) => item.label).join(', ')}`);
    }
  }
}

@Global()
@Module({
  providers: [...repositoryProviders, DataBootstrapService],
  exports: [
    HOME_REPOSITORY,
    ORGANIZATIONS_REPOSITORY,
    CONTRIBUTIONS_REPOSITORY,
    WIKI_REPOSITORY,
    CONFLUENCE_ACCOUNTS_REPOSITORY,
    CONTRIBUTORS_REPOSITORY,
    SUMMITS_REPOSITORY,
    MEETINGS_REPOSITORY,
    PERSONS_REPOSITORY,
    IDENTITY_CLAIMS_REPOSITORY,
  ],
})
export class RepositoriesModule {}

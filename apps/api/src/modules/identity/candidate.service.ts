import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConfluenceAccount,
  ConfluenceIdentityCandidate,
  Contributor,
  GithubIdentityCandidate,
  IdentityCandidate,
  IdentityCandidateOwner,
  IdentityCandidatesData,
  IdentityClaim,
  MeetingAttendanceMatrix,
  MeetingIdentityCandidate,
  Person,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONFLUENCE_ACCOUNTS_REPOSITORY,
  CONTRIBUTORS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  MEETINGS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';

/** 候选唯一键：必须由 source + accountKey 组合而成 */
function candidateKey(source: string, accountKey: string): string {
  return `${source}:${accountKey}`;
}

/**
 * 候选池派生（04 §5.3.11）：**不落盘**，每次按来源现算。
 * 来源文件缺失/为空时**降级为空数组并告警**，不阻断整个接口。
 * 响应**不得**携带邮箱等敏感身份字段。
 *
 * `confluence` 分组读**账号级** `confluence-accounts.json`（ADR-0010）：
 * 候选的 `accountKey` 即 `accountId`，与认领边口径一致。
 */
@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(
    @Inject(CONTRIBUTORS_REPOSITORY) private readonly contributors: JsonRepository<Contributor[]>,
    @Inject(CONFLUENCE_ACCOUNTS_REPOSITORY)
    private readonly confluenceAccounts: JsonRepository<ConfluenceAccount[]>,
    @Inject(MEETINGS_REPOSITORY) private readonly meetings: JsonRepository<MeetingAttendanceMatrix>,
    @Inject(PERSONS_REPOSITORY) private readonly persons: JsonRepository<Person[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY) private readonly claims: JsonRepository<IdentityClaim[]>,
  ) {}

  async getCandidates(): Promise<IdentityCandidatesData> {
    const warnings: string[] = [];

    // persons / identity-claims 缺失或损坏 → 50001（不再降级）
    const [persons, claims] = await Promise.all([this.persons.read(), this.claims.read()]);

    const [github, confluence, meeting] = await Promise.all([
      this.loadGithub(warnings),
      this.loadConfluence(warnings),
      this.loadMeeting(warnings),
    ]);

    const nameByPerson = new Map(persons.data.map((person) => [person.personId, person.displayName]));
    const ownersByKey = new Map<string, IdentityCandidateOwner[]>();
    for (const claim of claims.data) {
      const key = candidateKey(claim.source, claim.accountKey);
      const owners = ownersByKey.get(key) ?? [];
      owners.push({
        personId: claim.personId,
        displayName: nameByPerson.get(claim.personId) ?? claim.personId,
      });
      ownersByKey.set(key, owners);
    }

    return {
      github: this.attach(github, ownersByKey),
      confluence: this.attach(confluence, ownersByKey),
      meeting: this.attach(meeting, ownersByKey),
      warnings,
    };
  }

  private attach<T extends IdentityCandidate>(
    list: T[],
    ownersByKey: Map<string, IdentityCandidateOwner[]>,
  ): T[] {
    return list.map(
      (item) =>
        ({
          ...item,
          claimedBy: ownersByKey.get(candidateKey(item.source, item.accountKey)) ?? [],
        }) as T,
    );
  }

  private async loadGithub(warnings: string[]): Promise<GithubIdentityCandidate[]> {
    try {
      const { data } = await this.contributors.read();
      return data.map((contributor) => ({
        source: 'github' as const,
        accountKey: String(contributor.githubId),
        displayName: contributor.name,
        ...(contributor.avatarUrl ? { avatarUrl: contributor.avatarUrl } : {}),
        // repos 不进候选池（噪声大），其余指标按 Omit<GithubMetrics,'repos'> 对齐
        ...(contributor.github
          ? {
              metrics: {
                pullRequests: contributor.github.pullRequests,
                commits: contributor.github.commits,
                issues: contributor.github.issues,
                linesChanged: contributor.github.linesChanged,
              },
            }
          : {}),
        claimedBy: [],
      }));
    } catch (error) {
      warnings.push('github 数据源不可用，已降级为空');
      this.logger.warn(`github 候选降级：${(error as Error).message}`);
      return [];
    }
  }

  private async loadConfluence(warnings: string[]): Promise<ConfluenceIdentityCandidate[]> {
    try {
      const { data } = await this.confluenceAccounts.read();
      return data.map((account) => ({
        source: 'confluence' as const,
        accountKey: account.accountId,
        displayName: account.displayName,
        metrics: {
          requirements: account.confluence.requirements,
          topicShares: account.confluence.topicShares,
          edits: account.confluence.edits,
        },
        claimedBy: [],
      }));
    } catch (error) {
      warnings.push('confluence 数据源不可用，已降级为空');
      this.logger.warn(`confluence 候选降级：${(error as Error).message}`);
      return [];
    }
  }

  private async loadMeeting(warnings: string[]): Promise<MeetingIdentityCandidate[]> {
    try {
      const { data } = await this.meetings.read();
      const seen = new Set<string>();
      const list: MeetingIdentityCandidate[] = [];
      for (const name of data.columns) {
        if (seen.has(name)) continue;
        seen.add(name);
        list.push({ source: 'meeting', accountKey: name, displayName: name, claimedBy: [] });
      }
      return list;
    } catch (error) {
      warnings.push('meeting 数据源不可用，已降级为空');
      this.logger.warn(`meeting 候选降级：${(error as Error).message}`);
      return [];
    }
  }
}

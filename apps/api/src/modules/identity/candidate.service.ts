import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Contributor,
  IdentityCandidate,
  IdentityCandidateOwner,
  IdentityCandidatesData,
  IdentityClaim,
  MeetingAttendanceMatrix,
  OrganizationWiki,
  Person,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  CONTRIBUTORS_REPOSITORY,
  IDENTITY_CLAIMS_REPOSITORY,
  WIKI_REPOSITORY,
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
 */
@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(
    @Inject(CONTRIBUTORS_REPOSITORY) private readonly contributors: JsonRepository<Contributor[]>,
    @Inject(WIKI_REPOSITORY) private readonly wiki: JsonRepository<OrganizationWiki[]>,
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

    const attach = (list: IdentityCandidate[]): IdentityCandidate[] =>
      list.map((item) => ({
        ...item,
        claimedBy: ownersByKey.get(candidateKey(item.source, item.accountKey)) ?? [],
      }));

    return {
      github: attach(github),
      confluence: attach(confluence),
      meeting: attach(meeting),
      warnings,
    };
  }

  private async loadGithub(warnings: string[]): Promise<IdentityCandidate[]> {
    try {
      const { data } = await this.contributors.read();
      return data.map((contributor) => ({
        source: 'github' as const,
        accountKey: String(contributor.githubId),
        displayName: contributor.name,
        ...(contributor.avatarUrl ? { avatarUrl: contributor.avatarUrl } : {}),
        claimedBy: [],
      }));
    } catch (error) {
      warnings.push('github 数据源不可用，已降级为空');
      this.logger.warn(`github 候选降级：${(error as Error).message}`);
      return [];
    }
  }

  private async loadConfluence(warnings: string[]): Promise<IdentityCandidate[]> {
    try {
      const { data } = await this.wiki.read();
      warnings.push(
        data.length === 0 ? 'confluence 数据源暂无数据' : 'confluence 账号级候选尚未接入',
      );
      return [];
    } catch (error) {
      warnings.push('confluence 数据源不可用，已降级为空');
      this.logger.warn(`confluence 候选降级：${(error as Error).message}`);
      return [];
    }
  }

  private async loadMeeting(warnings: string[]): Promise<IdentityCandidate[]> {
    try {
      const { data } = await this.meetings.read();
      const seen = new Set<string>();
      const list: IdentityCandidate[] = [];
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

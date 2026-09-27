import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-code';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  ClaimDeleteResult,
  IdentityClaim,
  Organization,
  Person,
  PersonDeleteResult,
  PersonListItem,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import {
  IDENTITY_CLAIMS_REPOSITORY,
  ORGANIZATIONS_REPOSITORY,
  PERSONS_REPOSITORY,
} from '../../repositories/repository.tokens';
import { CreateClaimDto } from './dto/create-claim.dto';
import { CreatePersonDto } from './dto/create-person.dto';
import { ListPersonsQueryDto } from './dto/list-persons-query.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { IdentityAuditService } from './identity-audit.service';

/** 展示名 → 可读 slug；无法生成 ASCII slug 时退化为 `person` */
function toSlug(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'person';
}

/** 冲突时统一追加顺序号：person-2、person-3 … */
function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function sortPersons(list: Person[]): Person[] {
  return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hans-CN'));
}

/**
 * 自然人档案与身份认领边的写侧服务（04 §5.3.14）。
 * 跨文件操作固定**先改边、后改点**；仅改归属只写 `persons.json` 单文件。
 */
@Injectable()
export class PersonService {
  private readonly logger = new Logger(PersonService.name);

  constructor(
    @Inject(PERSONS_REPOSITORY) private readonly persons: JsonRepository<Person[]>,
    @Inject(IDENTITY_CLAIMS_REPOSITORY) private readonly claims: JsonRepository<IdentityClaim[]>,
    @Inject(ORGANIZATIONS_REPOSITORY) private readonly organizations: JsonRepository<Organization[]>,
    private readonly audit: IdentityAuditService,
  ) {}

  /** GET /api/identity/persons —— 自然人列表（派生 claimCount） */
  async listPersons(query: ListPersonsQueryDto): Promise<PersonListItem[]> {
    const [persons, claims] = await Promise.all([this.persons.read(), this.claims.read()]);

    const claimCount = new Map<string, number>();
    for (const claim of claims.data) {
      claimCount.set(claim.personId, (claimCount.get(claim.personId) ?? 0) + 1);
    }

    const keyword = query.keyword?.toLowerCase();

    const filtered = persons.data.filter((person) => {
      if (query.orgId !== undefined) {
        if (query.orgId === 'none') {
          if (person.orgId !== null) return false;
        } else if (person.orgId !== query.orgId) {
          return false;
        }
      }
      if (keyword) {
        const haystack = `${person.displayName} ${person.personId}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    return sortPersons(filtered).map((person) => ({
      ...person,
      claimCount: claimCount.get(person.personId) ?? 0,
    }));
  }

  /** GET /api/identity/claims —— 认领边全量列表，按 createdAt 升序 */
  async listClaims(): Promise<IdentityClaim[]> {
    const { data } = await this.claims.read();
    return [...data].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** POST /api/identity/persons —— 新建自然人 */
  async createPerson(dto: CreatePersonDto): Promise<Person> {
    const now = new Date().toISOString();
    let created: Person | null = null;

    await this.persons.update((list) => {
      const taken = new Set(list.map((person) => person.personId));
      const personId = uniqueSlug(toSlug(dto.displayName), taken);
      created = {
        personId,
        displayName: dto.displayName,
        orgId: null,
        createdAt: now,
        updatedAt: now,
      };
      return [...list, created];
    });

    const person = created as unknown as Person;
    await this.audit.record({
      action: 'person.create',
      personId: person.personId,
      detail: { displayName: person.displayName },
    });
    this.logger.log(`创建自然人 ${person.personId}`);
    return person;
  }

  /** PATCH /api/identity/persons/:personId —— 重命名 / 调整归属 */
  async updatePerson(personId: string, dto: UpdatePersonDto): Promise<Person> {
    if (dto.displayName === undefined && dto.orgId === undefined) {
      throw new DomainException(ErrorCode.BAD_REQUEST, '至少提供 displayName 或 orgId 之一');
    }

    const current = (await this.persons.read()).data.find((person) => person.personId === personId);
    if (!current) throw new DomainException(ErrorCode.PERSON_NOT_FOUND);

    if (dto.orgId !== undefined && dto.orgId !== null) {
      await this.assertAssignableOrg(dto.orgId);
    }

    const now = new Date().toISOString();
    await this.persons.update((list) =>
      list.map((person) =>
        person.personId === personId
          ? {
              ...person,
              displayName: dto.displayName ?? person.displayName,
              orgId: dto.orgId === undefined ? person.orgId : dto.orgId,
              updatedAt: now,
            }
          : person,
      ),
    );

    const updated = (await this.persons.read()).data.find((person) => person.personId === personId);
    await this.audit.record({
      action: 'person.update',
      personId,
      detail: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.orgId !== undefined ? { orgId: dto.orgId } : {}),
      },
    });
    this.logger.log(`更新自然人 ${personId}`);
    return updated as Person;
  }

  /**
   * DELETE /api/identity/persons/:personId —— 物理删除（不可逆，仅限误建/重复提取）。
   * 跨文件操作固定**先改边、后改点**：先解除其全部认领边，再删除自然人本体。
   */
  async deletePerson(personId: string): Promise<PersonDeleteResult> {
    const person = (await this.persons.read()).data.find((item) => item.personId === personId);
    if (!person) throw new DomainException(ErrorCode.PERSON_NOT_FOUND);

    // 先改边：解除该自然人全部认领
    const claims = await this.claims.read();
    const removedClaims = claims.data.filter((claim) => claim.personId === personId).length;
    if (removedClaims > 0) {
      await this.claims.update((list) => list.filter((claim) => claim.personId !== personId));
    }

    // 后改点：物理删除本体
    await this.persons.update((list) => list.filter((item) => item.personId !== personId));
    await this.audit.record({ action: 'person.delete', personId, detail: { removedClaims } });
    this.logger.warn(`物理删除自然人 ${personId}（一并解除 ${removedClaims} 条认领）`);

    return { personId, removedClaims };
  }

  /** POST /api/identity/claims —— 认领来源账号 */
  async createClaim(dto: CreateClaimDto): Promise<IdentityClaim> {
    const person = (await this.persons.read()).data.find((item) => item.personId === dto.personId);
    if (!person) throw new DomainException(ErrorCode.PERSON_NOT_FOUND);

    const claims = await this.claims.read();
    const duplicated = claims.data.some(
      (claim) =>
        claim.personId === dto.personId &&
        claim.source === dto.source &&
        claim.accountKey === dto.accountKey,
    );
    if (duplicated) throw new DomainException(ErrorCode.CLAIM_DUPLICATED);

    const conflicting = claims.data.some(
      (claim) => claim.source === dto.source && claim.accountKey === dto.accountKey,
    );
    if (conflicting) {
      this.logger.warn(`账号冲突：${dto.source}:${dto.accountKey} 已指向其他自然人（允许并提示）`);
    }

    const claim: IdentityClaim = {
      claimId: `clm_${randomUUID()}`,
      personId: dto.personId,
      source: dto.source,
      accountKey: dto.accountKey,
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      createdAt: new Date().toISOString(),
    };
    await this.claims.update((list) => [...list, claim]);
    await this.audit.record({
      action: 'claim.create',
      personId: claim.personId,
      claimId: claim.claimId,
      source: claim.source,
      accountKey: claim.accountKey,
    });
    this.logger.log(`认领 ${claim.source}:${claim.accountKey} → ${claim.personId}`);
    return claim;
  }

  /** DELETE /api/identity/claims/:claimId —— 解除认领（物理删边，账号回池） */
  async deleteClaim(claimId: string): Promise<ClaimDeleteResult> {
    const claim = (await this.claims.read()).data.find((item) => item.claimId === claimId);
    if (!claim) throw new DomainException(ErrorCode.IDENTITY_CLAIM_NOT_FOUND);

    await this.claims.update((list) => list.filter((item) => item.claimId !== claimId));
    await this.audit.record({
      action: 'claim.delete',
      personId: claim.personId,
      claimId: claim.claimId,
      source: claim.source,
      accountKey: claim.accountKey,
    });
    this.logger.log(`解除认领 ${claim.claimId}`);
    return {
      claimId: claim.claimId,
      personId: claim.personId,
      source: claim.source,
      accountKey: claim.accountKey,
    };
  }

  /** 校验归属目标：必须存在且非伪组织 */
  private async assertAssignableOrg(orgId: string): Promise<void> {
    const org = (await this.organizations.read()).data.find((item) => item.orgId === orgId);
    if (!org) throw new DomainException(ErrorCode.ORGANIZATION_NOT_FOUND);
    if (org.type === 'individual') throw new DomainException(ErrorCode.INVALID_ORG_ASSIGNMENT);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Organization, OrgRosterData, OrgRosterEntry, Person, PersonRef } from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import { ORGANIZATIONS_REPOSITORY, PERSONS_REPOSITORY } from '../../repositories/repository.tokens';

function sortByName(list: Person[]): Person[] {
  return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hans-CN'));
}

function toRef(person: Person): PersonRef {
  return {
    personId: person.personId,
    displayName: person.displayName,
    ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
  };
}

/**
 * 组织花名册派生（04 §5.3.13）：**不落盘**，由 `Person.orgId` 分组派生。
 * 组织清单只读取自 `organizations.json`，排除伪组织（`type = 'individual'`）。
 */
@Injectable()
export class OrgRosterService {
  constructor(
    @Inject(PERSONS_REPOSITORY) private readonly persons: JsonRepository<Person[]>,
    @Inject(ORGANIZATIONS_REPOSITORY) private readonly organizations: JsonRepository<Organization[]>,
  ) {}

  async getRoster(): Promise<OrgRosterData> {
    const [persons, organizations] = await Promise.all([
      this.persons.read(),
      this.organizations.read(),
    ]);

    const byOrg = new Map<string, Person[]>();
    for (const person of persons.data) {
      if (person.orgId === null) continue;
      const members = byOrg.get(person.orgId) ?? [];
      members.push(person);
      byOrg.set(person.orgId, members);
    }

    const entries: OrgRosterEntry[] = organizations.data
      .filter((organization) => organization.type !== 'individual')
      .map((organization) => {
        const members = sortByName(byOrg.get(organization.orgId) ?? []).map(toRef);
        return {
          organization,
          memberCount: members.length,
          members,
        };
      });

    const unassigned = sortByName(
      persons.data.filter((person) => person.orgId === null),
    ).map(toRef);

    return { organizations: entries, unassigned, updatedAt: new Date().toISOString() };
  }
}

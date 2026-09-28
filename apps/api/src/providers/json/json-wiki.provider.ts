import { Inject, Injectable } from '@nestjs/common';
import { OrganizationWiki } from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import { WIKI_REPOSITORY } from '../../repositories/repository.tokens';
import { WikiPort, WikiQuery } from '../ports/wiki.port';

@Injectable()
export class JsonWikiProvider implements WikiPort {
  constructor(
    @Inject(WIKI_REPOSITORY)
    private readonly repository: JsonRepository<OrganizationWiki[]>,
  ) {}

  async getWiki(query: WikiQuery): Promise<OrganizationWiki[]> {
    const { data } = await this.repository.read();

    if (!query.orgIds?.length) {
      return data;
    }

    const whitelist = new Set(query.orgIds);
    return data.filter((item) => whitelist.has(item.orgId));
  }
}

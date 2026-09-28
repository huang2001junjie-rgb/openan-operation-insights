import { OrganizationWiki } from '../../contract/entities';

export type { OrganizationWiki };

export interface WikiQuery {
  orgIds?: string[];
  from?: string;
  to?: string;
}

export interface WikiPort {
  getWiki(query: WikiQuery): Promise<OrganizationWiki[]>;
}

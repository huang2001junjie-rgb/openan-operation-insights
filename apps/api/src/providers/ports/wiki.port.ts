import { OrganizationWiki } from '../../contract/entities';

export type { OrganizationWiki };

export interface WikiQuery {
  orgIds?: string[];
  /**
   * ISO 8601。**接受但恒不参与过滤**（ADR-0018 决策 5）：组织级 Confluence 由账号级累计计数
   * 派生，没有事件级时间维度可切，故本端口恒为**全量口径（All-time）**。
   * 与 GitHub 侧的区间口径混排时由前端标注「全历史」，不静默改数字。
   */
  from?: string;
  to?: string;
}

export interface WikiPort {
  getWiki(query: WikiQuery): Promise<OrganizationWiki[]>;
}

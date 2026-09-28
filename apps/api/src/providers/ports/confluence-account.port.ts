import { ConfluenceAccount, ConfluenceAccountView } from '../../contract/entities';

export type { ConfluenceAccount, ConfluenceAccountView };

export interface ConfluenceAccountQuery {
  orgIds?: string[];
  /** ISO 8601；阶段一不生效，阶段三由采集器在落盘时决定区间 */
  from?: string;
  to?: string;
}

/**
 * 账号级 Confluence 端口（ADR-0008 / ADR-0010）：
 * 读取 confluence-accounts.json 中的**平台账号**事实，并叠加读时派生的**生效归属**，
 * 供个人维度的 Confluence 贡献展示、候选池与身份匹配控制台使用。
 * 组织级（WikiPort）与账号级各自读同一批原子事实派生，互不写文件。
 */
export interface ConfluenceAccountPort {
  getConfluenceAccounts(query: ConfluenceAccountQuery): Promise<ConfluenceAccountView[]>;
}

import { ConfluenceAccount, ConfluenceAccountView } from '../../contract/entities';

export type { ConfluenceAccount, ConfluenceAccountView };

export interface ConfluenceAccountQuery {
  orgIds?: string[];
  /**
   * ISO 8601。**接受但恒不参与过滤**（ADR-0018 决策 5）：Confluence 侧落盘的是账号级
   * **累计计数**（requirements / topicShares / edits），没有可切片的事件级时间维度，
   * 故本端口恒为**全量口径（All-time）**。
   *
   * 不报错、不静默改数字：由前端在 Confluence 视图下**禁用区间筛选器**并标注「全历史」，
   * 让口径差异对用户可见。补 Confluence 事件级事实后再激活（遗留债，见 06 文档）。
   */
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

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** 审计动作（04 §5.3.15） */
export type IdentityAuditAction =
  | 'person.create'
  | 'person.update'
  | 'person.delete'
  | 'claim.create'
  | 'claim.delete';

/** 审计单行结构（JSON Lines） */
export interface IdentityAuditEntry {
  /** 操作时间（ISO 8601 UTC） */
  at: string;
  action: IdentityAuditAction;
  personId: string;
  /** 仅 claim.* */
  claimId?: string;
  /** 仅 claim.* */
  source?: string;
  /** 仅 claim.* */
  accountKey?: string;
  /** 变更摘要，如 { orgId: 'huawei' } */
  detail?: Record<string, unknown>;
}

/**
 * 身份匹配审计（04 §5.3.15）：向 `data/.identity-audit.jsonl` **仅追加**。
 *
 * - **非契约**、不参与结构校验、接口不返回（先例同 `data/.sync-state.json`）；
 * - 只记标识与结构变化，**不得**写入令牌、邮箱等个人信息；
 * - 写审计失败**不使主操作失败**（仅记 `WARN`），保证归属数据优先落盘。
 */
@Injectable()
export class IdentityAuditService {
  private readonly logger = new Logger(IdentityAuditService.name);
  private readonly filePath: string;

  constructor(config: ConfigService) {
    this.filePath = join(config.getOrThrow<string>('dataDir'), '.identity-audit.jsonl');
  }

  async record(entry: Omit<IdentityAuditEntry, 'at'>): Promise<void> {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${line}\n`, 'utf8');
    } catch (error) {
      this.logger.warn(`写入身份审计失败（不影响主操作）：${(error as Error).message}`);
    }
  }
}

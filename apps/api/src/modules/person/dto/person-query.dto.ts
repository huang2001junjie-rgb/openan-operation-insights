import { IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ToTrimmedString } from '../../../common/dto/transforms';
import { ErrorCode } from '../../../common/constants/error-code';
import { DomainException } from '../../../common/exceptions/domain.exception';

/**
 * 个人模式（Person Mode）查询参数 —— GET /api/person-* 四个端点（04 §5.3.19-22）。
 *
 * **区间口径（ADR-0018）**：`from` / `to` 是 ISO 8601 **时刻**，半开区间 `from <= timestamp < to`，
 * 两侧缺省 ≡ 全量口径（All-time）；只有 GitHub 事件明细与自然人的 GitHub 聚合按区间生效，
 * Confluence 账号级计数与需求级事实恒「全历史」，不接受 from/to。
 */

/** 自然人级贡献聚合查询（04 §5.3.19） */
export class PersonContributionsQueryDto {
  /** 自然人 personId */
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  personId!: string;

  /** 下界（含）；作用于 GitHub 聚合，Confluence 恒全历史 */
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  /** 上界（不含）；同上 */
  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  assertRange(): void {
    if (this.from && this.to && Date.parse(this.from) > Date.parse(this.to)) {
      throw new DomainException(ErrorCode.INVALID_DATE_RANGE);
    }
  }
}

/** 明细选择器（personId / account 二选一）：两都传或都不传均为 40001 */
function assertEntitySelector(personId: string | undefined, account: string | undefined): void {
  const hasPerson = Boolean(personId?.trim());
  const hasAccount = Boolean(account?.trim());
  if (hasPerson === hasAccount) {
    throw new DomainException(
      ErrorCode.VALIDATION_FAILED,
      'personId 与 account 必须二选一：自然人模式传 personId={personId}，账号模式传 account={accountKey}',
    );
  }
}

/** GitHub 事件明细查询（04 §5.3.20） */
export class PersonGithubEventsQueryDto {
  /** 自然人 personId（与 account 二选一） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  personId?: string;

  /** 单账号键：GitHub 接受 login 或 githubId 字符串（二选一） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  account?: string;

  /** 下界（含） */
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  /** 上界（不含） */
  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  /** 返回条数上限（默认 500，最大 1000）；命中超过上限返回 truncated=true */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  assertValid(): void {
    assertEntitySelector(this.personId, this.account);
    if (this.from && this.to && Date.parse(this.from) > Date.parse(this.to)) {
      throw new DomainException(ErrorCode.INVALID_DATE_RANGE);
    }
  }
}

/** Confluence 需求明细查询（04 §5.3.21）：恒全历史，不接受 from/to */
export class PersonConfluenceRequirementsQueryDto {
  /** 自然人 personId（与 account 二选一） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  personId?: string;

  /** 单账号键：Confluence accountId（二选一） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  account?: string;

  assertValid(): void {
    assertEntitySelector(this.personId, this.account);
  }
}

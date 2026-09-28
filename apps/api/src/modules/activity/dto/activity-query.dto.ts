import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { ToStringArray } from '../../../common/dto/transforms';
import { ErrorCode } from '../../../common/constants/error-code';
import { DomainException } from '../../../common/exceptions/domain.exception';

/** orgIds / from / to 三个筛选维度在三类活动查询中完全一致 */
export abstract class TimeRangeQueryDto {
  @IsOptional()
  @ToStringArray()
  orgIds?: string[];

  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  /** from 不得晚于 to */
  assertRange(): void {
    if (this.from && this.to && Date.parse(this.from) > Date.parse(this.to)) {
      throw new DomainException(ErrorCode.INVALID_DATE_RANGE);
    }
  }
}

export class ListContributionsQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(['pullRequests', 'commits', 'issues', 'linesChanged', 'repos'])
  sortBy?: 'pullRequests' | 'commits' | 'issues' | 'linesChanged' | 'repos';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** 个人维度贡献（ADR-0003）：sortBy 与组织贡献同构，默认按 commits 排序 */
export class ListContributorContributionsQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(['pullRequests', 'commits', 'issues', 'linesChanged', 'repos'])
  sortBy?: 'pullRequests' | 'commits' | 'issues' | 'linesChanged' | 'repos';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListWikiQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(['requirements', 'topicShares'])
  sortBy?: 'requirements' | 'topicShares';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** 账号级 Confluence 明细（ADR-0008）：sortBy 与组织级 wiki 同构，默认按 requirements 排序 */
export class ListConfluenceAccountsQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(['requirements', 'topicShares'])
  sortBy?: 'requirements' | 'topicShares';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ContributionSummaryQueryDto extends TimeRangeQueryDto {}

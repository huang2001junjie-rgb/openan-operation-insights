import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { ToStringArray } from '../../../common/dto/transforms';
import { ErrorCode } from '../../../common/constants/error-code';
import { DomainException } from '../../../common/exceptions/domain.exception';

/**
 * orgIds / from / to 三个筛选维度在三类活动查询中完全一致。
 *
 * **区间口径（ADR-0018）**：
 * - `from` / `to` 是 ISO 8601 **时刻**，语义为半开区间 `from <= timestamp < to`；
 *   结束日期由前端翻成「次日零点」，于是「1 月 1 日 ～ 1 月 31 日」覆盖 31 个整天，不吞最后一天；
 * - 日界按 **Asia/Shanghai** 切，由**前端**在翻时刻时决定，后端只比 epoch 毫秒、不解析时区；
 * - 两侧都缺省 ≡ **全量口径（All-time）**，数字与激活区间筛选之前完全一致；
 * - 只有 **GitHub 侧**按事件 `timestamp` 生效（PR=mergedAt、Issue=createdAt）；
 *   Confluence 侧无事件级时间维度，恒为全量口径，由前端标注「全历史」（见 06 文档遗留债）。
 */
export abstract class TimeRangeQueryDto {
  @IsOptional()
  @ToStringArray()
  orgIds?: string[];

  /** 下界（含） */
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  /** 上界（不含） */
  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  /**
   * from 不得晚于 to。
   *
   * `from == to` **合法**：半开区间下它是一个空区间（返回全 0 桶 / 空榜单），不是参数错误——
   * 前端单日筛选（from=to=同一天 00:00）依赖这个行为时会得到空结果，故前端单日场景应把
   * 上界翻成次日零点，而不是让 from 与 to 相等。
   */
  assertRange(): void {
    if (this.from && this.to && Date.parse(this.from) > Date.parse(this.to)) {
      throw new DomainException(ErrorCode.INVALID_DATE_RANGE);
    }
  }
}

export class ListContributionsQueryDto extends TimeRangeQueryDto {
  /** 仓库组合筛选（`owner/repo` 全名，逗号分隔）；缺省/空 ≡ 不过滤（全选） */
  @IsOptional()
  @ToStringArray()
  repoIds?: string[];

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
  /** 仓库组合筛选（`owner/repo` 全名，逗号分隔）；缺省/空 ≡ 不过滤（全选） */
  @IsOptional()
  @ToStringArray()
  repoIds?: string[];

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

/**
 * 账号级 Confluence 明细（ADR-0008）：默认按 requirements 排序。
 * sortBy 较组织级 wiki 多一个 `edits`（v1.24，ADR-0016）——与首页组织卡「Confluence 贡献量」及该维度 top3 口径对齐。
 */
export class ListConfluenceAccountsQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(['requirements', 'topicShares', 'edits'])
  sortBy?: 'requirements' | 'topicShares' | 'edits';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ContributionSummaryQueryDto extends TimeRangeQueryDto {
  /** 仓库组合筛选；仅作用于 GitHub 侧合计（Confluence 无仓库概念，不受影响） */
  @IsOptional()
  @ToStringArray()
  repoIds?: string[];
}

/**
 * 仓库维度贡献（D1）：由 github-events.json 读时派生。
 * 不接受 repoIds（行指标不随筛选变化，前端客户端挑行）；默认按 commits 降序。
 */
export class ListRepoContributionsQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(['pullRequests', 'commits', 'issues', 'linesChanged', 'contributors', 'orgs'])
  sortBy?: 'pullRequests' | 'commits' | 'issues' | 'linesChanged' | 'contributors' | 'orgs';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

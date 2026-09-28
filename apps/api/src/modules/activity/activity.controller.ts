import { Controller, Get, Query } from '@nestjs/common';
import {
  ConfluenceAccountView,
  ContributionSummaryData,
  ContributorContribution,
  OrganizationContribution,
  OrganizationWiki,
} from '../../contract/entities';
import { ActivityService } from './activity.service';
import {
  ContributionSummaryQueryDto,
  ListConfluenceAccountsQueryDto,
  ListContributionsQueryDto,
  ListContributorContributionsQueryDto,
  ListWikiQueryDto,
} from './dto/activity-query.dto';

@Controller()
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  /** GET /api/contributions —— 社区活跃度：GitHub 贡献明细 */
  @Get('contributions')
  listContributions(@Query() query: ListContributionsQueryDto): Promise<OrganizationContribution[]> {
    return this.activityService.listContributions(query);
  }

  /** GET /api/contributor-contributions —— 社区活跃度：个人贡献明细（ADR-0003） */
  @Get('contributor-contributions')
  listContributorContributions(
    @Query() query: ListContributorContributionsQueryDto,
  ): Promise<ContributorContribution[]> {
    return this.activityService.listContributorContributions(query);
  }

  /** GET /api/contributions/summary —— 汇总指标（环形图数据源） */
  @Get('contributions/summary')
  getContributionSummary(
    @Query() query: ContributionSummaryQueryDto,
  ): Promise<ContributionSummaryData> {
    return this.activityService.getSummary(query);
  }

  /** GET /api/wiki —— 社区活跃度：wiki（Confluence）工作量明细 */
  @Get('wiki')
  listWiki(@Query() query: ListWikiQueryDto): Promise<OrganizationWiki[]> {
    return this.activityService.listWiki(query);
  }

  /** GET /api/confluence-accounts —— Confluence：账号级贡献明细（生效口径，ADR-0008 / ADR-0010） */
  @Get('confluence-accounts')
  listConfluenceAccounts(
    @Query() query: ListConfluenceAccountsQueryDto,
  ): Promise<ConfluenceAccountView[]> {
    return this.activityService.listConfluenceAccounts(query);
  }
}

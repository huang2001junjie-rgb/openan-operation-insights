import { Controller, Get, Query } from '@nestjs/common';
import {
  PersonCandidatesData,
  PersonConfluenceRequirementsData,
  PersonContributionsData,
  PersonGithubEventsData,
} from '../../contract/entities';
import { PersonInsightService } from './person-insight.service';
import {
  PersonConfluenceRequirementsQueryDto,
  PersonContributionsQueryDto,
  PersonGithubEventsQueryDto,
} from './dto/person-query.dto';

/**
 * 个人模式（Person Mode）读时派生端点（ADR-0020）：
 * - 自然人视图 = 跨来源统一画像（一屏 GitHub + Confluence，各自标注时间口径）；
 * - 账号视图 = 单平台账号（候选池见 GET /api/person-candidates）；
 * - 全部聚合数字读时派生（服务端口径唯一），前端不得自行重算。
 */
@Controller()
export class PersonController {
  constructor(private readonly personService: PersonInsightService) {}

  /** GET /api/person-contributions —— 自然人跨来源统一画像（04 §5.3.19） */
  @Get('person-contributions')
  getPersonContributions(
    @Query() query: PersonContributionsQueryDto,
  ): Promise<PersonContributionsData> {
    query.assertRange();
    return this.personService.getPersonContributions(query);
  }

  /** GET /api/person-github-events —— GitHub 事件明细下钻（04 §5.3.20，半开区间 + truncated） */
  @Get('person-github-events')
  getPersonGithubEvents(@Query() query: PersonGithubEventsQueryDto): Promise<PersonGithubEventsData> {
    query.assertValid();
    return this.personService.getPersonGithubEvents(query);
  }

  /** GET /api/person-confluence-requirements —— Confluence 需求明细下钻（04 §5.3.21，恒全历史） */
  @Get('person-confluence-requirements')
  getPersonConfluenceRequirements(
    @Query() query: PersonConfluenceRequirementsQueryDto,
  ): Promise<PersonConfluenceRequirementsData> {
    query.assertValid();
    return this.personService.getPersonConfluenceRequirements(query);
  }

  /** GET /api/person-candidates —— 个人模式选择器候选（04 §5.3.22，只列有贡献的实体） */
  @Get('person-candidates')
  getPersonCandidates(): Promise<PersonCandidatesData> {
    return this.personService.getPersonCandidates();
  }
}

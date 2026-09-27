import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NoStoreCache } from '../../common/decorators/no-store-cache.decorator';
import { AdminTokenGuard } from '../../common/guards/admin-token.guard';
import {
  ClaimDeleteResult,
  IdentityCandidatesData,
  IdentityClaim,
  OrgRosterData,
  Person,
  PersonDeleteResult,
  PersonListItem,
} from '../../contract/entities';
import { CandidateService } from './candidate.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { CreatePersonDto } from './dto/create-person.dto';
import { ListPersonsQueryDto } from './dto/list-persons-query.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { OrgRosterService } from './org-roster.service';
import { PersonService } from './person.service';

/**
 * 身份匹配控制台（04 §5.3.10～§5.3.15）。
 * 只读 GET 不鉴权；写接口统一挂 `AdminTokenGuard`。
 *
 * 整个控制器标注 `@NoStoreCache()`：这里的数据可被写接口即时改变，
 * 若沿用默认 `private, max-age=60`，浏览器会在最多 60s 内回放旧的 GET 响应，
 * 导致"刚创建的自然人不显示、强刷才出现"。控制台类路由一律禁用 HTTP 缓存。
 */
@Controller('identity')
@NoStoreCache()
export class IdentityController {
  constructor(
    private readonly personService: PersonService,
    private readonly candidateService: CandidateService,
    private readonly orgRosterService: OrgRosterService,
  ) {}

  // ── 只读 ──────────────────────────────────────────────────────────

  @Get('persons')
  listPersons(@Query() query: ListPersonsQueryDto): Promise<PersonListItem[]> {
    return this.personService.listPersons(query);
  }

  @Get('claims')
  listClaims(): Promise<IdentityClaim[]> {
    return this.personService.listClaims();
  }

  @Get('candidates')
  getCandidates(): Promise<IdentityCandidatesData> {
    return this.candidateService.getCandidates();
  }

  @Get('org-roster')
  getRoster(): Promise<OrgRosterData> {
    return this.orgRosterService.getRoster();
  }

  // ── 写（需 X-Admin-Token） ────────────────────────────────────────

  @Post('persons')
  @UseGuards(AdminTokenGuard)
  @NoStoreCache()
  createPerson(@Body() dto: CreatePersonDto): Promise<Person> {
    return this.personService.createPerson(dto);
  }

  @Patch('persons/:personId')
  @UseGuards(AdminTokenGuard)
  @NoStoreCache()
  updatePerson(@Param('personId') personId: string, @Body() dto: UpdatePersonDto): Promise<Person> {
    return this.personService.updatePerson(personId, dto);
  }

  /** 物理删除（不可逆，仅限误建/重复提取；先解除其全部认领边再删除本体） */
  @Delete('persons/:personId')
  @UseGuards(AdminTokenGuard)
  @NoStoreCache()
  deletePerson(@Param('personId') personId: string): Promise<PersonDeleteResult> {
    return this.personService.deletePerson(personId);
  }

  @Post('claims')
  @UseGuards(AdminTokenGuard)
  @NoStoreCache()
  createClaim(@Body() dto: CreateClaimDto): Promise<IdentityClaim> {
    return this.personService.createClaim(dto);
  }

  @Delete('claims/:claimId')
  @UseGuards(AdminTokenGuard)
  @NoStoreCache()
  deleteClaim(@Param('claimId') claimId: string): Promise<ClaimDeleteResult> {
    return this.personService.deleteClaim(claimId);
  }
}

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrganizationType } from '../../../contract/entities';
import { ToTrimmedString } from '../../../common/dto/transforms';

export class ListOrganizationsQueryDto {
  /** all（默认）| contributing：返回全部组织并附带综合贡献分与等级，按贡献分降序（ADR-0001） */
  @IsOptional()
  @IsIn(['all', 'contributing'])
  scope?: 'all' | 'contributing';

  @IsOptional()
  @IsIn(['tsc', 'participant', 'individual'])
  type?: OrganizationType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  keyword?: string;
}

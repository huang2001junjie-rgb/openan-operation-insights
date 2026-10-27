import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrganizationType } from '../../../contract/entities';
import { ToTrimmedString } from '../../../common/dto/transforms';

export class ListOrganizationsQueryDto {
  /** all（默认）| contributing：contributing 过滤出有贡献的组织，附带两项贡献量与 top3 贡献者；两种 scope 均按 displayOrder 升序（ADR-0016） */
  @IsOptional()
  @IsIn(['all', 'contributing'])
  scope?: 'all' | 'contributing';

  @IsOptional()
  @IsIn(['tsc', 'participant', 'operation', 'individual'])
  type?: OrganizationType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  keyword?: string;
}

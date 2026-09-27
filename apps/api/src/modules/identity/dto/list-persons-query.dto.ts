import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ToTrimmedString } from '../../../common/dto/transforms';

/** 自然人列表查询参数（04 §5.3.10） */
export class ListPersonsQueryDto {
  /** 按 displayName / personId 不区分大小写模糊匹配 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  keyword?: string;

  /** 归属组织；特殊值 `none` 表示只取未归属（orgId = null） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ToTrimmedString()
  orgId?: string;
}

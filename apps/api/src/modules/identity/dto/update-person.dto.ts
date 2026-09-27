import { IsOptional, IsString, Length } from 'class-validator';
import { ToTrimmedString } from '../../../common/dto/transforms';

/**
 * 重命名 / 调整归属（04 §5.3.14 ②）。
 * 字段均可选，但**至少提供一项**，否则服务层返回 `40000`。
 * `orgId` 显式为 `null` 表示置为未归属。
 */
export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @ToTrimmedString()
  displayName?: string;

  @IsOptional()
  @IsString()
  @ToTrimmedString()
  orgId?: string | null;
}

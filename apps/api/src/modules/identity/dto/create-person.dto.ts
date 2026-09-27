import { IsString, Length } from 'class-validator';
import { ToTrimmedString } from '../../../common/dto/transforms';

export class CreatePersonDto {
  /** 展示名，1～64 字符（trim 后非空）；personId 由服务端生成 */
  @IsString()
  @Length(1, 64)
  @ToTrimmedString()
  displayName!: string;
}

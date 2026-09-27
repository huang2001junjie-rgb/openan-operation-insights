import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ToTrimmedString } from '../../../common/dto/transforms';
import { IdentitySource } from '../../../contract/entities';

/** 认领来源账号（04 §5.3.14 ⑤） */
export class CreateClaimDto {
  @IsString()
  @Length(1, 128)
  @ToTrimmedString()
  personId!: string;

  @IsIn(['github', 'confluence', 'meeting'])
  source!: IdentitySource;

  /** 来源内稳定标识：github=githubId、confluence=accountId、meeting=人名原文（**不 trim**，须与候选池逐字一致） */
  @IsString()
  @Length(1, 256)
  accountKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;
}

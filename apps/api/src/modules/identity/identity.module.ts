import { Module } from '@nestjs/common';
import { AdminTokenGuard } from '../../common/guards/admin-token.guard';
import { CandidateService } from './candidate.service';
import { IdentityAuditService } from './identity-audit.service';
import { IdentityController } from './identity.controller';
import { OrgRosterService } from './org-roster.service';
import { PersonService } from './person.service';

/**
 * 身份匹配控制台模块（04 §5.1 / §5.3）。
 * `RepositoriesModule` 为 `@Global()`，两个写侧仓储（persons / identity-claims）
 * 与既有只读仓储均直接注入，不经只读 Port 间接层。
 */
@Module({
  controllers: [IdentityController],
  providers: [PersonService, CandidateService, OrgRosterService, IdentityAuditService, AdminTokenGuard],
})
export class IdentityModule {}

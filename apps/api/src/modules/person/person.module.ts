import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PersonController } from './person.controller';
import { PersonInsightService } from './person-insight.service';

/**
 * 个人模式（Person Mode，ADR-0020）：自然人 / 账号 聚焦下钻的读时派生端点。
 * 与 identity 模块同款装配（直接读 contract 仓储）；仓储契约见 04 §2 / §3.16 / §3.17。
 */
@Module({
  imports: [RepositoriesModule],
  controllers: [PersonController],
  providers: [PersonInsightService],
})
export class PersonModule {}

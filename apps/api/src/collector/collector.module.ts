import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import configuration, { ConfluenceConfig, GithubConfig } from '../config/configuration';
import { validateEnv } from '../config/env.validation';
import { RepositoriesModule } from '../repositories/repositories.module';
import { GITHUB_SOURCE, CONFLUENCE_SOURCE } from './collector.tokens';
import { ConfluenceCollectorService } from './confluence-collector.service';
import { ConfluenceRestSource } from './confluence-rest.source';
import { ConfluenceStateStore } from './confluence-state.store';
import { FixtureConfluenceSource } from './fixture-confluence.source';
import type { ConfluenceSource } from './confluence-source.types';
import { ContributionCollectorService } from './contribution-collector.service';
import { FixtureGithubSource } from './fixture-github.source';
import { GithubSource } from './github-source.types';
import { GraphqlGithubSource } from './graphql-github.source';
import { SyncStateStore } from './sync-state.store';

/**
 * 采集器独立上下文：**不启动 HTTP 服务**，只跑采集并落盘。
 * 与 AppModule 解耦，避免采集链路被请求链路触发（见 05 文档 2.5 读写分离）。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    RepositoriesModule,
  ],
  providers: [
    ContributionCollectorService,
    ConfluenceCollectorService,
    {
      provide: SyncStateStore,
      useFactory: (config: ConfigService) =>
        new SyncStateStore(config.getOrThrow<string>('dataDir')),
      inject: [ConfigService],
    },
    {
      provide: ConfluenceStateStore,
      useFactory: (config: ConfigService) =>
        new ConfluenceStateStore(config.getOrThrow<string>('dataDir')),
      inject: [ConfigService],
    },
    {
      provide: GITHUB_SOURCE,
      useFactory: (config: ConfigService): GithubSource => {
        // GITHUB_FIXTURE：离线模式，从固定 JSON 读取记录，用于无 token 验证
        const fixture = process.env.GITHUB_FIXTURE?.trim();
        if (fixture) {
          return new FixtureGithubSource(resolve(process.cwd(), fixture));
        }

        const github = config.get<GithubConfig>('github');
        return new GraphqlGithubSource({
          token: github?.token ?? '',
          orgs: github?.orgs ?? [],
          repos: github?.repos ?? [],
          endpoint: github?.endpoint,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: CONFLUENCE_SOURCE,
      useFactory: (config: ConfigService): ConfluenceSource => {
        // CONFLUENCE_FIXTURE：离线模式，从固定 JSON 读取页面事实，用于无 token 验证
        const fixture = process.env.CONFLUENCE_FIXTURE?.trim();
        if (fixture) {
          return new FixtureConfluenceSource(resolve(process.cwd(), fixture));
        }

        const confluence = config.get<ConfluenceConfig>('confluence');
        return new ConfluenceRestSource({
          baseUrl: confluence?.baseUrl ?? '',
          token: confluence?.token ?? '',
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    ContributionCollectorService,
    ConfluenceCollectorService,
    SyncStateStore,
    ConfluenceStateStore,
    GITHUB_SOURCE,
    CONFLUENCE_SOURCE,
  ],
})
export class CollectorModule {}

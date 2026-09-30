import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import configuration, { ConfluenceConfig, GithubConfig } from '../config/configuration';
import { validateEnv } from '../config/env.validation';
import { RepositoriesModule } from '../repositories/repositories.module';
import { GITHUB_SOURCE, CONFLUENCE_SOURCE } from './collector.tokens';
import { ConfluenceCollectorService } from './confluence/confluence-collector.service';
import { ConfluenceRestSource } from './confluence/confluence-rest.source';
import { ConfluenceStateStore } from './confluence/confluence-state.store';
import { ConfluenceFixtureSource } from './confluence/confluence-fixture.source';
import type { ConfluenceSource } from './confluence/confluence-source.port';
import { GithubCollectorService } from './github/github-collector.service';
import { GithubFixtureSource } from './github/github-fixture.source';
import { GithubSource } from './github/github-source.port';
import { GithubGraphqlSource } from './github/github-graphql.source';
import { GithubSyncStateStore } from './github/github-sync-state.store';

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
    GithubCollectorService,
    ConfluenceCollectorService,
    {
      provide: GithubSyncStateStore,
      useFactory: (config: ConfigService) =>
        new GithubSyncStateStore(config.getOrThrow<string>('dataDir')),
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
          return new GithubFixtureSource(resolve(process.cwd(), fixture));
        }

        const github = config.get<GithubConfig>('github');
        return new GithubGraphqlSource({
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
          return new ConfluenceFixtureSource(resolve(process.cwd(), fixture));
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
    GithubCollectorService,
    ConfluenceCollectorService,
    GithubSyncStateStore,
    ConfluenceStateStore,
    GITHUB_SOURCE,
    CONFLUENCE_SOURCE,
  ],
})
export class CollectorModule {}

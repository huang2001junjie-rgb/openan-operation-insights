import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivityModule } from './modules/activity/activity.module';
import { HomeModule } from './modules/home/home.module';
import { MeetingModule } from './modules/meeting/meeting.module';
import { ReleaseModule } from './modules/release/release.module';
import { SummitModule } from './modules/summit/summit.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PersonModule } from './modules/person/person.module';
import { CommonModule } from './common/common.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { ProvidersModule } from './providers/providers.module';
import { RepositoriesModule } from './repositories/repositories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    CommonModule,
    RepositoriesModule,
    ProvidersModule,
    HomeModule,
    OrganizationModule,
    ActivityModule,
    ReleaseModule,
    SummitModule,
    MeetingModule,
    IdentityModule,
    PersonModule,
  ],
})
export class AppModule {}

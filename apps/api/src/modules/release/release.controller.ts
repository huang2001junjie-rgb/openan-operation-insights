import { Controller, Get } from '@nestjs/common';
import { RepoReleasesData } from '../../contract/entities';
import { ReleaseService } from './release.service';

@Controller()
export class ReleaseController {
  constructor(private readonly releaseService: ReleaseService) {}

  /** 版本发布页汇总（ADR-0019）：各组件 Release 情况 + 全社区口径统计 */
  @Get('repo-releases')
  async getRepoReleases(): Promise<RepoReleasesData> {
    return this.releaseService.getRepoReleases();
  }
}

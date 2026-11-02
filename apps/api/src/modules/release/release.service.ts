import { Inject, Injectable } from '@nestjs/common';
import { RepoReleasesData } from '../../contract/entities';
import { RepoReleasePort } from '../../providers/ports/repo-release.port';
import { REPO_RELEASE_PORT } from '../../providers/tokens';

@Injectable()
export class ReleaseService {
  constructor(
    @Inject(REPO_RELEASE_PORT) private readonly repoReleases: RepoReleasePort,
  ) {}

  /** 版本发布页汇总（ADR-0019）：全部由 github-releases.json 读时派生 */
  async getRepoReleases(): Promise<RepoReleasesData> {
    return this.repoReleases.getRepoReleases();
  }
}

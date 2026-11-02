import { RepoReleasesData } from '../../contract/entities';

/** 端口 DI Token：见 tokens.ts 的 REPO_RELEASE_PORT */
export interface RepoReleasePort {
  /** 版本发布页汇总（ADR-0019）：github-releases.json 读时派生，不落盘 */
  getRepoReleases(): Promise<RepoReleasesData>;
}

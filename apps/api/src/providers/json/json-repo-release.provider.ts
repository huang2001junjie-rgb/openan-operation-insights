import { Inject, Injectable } from '@nestjs/common';
import {
  GithubReleasesFileData,
  RepoReleasesData,
  RepoReleaseSummary,
} from '../../contract/entities';
import { JsonRepository } from '../../repositories/json-repository';
import { GITHUB_RELEASES_REPOSITORY } from '../../repositories/repository.tokens';
import { RepoReleasePort } from '../ports/repo-release.port';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 近 90 天窗口的左边界（与 lib/format.ts 的 daysUntil 同口径：宽松含边界当天） */
function recentCutoff(now: Date): number {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart.getTime() - 89 * DAY_MS;
}

/**
 * 版本发布汇总：由 github-releases.json 读时派生（ADR-0019）。
 *
 * 派生口径：
 * - 「最新版本」按 publishedAt 最新取（不按 tag 名字符串排序——跨仓库命名不规范）；
 * - 平均发布周期 = 各组件内部相邻发布间隔的均值、再按组件等权平均（组件 ≥2 次发布才参与）。
 */
@Injectable()
export class JsonRepoReleaseProvider implements RepoReleasePort {
  constructor(
    @Inject(GITHUB_RELEASES_REPOSITORY)
    private readonly repository: JsonRepository<GithubReleasesFileData>,
  ) {}

  async getRepoReleases(): Promise<RepoReleasesData> {
    const envelope = await this.repository.read();
    const { repositories, releases } = envelope.data;

    const byRepo = new Map<string, RepoReleaseSummary['latest'][]>();
    for (const release of releases) {
      const list = byRepo.get(release.repository) ?? [];
      list.push({
        tag: release.tag,
        name: release.name,
        publishedAt: release.publishedAt,
        url: release.url,
      });
      byRepo.set(release.repository, list);
    }

    const repos: RepoReleaseSummary[] = [];
    const cadenceIntervals: number[] = [];
    byRepo.forEach((list, repoId) => {
      // 升序排一次：latest 取末位，发布间隔也按时间先后计算
      const sorted = [...list].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
      const latest = sorted[sorted.length - 1];
      repos.push({ repoId, releaseCount: sorted.length, latest });
      if (sorted.length >= 2) {
        const spanMs = Date.parse(latest.publishedAt) - Date.parse(sorted[0].publishedAt);
        cadenceIntervals.push(spanMs / (sorted.length - 1));
      }
    });
    repos.sort(
      (a, b) => Date.parse(b.latest.publishedAt) - Date.parse(a.latest.publishedAt) || a.repoId.localeCompare(b.repoId),
    );

    const reposWithReleases = new Set(byRepo.keys());
    const reposWithoutReleases = repositories.filter((repo) => !reposWithReleases.has(repo)).sort();

    const cutoff = recentCutoff(new Date());
    const recent90dCount = releases.filter((release) => Date.parse(release.publishedAt) >= cutoff).length;

    const first = repos[0];
    return {
      repos,
      totalInScope: repositories.length,
      reposWithoutReleases,
      recent90dCount,
      latestRelease: first
        ? { repoId: first.repoId, tag: first.latest.tag, publishedAt: first.latest.publishedAt }
        : null,
      avgDaysBetweenReleases:
        cadenceIntervals.length > 0
          ? Math.round(
              (cadenceIntervals.reduce((sum, ms) => sum + ms, 0) / cadenceIntervals.length / DAY_MS) * 10,
            ) / 10
          : null,
      updatedAt: envelope.updatedAt,
    };
  }
}

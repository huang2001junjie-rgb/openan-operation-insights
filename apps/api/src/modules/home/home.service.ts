import { Inject, Injectable, Logger } from '@nestjs/common';
import { HomeSummary, SummitSummary } from '../../contract/entities';
import { isIndependentDeveloper } from '../../common/effective-org';
import {
  CONTRIBUTOR_CONTRIBUTION_PORT,
  HOME_METRIC_PORT,
  SUMMIT_PORT,
} from '../../providers/tokens';
import { ContributorContributionPort } from '../../providers/ports/contributor-contribution.port';
import { HomeMetricPort } from '../../providers/ports/home-metric.port';
import { SummitPort } from '../../providers/ports/summit.port';

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    @Inject(HOME_METRIC_PORT) private readonly homeMetric: HomeMetricPort,
    @Inject(SUMMIT_PORT) private readonly summits: SummitPort,
    @Inject(CONTRIBUTOR_CONTRIBUTION_PORT)
    private readonly contributorContributions: ContributorContributionPort,
  ) {}

  /**
   * 首页指标（ADR-0017）：`partnerCount` / `summitCount` / `useCaseCount` / `nextSummit` 仍来自
   * `home.json`；**独立开发者人数改为读时派生**——`home.json` 已无该字段，采集器也不再回填。
   *
   * 口径 = **生效归属**为伪组织 `unattributed` 且非机器人的 GitHub 账号数（`isIndependentDeveloper`）。
   * 端口返回的已排除机器账号，此处仍走同一判定函数，使口径只有一处定义。
   *
   * **不带 `delta` / `deltaDirection`**：环比须基于历史快照（07 §2.2 P1 待办 ②），
   * 不得由「当前值 − 上次值」伪造。出参形状不变，前端趋势药丸自动隐藏（`StatCard` 对 `delta` 判空）。
   *
   * ⚠️ `updatedAt` 仍取 `home.json` 的文件时间，而本数字的新鲜度取决于
   * `github-accounts.json` + 认领边——两者可能不同步（登记为 ADR-0017 遗留债 7）。
   */
  async getSummary(): Promise<HomeSummary> {
    const [{ data, updatedAt }, githubAccounts] = await Promise.all([
      this.homeMetric.getHomeMetrics(),
      this.contributorContributions.getContributorContributions({}),
    ]);

    const independentDevelopers = githubAccounts.filter(isIndependentDeveloper).length;

    return {
      partnerCount: data.partnerCount,
      externalDeveloperCount: { value: independentDevelopers, unit: '人' },
      summitCount: data.summitCount,
      useCaseCount: data.useCaseCount,
      nextSummit: await this.resolveNextSummit(data.nextSummitId),
      updatedAt,
    };
  }

  /**
   * 推导规则（见 04 文档 3.6）：
   * 优先取 nextSummitId 指向的峰会；未配置或该峰会已结束时，
   * 回退为"未结束峰会中 endDate 最晚的一场"；仍无则 null。
   */
  private async resolveNextSummit(nextSummitId: string | null): Promise<SummitSummary | null> {
    if (nextSummitId) {
      const referenced = await this.summits.getSummitSummaryById(nextSummitId);
      if (referenced?.isUpcoming) {
        return referenced;
      }
      if (referenced) {
        this.logger.warn(
          `home.json 的 nextSummitId=${nextSummitId} 指向的峰会已结束，回退为自动推导`,
        );
      } else {
        this.logger.warn(`home.json 的 nextSummitId=${nextSummitId} 无对应峰会，回退为自动推导`);
      }
    }

    return this.summits.getNextSummit();
  }
}

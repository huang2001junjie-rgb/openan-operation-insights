import { Global, Module } from '@nestjs/common';
import { JsonContributionProvider } from './json/json-contribution.provider';
import { JsonContributorContributionProvider } from './json/json-contributor-contribution.provider';
import { JsonHomeMetricProvider } from './json/json-home-metric.provider';
import { JsonWikiProvider } from './json/json-wiki.provider';
import { JsonMeetingAttendanceProvider } from './json/json-meeting-attendance.provider';
import { JsonSummitProvider } from './json/json-summit.provider';
import { JsonOrganizationProvider } from './json/json-organization.provider';
import {
  CONTRIBUTION_PORT,
  CONTRIBUTOR_CONTRIBUTION_PORT,
  HOME_METRIC_PORT,
  WIKI_PORT,
  MEETING_ATTENDANCE_PORT,
  SUMMIT_PORT,
  ORGANIZATION_PORT,
} from './tokens';

/**
 * ★ 数据源绑定的唯一入口。
 *
 * 注意：GitHub / Confluence 采集**不走端口切换**。按读写分离设计（见 05 文档 2.5），
 * 采集器 src/collector 是唯一写 data/*.json 的入口，API 请求链路永远只读本地落盘文件，
 * 因此 CONTRIBUTION_PORT / WIKI_PORT 恒为 JSON 实现。
 * 业务代码只依赖端口，与数据来源解耦（可替换性验收标准，见 03 文档 4.5）。
 *
 * 若未来需要直连上游（如实时查询），才在此新增绑定。
 */
@Global()
@Module({
  providers: [
    // ── 当前阶段：JSON 种子数据 ──────────────────────────────
    { provide: HOME_METRIC_PORT, useClass: JsonHomeMetricProvider },
    { provide: ORGANIZATION_PORT, useClass: JsonOrganizationProvider },
    { provide: CONTRIBUTION_PORT, useClass: JsonContributionProvider },
    { provide: CONTRIBUTOR_CONTRIBUTION_PORT, useClass: JsonContributorContributionProvider },
    { provide: WIKI_PORT, useClass: JsonWikiProvider },
    { provide: SUMMIT_PORT, useClass: JsonSummitProvider },
    // 例会台账经采集脚本落盘，接口侧恒为 JSON 读实现（ADR-0005）
    { provide: MEETING_ATTENDANCE_PORT, useClass: JsonMeetingAttendanceProvider },
  ],
  exports: [
    HOME_METRIC_PORT,
    ORGANIZATION_PORT,
    CONTRIBUTION_PORT,
    CONTRIBUTOR_CONTRIBUTION_PORT,
    WIKI_PORT,
    SUMMIT_PORT,
    MEETING_ATTENDANCE_PORT,
  ],
})
export class ProvidersModule {}

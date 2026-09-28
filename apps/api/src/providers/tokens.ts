/** 端口 DI Token：切换数据源只改 ProvidersModule 中的绑定（见 03 文档 4.5） */
export const HOME_METRIC_PORT = Symbol('HOME_METRIC_PORT');
export const ORGANIZATION_PORT = Symbol('ORGANIZATION_PORT');
export const CONTRIBUTION_PORT = Symbol('CONTRIBUTION_PORT');
export const CONTRIBUTOR_CONTRIBUTION_PORT = Symbol('CONTRIBUTOR_CONTRIBUTION_PORT');
export const WIKI_PORT = Symbol('WIKI_PORT');
export const CONFLUENCE_ACCOUNT_PORT = Symbol('CONFLUENCE_ACCOUNT_PORT');
export const SUMMIT_PORT = Symbol('SUMMIT_PORT');
export const MEETING_ATTENDANCE_PORT = Symbol('MEETING_ATTENDANCE_PORT');

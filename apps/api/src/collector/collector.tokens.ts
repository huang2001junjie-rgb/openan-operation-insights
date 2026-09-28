/** 采集器 DI Token（采集源可切换：真实 GitHub / 离线固定数据） */
export const GITHUB_SOURCE = Symbol('GITHUB_SOURCE');

/** Confluence 采集源 DI Token（同理可切换：真实 REST / 离线固定数据） */
export const CONFLUENCE_SOURCE = Symbol('CONFLUENCE_SOURCE');

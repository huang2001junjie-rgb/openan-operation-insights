/**
 * 当前对外展示的版本号（硬编码，发版时人工更新，见 docs/adr/0015-home-version-display.md）。
 *
 * 注意：与 package.json 的 `version` 字段**不联动**，两者口径独立——本常量是对外展示口径，
 * package.json 的 version 仅供 npm 工作区使用。
 */
export const APP_VERSION = 'OpenAN 26.12';

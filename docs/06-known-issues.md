# 06 已知问题

## 2026-09-23 IDE WebView 控制台报错

现象：WebView 打开 `/activity` 报 `Script error.` 与 `getBoundingClientRect` 空引用。

取证：agent-browser 独立浏览器冷加载与交互矩阵（切换指标、tooltip、路由往返、缩放、HMR）全程零报错，渲染正常。

结论：WebView 注入脚本对 HMR 移除节点操作所致，非应用缺陷。

处置：`EChart.tsx` 加 isDisposed 守卫并修正注释；回归通过。

## 2026-09-27 身份匹配控制台「账号认领」完全不可用

现象：`/admin/identity` 自然人模式下左侧自然人"无法选中"——点行只弹出全屏详情抽屉，关闭后选中即消失，右侧候选池的「认领」按钮始终点不动，账号认领无法完成。

取证：静态审计 `IdentityConsolePage.tsx` 与 `PersonRoster.tsx`——整行按钮与行内「详情」按钮的 `onClick` 同为 `setSelectedPersonId`，而 `PersonDetailDrawer` 的 `open={Boolean(selectedPerson)}` 取自同一状态，其根节点为 `fixed inset-0 z-50` 且全屏遮罩点击即 `onClose`，`onClose` 又把该状态置回 `null`。页面初始快照显示候选池 41 个「认领」按钮全部 `[disabled]`（title「请先在左侧选择自然人」）。后端无异常：`/identity/persons`、`/identity/candidates`、`/identity/claims` 与 `PATCH {orgId:null}` 均返回正常。

结论：认领目标与详情抽屉共用一个 state，二者在可用性上互斥——目标存在则候选池被模态遮罩覆盖，遮罩关闭则目标归零，故「认领」在任何时刻都不可点。设计决策与取舍见 [ADR-0006](./adr/0006-identity-console-selection-vs-detail.md)。

处置：拆出 `detailPersonId`，行点击只设认领目标、行内「详情」按钮开抽屉、关抽屉不清目标；新建即成为目标；「详情」按钮改常驻可见并补 `pointer-events` / `aria-pressed`。`tsc --noEmit` 通过；浏览器侧端到端回归待补（本次 agent-browser 的 CDP 守护进程持续超时，未取到运行时证据）。

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

## 2026-09-28 身份匹配控制台「新建」自然人点击无反应

现象：`/admin/identity` 自然人模式左栏点「新建」，页面毫无变化，新人未出现，也没有任何提示。

取证：后端无异常——直连 `POST /api/identity/persons`（带 `X-Admin-Token`）97 ms 返回，随后 `DELETE` 清理，`data/persons.json` 数量复原；`data/.identity-audit.jsonl` 中历史 `person.create` 4 条（另本次探测产生的创建 / 删除临时自然人各 1 条，按审计流水留档未删），说明该写入链路本身一直可用。前端静态审计定位到三处叠加缺陷：① `PersonRoster` 的按钮为 `disabled={isCreating || !draftName.trim()}`，空名即被禁用；② `Button` 只定义了 `hover:` 态、**没有任何 `disabled:` 样式**，禁用按钮与可用按钮的外观、悬停高亮完全一致，点击自然毫无反馈；③ `submitCreate` 先 `setDraftName('')` 再提交，一旦提交被拒（例如当前标签页未配置管理令牌 → `40101`），输入已被清空、按钮回到空名禁用态，表现为「点过一次之后彻底没反应」。已核对 `Toaster` 挂在 `AppShell` 上，写失败本应弹提示，故此前「无反应」实为按钮处于 disabled，而非请求失败。环境侧旁证：本次 agent-browser 连 `DOM.enable` / `Page.navigate` 均持续超时，而浏览器各渲染进程累计 CPU 仅 20~33 秒，排除页面死循环，判定为工具侧不可用（与 2026-09-27 同因），故同样未取得浏览器端运行时证据。

结论：非接口故障，而是「禁用态无视觉反馈 + 空名静默返回 + 失败先清空输入」三个客户端缺陷叠加，把一次可控的前置校验伪装成了「按钮坏了」。用户看到的按钮点是可用的（甚至悬停会高亮），这点是缺陷的关键。

处置：`Button` 补 `disabled:pointer-events-none disabled:opacity-45`；`PersonRoster` 的空名点击改为「toast 提示 + 聚焦输入框」而非静默返回，仅在成功后才清空输入（失败保留便于重试），空名不再禁用按钮；`TextInput` 经 `forwardRef` 暴露 `ref`；`IdentityConsolePage` 在未配置令牌时直接打开令牌弹窗并写明原因，不再依赖一次失败后才出现的提示。`tsc --noEmit` 与 `vite build` 均通过；浏览器侧回归待补。

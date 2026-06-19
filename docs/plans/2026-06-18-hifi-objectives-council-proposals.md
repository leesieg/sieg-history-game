# hifi 目标感 + 御前会议行动草案 落地实施计划

> **For Claude:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 按任务逐条实现本计划。步骤用 `- [ ]` 复选框追踪。

**Goal:** 把 hifi 主线从「复杂沙盘」推进到「玩家进游戏 30 秒能回答：我是谁 / 我要干什么 / 本季先做什么」，并把御前会议从只读文案改成可校验、可执行、可跳转的行动草案。

**Architecture:** 落地 21/22 两份设计的共同主张——**目标由规则生成、AI/模板只负责表达、所有行动走规则引擎校验后执行**。新增三个纯逻辑引擎（`objectives` 生成长/中/短目标，`proposals` 行动目录+校验+预览，`ledger` 季度账本），全部复用现有 `economy/diplomacy/warfare/history` 引擎函数，不重写机制；UI 层改写 `renderCouncil` 渲染草案卡，并扩 `history.issues()` 让战争/外交/经济机会进右侧待办队列。本计划**只做规则 Agent + 模板文案，不接 LLM**。

**Tech Stack:** 原生 JavaScript（IIFE + `window.HIFI_*` 全局）、HTML/CSS/SVG、Node 内置 `vm` + `assert` 测试（`.test.cjs`）。无构建系统、无 npm、无第三方依赖。

## Global Constraints

逐条来自 CLAUDE.md，每个任务都隐含遵守：

- 只改 `prototype/hifi/` 主线；**绝不改 `demos/demo2`**（已机制冻结）。
- 每个脚本是 `(() => { "use strict"; ... })()`，API 挂到全局 `window.HIFI_*`，不用 ES module、不用打包器。
- 分层不可越界：`data/`（纯数据）→ `engine/`（纯逻辑，不碰 DOM）→ `ui/`（DOM/接线）→ `main.js`（接线）。新逻辑放 `engine/`，**不要新建 `scripts/core/`**（21 号文档里的 `scripts/core/*` 路径是错的，本计划已纠正为 `engine/`）。
- 改任一脚本后，**必须在 `prototype/hifi/index.html` 里把该脚本的 `?v=N` 递增**，否则浏览器吃旧缓存。新脚本以 `?v=1` 引入，并按依赖顺序插入 `<script>`。
- 新 `engine/` 文件必须配 `tests/hifi-<name>.test.cjs`：用 `vm.runInNewContext` 把所需脚本在 `{ window: {} }` 上下文跑起来，从 `context.window.HIFI_*` 取 API 断言。引擎逻辑零 DOM 依赖才测得动。
- UI 容器 id / 接线字符串若新增，要同步 `tests/hifi-ui-smoke.test.cjs`、`tests/hifi-layout.test.cjs` 的正则。
- 术语用欧洲史标准译名（御前会议 / 使节 / 议会 / 阿基坦 等），不用中国官制词汇。
- 跑测试：`for file in tests/*.test.cjs; do node "$file"; done`；单测：`node tests/hifi-<name>.test.cjs`。仓库路径含空格，shell 命令务必加引号。
- 提交粒度：每个 Task 一次 commit；commit message 末尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

**范围内（本计划交付）：** 22 号 §8 显性缺陷修复、22 号 #1/#2/#3/#4/#12 目标感与队列与季报、21 号阶段 0/1/2/3（状态摘要 / 行动目录 / 御前会议 / 季报）。

**范围外（后续单独成计划，本计划不做）：** 21 号阶段 4 外交来信 + 领导人记忆（新数据层，需单独评估存档/测试）、阶段 5 阶层陈情、阶段 6 LLM 润色、阶段 7 委任模式、22 号 §6 HUD 压缩与移动端横屏（纯 UI，可并行另起计划）。

---

## Phase 0 — 显性缺陷修复（22 号 §8，零机制风险，先发）

> 这些是「去掉误导」，不碰引擎机制，应单独成一个 commit 先合。对应 22 号优先级 1。

### Task 0.1：修复误导文案与禁用态

**Files:**
- Modify: `prototype/hifi/scripts/ui/drawers.js`
- Modify: `prototype/hifi/index.html`（`drawers.js?v=20` → `?v=21`）
- Test: `tests/hifi-ui-smoke.test.cjs`

**Action:**
- 「征集军需」动作的收益文案当前误显示「军事点 +30」，改为「军需 +30」。在 `drawers.js` 内定位生成该按钮副标题的文案（搜 `军需` / `军事点` / `军事 +`），把展示文本与实际资源对齐（实际加的是 `country.military`，不是 `actionPoints.military`）。
- 已建成建筑的按钮：当前建成后仍可点、点了才提示。改为建成即禁用——`actionButton()` 已有第 6 个参数 `active`（见 `data-agenda` 用法 `country.agenda === key`）；对建筑按钮传入 `已建成` 判定（`country.buildings?.[tileId]?.includes(key)` 或现有建成判定字段），并在按钮文案显示「已建成」。

**Verify:**
- `node tests/hifi-ui-smoke.test.cjs` 通过（若加了新 id/文案正则，同步更新该测试）。
- 浏览器开 `http://127.0.0.1:8765/prototype/hifi/index.html`，进经济抽屉：征集军需副标题显示「军需 +30」；已建建筑按钮置灰显示「已建成」、不可重复点。

**Done:** 两处误导消失，`hifi-ui-smoke` 绿。

- [ ] Step 1：改「军需」文案
- [ ] Step 2：建筑建成禁用 + 文案
- [ ] Step 3：`index.html` 把 `drawers.js?v=20`→`?v=21`
- [ ] Step 4：`node tests/hifi-ui-smoke.test.cjs` 通过
- [ ] Step 5：commit `fix: 修正军需文案与建成建筑禁用态`

### Task 0.2：规则错误转可见 toast + 国家选择器旗帜/高亮

**Files:**
- Modify: `prototype/hifi/scripts/main.js`（`?v=10`→`?v=11`）
- Modify: `prototype/hifi/scripts/ui/dialogs.js`（军令规划失败分支，`?v=10`→`?v=11`）
- Modify: `prototype/hifi/scripts/ui/drawers.js`（国家选择器，承接 0.1 的 `?v=21`→`?v=22`）

**Action:**
- 不可达军令：`dialogs.js` 军团规划路线处（`data-army-plan`，见现有 `showToast("尚未规划路线…")`）补一个失败分支：目标不可达时 `window.hifiGame.showToast("目标不可达，已退出规划")` 并退出规划态，而不是进 `console`。
- 全局错误兜底：`main.js` 的 `runAction` 已经 `catch(error){ showToast(error.message) }`，确认所有引擎在非法操作时 `throw new Error("可读中文原因")`（抽查 `constructBuilding`/`integrateTile` 的失败路径），保证 message 是玩家能看懂的中文，不是英文堆栈。
- 国家选择器：在候选卡加盾徽/旗帜符号（复用 `renderHud` 里 `governmentMarks` 政体符号即可，无需新美术），给当前 `playerPolity` 候选加 `.selected` 高亮 class，并在打开选择器时 `scrollIntoView` 到当前国家。

**Verify:**
- 浏览器：选一个无法到达的军令目标 → 弹 toast「目标不可达，已退出规划」，不进控制台。
- 打开国家选择器：当前国家高亮且自动滚动可见，候选带盾徽。
- `for file in tests/*.test.cjs; do node "$file"; done` 全绿。

**Done:** 所有规则失败有 toast，选择器有身份识别。

- [ ] Step 1：军令不可达 toast + 退出规划
- [ ] Step 2：抽查引擎 throw 文案为中文
- [ ] Step 3：选择器盾徽 + 高亮 + 自动滚动
- [ ] Step 4：`index.html` bump `main.js`/`dialogs.js`/`drawers.js` 的 `?v`
- [ ] Step 5：全测试通过
- [ ] Step 6：commit `fix: 规则失败转 toast + 国家选择器旗帜与当前高亮`

---

## Phase 1 — 目标感闭环 + 行动草案底座（21 号阶段 0/1/2，22 号 #1/#2）

> 这是「沙盘→策略」的真正拐点。先把规则底座（目标生成 / 行动目录 / 校验 / 预览）做扎实，再接 UI。

### Task 1.1：`objectives` 引擎——规则生成长/中/短目标

**Files:**
- Create: `prototype/hifi/scripts/engine/objectives.js`
- Modify: `prototype/hifi/index.html`（在 `history.js` 之后、`strategy.js` 之前插 `<script src="scripts/engine/objectives.js?v=1"></script>`）
- Test: `tests/hifi-objectives.test.cjs`

**Interfaces（后续任务依赖）:**
- `window.HIFI_OBJECTIVES_ENGINE.nationalMission(world, polity = world.playerPolity)` → `{ id, title, why, targets: string[] }`（长期使命，1 条）
- `window.HIFI_OBJECTIVES_ENGINE.midAgenda(world, polity)` → `{ id, title, why }[]`（中期议程，0–2 条）
- `window.HIFI_OBJECTIVES_ENGINE.seasonTasks(world, polity)` → `{ id, label, advisor: "fiscal"|"diplomacy"|"military"|"internal", reason }[]`（本季 2–3 件事，纯文字描述，不含行动；行动绑定在 Task 1.3）

**Action:**
- 纯函数，零 DOM。目标**全部从 state 派生**，不写死法兰西专属，但允许按 `polity`/时代/处境给出具体文案。
- `nationalMission`：基于国家是否处于战争、是否有领土宣称、合法性高低，从一张规则表里选一条。法兰西在百年战争中 → `{ title: "收复阿基坦", why: "恢复王权威信，终结英格兰在法南的立足点", targets: ["阿基坦相关地块"] }`；无战争的国家走「稳固王权 / 扩张贸易」等通用分支。
- `midAgenda`：基于 `country.pressures`（fiscal/military/trade）、阶层满意、控制力低的地块，生成阶段任务，如「整顿诺曼底：提升控制力与财政」。
- `seasonTasks`：从当前可执行性派生 2–3 条，每条标注归属顾问，复用 `councilSummary` 已有判定逻辑（`country.money<50` → 财政优先 等），但输出结构化对象而非拼好的字符串。

**Verify（`tests/hifi-objectives.test.cjs`，参照 `hifi-history.test.cjs` 的 vm 加载法）:**
- 加载 `world.js turn.js politics.js economy.js diplomacy.js warfare.js history.js objectives.js` 到 `{window:{}}`，`createWorld` 后：
  - `nationalMission(world)` 返回含非空 `title`/`why`/`targets` 的对象。
  - 同一 state 调两次 `seasonTasks` 返回**结构稳定、长度一致**（确定性，不随机）。
  - `seasonTasks` 每条 `advisor` ∈ 四类枚举。

**Done:** 三层目标可由规则稳定生成，单测绿。

- [ ] Step 1：写 `tests/hifi-objectives.test.cjs`（先断言三个函数存在且返回结构）
- [ ] Step 2：`node tests/hifi-objectives.test.cjs` → 失败（未定义）
- [ ] Step 3：实现 `objectives.js` 三个函数
- [ ] Step 4：`node tests/hifi-objectives.test.cjs` → 通过
- [ ] Step 5：`index.html` 插入 script 标签 `?v=1`
- [ ] Step 6：commit `feat(hifi): objectives 引擎按规则生成国家使命/中期议程/本季三件事`

### Task 1.2：`proposals` 引擎——行动目录 + 校验 + 效果预览

**Files:**
- Create: `prototype/hifi/scripts/engine/proposals.js`
- Modify: `prototype/hifi/index.html`（在 `objectives.js` 之后插 `?v=1`）
- Test: `tests/hifi-proposals.test.cjs`

**Interfaces（后续任务依赖）:**
- `window.HIFI_PROPOSALS_ENGINE.actionCatalog` → 声明式表：`{ [type]: { label, advisor, cost, apply(world, polity, params), preview(world, polity, params), available(world, polity, params) } }`。`type` 是行动白名单的唯一来源。
- `validate(world, polity, proposal)` → `{ ok: boolean, reason?: string }`（校验 type 在白名单内、`available` 为真、资源/行动点足够）
- `preview(world, polity, proposal)` → `{ cost: string, gain: string, risk: string }`（人类可读）
- `execute(world, polity, proposal)` → 调用 catalog 对应 `apply`，失败 `throw new Error(中文原因)`；**只通过现有引擎改 state，自身不直接写 state**

**Action:**
- `actionCatalog` 的每个 `apply` **直接复用现有引擎函数**，不重写机制：
  - `build_market` → `HIFI_ECONOMY_ENGINE.constructBuilding(world, polity, tileId, "market")`
  - `develop_tile` → `HIFI_ECONOMY_ENGINE.developTile(...)`
  - `integrate_tile` → `HIFI_ECONOMY_ENGINE.integrateTile(...)`
  - `send_envoy` → `HIFI_DIPLOMACY_ENGINE.startMission(world, polity, target, "improve")`
  - `propose_trade` → `HIFI_DIPLOMACY_ENGINE.proposeTreaty(world, polity, target, "trade")`
  - `mobilize_army` → `HIFI_WARFARE_ENGINE.mobilizeArmy(...)`
- `available`/`cost` 复用引擎已有前置判断（如 `freeEnvoys`、`actionPoints`、`evaluateProposal`）。外交可达性直接调 `diplomacy.evaluateProposal()`（它已返回 `{available, accepted}`）。
- `validate` 失败时给中文 `reason`（资源不足 / 无空闲使节 / 地块非己方 / 外交容量已满）。**不做智能兜底替换**（21/22 共同硬边界）。

**Verify（`tests/hifi-proposals.test.cjs`）:**
- `actionCatalog` 每个 type 都有 `label/advisor/cost/apply/preview/available` 六个键。
- 构造资源不足场景：`validate` 返回 `{ok:false, reason: 非空中文}`。
- 构造可行场景：`validate.ok === true`，`execute` 后 state 真实变化（如某资源被扣、某 mission 出现）。
- 白名单外的 `proposal.type` → `validate.ok === false`（不抛未捕获异常）。

**Done:** 行动目录是唯一行动白名单，校验+预览+执行三件齐活，单测覆盖「不足/可行/越界」三态。

- [ ] Step 1：写 `tests/hifi-proposals.test.cjs`（断言 catalog 结构 + 三态）
- [ ] Step 2：跑测试 → 失败
- [ ] Step 3：实现 `proposals.js`，`apply` 全部委托现有引擎
- [ ] Step 4：跑测试 → 通过
- [ ] Step 5：`index.html` 插入 `?v=1`
- [ ] Step 6：commit `feat(hifi): proposals 行动目录+校验+效果预览，复用现有引擎执行`

### Task 1.3：御前会议改行动草案卡（接 UI）

**Files:**
- Modify: `prototype/hifi/scripts/engine/objectives.js`（`?v=1`→`?v=2`，新增 `advisorProposals`）
- Modify: `prototype/hifi/scripts/ui/dialogs.js`（重写 `renderCouncil`，`?v` 续 Phase 0 递增）
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-objectives.test.cjs`（扩）、`tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- `window.HIFI_OBJECTIVES_ENGINE.advisorProposals(world, polity)` → `{ advisor, proposal, preview }[]`（3 条以内）：把 `seasonTasks` 各条映射到 `proposals.actionCatalog` 里一个合法、当前 `validate.ok===true` 的具体行动；附 `proposals.preview` 结果。

**Action:**
- `advisorProposals`：对每个顾问取一条「现在就能执行且通过校验」的行动（财政→`build_market`、外交→`send_envoy`、军务→`mobilize_army`/打开军团面板）。若该顾问当前无合法行动，则降级为「跳转面板」卡（仍可点，但 action 是打开抽屉而非执行）。
- 重写 `dialogs.js` 的 `renderCouncil`：
  - 顶部新增「国家使命」区：渲染 `nationalMission`（标题 + why）。
  - 「国家预警」保留（来自 `councilSummary.warnings`），但若 `world` 有进行中战争而预警却为空，强制补「仍在百年战争中」一条（修 22 号「无危机」与「战争 1」冲突）。
  - 「顾问建议」三条文字 → 三张**草案卡**：每张显示 顾问 / 行动 label / `预览.cost` / `预览.gain` / `预览.risk` + 两个按钮：`执行建议`（`data-proposal-exec`）与 `跳转面板`（`data-proposal-goto`）。
  - `执行建议`：`store.update(world => HIFI_PROPOSALS_ENGINE.execute(world, world.playerPolity, proposal))`，包在 try/catch 里失败走 `hifiGame.showToast(error.message)`，成功后关弹层并 `showToast("已执行：<label>")`。
  - 保留 `data-run-regency`、`data-ack-transition` 既有按钮。
- 「垂帘听政 4 季」按钮文案/位置不动（属范围外的委任，本期不改）。

**Verify:**
- 扩 `hifi-objectives.test.cjs`：`advisorProposals(world)` 每条 `proposal.type` ∈ `proposals.actionCatalog`，且每条 `preview` 三字段非空。
- 浏览器点顶部「待办」开御前会议：看到 国家使命 + 预警 + 三张草案卡（含成本/收益/风险）；点「执行建议」资源真实变化、弹成功 toast；资源不足时点击弹失败 toast、state 不变。
- `hifi-ui-smoke` 更新并通过（新增 `data-proposal-exec`/`data-proposal-goto` 接线断言）。

**Done:** 御前会议从只读文案变为可校验可执行的草案卡，且每条建议都来自合法行动。

- [ ] Step 1：扩测试断言 `advisorProposals` 绑定合法行动
- [ ] Step 2：跑测试 → 失败
- [ ] Step 3：实现 `advisorProposals`
- [ ] Step 4：重写 `renderCouncil` 渲染草案卡 + 执行/跳转接线
- [ ] Step 5：更新 `hifi-ui-smoke` 接线正则
- [ ] Step 6：`index.html` bump `objectives.js`/`dialogs.js` 的 `?v`
- [ ] Step 7：全测试通过 + 浏览器手验执行/失败两条路径
- [ ] Step 8：commit `feat(hifi): 御前会议改行动草案卡，绑定行动目录校验执行`

### Task 1.4：开局「本季三件事」入口（HUD 接目标感）

**Files:**
- Modify: `prototype/hifi/scripts/main.js`（`renderHud`，`?v` 续增）
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-ui-smoke.test.cjs`

**Action:**
- 现状：开局 `issues` 为空 → 顶部显示「待办已清」，玩家不知道该干嘛。改为：当 `blockingIssues` 为空但 `objectives.seasonTasks` 非空时，顶部 `topPending` 显示「本季 3 件事 ›」而非「待办已清」，点击同样打开御前会议（草案卡即三件事）。
- 不新增大面板，只改 `topPending.textContent` 逻辑与点击目标（已绑定 `narrativeDialogs.renderCouncil`）。

**Verify:**
- 浏览器开局：顶部显示「本季 3 件事 ›」，点开即御前会议草案卡。
- `hifi-ui-smoke` 通过。

**Done:** 开局不再「待办已清」空窗，30 秒内能看到本季要做什么。

- [ ] Step 1：改 `renderHud` 的 `topPending` 文案分支
- [ ] Step 2：`index.html` bump `main.js`
- [ ] Step 3：测试通过 + 手验开局文案
- [ ] Step 4：commit `feat(hifi): 开局顶栏显示本季三件事入口`

---

## Phase 2 — 压力队列 + 季度账本（21 号阶段 3，22 号 #3/#4/#12）

### Task 2.1：战争/外交/经济机会进右侧待办队列

**Files:**
- Modify: `prototype/hifi/scripts/engine/history.js`（`issues()`，`?v=10`→`?v=11`）
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-history.test.cjs`

**Action:**
- `history.issues(world)` 当前只聚合 election/event/transition/warning/situation。新增三类**非阻断** item（`blocking:false`）：
  - 战争待办：遍历 `world.diplomacy.wars` 中本国参战的战争 → `{ kind:"war", label:"与<敌>交战中", detail:"可推进战争目标 / 可议和" }`（修 22 号 #3：战争没进队列）。
  - 外交机会：存在 `evaluateProposal(...).accepted` 的可缔约对象，或邻国威胁上升 → `{ kind:"diplomacy", label:"可与<国>缔约 / <国>威胁上升" }`。
  - 经济机会：有高收益可建地块或资本池可投资 → `{ kind:"economy", label:"<地块>可建设增收" }`。
- 队列点击路由：`main.js` 的 `[data-history-issue]` 点击当前按 `kind` 分流（event→renderEvent，其余→renderCouncil）。新 kind 默认进 renderCouncil 即可，无需新弹层。

**Verify:**
- `hifi-history.test.cjs`：构造一个处于战争中的 world → `issues(world)` 含至少一条 `kind:"war"` 的非阻断 item。
- 浏览器：法兰西开局右侧队列出现「与英格兰交战中」等条目，不再空。
- 全测试通过。

**Done:** 战争/外交/经济不再隐身，右侧队列反映真实局势压力。

- [ ] Step 1：`hifi-history.test.cjs` 加战争进队列断言
- [ ] Step 2：跑测试 → 失败
- [ ] Step 3：`issues()` 增 war/diplomacy/economy 分支
- [ ] Step 4：跑测试 → 通过 + 浏览器手验队列非空
- [ ] Step 5：`index.html` bump `history.js`
- [ ] Step 6：commit `feat(hifi): 战争/外交/经济机会进入右侧待办队列`

### Task 2.2：季度账本（结束季度的因果反馈）

**Files:**
- Modify: `prototype/hifi/scripts/engine/history.js`（新增 `quarterLedger`，承接 2.1 的 `?v` 递增）
- Modify: `prototype/hifi/scripts/main.js`（结束季度后展示账本，`?v` 续增）
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-history.test.cjs`

**Interfaces:**
- `window.HIFI_HISTORY_ENGINE.quarterLedger(world, polity = world.playerPolity)` → `{ food:{delta,sources:string[]}, money:{...}, military:{...} }`：本季各资源净变化 + 主要来源构成（3–5 条重点）。

**Action:**
- 在 `processHistory` 末尾，把本季 `settleCountry` 产生的资源构成汇总进 `country.report.ledger`（来源已散落在结算逻辑里，这里聚合成可读条目，如「国库 +318：诺曼底港口 +180 / 关税 +88 / 其余 +50」）。
- `main.js` 结束季度（`seasonControl` onclick，现有 `showToast(进入XX季)`）后，除 toast 外，把 `quarterLedger` 渲染进御前会议的「季报」区或一个轻量 toast 扩展（不新增大弹层，复用 council 的 body 追加「本季季报」subtitle 区块）。

**Verify:**
- `hifi-history.test.cjs`：推进一季后 `quarterLedger(world).money.delta` 为数值，`sources` 非空数组。
- 浏览器：连续结束几季，能在御前会议看到「本季国库增长主要来自 X」之类构成，而非纯数字（修 22 号 #12）。

**Done:** 玩家结束季度后能看懂钱/粮/军需的因果来源。

- [ ] Step 1：`hifi-history.test.cjs` 加 `quarterLedger` 断言
- [ ] Step 2：跑测试 → 失败
- [ ] Step 3：实现 `quarterLedger` + 在 `processHistory` 聚合来源
- [ ] Step 4：UI 渲染季报区
- [ ] Step 5：跑测试 → 通过 + 浏览器手验
- [ ] Step 6：`index.html` bump `history.js`/`main.js`
- [ ] Step 7：commit `feat(hifi): 季度账本展示资源变化来源构成`

---

## Phase 3 — 长跑回归与收尾

### Task 3.1：长跑稳定性与确定性回归

**Files:**
- Modify: `tests/hifi-longrun.test.cjs`

**Action:**
- 扩 `hifi-longrun`：连续推进 ≥40 季，断言新增引擎不抛错、`objectives/proposals/quarterLedger` 在各时代/战争/和平态都返回合法结构、`advisorProposals` 始终绑定白名单内行动。
- 顺带验证 22 号 #4 的观察（资源单调膨胀）：记录 40 季后资源量级，**仅作基线快照**（数值出口调整属范围外的平衡改动，本计划不动，只留 TODO 注释指向 `docs/design/20`）。

**Verify:** `node tests/hifi-longrun.test.cjs` 通过；`for file in tests/*.test.cjs; do node "$file"; done` 全绿。

**Done:** 全套测试绿，新机制 40 季不崩。

- [ ] Step 1：扩 `hifi-longrun` 断言
- [ ] Step 2：全测试通过
- [ ] Step 3：commit `test(hifi): 目标/草案/季报长跑回归`

### Task 3.2：百科词条与文档回填

**Files:**
- Modify: `prototype/hifi/scripts/data/codex.js`（`?v=4`→`?v=5`）
- Modify: `prototype/hifi/index.html`
- Modify: `docs/design/22-hifi整体体验问题评估.md`（勾掉已落地项）
- Test: `tests/hifi-codex.test.cjs`

**Action:**
- `codex.js` 增「国家使命 / 行动草案 / 顾问建议 / 季度账本」词条，沿用现有 `{ term, summary, affectedBy, affects }` 结构与欧洲史译名。
- 在 22 号文档「问题总表」对应行标注「已落地（见本计划）」，保持设计文档与实现同步。

**Verify:** `node tests/hifi-codex.test.cjs` 通过；浏览器悬浮新术语有 tooltip。

**Done:** 新概念可查，设计文档回填。

- [ ] Step 1：增百科词条
- [ ] Step 2：`hifi-codex.test.cjs` 通过
- [ ] Step 3：回填 22 号文档落地标注
- [ ] Step 4：`index.html` bump `codex.js`
- [ ] Step 5：commit `docs(hifi): 补目标/草案/季报百科词条并回填设计文档`

---

## 落地顺序与依赖

```
Phase 0（缺陷修复，可先合，独立）
  └─ Phase 1.1 objectives ─┐
     Phase 1.2 proposals ──┴─> 1.3 草案卡 ─> 1.4 HUD 入口
                                   └─> Phase 2.1 队列 ─> 2.2 季报
                                          └─> Phase 3 回归 + 收尾
```

- Phase 0 与 Phase 1 无依赖，可并行/先发。
- Phase 1.3 依赖 1.1 + 1.2（两个引擎都要先存在）。
- Phase 2 依赖 Phase 1（队列项点击复用御前会议）。

## Self-Review 检查表（执行前已核对）

- **Spec 覆盖**：22 号 §8 缺陷→Phase 0；#1 目标感→1.1/1.4；#2 御前会议→1.3；#3 战争进队列→2.1；#4 空转打断→2.1/2.2；#12 资源解释→2.2。21 号阶段 0→1.1；阶段 1→1.2；阶段 2→1.3；阶段 3→2.2。✅
- **路径纠正**：21 号 `scripts/core/*` 全部改为 `scripts/engine/*`，符合 CLAUDE.md 分层。✅
- **类型一致**：`proposal.type` 在 1.2 定义、1.3 `advisorProposals` 消费；`seasonTasks().advisor` 四类枚举在 1.1 定义、1.3 复用；`quarterLedger` 在 2.2 定义并消费。✅
- **缓存约定**：每个改脚本任务都含 `?v=N` bump 步骤；新脚本 `?v=1`。✅
- **范围边界**：外交记忆/LLM/委任/HUD 压缩明确列入「范围外」，不混入本计划。✅

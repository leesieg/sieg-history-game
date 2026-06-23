# 法兰西战役体验闭环 Implementation Plan（局势系统主线）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **设计依据：** `docs/design/26-局势系统设计-百年战争.md`。本计划是 26 号设计的实现拆分（S1–S6）。

**Goal:** 把百年战争这类多国卷入的大历史事件抽象成一个可交互的「局势（Struggle）」系统，让法兰西 1337 开局从“系统可点”推进到“一局有目标、有压力、有反馈、有终局的百年战争样板局”。

**Architecture:** 不造大而全新系统，而是把已有 `world.situations` 雏形升级出独立「局势」类型：新增 `HIFI_STRUGGLE_ENGINE` 负责局势对象、参与度、阶段状态机、诱因计量、终局结算；UI 层只负责展示“局势作战室”“阶段使命”“本季总结”，所有按钮继续调用现有 `economy/diplomacy/warfare/objectives/proposals/history` 引擎。被动情势（黑死病/小冰期）旧逻辑完全不动，守住现有测试。

**Tech Stack:** 原生 JavaScript IIFE + `window.HIFI_*` 全局 API；HTML/CSS/SVG；Node 内置 `vm` + `assert` 测试。

---

## 背景结论

| 试玩结论 | 说明 |
|---|---|
| 法兰西身份成立 | 左上角国家、家族、时期、统治者信息清楚 |
| 御前会议成立 | 国家使命、顾问草案、来信、预警已经可用 |
| 行动反馈成立 | 建市场、派使节、动员军团都能扣资源并改变状态 |
| 主线压力不足 | 百年战争没有压住全局，玩家不知道怎样赢 |
| 资源压力不足 | 推进一年后金钱、粮食、军需明显增长，取舍感弱 |
| 战争面板不足 | 当前只看到“百年战争 / 提议停战”，缺战争目标、进度、敌我态势 |

**核心抓手：** 把百年战争做成有阶段节奏、多国共享、有历史终局的「局势」，直接压住主线、制造取舍。

## 范围

| 类型 | 内容 |
|---|---|
| 本计划做 | 局势内核（数据结构/参与度/四阶段/双向诱因/时间漂移）、百年战争单实例、阶段使命、局势作战室、季度战争压力与总结、阶段限定操作、复用三段使命的 12 季终局结算 |
| 本计划不做 | 局势专属 AI（参与者/英格兰先走现有 strategy 引擎）、多局势并发、动态参与、完整终局演出、新 LLM 接入 |
| 不改范围 | 不改被动情势（黑死病/小冰期）旧逻辑；不改 `prototype/demos/`，只改 `prototype/hifi/` |

## 全局约束

- 每个脚本仍用 IIFE，全局挂到 `window.HIFI_*`。引擎层不碰 DOM，UI 层不直接改复杂规则。
- 新增或修改脚本后，必须更新 `prototype/hifi/index.html` 对应 `?v=N`；新增模块要加进 `index.html` 脚本顺序与 `tests/hifi-structure.test.cjs` 清单。
- 局势新增逻辑只加测试、不改存量 37 个测试的旧断言；被动情势行为必须保持不变。
- 所有失败原因必须是中文 toast，不允许吞错。
- 术语用欧洲史标准译名；局势术语统一为：阶段（Phase）/ 诱因（Catalyst）/ 参与度（Involvement）/ 终局（Ending）。
- 先写测试，再实现。每个 Task 完成后单独 commit。

---

## Phase 1 - 局势内核（S1）

### Task 1.1: 新增局势引擎模块

**Files:**
- Create: `prototype/hifi/scripts/engine/struggle.js`
- Modify: `prototype/hifi/scripts/engine/history.js`（在 `processHistory` 管线接入）
- Modify: `prototype/hifi/index.html`（脚本顺序 + `?v=1`）
- Modify: `tests/hifi-structure.test.cjs`（必备文件清单）
- Test: `tests/hifi-struggle.test.cjs`（新建）

**Action:**
- 新增 `window.HIFI_STRUGGLE_ENGINE`，导出：
  - `startStruggle(world, key)`：按数据表创建局势对象（见 26 号 §4），push 到 `world.struggles`。
  - `processStruggles(world)`：每季推进——时间默认漂移 + 阶段翻转判定（诱因计量在 Phase 3 接入，本 Task 先只做时间漂移与阶段机）。
  - `involvement(world, polity, struggle)`：返回 `principal | interloper | bystander`。
  - `struggleFor(world, key)` / `activeStruggles(world)` 查询。
- 局势对象与被动情势分开：用独立数组 `world.struggles`，不碰 `world.situations`。
- 百年战争数据表（数据驱动，便于以后加别的局势）：`regionTiles`、`parties`（法/英 principal，勃艮第/苏格兰/弗兰德斯/教皇国 interloper）、四阶段 `standoff/open_war/truce/resolution`。
- 法兰西开局即起百年战争局势（`createWorld` 后或首季 `processHistory` 内触发）。
- 在 `processHistory` 的 `processSituations(world)` 之后调用 `processStruggles(world)`。

**Verify:**
- 法兰西开局存在 `hundred_years_war` 局势对象，初始阶段 `standoff`，含 parties。
- `involvement` 对法兰西/英格兰返回 principal，勃艮第返回 interloper，卡斯蒂利亚返回 bystander。
- 连续推进若干季，阶段能按时间漂移翻转，阶段机不报错。
- 被动情势（黑死病/小冰期）行为不变。
- `node tests/hifi-struggle.test.cjs` 与 `node tests/hifi-structure.test.cjs` 通过，其余 hifi 测试全绿。

**Done:** 世界里有一个可查询、会自转的百年战争局势对象。

---

## Phase 2 - 阶段使命（S2）

### Task 2.1: 数据驱动的法兰西战役阶段使命

**Files:**
- Modify: `prototype/hifi/scripts/engine/objectives.js`
- Test: `tests/hifi-objectives.test.cjs`

**Action:**
- 新增 `CAMPAIGN_STAGES` 数据表，法兰西是第一条 entry；`missionStages(world, polity)` 读表 + 通用判定，不写 `if(法兰西)`。
- 三段固定：
  - 稳住王国核心：保持巴黎、鲁昂、奥尔良控制稳定。
  - 收复争议领地：围绕加斯科涅 / 阿基坦方向推进。
  - 争取有利和平：战争分数或议和条件达到阈值。
- 每段结构：`{ id, name, condition(world,polity)→bool, status, reward, penalty }`，status 只用三态：未开始 / 进行中 / 已完成。
- `nationalMission()` 仍返回单条主使命，行为不变；`missionStages` 是并列新函数。

**Verify:**
- 法兰西开局返回 3 个阶段，状态可随控制力/争议地推进变化。
- 非法兰西国家不走法兰西专属阶段，仍走通用目标。
- `node tests/hifi-objectives.test.cjs` 通过。

**Done:** 局势与使命共享同一套“目标”真相源，供后续作战室与终局复用。

---

### Task 2.2: 在御前会议展示阶段进度

**Files:**
- Modify: `prototype/hifi/scripts/ui/dialogs.js`
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-ui-smoke.test.cjs`

**Action:**
- 在御前会议“国家使命”区增加阶段条，展示当前局势阶段 + 三段使命进度。
- 每段显示：阶段名、当前状态、完成条件、奖励或后果。

**Verify:**
- 打开法兰西御前会议能看到当前局势阶段与三段使命。
- 其他国家不显示法兰西专属文案。
- `node tests/hifi-ui-smoke.test.cjs` 通过。

**Done:** 玩家开局 30 秒内能知道这局法兰西要怎么打。

---

## Phase 3 - 诱因计量与战争压力（S3）

### Task 3.1: 诱因计量与阶段翻转

**Files:**
- Modify: `prototype/hifi/scripts/engine/struggle.js`
- Modify: `prototype/hifi/scripts/engine/warfare.js`（暴露会战/占领/议和信号）
- Test: `tests/hifi-struggle.test.cjs`

**Action:**
- 在 `processStruggles` 里接入诱因（见 26 号 §6），把已发生事件折算成阶段分：
  - 打赢会战 / 占领核心争议城 → +open_war。
  - 签停战 / 王室联姻 → +truce。
  - 统治者更替 / 财政崩溃（money 连续为负）→ +truce。
  - 时间流逝 → +默认下一阶段 1。
- 阶段分过阈值（如 ≥10）即翻阶段并清零计量；翻阶段写入世界纪闻与季度账本。
- 诱因只读现有引擎产出，不新造事件。

**Verify:**
- 触发一场胜仗后 open_war 计量上升，累计到阈值能从 standoff 翻到 open_war。
- 签停战后 truce 计量上升。
- 翻阶段事件能在纪闻/账本看到。
- `node tests/hifi-struggle.test.cjs` 通过。

**Done:** 局势阶段由真实战况推动，不再是单调进度条。

---

### Task 3.2: 季度战争压力回灌核心循环

**Files:**
- Modify: `prototype/hifi/scripts/engine/history.js`
- Modify: `prototype/hifi/scripts/engine/economy.js`（或 `settleCountry` 所在处）
- Test: `tests/hifi-history.test.cjs`

**Action:**
- 法兰西处于百年战争且阶段为 open_war 时，每季产生可解释压力：
  - **主干（产出流回灌）**：战争消耗军需/粮食、边境争议地产出被压低，让资源停止无脑增长。
  - **辅助（体感信号）**：保留并轻量强化现有 `warExhaustion`（`history.js:141` 已有 +1），只做“显示 + 触发议和压力”，**不与产出回灌叠加成双重砍资源**。
- 所有压力必须写进季度账本（复用 `lastReport` / `quarterLedger` seam），不能只改数值。

**Verify:**
- open_war 阶段推进 4 季后，军需/粮食消耗或边境产出有可见变化，资源不再无脑上涨。
- 账本能说明变化来源（区分产出回灌 vs 疲惫信号）。
- 被动情势行为不变。
- `node tests/hifi-history.test.cjs` 通过。

**Done:** 玩家能感觉到“不处理战争会变糟”，且知道糟在哪。

---

### Task 3.3: 季度总结

**Files:**
- Modify: `prototype/hifi/scripts/ui/dialogs.js`
- Modify: `prototype/hifi/scripts/main.js`
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-ui-smoke.test.cjs`

**Action:**
- 每次季度推进后，在 toast 之外提供可展开的“本季总结”，读 `quarterLedger`：
  - 收入变化 / 支出变化 / 战争变化（含局势阶段翻转）/ 外交变化 / 人口变化。
- 顶部问题入口可以打开最近一季总结。

**Verify:**
- 推进季度后能看到“进入 1337 年 · 夏”之外的详细变化。
- 动员军团或 open_war 压力导致人口/资源下降时，季度总结能说明。
- `node tests/hifi-ui-smoke.test.cjs` 通过。

**Done:** 玩家知道每季发生了什么，不只看到资源数字上涨。

---

## Phase 4 - 局势作战室（S4）

### Task 4.1: 局势态势摘要

**Files:**
- Modify: `prototype/hifi/scripts/engine/struggle.js`（或 `warfare.js`）
- Test: `tests/hifi-struggle.test.cjs` / `tests/hifi-warfare.test.cjs`

**Action:**
- 新增 `struggleSummary(world, polity, key)`，返回：
  - 局势名称、当前阶段 + 阶段计量、参与度
  - 交战双方、战争目标、战争分数、战争疲惫
  - 我方主力军位置、敌方关键威胁
  - 当前阶段可用操作、终局决议预览、推荐下一步（规则生成，先 3 条固定启发式：疲惫高→议和 / 主力军不在前线→集结 / 边境控制掉→增援）

**Verify:**
- 法兰西开局能拿到百年战争局势摘要。
- 没有局势 / 没有战争时返回空对象，不报错。
- 相关测试通过。

**Done:** 局势不再只是列表文字，而有可展示的态势对象。

---

### Task 4.2: 军事抽屉「百年战争作战室」+ 阶段限定操作

**Files:**
- Modify: `prototype/hifi/scripts/ui/drawers.js`
- Modify: `prototype/hifi/scripts/engine/struggle.js`（阶段限定操作 gate）
- Modify: `prototype/hifi/styles/components.css`
- Modify: `prototype/hifi/index.html`
- Test: `tests/hifi-layout.test.cjs`

**Action:**
- 军事抽屉“战争”页改成局势作战室，消费 `struggleSummary`，展示：当前阶段条、战争分数条、战争疲惫条、我方主力军、敌方威胁、阶段可用操作、议和条件预览。
- 阶段限定操作（见 26 号 §7）只做 gate + 调现有引擎，不可用时给中文 toast：
  - 对峙→提王位主张；鏖战→决战集结；议和→有利停战谈判。
- “提议停战”保留，放到议和区。

**Verify:**
- 点击军事 → 战争，能看到完整作战室与当前阶段可用操作。
- 非当前阶段的操作点击给中文 toast，不执行。
- 组件不遮挡右上角资源栏和左下角地块详情。
- `node tests/hifi-layout.test.cjs` 通过。

**Done:** 法兰西玩家知道百年战争当前该看什么、能做什么。

---

## Phase 5 - 顾问草案围绕局势阶段（S5）

### Task 5.1: 法兰西开局顾问草案改为阶段导向

**Files:**
- Modify: `prototype/hifi/scripts/engine/objectives.js`
- Modify: `prototype/hifi/scripts/engine/proposals.js`
- Test: `tests/hifi-objectives.test.cjs` / `tests/hifi-proposals.test.cjs`

**Action:**
- 法兰西开局顾问草案按当前局势阶段优先推荐：
  - 对峙/鏖战：集结主力军、动员或补员、改善苏格兰/教皇国/勃艮第关键外交、强化鲁昂或巴黎补给。
  - 议和：有利停战、稳住核心控制。
- 经济建设仍可推荐，但不能压过局势主线。

**Verify:**
- 法兰西开局御前会议至少 2 张草案与百年战争局势相关。
- 无局势国家不强行显示战争草案。
- 相关测试通过。

**Done:** 顾问不再平均撒建议，而是围绕当前局势阶段服务。

---

## Phase 6 - 终局结算（S6）

### Task 6.1: 法兰西 12 季样板局终局结算

**Files:**
- Modify: `prototype/hifi/scripts/engine/struggle.js`
- Modify: `prototype/hifi/scripts/engine/history.js`
- Modify: `prototype/hifi/scripts/ui/dialogs.js`
- Test: `tests/hifi-struggle.test.cjs` / `tests/hifi-history.test.cjs`

**Action:**
- 第 12 季对三段使命状态拍快照，按 26 号 §8 判定四终局：
  - 法兰西霸权：三段全完成 + 定局阶段。
  - 英格兰主张得逞：英格兰占据核心法兰西争议地。
  - 谈判和平：议和阶段达成双方妥协。
  - 长期僵局：12 季未达上述任一。
- 终局只作为样板局结果，**不影响沙盒继续游玩**；给永久区域修正（霸权加成 / 核心崩坏 debuff）。
- 终局结算弹窗复用季度总结/对话框组件。

**Verify:**
- 推进到第 12 季能触发终局结算。
- 达成条件时显示对应胜利/失败/僵局总结，复用三段使命状态判定。
- 结算后沙盒可继续推进。
- `node tests/hifi-struggle.test.cjs` 与 `node tests/hifi-history.test.cjs` 通过。

**Done:** 法兰西局有短期终点，玩家知道这局有没有打好。

---

## 验收标准

| 验收项 | 标准 |
|---|---|
| 局势成立 | 法兰西开局存在“百年战争”局势对象，含阶段与参与国 |
| 开局目标 | 30 秒内能看到当前局势阶段 + 法兰西三段使命 |
| 阶段流转 | 诱因事件 / 时间漂移能推动阶段在四阶段间流转 |
| 战争主线 | 军事 → 战争页能看到完整百年战争作战室 |
| 操作受限 | 阶段限定操作只在对应阶段可用，否则中文 toast |
| 行动建议 | 御前会议至少 2 条建议服务当前局势阶段 |
| 季度反馈 | 推进季度后能看到资源、战争、外交、人口变化原因 |
| 压力存在 | open_war 阶段连续跳季不处理，局势会变差且写进账本 |
| 样板结算 | 12 季内有四终局之一，复用三段使命状态判定 |
| 回归 | 被动情势（黑死病/小冰期）行为不变；全部 hifi 测试通过 |

## 推荐执行顺序

| 顺序 | Phase | 原因 |
|---|---|---|
| 1 | Phase 1 局势内核 | 先有可自转的局势对象作为一切的地基 |
| 2 | Phase 2 阶段使命 | 解决“我要干什么”，并建立目标真相源 |
| 3 | Phase 5 顾问导向 | 改动小、立刻提升“开局知道干什么”体感（提前到压力之前） |
| 4 | Phase 3 诱因与压力 | 解决“为什么不处理会糟”，让局势由战况推动 |
| 5 | Phase 4 作战室 | 解决“战争怎么看、能做什么” |
| 6 | Phase 6 终局结算 | 最后补短战役终点 |

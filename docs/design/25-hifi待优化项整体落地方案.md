---
title: 25 - hifi 待优化项整体落地方案（AI 主动性 / Agent 表达 / 因果链 / 数值真实化 / 平衡）
date: 2026-06-21
tags:
  - hifi
  - ai-agent
  - strategy-ai
  - causality
  - gameplay
status: draft
---

> 承接 [17 号](17-hifi主线机制现状说明与待修问题.md)（待修清单）、[21 号](21-AI-Agent机制调研与设计方案.md)（AI/Agent 调研）、[22 号](22-hifi整体体验问题评估.md) + [23 号](23-hifi体验闭环二期实现方案.md)（体验闭环一/二期，**已全部落地**）。
>
> 22/23 号方案里「除长期项外的全部待办」已清空、合入 main、18 个 hifi 测试文件全绿。本方案处理 **22/23 反复标注为「长期、待设计确认」的全部剩余项 + 17 号保留的平衡项**，是收尾性的「让世界活起来」工作，不是补残缺。
>
> 所有改动只动 `prototype/hifi/`，不碰冻结的 demo2。每改一个脚本在 `index.html` bump `?v=N`。引擎层 TDD（先写 `.test.cjs`），UI 层用 `hifi-ui-smoke`/`hifi-layout` 正则核对。

# 25 - hifi 待优化项整体落地方案

## 一、待优化项清单与归并

| 来源 | 项 | 现状 |
|---|---|---|
| 17-I / 22 / 23 长期项 | **AI 主动外交 / 宣战 / 议和** | `strategy.js` 极简且防御式：只采纳科技、调关税、动员、召议会、与友好国签贸易、向戒备强邻派使节缓和。**从不宣战、从不议和、从不对玩家发起攻击性外交**。世界除初始两场历史战争外静止。 |
| 21 号全文 | **AI / Agent 表达层** | 整份 `draft`。仅「御前会议行动草案卡」(一期) 落地；AI 领导人来信/提约/记仇、阶层 Agent 诉求、委任模式、AI 季报叙事**全未实现**。 |
| 17-I / 22 / 23 长期项 | **历史因果链扩展** | `applyCausalChain` 只认 `constantinople_falls`（其余 `throw`）。纪元转折只 `pendingTransition` 弹文案、无机制后果。 |
| 17-E / 22 / 23 长期项 | **发展度 / POP 接真实引擎值** | `map.js updateProvince`：发展度=`pop*3+建筑*8`、POP 显示×31.5K、控制度不反映战争占领，与经济引擎实际值脱节。 |
| 17-I | **附属傀儡化失衡** | `evaluateProposal` subject 含「实力差距/2」(diplomacy.js L247)，对弱小邻国极易直接傀儡化，缺约束。 |
| 17-C | **将领系统无 UI** | `assignGeneral` 支持非统治者将领，但 UI 只有「统治者领军」，`generals` 池实际只有 ruler-general。 |

归并成 **5 个 Phase**，依赖关系：A 是其余一切的地基（没有会动的 AI，B 的来信/委任就没内容可表达；C/D/E 独立）。

| Phase | 主题 | 覆盖 | 层 | 依赖 |
|---|---|---|---|---|
| **A — AI 主动性** | AI 会宣战 / 议和 / 主动攻击性外交 / 索附属，受压力与实力门槛 gate | AI 外交/宣战 | engine（strategy.js 为主）+ 测试 | 无 |
| **B — Agent 表达层** | 规则事件 → 领导人来信 / 阶层诉求 / 季报叙事；统一「表达适配器」预留 LLM 接缝 | 21 号 | engine（新 narrative.js）+ ui | A |
| **C — 因果链扩展** | `applyCausalChain` 泛化为「链表 + 机制后果」，新增 3~4 条纪元链 | 因果链 | engine（history.js）+ 测试 | 无 |
| **D — 数值真实化** | 省份面板发展度/控制度/POP 接经济引擎真实值，抽纯函数 | 17-E | engine 纯函数 + ui | 无 |
| **E — 平衡补正** | 附属门槛加约束 + 将领任命 UI | 17-C/I | engine + ui | 无 |

A/B 顺序合并；C/D/E 可与 A 并行、独立合并。

---

## 二、Phase A — AI 主动性（最高优先级）

> **落地状态（2026-06-21，分支 `feat/hifi-ai-initiative-phaseA`）**：已实现。`strategy.js` 新增 `warTarget` / `shouldSeekPeace` / `subjectTarget` / `pursueWar` 决策与执行（全部走 warfare/diplomacy 现有 API），`processAI` 每季重置 `__aiWarsThisQuarter` 预算（上限 2），`warfare.js` 导出 `neighbors` 供接壤判断。AI 现会：对接壤、军力占优、态度不友好的弱邻（含玩家）宣战；进攻取胜后索取战争目标领土、劣势/久攻不下时议和；按 `evaluateProposal` 阈值索取附属。宣战/议和写入 `worldEvents` 供玩家感知（对玩家宣战经 `issues()` 既有战争待办通道自动进队列）。新增 `tests/hifi-strategy.test.cjs`（决策纯函数 + AI 对玩家宣战 + 劣势求和集成），全套 36 测试文件通过。

**目标**：让非玩家国家成为「会主动找事」的对手——按压力 + 实力差 + 关系决定是否宣战、是否在劣势时议和、是否向弱邻索取附属。核心约束沿用 21 号边界：**AI 不直接改 state，只调用现有 `warfare`/`diplomacy` 引擎 API**（这些 API 已含全部规则校验：停战期、容量、停战分数、提案阈值）。改动**收敛在 `strategy.js`**，引擎其余文件不动。

### 2.1 决策函数（纯函数，可单测）

在 `strategy.js` 内新增，挂到 `HIFI_STRATEGY_ENGINE` 便于测试：

```
warTarget(world, polity)    → 目标国名 | null   // 选最该打的邻国
shouldSeekPeace(world, polity, war) → bool       // 劣势/厌战是否求和
subjectTarget(world, polity) → 目标国名 | null    // 选可索附属的弱邻
```

- **`warTarget`**：候选 = 与本国领土接壤（`controlledTiles` 邻接，复用 warfare 的 `neighbors`）或既有领土矛盾 `territorialConflict` 高的国家。门槛全部满足才宣战：
  - 本国军事压力 `pressures.military` 低（不是自身被压着打）或军力盈余（军团总兵力 > 目标 ×1.3，用 `countryStrength`）；
  - 与目标态度为 `rival`/`hostile`；
  - 不在 `underTruce`、不 `areAtWar`、目标非本国盟友/宗主；
  - 玩家国家也是合法目标（解决「世界对玩家静止」）。
  - 多个候选按「实力差 × 领土矛盾」打分取最高。
- **`shouldSeekPeace`**：本国是参战方且 `war.score` 对己方为负且绝对值超阈值，或本国 `warWill` 跌破阈值、或军团near-wiped → 调 `concludePeace(world, war.id, polity, [{type:"truce"}])` 或割地求和。
- **`subjectTarget`**：用 `evaluateProposal(world, polity, target, "tributary")`，仅当 `accepted` 且目标是接壤弱国时提案；**靠 Phase E 收紧后的阈值天然限流**，不在此另设逻辑。

### 2.2 接入回合

`processCountry` 末尾在 `pursueDiplomacy` 之后追加 `pursueWar`：

- 每国每季**至多发起一项攻击性动作**（宣战 XOR 索附属），且消耗对应 `actionPoints`（宣战走军事点门槛、附属走外交点，与玩家同口径）。
- 先处理「正在打的仗」：遍历本国参与的 `wars`，`shouldSeekPeace` 为真则议和（释放兵力、止损）。
- 再考虑新动作：`warTarget` 命中且行动点够 → `declareWarOn`；否则 `subjectTarget` 命中 → `proposeSubject`。
- 全程 `try/catch`，被引擎规则拒绝（停战期/容量/分数不足）则静默跳过——AI 不绕过规则。

### 2.3 节流与平衡（避免「全图混战」）

- 全局每季 AI 新开战争数设软上限（如 ≤ 1~2，常量 `AI_WAR_BUDGET`），优先离玩家近/强国之间，防止开局即世界大战。
- AI 宣战写入 `pushWorldEvent` + 给玩家的 issue（「英格兰向勃艮第宣战」非阻塞提醒），让玩家**感知**世界在动——这是 22 号「压力弱」的正解。
- AI 对**玩家**宣战时，进玩家 issue 队列为显著条目（接 23 号已建的战争待办通道）。

### 2.4 测试（`hifi-strategy.test.cjs` 新建 + `hifi-longrun` 扩展）

- `warTarget`：构造「军力盈余 + 接壤 + hostile」→ 返回目标；「停战期内」「己方军事压力高」「目标是盟友」→ 返回 null。
- `shouldSeekPeace`：构造 score 大幅落后 → true；微弱领先 → false。
- 接入测试：跑 N 季，断言「至少发生一次非预置宣战」且「AI 在明显劣势的预置战争中会求和」。
- `hifi-longrun`：断言世界不再静止（战争总数随时间 > 初始）且不爆炸（受 `AI_WAR_BUDGET` 约束，长跑不全图卷入）。
- 回归：`hifi-warfare`/`hifi-diplomacy` 全绿（API 未改签名）。

---

## 三、Phase B — Agent 表达层（21 号最小可行版）

> **落地状态（2026-06-22，分支 `feat/hifi-ai-initiative-phaseA`）**：已实现（规则模板版）。新建 `engine/narrative.js`（`HIFI_NARRATIVE_ENGINE`），只读世界状态、不改 state：`leaderLetters`（战争→战书 / 王朝纽带→友好信 / 宿怨→威胁信，≤3 封）、`estateDemands`（信仰压力→教士发声、不满阶层→绑定行动目录合法行动或跳转面板，不可执行的不生成）、`quarterNarrative`（把 `quarterLedger` 净额翻成一句话）；全部条目带 `basis` 来源可追溯。唯一文案出口 `narrate(entry)` 预留 LLM 接缝。御前会议（`dialogs.js renderCouncil`）注入「宫廷来信 / 阶层诉求（带跳转）/ 季报叙事」三段，复用现有草案卡与 `hifi:open-system` 跳转。新增 `tests/hifi-narrative.test.cjs` + `hifi-ui-smoke` 接线断言；`narrative.js` 入 `hifi-structure` 必备文件。全套 37 测试通过。**委任模式、真实 LLM 调用按方案 §3.3 不做。**

**判断**：本项目是无依赖、无构建、Node `vm` 跑测的微信小游戏原型，不能在主线里硬塞 LLM 调用。21 号自己的边界就是「**规则负责算，AI 只负责表达**」。因此 B 的落地形态是：**规则事件 → 结构化「表达条目」→ 模板化文案渲染**，并把「文案生成」抽成单一适配器 `narrate(entry)`，**预留 LLM 接缝**（将来把 `narrate` 换成异步 LLM 调用即可，规则与 UI 不动）。

> 决策点（**已确认 2026-06-21：走规则模板**）：B 走**规则模板文案**（确定性、可测、零依赖、可离线跑）。真实 LLM 接入另立方案处理 async/降级/微信侧鉴权，不混入本期；本方案只在 `narrate()` 留接缝。

### 3.1 新建 `engine/narrative.js`（纯逻辑）

挂 `HIFI_NARRATIVE_ENGINE`，消费已有 state、产出表达条目，**不改 state**：

| 表达 | 数据来源（已存在） | 产出 |
|---|---|---|
| **领导人来信** | Phase A 的 AI 宣战/议和/提案 + `leaderRelationView`（friendship/grudge/kinship） | 结构化条目 `{from, tone, intent, refTo}`，进玩家 issue/事件流，措辞由 `narrate` 按 tone 模板生成（敌意/拉拢/记仇） |
| **阶层诉求** | `country.estates` 满意度 + `pressures`（如信仰压力高→教士诉求） | 顾问/阶层口吻条目，绑定**已有合法行动**（复用 23 号 actionPreview/草案校验），不可执行的不生成 |
| **季报叙事** | `quarterLedger`（23 号已有 gross/maintenance/event/net） | 把净额构成翻译成一句「本季国库增长主要来自诺曼底港口」式文案 |

- 所有条目**来源可追溯**：带 `basis` 字段（资源/地块/战争/关系/阶层），符合 21 号 §5.3 边界。
- AI 建议必须接合法行动目录，沿用一期已建的 proposal 校验——**不新建校验系统**。

### 3.2 UI 接入（ui only）

- 领导人来信：进现有事件/issue 流（复用历史事件弹窗 + 御前会议区块），不新建弹窗系统。
- 阶层诉求：御前会议「顾问建议」区追加阶层声音卡，沿用草案卡样式。
- 季报叙事：季报面板顶部加一句叙事概述，明细仍是 23 号三段账本。

### 3.3 明确不做（YAGNI / 留给后续）

- 委任模式（AI 内阁自动处理低风险事务）——依赖 A 稳定后再评估，本期不做。
- 真实 LLM 调用 / 记忆-反思-计划循环——只留 `narrate` 接缝。

### 3.4 测试

- `hifi-narrative.test.cjs`：给定一次 AI 宣战 → 生成对应 tone 的来信条目，带正确 `from`/`basis`；信仰压力高 → 生成教士诉求且绑定合法行动 key。
- `narrate(entry)` 模板覆盖各 tone 不抛错、不空串。
- `hifi-ui-smoke`：来信/阶层卡/季报叙事容器存在。

---

## 四、Phase C — 历史因果链扩展

> **落地状态（2026-06-21，分支 `feat/hifi-ai-initiative-phaseA`）**：已实现。`history.js` 抽出数据驱动的 `CAUSAL_CHAINS` 表（`constantinople_falls` 平移入表、行为不变），新增 `reformation_split` / `price_revolution` / `gunpowder_revolution` / `industrial_takeoff` 四条链，每条带机制后果（信仰压力+正统阶层张力 / 物价+财政压力 / 旧式军团组织度下挫 / 思想+金钱加速），全部回灌已有压力通道。`CHAIN_BY_ERA` 让纪元跨越自动触发绑定链（信仰/绝对主义/工业纪元），`triggerFlowChains` 让新大陆白银航路开通触发价格革命；`world.firedChains` 防重复。`applyCausalChain` 对未知 key 仍报错。`hifi-history` 扩展用例覆盖全部新链 + 纪元/流触发 + 回归。

**目标**：把 `applyCausalChain` 从「写死一条 + 其余 throw」泛化为**数据驱动的链表**，每条链不止弹文案，还有**机制后果**（回灌核心循环），让纪元转折「有牙齿」。

### 4.1 重构 `history.js`

- 抽 `CAUSAL_CHAINS`（data/rules.js 或 history.js 顶部常量）：每条 `{ key, steps:[...文案], flags:{...}, effect(world) }`。
- `applyCausalChain(world, key)`：查表执行 `effect(world)`（改压力/物价/解锁/阶层张力）、置 `flags`、`pushWorldEvent`、设 `pendingTransition`。`constantinople_falls` 平移为表中第一条（行为不变，回归保护）。
- `checkEra` 触发纪元时，若该纪元绑定了因果链则一并 `applyCausalChain`，纪元转折从「纯文案」升级为「文案 + 后果」。

### 4.2 新增链（3~4 条，机制后果复用已有通道，不新建系统）

| 链 key | 触发 | 机制后果（回灌流） |
|---|---|---|
| `reformation_split`（已有 `flags.reformation` 里程碑，1517） | 信仰分裂纪元 | 提升正统阶层（church/clergy）张力（复用 `applyPressureEffects` 的信仰通道）；信仰压力 + |
| `price_revolution`（新大陆白银路线流量达阈值） | 发现纪元后 | 全国 `priceIndex` 上行、财政压力 +（复用君堡链的物价机制） |
| `gunpowder_revolution`（多国掌握 `artillery`/`bastions`） | 绝对主义前后 | 旧式征召军组织度上限下调（复用 warfare organization 通道），逼出常备军转型 |
| `industrial_takeoff`（已有 1750 蒸汽机里程碑） | 工业纪元 | 产出乘数 + 思想点加速（复用经济乘数 + ideas 通道） |

- 全部后果走**已有字段/已有压力通道**，符合 19 号「双向调节阀」范式，不空转。

### 4.3 测试（`hifi-history.test.cjs` 扩展）

- `applyCausalChain` 对每条 key 不抛错、置对 flags、调对 effect（断言目标字段变化方向）。
- 未知 key 仍 `throw`（保留防呆）。
- `constantinople_falls` 行为与重构前一致（回归）。
- `checkEra` 跨年触发绑定链时，后果落到 state。

---

## 五、Phase D — 省份数值真实化

> **落地状态（2026-06-21，分支 `feat/hifi-ai-initiative-phaseA`）**：已实现。`map.js` 新增纯函数 `provinceStats(world, tile)`（导出到 `window.prototypeMap`）：发展度由 `HIFI_ECONOMY_ENGINE.tileOutput` 真实产出 + 建筑派生分级（凋敝/稳定/兴盛/繁荣），有效控制度 = `control × (1-占领) × (1-破坏)` 战时实时反映，POP 缩放系数提为命名常量 `POP_DISPLAY_SCALE` 并注释「展示用、非引擎真实人口」。`updateProvince` 改用 `provinceStats`。`hifi-map` 扩展 `provinceStats` 纯函数断言（和平/占领/破坏/海域各场景）。

**目标**：省份面板发展度/控制度/POP 从「展示用拍脑袋算法」接经济引擎真实值，消除 17-E 的数据脱节。**纯函数下沉 + UI 调用**，引擎计算逻辑已存在（`tileOutput`/`control`/`occupation`/`devastation`）。

### 5.1 `map.js` 抽纯函数 `provinceStats(world, tile)`

返回 `{ developmentTier, effectiveControl, popDisplay, output }`：

- **发展度**：改由 `tileOutput` 实际产出 + 建筑加成派生分级（与经济引擎同口径），不再 `pop*3+建筑*8`。
- **控制度**：`control × (1 - occupation/100) × (1 - devastation/100)` 反映战争占领/破坏——战时实时下降，接 17-E。
- **POP**：保留缩放展示，但把 ×31.5 系数提为命名常量 `POP_DISPLAY_SCALE` 并注释「展示缩放、非引擎值」，诚实标注而非伪装精确。

### 5.2 UI

`updateProvince` 调 `provinceStats` 渲染；战时占领格控制度行显示降幅（红色），与地图「占领」透镜一致。

### 5.3 测试（`hifi-map.test.cjs` 扩展）

- `provinceStats`：满控制无占领 → effectiveControl≈control；占领 60% → 按公式下降；发展度随真实产出单调。
- `hifi-ui-smoke`：省份面板控制度/发展度容器存在。

---

## 六、Phase E — 平衡补正

> **落地状态（2026-06-21，分支 `feat/hifi-ai-initiative-phaseA`）**：已实现。E1：`diplomacy.js evaluateProposal` 的「实力差距」加分封顶 30、新增「独立意志」负权重（目标 `countryStrength≥40` 时按强度递增），有实力的独立强邻不再被一键傀儡化，弱邦在良好关系下仍可正常臣服。E2：`warfare.js` 新增 `recruitGeneral`（1 军事点 → 非统治者将领，指挥力由军事改革/常备军科技决定），`dialogs.js` 军团弹窗「领军」段扩为将领花名册（统治者领军 + 已招募将领任命 + 招募 + 撤将）。`hifi-diplomacy`/`hifi-warfare`/`hifi-ui-smoke` 各补对应断言。

### 6.1 附属傀儡化约束（diplomacy.js `evaluateProposal`）

- 「实力差距/2」项**封顶**（如 `min(差距/2, 上限)`），并对 `puppet`（主权损失 -42）维持高门槛；
- 追加负权重「附庸抗拒」：目标已是独立大国（`countryStrength` 高于绝对阈值）时额外减分，避免「碾压即傀儡」。
- 测试：`hifi-diplomacy` 加用例——强国对极弱邻 tributary 仍可成、puppet 需更高关系；强国对中等国 puppet 被拒。

### 6.2 将领任命 UI（17-C）

- 引擎 `assignGeneral` 已支持非统治者将领，缺的是 `generals` 池来源 + UI。
- 最小落地：军团抽屉「领军」按钮由「统治者领军」扩为下拉/列表，列出 `generals`；统治者仍是默认项。若 `generals` 池目前只有 ruler，先补一个「从军团经验/政体产生候选将领」的最小生成（或先只暴露既有项，列表化为后续扩展留位）。
- 测试：`hifi-warfare` 断言 `assignGeneral` 可任命非统治者；`hifi-ui-smoke` 核对领军列表容器。

---

## 七、分期与合并顺序

| 序 | Phase | 可独立合并 | 备注 |
|---|---|---|---|
| 1 | **A AI 主动性** | ✅ | 地基，最高价值，先合 |
| 2 | **C 因果链** / **D 数值** / **E 平衡** | ✅ 各自独立 | 与 A 并行，无依赖，体量小 |
| 3 | **B Agent 表达** | 依赖 A | A 稳定后做，承接来信/诉求内容 |

每个 Phase 独立分支、TDD、合并前全套 18+ 测试绿。

## 八、明确不做（边界）

- **真实 LLM 接入**：B 只留 `narrate` 接缝，async/降级/鉴权另立方案。
- **委任模式 / 多 Agent 记忆-反思-计划**：21 号远期路线，本期不做。
- **海军系统 / 谍报系统**：17 号已确认「去伪存真、不新建」，维持。
- **demo2**：冻结，全程不碰。

## 九、Self-Review 检查

- **覆盖**：AI 主动性→A；21 号表达层→B；因果链→C；数值真实化→D；附属失衡+将领 UI→E。待优化项全覆盖。✅
- **不新建系统**：A 复用 warfare/diplomacy 现有 API；B 复用一期 proposal 校验 + 现有弹窗；C 复用已有压力/物价/组织/乘数通道；E 改系数不改结构。✅
- **回灌核心循环**：所有机制后果落到已有流/压力字段，符合 19 号双向调节阀，无空转。✅
- **AI 边界**：AI 不直接改 state，全部走带校验的引擎 API；表达层来源可追溯。✅
- **不碰冻结基线**：只动 prototype/hifi/。✅
- **缓存约定**：每个改脚本 bump `?v=N`（新增 narrative.js 需加 `<script>` 标签 + 进 `hifi-structure` 必备文件列表）。✅
- **决策点**：B 走规则模板而非 LLM——已在 §三 标注，待确认。

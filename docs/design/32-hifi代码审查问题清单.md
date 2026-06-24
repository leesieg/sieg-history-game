# 32 - hifi 代码审查问题清单

> 来源：对 `feat/hifi-struggle-system` 分支（`git diff main...HEAD` + 工作区改动）的高强度多角度代码审查（8 个发现角度 × 验证）。
> 全部条目已对**审查时的最新代码**逐条复核确认。
> 复核基准时间：2026-06-24 晚（局势系统 #28/#31 实现进行中）。

## 审查背景与范围说明

- 本次审查在「移动靶」上进行：审查期间工作区通过 iCloud 同步陆续进来一整套 #31 实现（弹窗互斥 `closeAllModals`、禁用按钮原因串、待办 `target`/`openIssueTarget` 跳转、`?v` 批量递增等）。
- 因此第一轮发现的多数 **UI/约定类问题已在当前代码中修好**，已从本清单剔除（如：弹窗不互斥、假按钮、待办跳转、工作区文件 `?v` 未递增）。
- 下列 5 条是**在当前代码里仍然成立**的问题：4 个正确性 Bug + 1 个会导致崩溃的约定违规。

## 优先级总览

| 序 | 文件 | 类型 | 严重度 | 状态 |
|---:|---|---|---|---|
| 1 | history.js:503 | 资源账目反向 | 高 | [ ] 待修 |
| 2 | objectives.js:120 | 使命无法完成 | 高 | [ ] 待修 |
| 5 | index.html:213 | 缓存陈旧→崩溃（约定违规） | 中（修复极快） | [ ] 待修 |
| 3 | struggle.js:289 | 重燃打错对象 | 中 | [ ] 待修 |
| 4 | struggle.js:497 | 和平结局误判僵局 | 中低 | [ ] 待修 |

---

## 1. 资源消耗在国库为负时反向加钱（history.js:503）

- **位置**：`applyStruggleWarPressure`，`prototype/hifi/scripts/engine/history.js:501-504`
- **现象**：战争压力扣资源时，国库为负的国家不仅没被扣，反而被「加钱」回拉到 0，并向季度账本写一笔负的战争开销（显示成「战争 −(-12)」= 收益）。
- **根因**：
  ```js
  moneyCost = Math.min(country.money ?? 0, moneyCost); // money=-12, cost=8 → Math.min(-12,8) = -12
  country.money = (country.money ?? 0) - moneyCost;     // -12 - (-12) = 0  → 加了 12
  ```
  `Math.min` 本意是「不超额扣」，但负库存下取到负值，减去负数即加法。501/502 行的粮食/军需同理（只是金钱更容易为负——`struggle.js applyCatalysts` 自身就按 `country.money < 0` 分支，证明该状态可达）。
- **影响**：战争压力本应在破产时最痛，结果反而奖励破产，掩盖财政崩溃。
- **修复建议**：先夹到非负再取 min，或显式 `Math.max(0, Math.min(stock, cost))`；扣减只在 `cost > 0` 时进行。账本写入用实际扣减量。
- **验收**：构造 money<0 的当事国跑一季，断言 money 不增、`lastReport.war.money >= 0`。

## 2. favorable-peace 使命的 `score <= -40` 永不成立（objectives.js:120）

- **位置**：`CAMPAIGN_STAGES` 的 `favorable-peace` stage `done()`，`prototype/hifi/scripts/engine/objectives.js:117-120`
- **现象**：法兰西作为防守方（英格兰主动进攻）即便防守制胜，「有利和平」使命也无法完成，从而卡住 `france_hegemony` 终局。
- **根因**：`war.score` 只会单向上涨、永不为负——`warfare.js:488` 仅 `war.score = Math.min(100, war.score + 25)`（进攻方占领目标地时 +25），初值 0，无任何减分路径。
  ```js
  return englandWar.attackers.includes(polity) ? englandWar.score >= 40 : englandWar.score <= -40;
  ```
  当法兰西是 defender 时走 `score <= -40` 分支，而 score ∈ [0,100]，`<= -40` 恒假。只能靠战争彻底结束（`!englandWar`）触发。
- **影响**：历史上最常见的「英格兰进攻、法兰西防守」配置下，使命链被卡，霸权终局不可达。
- **修复建议**：用「相对己方优势」的判据，而非 attacker 视角原始分。例如 defender 方改判「英格兰未占任何争议地 且 持续 N 季」，或引入对称的 defenderScore；或统一把 score 折算成 `polity` 视角的净优势再比较。
- **验收**：英格兰为 attacker、法兰西占据全部争议地的局面，断言该 stage `done === true`。

## 3. 重燃战火打错对象（struggle.js:289）

- **位置**：`updateWarPressure`，`prototype/hifi/scripts/engine/struggle.js:286-289`
- **现象**：局势重燃时永远拿玩家当被告，哪怕玩家根本不是这场局势的当事国。
- **根因**：
  ```js
  const ai = principalsOf(struggle).find(name => name !== world.playerPolity) || opponentOf(...);
  // ...
  window.HIFI_WARFARE_ENGINE.declareWarOn(world, ai, world.playerPolity, `${struggle.label}·重燃`);
  ```
  被告硬编码为 `world.playerPolity`。玩家选干涉者（如卡斯蒂利亚）时，`ai` 落到法兰西，于是法兰西对**卡斯蒂利亚**宣「百年战争·重燃」。`canDeclareWar`（287 行）只查交战/停战，不查是否为当事国。
- **影响**：非当事国玩家会被卷入一场与自己无关的「百年战争」。
- **修复建议**：被告应取「另一位当事国」（`opponentOf(struggle, ai)` 或 `principalsOf` 里非 `ai` 的那个），与玩家身份无关；并校验双方均为该局势 principal。
- **验收**：玩家设为非当事国跑到 warPressure 触发，断言新战争双方都是该局势 principal，且不含玩家。

## 4. 谈判和平几乎触发不了，和平结局被误判为僵局（struggle.js:497 + 264）

- **位置**：`decideEnding`（`struggle.js:494-497`）配合 `processStruggles`（`struggle.js:264`）
- **现象**：实际以议和收场的百年战争，1453 结算时被判成 `stalemate`（僵局），还给双方 +5 战争疲惫，而非 `negotiated_peace` 的疲惫清零。
- **根因**：`processStruggles` 每个无战和平季都 `addCatalyst(struggle, "standoff", 1)`（264 行），把阶段从 truce 推向 standoff；到历史终点年结算时阶段很少还停在 truce，`decideEnding` 的 `phase === "truce" && !principalWar` 分支命中不到，落到 `stalemate`。
- **影响**：四个终局里 `negotiated_peace` 事实上不可达；和平玩家反吃僵局惩罚。
- **修复建议**：判定是否「谈判和平」不应只看瞬时 phase。改为记录「最近一次是否经由议和结束战争」的标志（如 `struggle.lastPeaceTurn`），或在 `decideEnding` 里放宽为「无决定性终局 且 双方已无战争 且 曾达成停战」。
- **验收**：跑一局以 favorable_truce 结束战争、推进到 1453，断言终局为 `negotiated_peace`、疲惫被清零。

## 5. objectives.js 改了却没递增 ?v（index.html:213，约定违规 + 崩溃）

- **位置**：`prototype/hifi/index.html` 的 `<script src="scripts/engine/objectives.js?v=2">`
- **现象**：objectives.js 在本分支有 +107/-8 的**已提交**改动（新增 `missionStages` 等），但 `?v` 仍是 2。
- **根因**：违反 CLAUDE.md「hifi 模块约定：改某个脚本后要在 index.html 里递增它的 `?v=N`，否则浏览器吃旧缓存」。本次 `?v` 批量递增覆盖了工作区改动文件，但漏了 objectives.js——它的改动是已提交的、不在当前工作区 diff 里。
- **影响**：回访玩家若缓存了 `objectives.js?v=2`，加载到没有 `missionStages` 的旧引擎；`struggle.js franceMissionsAllDone`（及 `reviewStruggles`/`decisiveEnding`）调用 `engine.missionStages(...)` 无方法级保护 → 每季 `advanceQuarter` 在 `processHistory` 内抛 TypeError → 游戏卡死。
- **修复建议**：`objectives.js?v=2` → `?v=3`（一字符）。可顺手给 `franceMissionsAllDone` 加 `engine.missionStages?.` 兜底。
- **验收**：`hifi-structure` 或 `hifi-layout` 加断言：凡 `git diff main...HEAD` 改过的脚本，其 `?v` 必 > main 基线。

---

## 已在当前代码修复、不再单列（第一轮发现，复核已修）

- 弹窗不互斥 → `dialogs.js` 已加 `closeAllModals`/`openLayer` 互斥。
- 条件不足按钮仍可点 → `drawers.js actionButton` 已支持禁用原因串（关税/商路/科技/决议）。
- 待办不精准跳转 → `history.js issues()` 已带 `target`，`main.js openIssueTarget` 已直达抽屉/面板。
- 工作区改动脚本 `?v` 未递增 → politics/warfare/strategy/history/struggle/drawers/dialogs/main 均已递增（**唯独 objectives.js 漏掉，见第 5 条**）。

> 建议：5 条全部落地后，结合 30 号评测方案重跑 100 局短样本 + 百年长样本回归。第 1、2 条优先（影响玩法正确性），第 5 条最快（一字符 + 防回归断言）。

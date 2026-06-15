# 17 · hifi 主线机制现状说明与待修问题清单

> 对象：`prototype/hifi/`（当前主线，模块化原生 JS 原型）。
> 目的：①把现有可玩机制完整梳理成一份说明文档；②列出当前 demo 中不合理 / 残缺 / 接线断裂的部分（空按钮、走不通的入口、对不上的数据）。
> 阅读前置：09 号（完整策划方案）、16 号（高保真界面交付方案）。本文只描述**代码里真实存在**的行为，不是设计愿望。

---

## 本次修复记录（第十二节问题清单的处理状态）

> 第一~十一节为机制说明，长期有效；第十二节问题清单中**已处理**的项目状态如下（`prototype/diagrams/hifi主线机制与问题框架图.html` 仍是修复前快照）。

| 项 | 处理 |
|---|---|
| 🔴 B 玩家无法宣战 | 已修：`warfare.declareWarOn(world, attacker, defender)`（自动以目标国首都为战争目标），外交抽屉新增「宣战」动作，`main.js` 接 `war:declare`。 |
| 🔴 A 命令坞空路由 | 宣战/联姻现已指向真实动作；**间谍按钮已移除**（无谍报系统，去伪存真，未新建该系统）。 |
| 🔴 C 引擎能力未暴露 | 已修：外交抽屉补「王室联姻 / 互不侵犯」；军事抽屉在掌握火炮科技后出现「铸造炮队」，`mobilizeArmy` 支持 artillery（耗军需 30）。将领系统仍仅「统治者领军」。 |
| 🟡 D 省份「整合」无机制 | 已修：新增 `economy.integrateTile`（20 金钱 + 1 行政点，控制度 +20），国家抽屉新增「领土整合」按钮。 |
| 🟡 E 省份数值脱节 | 部分修：控制度现反映占领状态，且每季结束后实时刷新（`prototypeMap.refreshSelected`）。发展度公式与 POP×31.5 缩放仍为展示代理，待设计确认。 |
| 🟡 F 死数据 / 失效聚焦 | 已修：删除 `world.pendingIssues` 与 `map.js` 中失效的 `data-focus` 聚焦绑定。 |
| 🟡 G 同名易混 / 死字段 | 已修：HUD 行动点改标「行政点 / 外交点 / 军事点」以区别「军需」；删除 `government.legitimacy` 死字段。 |
| 🟢 H 死代码 | 已修：删除 `world.selectedUnit`、`bindCountryDialogs` 冗余的 `renderSystem` 返回项。 |
| 🟢 I 体验/平衡 | 仅修「继续行军」无路线时的提示反馈；AI 主动性、附属平衡、因果链扩展按原结论**保留待设计确认**。 |

新增/变更已补测试：`hifi-warfare`（declareWarOn / 停战 / 炮兵）、`hifi-economy`（integrateTile）。全套 30 个测试文件通过（含 `hifi-longrun` 长线模拟、`hifi-demo2-parity` 对账）。

---

## 一、整体结构与数据流

```
data/        geography / countries / rules / trade      —— 纯数据
engine/      world turn politics economy diplomacy warfare trade history strategy   —— 纯逻辑
ui/          store / map / drawers / dialogs            —— 渲染与交互
main.js                                                 —— 接线
```

- 每个文件是一个 IIFE，把 API 挂到全局 `window.HIFI_*`（如 `HIFI_WORLD_ENGINE`、`HIFI_TURN_ENGINE`）。`index.html` 用按依赖顺序排列的 `<script src="...?v=N">` 加载，`?v=N` 是手动 cache-bust。
- **唯一可变状态是 `world` 对象**，由 `HIFI_STORE.createStore(world)` 包一层订阅。`store.update(mutator)` 跑 mutator 后通知所有订阅者重渲染。注意 store 并不复制状态，直接原地改 `world`。
- 渲染主循环：`store.subscribe` → `renderHud` + `prototypeMap.syncSelection` + `renderMainMap`。系统抽屉内容由 `HIFI_DRAWERS.renderSystem(system, world)` 生成 HTML 字符串，再由 `main.js` 用 `data-*` 属性批量绑定点击。

### 启动序列（main.js）
1. `createWorld(prototypeMap.tiles)` —— 地图由 `ui/map.js` 的 `buildTiles()` 程序化生成（六边形网格 + 真实海陆轮廓投影），不是从 demo2 抽取的静态地图。
2. 依次 `initializePolitics / initializeEconomy / initializeDiplomacy / initializeWarfare / initializeHistory / initializeTrade`。
3. 建 store、绑国家/军团/叙事三组弹窗、注册系统轨与地图事件。

---

## 二、回合循环（季度推进）

`HIFI_TURN_ENGINE.advanceQuarter(world)`（turn.js）按固定顺序执行，是理解全局耦合的关键：

1. `turn += 1`
2. **warfare**：`processWarfare` —— 佣兵契约结算 → 军团移动 → 补给/士气 → 同格敌对军团自动开战 → 占领推进。
3. **行动点**：每国按领导人能力 `leaderActionGain` 回点（行政/外交/军事，上限 10）。
4. **economy**：每国 `settleCountry` 结算地块产出（粮/钱/军需）、开放贸易额外收益、议程达成奖励。
5. **trade**：`processTrade` —— 路线流量、关税分配收入、刷新六维结构压力。
6. **diplomacy**：`processDiplomacy` —— 使节任务推进、条约到期清理、附属贡赋、外交容量超限惩罚。
7. **politics**：每国 `processLeadership` 检查领导人到期（历史卒年 / 任期）→ 触发继承或选举。
8. **history**：`processHistory` —— 局势（黑死病/小冰期）、技术传播、纪元里程碑、时代使命、纪元状态机。
9. **strategy**：`processAI` —— 非玩家国家的极简 AI。

> 结束季度按钮（`seasonControl`）只有在 `blockingIssues` 为空时才允许推进；否则提示先处理裁断。

---

## 三、世界与资源模型（world.js）

- 国家状态由 `createCountryState` 生成，初始 `food/money/military` 由领土人口、市场/港口/堡垒数量推算。
- **行动点三类**：行政 administrative、外交 diplomatic、军事 military（`actionPoints`，上限 10），是大部分操作的硬性成本。
- **存量资源**：粮食 food、金钱 money、军需 military（注意与「军事行动点」同名不同物）、合法性 legitimacy、思想点 ideas、资本池 capital。
- HUD 顶栏 7 个资源 token 与 `renderHud` 的 `setResource` 一一对应；粮/钱/军需额外显示 `forecast` 预测的「+N/季」。
- `setPlayerCountry` 切换扮演国并把选中地块移到其首都。共 30+ 个 1337 年政权可切换扮演。

---

## 四、政治系统（politics.js + countries.js）

| 子系统 | 行为 |
|---|---|
| **政体** | 6 种：君主制 / 共和国 / 神权国 / 部族联盟 / 商业共和国 / 帝国制。各有 powerName、议会类型、5 个专属阶层、继承方式。 |
| **改革槽** | 6 槽（行政/财政/军事/宗教/政治/海事），0–5 级。升级消耗对应资源（行政→钱、军事→军需、政治→合法性、海事→钱）。 |
| **法律** | 4 类（税制/动员/宗教/权威），循环切换，每次花 1 行政点。 |
| **议会** | 解锁后可「召开议会」，按平均满意度+政治改革+让步算支持度，≥50 通过并 +3 合法性。让步可选特权/金钱。 |
| **国家决议** | 6 项硬转折（召开等级会议、议会/绝对主义财政路线、接纳宗教改革、君主立宪、公民共和国），各有 `can` 前置与 `why` 文案。 |
| **领导人** | 来自 `countries.js` 的真实史实人物（带卒年 endYear、能力三维）。到卒年/任期则继承或选举。 |
| **继承/选举** | 史实继任者优先；世袭→生成同族继承人；非玩家选举国→自动选；玩家选举国→弹「选举弹窗」让玩家三选一。 |

---

## 五、经济系统（economy.js + rules.js）

- **地块产出 `tileOutput`**：基于人口×控制度×（1-破坏度）×（1-占领度）。粮食看是否粮食类产物，军需看是否军事类产物。建筑（农庄/市场/堡垒/港口/工坊）与科技（复式记账/常备军）给乘数。被 100% 占领的地块产出归零。
- **建筑**：5 种，花金钱 + 1 行政点，须在己方陆地、地块尚无该建筑。
- **敕令 edicts**：强化征税 / 建立粮储 / 征集军需，即时消耗换即时收益。
- **议程 agendas**：设一个目标（钱/粮/军需达阈值），达成给合法性奖励，一次性。
- **科技 technologies**：9 项，有「可用年代」「传播度≥25%」「思想点足够」三重门槛。采纳推进时代进度。
- **贸易政策**：封闭/常规/开放，开放额外给钱并积累资本池。

---

## 六、贸易系统（trade.js 数据 + engine）

- **10 条历史商路**（黎凡特/汉萨/好望角/新大陆白银等），部分需科技解锁（远洋帆装/印刷术/跨洋贸易体系）。
- 每路线 `flow = value × (1 - 成本/120)`；成本受沿途地块破坏度、占领、关税影响。君士坦丁堡陷落后黎凡特相关路线成本 +18。
- **关税** 只能设 0/10/25%，影响本国节点分得的贸易收入与财政压力。
- **六维结构压力** `pressures`（贸易/军事/财政/探索/信仰/思想）每季由 `computePressures` 重算，供 AI 决策与探索点积累使用。

---

## 七、外交系统（diplomacy.js）

- **双边关系是有方向的**：`relation.sides[viewer]` 记录信任/威胁/好感/领土矛盾/制度冲突等，A 看 B 与 B 看 A 是两套数值。
- **态度** `diplomaticAttitude` 由综合分映射成 close/cooperative/neutral/wary/rival/hostile。
- **使节** envoys（默认 2）派出执行「改善关系 / 安抚附属」任务，每季推进。
- **条约** 5 种（贸易/通行/联姻/互不侵犯/防御同盟），**附属** 3 种（朝贡/附庸/傀儡）。提案走 `evaluateProposal` 打分，达阈值才被接受，否则报「对方拒绝 分数/阈值」。
- **外交容量**：条约/附属各占容量，超出容量每季扣外交点。
- **领导人外交**：赠礼（20 钱）/会晤/威慑，调整领导人间友谊·尊重·恐惧·宿怨。

---

## 八、战争系统（warfare.js）

- **军团编制**：units 数组，每单位有 combatType（步/骑/炮）+ serviceType（卫队/职业/常备/征召/佣兵）+ 兵力 + 经验。军团有士气/组织/补给。
- **初始布局**：法/英/奥斯曼/拜占庭各一支主力军；并预置两场历史战争——**百年战争**（英→法）、**尼科米底亚围城**（奥斯曼→拜占庭）。
- **动员** `mobilizeArmy`：己方陆地征召步兵(1200)/骑兵(500)，消耗地块人口 + 1 军事点。
- **佣兵** `hireMercenary`：40 钱雇一团，有契约期与忠诚，到期/欠饷会叛离。可续约/解约。
- **军团管理**（军团抽屉）：拆分/合并/补员/训练/复员征召兵/任命统治者领军/规划路线。
- **移动**：`planArmyRoute` 用 BFS 按地形成本找路（山地/海洋不可通行），点地图目标格规划，按季逐格行军。
- **战斗** `resolveBattle`：同格敌对军团自动开战，按兵种相性（骑兵在林地/丘陵减成）、经验、将领指挥、士气/组织/补给算战力，分胜负、扣兵、造成破坏，败方溃退。
- **占领 / 和平**：`advanceOccupation` 占领敌格累计战争分数；`concludePeace` 按战争目标索取领土或停战，并清占领、立 20 季停战。君堡被奥斯曼夺取触发「君士坦丁堡陷落」历史因果链。

---

## 九、历史叙事系统（history.js）

- **六纪元状态机** `eras`：封建→发现→信仰分裂→绝对主义→革命→工业，按年份推进，触发「时代转折」裁断。
- **局势 situations**：第 12 季黑死病、第 48 季小冰期，分预兆/爆发/消退三相，爆发期周期性扣全图人口，并可生成玩家事件。
- **玩家事件 playerEvents**：如「疫病逼近首都」，二选一裁断，立即改资源（属阻塞性裁断，必须处理才能结束季度）。
- **历史因果链 `applyCausalChain`**：目前只实现 `constantinople_falls`，链式推动探索压力 + 物价 + 触发时代转折弹窗。
- **时代使命 missions**：稳固首都/接入市场/近代军队/工业起飞，达成给奖励 + 写编年史。
- **新手指引 tutorial**：5 步线性引导（选地块→看国家→调贸易→整编军团→结束季度），通过 `completeTutorial(key)` 推进。
- **御前会议 councilSummary**：汇总预警 + 顾问建议 + 局势；可「确认时代转折」「垂帘听政 4 季」（连续自动推进直到出现阻塞事件）。
- **问题列表 `issues`**：选举/玩家事件为阻塞性；时代转折、顾问预警、局势为非阻塞。HUD 右侧「问题与对象」面板与底部「结束季度/处理裁断」按钮都读它。

---

## 十、AI（strategy.js）

极简，仅对非玩家国家：按可负担+传播够的科技采纳一项；按财政/贸易压力调关税；军事压力高且军团<3 时动员步兵；议会支持低时召开议会。
**AI 不会主动宣战、不会议和、不会对玩家发起任何外交。**

---

## 十一、UI 结构与交互

- **左侧系统轨** 5 键：国家/经济/外交/军事/发展 → 打开右侧系统抽屉。
- **省份面板**（左下）：显示选中地块的气候/POP/产出/控制度/发展度/文化/宗教 + 4 个快捷动作。
- **命令坞**（底部）：宣战/议和/贸易/结盟/联姻/间谍/通行权 7 键。
- **地图工具**（右侧）：10 个透镜（政治/地形/人口/产出/贸易/宗教/家族/政体/阶层/军事）、缩略图、缩放、图例。
- **弹窗**：国家详情、选择扮演国、领导人选举、御前会议、历史事件。
- **军团抽屉**：点地图上 ♞ 标记或军事抽屉里的军团条目打开。

---

## 十二、待修问题清单（不合理 / 残缺 / 接线断裂）

> 按严重度分级：🔴 走不通的入口/缺失功能　🟡 数据对不上/误导　🟢 死代码/清理项

### 🔴 A. 命令坞按钮多数是「装饰性路由」，部分通向不存在的功能
命令坞 7 个按钮全部只是 `data-open-system` 跳转打开某个抽屉（index.html L90-98），并不真正执行命令：

| 按钮 | 跳转到 | 实际能做的事 | 问题 |
|---|---|---|---|
| 宣战 | 外交抽屉 | —— | **外交抽屉里根本没有「宣战」动作**（见 B），死路。玩家无法主动开战。 |
| 议和 | 军事抽屉 | 有按战争的议和按钮 | 勉强对得上。 |
| 贸易 | 外交抽屉 | 贸易协定 | 可用。 |
| 结盟 | 外交抽屉 | 防御同盟 | 可用。 |
| 联姻 | 外交抽屉 | —— | **外交动作列表里没有联姻**（引擎有 `treaty:marriage` 但 UI 未暴露），死路。 |
| 间谍 | 外交抽屉 | —— | **完全没有间谍/谍报系统**，死路。 |
| 通行权 | 外交抽屉 | 军事通行 | 可用。 |

### 🔴 B. 玩家无法主动宣战
`drawers.js` 的外交动作数组（`renderDiplomacy`，L147-158）只有 mission/leader/treaty/subject 四类，**没有 declareWar**。`warfare.js` 有 `declareWar`，但只在初始化时被历史战争调用，没有任何 UI 入口。结果：玩家全程只能打初始预置的百年战争，无法对其他国家开战。

### 🔴 C. 引擎能力未在 UI 暴露
- **联姻条约 `treaty:marriage`、互不侵犯 `treaty:nonaggression`**：引擎定义齐全，外交抽屉只列了 trade/access/alliance，这两项无入口。
- **炮兵 artillery**：`mobilizeArmy` 只允许步兵/骑兵，`canRecruitCombatType` 检查炮兵需要 `artillery` 科技，但没有任何「造炮兵」的 UI；炮兵只能在初始编制里出现，玩家造不出来。
- **将领系统**：除「统治者领军」外，`assignGeneral` 支持任命非统治者将领，但 UI 只有 ruler 一种；`generals` 池实际只会有 ruler-general。

### 🟡 D. 省份面板快捷动作有一个对不上
省份面板 4 个动作（index.html L82-87）：建设→经济✅、征兵→军事✅、派驻→军事✅、**整合→国家**❌。「整合」暗示领土整合/核心化机制，但国家抽屉里只有改革/法律/议会/决议，没有任何「整合地块」功能。属误导性入口。

### 🟡 E. 省份面板部分数值是「展示用算法」，与引擎实际值脱节
`map.js` 的 `updateProvince`：
- 发展度 = `population*3 + buildings.length*8`，与经济引擎真正用的 `control/devastation/occupation` 无关，纯展示。
- POP 显示 = `population * 31.5` K，缩放系数是拍脑袋的。
- 控制度直接显示地块静态 `control`，但战争占领/破坏不会反映到这一行。

### 🟡 F. `world.pendingIssues` 是死数据 + 对应的聚焦点击失效
- `createWorld` 造了 `pendingIssues`（财政压力/军团待命/新科技），**从未被任何地方读取**——HUD 的问题列表实际来自 `HIFI_HISTORY_ENGINE.issues()`。
- `map.js` L509 绑定 `.issue[data-focus]` 的「点击聚焦到该地区」，但 `main.js` 渲染的 issue 按钮用的是 `data-history-issue` + `data-kind`，**没有 `data-focus`**，所以这段聚焦逻辑永远不触发，是死代码。

### 🟡 G. 同名概念易混
- 顶栏「军事」(actionPoints.military) 与「军需」(military 存量) 是两个东西，图标分别是 ⚔ / ▣，但都叫「军事」系的词，新玩家易混。
- `government.legitimacy`（createGovernment 里设 70）从不被读取，真正用的是 `country.legitimacy`，前者是死字段。

### 🟢 H. 死代码 / 清理项
- `world.selectedUnit`：从未使用。
- `bindCountryDialogs` 返回对象里带 `renderSystem`，但它只是全局同名函数的引用，且调用方 `main.js` 直接用 `window.HIFI_DRAWERS.renderSystem`，返回里的这个字段没用。
- 顶栏资源 token 的初始硬编码值（120/4/3/3/812/240/78）和省份面板初始值（巴黎/504K/64）是占位，渲染后被覆盖；若首帧渲染失败会暴露假数据。

### 🟢 I. 体验/平衡观察（非 bug，待设计确认）
- AI 不会外交、不会开战，世界除初始两场战争外基本静止，长线缺乏外部压力。
- 附属提案分数含「实力差距 / 2」，对弱小邻国极易直接傀儡化，缺平衡约束。
- 军团「继续行军」按钮在没有已规划路线时点击无任何反馈。
- 历史因果链目前只实现君堡陷落一条，其余纪元转折只是弹文案，无机制后果。

---

## 十三、优先级建议（供后续排期参考）

1. **接通宣战入口**（B）——这是策略游戏的核心动词，目前完全缺失，优先级最高。
2. **命令坞按钮去伪存真**（A/C）——要么补齐联姻/间谍/宣战动作，要么先移除/置灰未实现的按钮，避免空点击。
3. **省份面板「整合」入口**（D）——补整合机制或改指向。
4. **清理死数据与失效聚焦**（F/H）——`pendingIssues`、`data-focus`、`selectedUnit`。
5. **数值口径统一**（E/G）——发展度/控制度接真实引擎值；区分「军事点 / 军需」措辞。
6. **AI 主动性**（I）——让 AI 至少会对玩家宣战/议和，世界才「活」。

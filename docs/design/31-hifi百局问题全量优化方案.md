# 31 - hifi 百局问题全量优化方案（基于 29 号试玩报告）

## 目标

29 号《hifi 百局试玩体验报告》在 100 局开局 + 5 个百年长样本里暴露了一整套问题：**8% 短局崩溃、长样本全崩、数值断裂、假按钮、弹窗叠加、待办失焦**。本方案对齐 29 号报告的「待办优先级 1–7」和「下一步落地方案四阶段」，把每一条都落到 `prototype/hifi/scripts/` 的具体函数，**要求覆盖报告全部问题点**。

与既有文档的边界：

- **28 号《局势系统优化方案》** 只管局势系统（precheck / warPressure / reviewStruggles / 备战命名 / 十年评估），其多数提案已落进 `struggle.js`。本方案不重复 28 号的局势内部设计，只在 P1 接住「局势/AI 自动宣战导致的崩溃」这一全局健壮性问题，并在 P5 引用 28 号的战争疲惫/资源消耗设计。
- **30 号《整体评测方案》** 提供 L1 不变量测试与 L2 批量自我对弈管线。本方案 P1 的「不变量护栏」和最终的「百局回归」直接复用 30 号的 `tools/sim/` 与 `hifi-invariants.test.cjs`，作为验收手段。

设计原则不变（CLAUDE.md 核心循环）：机制是挂在流上的双向阀门，**所有自动流必须无人值守也不崩**；玩家是扰动机器，不是驱动机器。因此「崩溃」是最高优先级——一台会卡死的机器，再好的数值也无从体验。

---

## 一、实测复现：崩溃真因（先于设计）

报告把 8% 崩溃归因为「局势自动宣战在已交战 / 停战期再次触发」。本方案在写设计前先做了**全引擎 + 全地图（1628 地块 / 35 国）的无头复现**，按 `main.js` 的 7 步初始化建局、加载 `strategy.js` + `struggle.js` 后连推 120–200 季，结论是：

> 报告观察到的崩溃只是一类更广问题的**表层症状**——**多个按季自转的引擎在遍历实体时，假设每个实体都有「玩家级完整状态」，但小国 / 缺统治者国 / 已被吞并国只有骨架状态，于是未受保护的字段访问或未 precheck 的引擎调用直接抛出未捕获异常，整局崩溃。**

已定位的两条具体链路：

| # | 崩溃链路 | 代码根因 | 现状 |
|---|---|---|---|
| C1 | **AI 遍历无议会国** | `strategy.js processCountry`（L37）读 `country.government.assembly.unlocked`。`initializePolitics`（politics.js L51-59）**只对 `data.leaders` 里有配置的国家**建完整 `government`；其余国保留 `world.js:71` 的默认骨架 `{type,typeLabel,powerName,centralPower}`，**没有 `assembly` 字段**。AI 每季遍历全部 35 国，处理到任一无 leader 国即抛 `reading 'unlocked'`，**首季即崩**。 | 复现 20/20 局首季崩溃 |
| C2 | **自动宣战未 precheck** | `declareWar`（warfare.js L360-361）对「已交战 / 停战期」抛 `双方已经交战` / `停战协定期内不能宣战`。`strategy.js:201` 已用 try/catch 包住、`struggle.js updateWarPressure`（L271/284）已做前置 return——**当前主线这两处已被保护**，但保护是「事后兜」而非「不变量」，新增任何第三处 `declareWarOn` 调用就会重新引爆。报告的 5+3 崩溃即此类。 | 主线已局部修复，缺统一护栏 |

**结论修订**：报告优先级①「修复局势自动宣战状态机」要从「修 struggle.js 一个函数」升级为「**给所有按季遍历实体的引擎补状态护栏 + 给所有自动宣战补统一 precheck**」。否则像 C1 这种「不在局势系统里、但同属一类」的崩溃会被遗漏。

---

## 二、优化设计（按报告待办优先级 1–7）

### P1 — 状态机健壮性：长样本零崩溃（报告①，最高优先级）

三层护栏，从「事后兜异常」改为「结构上不可能崩」。

**① 完整状态保证（修 C1 的根因）**：让所有国家都拥有结构完整的 `government`，而不是骨架默认值。

```js
// politics.js initializePolitics —— 无 leader 配置的国家也补全 government
for (const [polity, country] of Object.entries(world.countries)) {
  const config = data.leaders[polity];
  // 有配置用配置；无配置给一份「最简君主制」完整结构（含 assembly:{unlocked:false,...}）
  country.government = createGovernment(config?.government || "monarchy");
  country.estates = createEstates(config?.government || "monarchy");
  if (config) { country.leader = leaderFromRecord(polity, config.history[0]); /* ... */ }
  country.decisionLedger = country.decisionLedger || [];
}
```

`createGovernment` 已经会产出带 `assembly` 的完整结构（politics.js L19），**关键是让缺 leader 的国也走这条路**。修后 C1 链路从「抛异常」变为「正常读到 `assembly.unlocked === false`」。

**② AI 遍历加防御 + 缩小作用域**：AI 不该对地图上每一个微型政体都跑完整决策。

```js
// strategy.js processAI —— 只处理「有真实玩家级状态」的主要国家，跳过骨架国
function processAI(world) {
  world.__aiWarsThisQuarter = 0;
  for (const polity of Object.keys(world.countries)) {
    const c = world.countries[polity];
    if (!c.government?.assembly || !c.actionPoints) continue; // 状态不完整直接跳过（双保险）
    processCountry(world, polity);
  }
  return world;
}
```

并把 `processCountry` 内所有「假设满状态」的访问改为可选链：`country.government?.assembly?.unlocked`、`country.actionPoints?.military`。

**③ 自动宣战统一 precheck（修 C2 的类）**：在 `warfare.js` 暴露一个**不抛异常**的 `canDeclareWar(world, a, b) → {ok, reason}`，所有自动调用方（strategy / struggle）先问再做；`declareWarOn` 内部仍保留 throw 作为最后防线（供 UI 层手动操作 toast）。

```js
// warfare.js
function canDeclareWar(world, attacker, defender) {
  if (!world.countries[defender]) return { ok:false, reason:"目标国家不存在" };
  if (attacker === defender)      return { ok:false, reason:"不能对本国宣战" };
  if (areAtWar(world, attacker, defender)) return { ok:false, reason:"双方已经交战" };
  if (underTruce(world, attacker, defender)) return { ok:false, reason:"停战协定期内不能宣战" };
  return { ok:true };
}
// strategy.js / struggle.js：if (warfare.canDeclareWar(world,a,b).ok) warfare.declareWarOn(...)
```

**④ 不变量护栏（接 30 号）**：新增 `tests/hifi-invariants.test.cjs`（30 号 T1），按 `main.js` 七步初始化建全图局、加载 struggle+strategy，连推 **200 季无 throw**，并断言 6 条守恒律（国家数不负增、资源非 NaN、每国 `government.assembly` 存在、无重复 war、phase 合法、turn 单调）。**这是 P1 的回归闸门，也是把「事后兜」升级为「结构不变量」的验证。**

**验收（报告① + 落地方案第一阶段）**：5 个百年长样本全部跑满、`hifi-invariants` 200 季零崩溃。

### P2 — 条件不足按钮统一禁用（报告②；假按钮）

报告点名的假按钮：未解锁科技、未解锁商路、条件不足国家决议、`当前关税`（已是当前值仍可点）、对强国的从属提案。根因：**判「可用态」和判「可执行」是两套规则**（与 28 号 P1 同一病根，但这里是经济/外交/科技抽屉，不是局势）。

**单一真相源模式**：每个可点行动声明一个 `evaluate(world,polity) → {enabled, reason}`，渲染端 (`drawers.js actionButton`，已有 `disabled/title` 通路 L249-265) 和执行端共用。

| 抽屉/行动 | 禁用条件 | 缺口提示（title） |
|---|---|---|
| 发展-科技采纳 | `country.ideas < tech.cost` 或前置未解锁 | `思想点 {have}/{cost}` 或 `需先采纳 {prereq}` |
| 经济-商路投资 | 商路未解锁 / 资本不足 | `商路未开通` / `资本 {have}/{need}` |
| 经济-关税档位 | 已是当前档位 | `当前已是该档位` |
| 国家-决议/整合 | 合法性/行政点/前置不足 | 列出具体缺口 |
| 外交-从属（朝贡/附庸/傀儡） | 对方实力/分数不足 | `对方实力过强，无法 {label}` |

执行端在真正调用引擎前再 `evaluate().enabled` 兜一次，双方读同一函数。**报告③「结束季度仍可推进但显示问题 N」属于另一类语义问题，见 P6-次要。**

**验收**：抽屉按钮清单检查——亮着的按钮点击必成功，置灰的带具体缺口 title。

### P3 — 弹窗互斥（报告④；界面叠加混乱）

现状 `dialogs.js` 只做 `classList.add("open")`（L124/136），季报 / 局势 / 御前会议 / 季度总结可同时开。

**统一 modal 管理器**：所有 modal 走一个 `openModal(id)`，进入前 `closeAllModals()`（抽屉 drawer 与 modal 分层：drawer 是侧栏可与地图并存，modal 是焦点弹窗互斥）。

```js
// dialogs.js
const MODALS = ["seasonSummaryModal","strugglePanel","councilModal","struggleReviewModal","struggleEndingModal"];
function closeAllModals(except) {
  MODALS.forEach(id => { if (id!==except) document.getElementById(id)?.classList.remove("open"); });
}
function openModal(id) { closeAllModals(id); document.getElementById(id)?.classList.add("open"); }
```

Esc / 点遮罩关闭当前 modal。**验收**：任一时刻至多一个 modal 处于 open。

### P4 — 待办直达对应系统（报告④；待办失焦 + 报告⑥分组）

现状 `issues()`（history.js L349+）已带 `blocking`/`kind`，但渲染端平铺、且所有待办都导向御前会议。两步改造：

**① 三层分组渲染**（采纳 28 号 P5 的 tier 映射）：

```
blocking（裁断/选举/情势爆发）→ mainline（局势/战争/使命）→ opportunity（预警/建设/外交机会）
```

每组带小标题，组内排序。黑死病满足「首次爆发 / 首都圈受影响 / 人口损失超阈值」之一时升 `blocking`（28 号已述，此处统一接渲染）。

**② 精准跳转**：每条待办带 `target:{drawer, tab}` 或 `panel`，点击直接 `openDrawer(drawer)+selectTab(tab)` 或 `openModal(panel)`，不再统一进会议。

| 待办类型 | 跳转目标 |
|---|---|
| 战争 / 局势 / 使命 | 局势面板 `strugglePanel` |
| 改革 / 法律 / 选举 | 国家抽屉·政制 tab |
| 关税 / 商路 / 敕令 | 经济抽屉·对应 tab |
| 外交提案 / 条约 | 外交抽屉·邦交 tab |
| 黑死病 / 小冰期 | 国家抽屉·概览（情势卡） |

**验收**：浏览器点击巡检——每条待办一步到位，分三组显示。

### P5 — 数值平衡：四条断裂曲线（报告⑤）

报告四张数值表的核心问题对应四处引擎改动。**全部接 `lastReport` / `quarterLedger`，可解释、不互相叠算。**

| 问题 | 现状（代码） | 设计 |
|---|---|---|
| **合法性过低**（25% 归零） | 灾害（history `processSituations`）、战争疲惫（warfare `processWarExhaustion` 只扣不补）、改革多处独立 `legitimacy -=`，叠加无封顶、无恢复 | ① 每季合法性净变化设软封顶（如 ≤ -6/季），多源惩罚取最大而非求和；② 新增恢复流：和平年景 + 阶层满意 + 在位久 → 每季 `+1~2`；③ 终局/十年评估的合法性奖惩保留（struggle 已有） |
| **思想点固定 60**（92 局全 60） | `economy.js:18` 初始 20，`+3 印刷术`、`history.js:117 +1`，但缺城市/贸易/事件来源，且疑似有隐性收束到 60 | 思想点产出流化：`ideas += 城市数×0.5 + 贸易枢纽×1 + 科技扩散事件 + 时代里程碑`（接 history `spreadTechnology` / `processMilestones`），去掉固定收束，让分布拉开 |
| **战争疲惫断裂**（0 或 100） | 只在 `advanceOccupation` 占领完成时 +（warfare L477），无真实占领则恒 0 | 采纳 28 号 P4：鏖战阶段**每季累加** `1 + floor(交战季数/4)`；疲惫 >20 时按比例压低产出并降阶层满意（回灌闭环） |
| **贫富差过大**（金钱 0~3096） | 缺持续性支出，强国盈余无处消耗 | 新增三条消耗流：军队**维护费**（按军团规模，接 warfare）、**行政成本**（按地块数/集权度，接 economy）、**贸易风险**（商路被封锁/海盗的概率性损耗）。让盈余被结构性吞掉，破产国靠减支自救 |
| **非军事路线脱军队**（多数路线军团 0） | 经济/外交/局势目标不要求军队 | 引入**最低防卫**概念：无任何军团且边境有压力时，阶层满意/合法性轻微受损，促使各路线至少维持象征性防卫；局势使命「收复争议领地」本就需军队（已有） |

**验收（落地方案第四阶段）**：重跑 100 局，合法性中位回到 ~45 且归零率 <10%、思想点分布拉开（非全 60）、战争疲惫呈渐进分布、金钱 75 分位/中位差距收敛。用 30 号 L2 批量管线出分布 diff。

### P6 — 外交对象分组（报告⑥）

`drawers.js` 邦交页一次平铺大量国家。按关系分组 + 折叠：

```
邻国 → 强敌（实力≥己方且戒备）→ 盟友/同君 → 附属（朝贡/附庸/傀儡）→ 远方国家（默认折叠）
```

每组带计数小标题，远方组默认折叠。**验收**：邦交页首屏只见邻国/强敌/盟友，远方折叠。

### P7 — 资源账本入口（报告⑦；资源来源不透明）

基础设施已就绪：`quarterLedger`（history.js L498）已把 `lastReport` 拆成「产出/维护/事件/战争」四段，`dialogs.js`（L145-165）已有 ledger 行渲染。**缺的只是入口**：

- 顶部资源条（粮食/金钱/军需/思想点/合法性）每项加 `data-resource` + 可点；
- 点击 `openModal("ledgerModal")`，渲染 `quarterLedger(world)` 对应资源段的四段构成 + 上季净变化。

**验收**：点顶部任一资源弹出该资源本季「为什么涨/跌」的四段来源。

---

## 三、次要优化（报告其余项，全覆盖）

| 报告项 | 设计 | 文件 |
|---|---|---|
| 结束季度文案不清（`问题 4` 仍可推进） | `seasonText` 恒显「结束季度」；问题数移到独立角标（`issueHeading` 旁），裁断数用红角标但**不阻断**推进 | main.js:136、index.html |
| 导师指引滞后（中期仍「选择一个地块」） | 导师主线目标按 `国家 × 时代 × 局势阶段` 刷新（接 objectives `missionStages` + 时代里程碑），早期=立国、中期=使命链、局势期=当前阶段推荐 | objectives.js、dialogs.js |
| 右下控件拥挤（地图模式/图例/缩放/局势挤一角） | 局势浮窗上移或折叠为图标；地图工具压缩成单行图标组；小屏断点下二者不重叠 | components.css、index.html |
| 弹窗遮挡地块详情 | 地块详情纳入 P3 的层级管理：modal 打开时地块详情降层或暂隐 | dialogs.js、components.css |
| 资源 404（terrain-banners / ruler-philip-vi） | **实测：`assets/terrain-banners/{plains,coast,...}.png` 与 `assets/ui/ruler-philip-vi.png` 当前均已存在**，报告中的 404 系旧缓存 / 路径未递增 `?v`。改动：核对 map.js 横幅路径拼接，必要时给图片引用补 cache-bust，并加一条 `hifi-structure` 断言「terrain-banner 全 9 类文件存在」防回归 | assets/、map.js、tests/hifi-structure |

---

## 四、实施任务拆分

| Task | 文件 | 内容 | 测试 |
|---|---|---|---|
| 9.1 | politics.js, strategy.js, warfare.js | **P1**：无 leader 国补全 government；processAI 跳过骨架国 + 可选链；`canDeclareWar` 不抛版 + 自动调用方改用它 | hifi-invariants（200 季零崩溃，每国有 assembly） |
| 9.2 | tests/hifi-invariants.test.cjs（新增，接 30 号 T1） | 全图 + struggle + strategy 连推 200 季，6 条守恒律断言 | 自身即测试 |
| 9.3 | drawers.js（+ economy/diplomacy 暴露 evaluate） | **P2**：科技/商路/关税/决议/从属统一 `evaluate→{enabled,reason}`，渲染与执行共用 | hifi-ui-smoke：置灰按钮带 title、亮按钮可执行 |
| 9.4 | dialogs.js, main.js | **P3** modal 互斥 `openModal/closeAllModals`；index.html 递增 dialogs/main 的 `?v` | hifi-layout：MODALS 互斥串存在 |
| 9.5 | history.js（issues tier+target）, main.js（渲染/跳转） | **P4** 待办三层分组 + 精准跳转 | hifi-world：issues 带 tier/target；ui-smoke：三组渲染 |
| 9.6 | history.js, warfare.js, economy.js | **P5** 合法性软封顶+恢复流、思想点产出流化、疲惫每季累加+回灌、维护/行政/贸易风险消耗、最低防卫 | hifi-history/warfare/economy + 30 号 L2 分布回归 |
| 9.7 | drawers.js | **P6** 邦交分组（邻国/强敌/盟友/附属/远方折叠） | hifi-ui-smoke：分组小标题存在 |
| 9.8 | index.html, dialogs.js, history.js | **P7** 顶部资源可点 → ledgerModal 渲染 quarterLedger | hifi-ui-smoke：data-resource + ledgerModal 接线 |
| 9.9 | main.js, objectives.js, components.css, map.js, tests/hifi-structure | 次要：结束季度文案、导师刷新、右下布局、横幅路径核对 + 资源存在断言 | hifi-structure：terrain-banner 全在 |

每改一个脚本在 `index.html` 递增其 `?v=N`（CLAUDE.md 约定）。

---

## 五、验收对照（对应 29 号待办优先级 1–7）

| 报告优先级 | 本方案达成途径 | 验证手段 |
|---|---|---|
| ① 修自动宣战状态机 | P1 三层护栏（完整状态 + AI 防御 + canDeclareWar）+ 修 C1 真因 | hifi-invariants 200 季 + 5 个百年长样本零崩溃 |
| ② 条件不足按钮禁用 | P2 单一真相源 evaluate | 抽屉按钮巡检 |
| ③ modal 互斥 | P3 openModal/closeAllModals | hifi-layout |
| ④ 待办直达 | P4 tier 分组 + target 跳转 | 浏览器点击巡检 |
| ⑤ 合法性/思想点/战争疲惫曲线 | P5 四条断裂曲线 + 贫富/防卫 | 100 局分布回归（30 号 L2） |
| ⑥ 外交分组 | P6 五组折叠 | hifi-ui-smoke |
| ⑦ 资源账本入口 | P7 顶部资源 → ledgerModal | hifi-ui-smoke |

**回归基线**：实施后用 30 号 `tools/sim/` 重跑 100 局短样本 + 5 个百年长样本，产出 32 号复测报告，对照本表七条与 29 号数值分布。

> 实现说明随后（按 CLAUDE.md 设计先行约定）。崩溃类（9.1/9.2）必须先于其余任务落地——一台会卡死的机器，数值与交互优化都无从体验。

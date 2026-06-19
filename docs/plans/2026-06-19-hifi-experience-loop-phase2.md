# hifi 体验闭环二期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 22 号体验评估中除长期项外的全部待办——给资源加消耗出口止住数值膨胀（#4）、把动作成本/收益反馈接到每个按钮（#5）、并对 HUD 与地图/地块/外交界面减负（#6/#7/#9/#10/#11）。

**Architecture:** 三个 Phase 独立可合并。Phase A 在 `economy.js settleCountry` 产出后扣维护费、欠费惩罚走已有压力通道，并在 `history.js quarterLedger` 展示「产出−维护−事件=净增」；Phase B 复用 `proposals.js` 的 preview/available 能力下沉到抽屉按钮；Phase C 只动 `ui/` + `index.html`。

**Tech Stack:** 原生 JS IIFE（无打包器、无依赖），全局 `window.HIFI_*` API；测试用 Node 内置 `vm` + `assert` 跑 `.test.cjs`。

## Global Constraints

- 只动 `prototype/hifi/`，不碰冻结的 `prototype/demos/`（demo2/demo）。
- 每个 IIFE 脚本把 API 挂到 `window.HIFI_*`；改某脚本后必须在 `index.html` 对应 `<script src="...?v=N">` 递增 `v`，否则浏览器吃旧缓存。
- 术语用欧洲史标准译名，不用中国官制词汇。
- 唯一可变状态是 `world` 对象；`store.update(mutator)` 原地改 `world` 后通知重渲染。
- 测试运行：`node tests/<name>.test.cjs`；全套：`for file in tests/*.test.cjs; do node "$file"; done`（当前基线 33 个文件全绿）。
- 仓库路径含空格（iCloud 目录），shell 命令务必加引号。
- 设计依据：`docs/design/23-hifi体验闭环二期实现方案.md`。

---

## File Structure

| 文件 | 职责 | Phase |
|---|---|---|
| `prototype/hifi/scripts/engine/economy.js` | `settleCountry` 加维护费扣减 + `report.maintenance`；新增 `armyMaintenance`/`buildingMaintenance` 纯函数 | A |
| `prototype/hifi/scripts/engine/history.js` | `quarterLedger` 增 maintenance/event/net 段；`processSituations` 爆发期加资源消耗写入事件段 | A |
| `prototype/hifi/scripts/engine/warfare.js` | 欠费惩罚通道（supply/organization 下降）由 economy 调用的钩子或字段 | A |
| `prototype/hifi/scripts/ui/dialogs.js` | 季报渲染三段构成 | A |
| `prototype/hifi/scripts/engine/proposals.js` | 导出 `actionPreview(world, polity, type, params)` 复用现有 preview/available | B |
| `prototype/hifi/scripts/ui/drawers.js` | 抽屉动作按钮下方渲染成本/预览小字 + 失败置灰 | B |
| `prototype/hifi/scripts/main.js` | 动作执行后比对差值 toast | B |
| `prototype/hifi/index.html` | HUD 顶栏结构、`?v` bump | C |
| `prototype/hifi/styles/*.css`（顶栏/资源栏所在样式文件） | 顶栏 layout、资源两栏、迷你卡、模式盘样式 | C |
| `prototype/hifi/scripts/ui/map.js` | `tileActionsFor(tile, player)` 纯函数 + 模式盘 + 地块迷你卡 | C |
| `tests/hifi-economy.test.cjs` | 维护费/net 断言 | A |
| `tests/hifi-longrun.test.cjs` | 资源不膨胀断言 | A |
| `tests/hifi-warfare.test.cjs` | 欠费惩罚断言 | A |
| `tests/hifi-proposals.test.cjs` | actionPreview == 实际差值 | B |
| `tests/hifi-map.test.cjs` | tileActionsFor 动作集 | C |
| `tests/hifi-layout.test.cjs` / `tests/hifi-ui-smoke.test.cjs` | 顶栏/模式盘/迷你卡/军令文字容器核对 | C |

---

# Phase A — 资源消耗出口（#4）

### Task A1: 军团维护与建筑维护纯函数

**Files:**
- Modify: `prototype/hifi/scripts/engine/economy.js`（在 `tileOutput` 之后、`settleCountry` 之前加两个纯函数 + 顶部 `MAINTENANCE` 常量）
- Test: `tests/hifi-economy.test.cjs`

**Interfaces:**
- Consumes: `world.warfare.armies`（对象，值有 `.owner`、`.units[]`，unit 有 `serviceType`、`soldiers`）；`window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)`（地块有 `.buildings[]`）。
- Produces:
  - `armyMaintenance(world, polity) → { food: number, military: number }`
  - `buildingMaintenance(world, polity) → number`（金钱）
  - `MAINTENANCE` 常量对象。

- [ ] **Step 1: 写失败测试**

在 `tests/hifi-economy.test.cjs` 末尾追加（沿用该文件已有的 `loadEconomy()`/`makeWorld()` 夹具风格；若无则用文件顶部已有的 `vm.runInNewContext` 加载方式）：

```js
// --- Task A1: 维护费纯函数 ---
{
  const { world, economy } = setupWorld(); // 复用文件内现有的世界构造助手
  const polity = world.playerPolity;
  // 造一支 3000 兵的常备军
  world.warfare.armies["test-army"] = {
    id: "test-army", owner: polity,
    units: [{ combatType: "infantry", serviceType: "standing", soldiers: 3000 }],
  };
  const am = economy.armyMaintenance(world, polity);
  assert(am.food > 0, "常备军应产生粮食维护");
  assert(am.military > 0, "常备军应产生军需维护");

  // 征召兵军需维护低于常备军
  world.warfare.armies["levy-army"] = {
    id: "levy-army", owner: polity,
    units: [{ combatType: "infantry", serviceType: "levy", soldiers: 3000 }],
  };
  const amLevy = economy.armyMaintenance(world, "__levy_only__"); // 见实现：按 owner 过滤
  // 简化断言：常备军单位的军需维护系数 > 征召兵
  assert(economy.MAINTENANCE.military.standing > economy.MAINTENANCE.military.levy,
    "常备军军需维护系数应高于征召兵");

  // 建筑维护：给首都地块加 2 栋建筑
  const tiles = world.tiles.filter(t => t.polity === polity && !t.isSea);
  tiles[0].buildings = ["market", "fort"];
  const bm = economy.buildingMaintenance(world, polity);
  assert(bm > 0, "建筑应产生金钱维护");
  console.log("A1 维护费纯函数 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-economy.test.cjs`
Expected: FAIL（`economy.armyMaintenance is not a function`）。

- [ ] **Step 3: 实现纯函数**

在 `economy.js` IIFE 顶部（`const rules = ...` 附近）加常量：

```js
  // 维护费系数：让"什么都不做"净增近零，扩军/铺建筑压成负，逼出取舍。
  // 系数在 longrun 测试反推标定，初值如下。
  const MAINTENANCE = {
    food: 0.4,        // 每 1000 兵每季消耗的粮食
    military: { guard: 0, levy: 0.2, professional: 0.6, standing: 0.8, mercenary: 0.5 }, // 每 1000 兵
    building: 3,      // 每栋建筑每季消耗的金钱（行政维护）
  };
```

在 `tileOutput` 之后加：

```js
  function armyMaintenance(world, polity) {
    const armies = Object.values(world.warfare?.armies || {}).filter(a => a.owner === polity);
    let food = 0, military = 0;
    for (const army of armies) {
      for (const unit of army.units) {
        const k = unit.soldiers / 1000;
        food += MAINTENANCE.food * k;
        military += (MAINTENANCE.military[unit.serviceType] || 0) * k;
      }
    }
    return { food: Math.round(food), military: Math.round(military) };
  }

  function buildingMaintenance(world, polity) {
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const count = tiles.reduce((sum, tile) => sum + (tile.buildings?.length || 0), 0);
    return Math.round(count * MAINTENANCE.building);
  }
```

把它们加进 `window.HIFI_ECONOMY_ENGINE = { ... }` 导出列表，并导出 `MAINTENANCE`。

> 注：测试里 `economy.armyMaintenance(world, "__levy_only__")` 只是为了不污染 player 军团统计——实现按 `owner === polity` 过滤即可，该行断言已改为只比对系数，无需特殊 owner。删除测试中那一行多余调用，保留系数比对断言。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-economy.test.cjs`
Expected: PASS，打印 `A1 维护费纯函数 OK`。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/engine/economy.js tests/hifi-economy.test.cjs
git commit -m "feat(hifi): 军团/建筑维护费纯函数（#4 数值出口基础）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A2: settleCountry 扣维护费并记账

**Files:**
- Modify: `prototype/hifi/scripts/engine/economy.js`（`settleCountry` 内）
- Test: `tests/hifi-economy.test.cjs`

**Interfaces:**
- Consumes: A1 的 `armyMaintenance`、`buildingMaintenance`。
- Produces: `country.lastReport.maintenance = { food, money, military }`；`settleCountry` 返回的 report 含 `maintenance`；`country.food/money/military` 已扣除维护（可为负）。

- [ ] **Step 1: 写失败测试**

```js
// --- Task A2: settleCountry 扣维护 ---
{
  const { world, economy } = setupWorld();
  const polity = world.playerPolity;
  world.warfare.armies["big"] = {
    id: "big", owner: polity,
    units: [{ combatType: "infantry", serviceType: "standing", soldiers: 20000 }],
  };
  const before = { ...world.countries[polity] };
  const report = economy.settleCountry(world, polity);
  assert(report.maintenance, "report 应含 maintenance 段");
  assert(report.maintenance.food > 0 && report.maintenance.military > 0, "大军应有粮/军需维护");
  // 净额 = 产出 - 维护，账面变化应反映扣减
  const foodDelta = world.countries[polity].food - before.food;
  assert(foodDelta === report.food - report.maintenance.food,
    "粮食账面变化应等于产出减维护");
  console.log("A2 settleCountry 扣维护 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-economy.test.cjs`
Expected: FAIL（`report.maintenance` undefined）。

- [ ] **Step 3: 实现**

在 `settleCountry` 中，把 `country.food += report.food;` 等三处累加改为先算维护、再写净额。具体替换 L75-79 那段：

```js
    const maintenance = {
      food: armyMaintenance(world, polity).food,
      military: armyMaintenance(world, polity).military,
      money: buildingMaintenance(world, polity),
    };
    report.maintenance = maintenance;

    country.food += report.food - maintenance.food;
    const domesticMoney = country.tradePolicy === "closed" ? report.money * 1.05 : report.money;
    const moneyProd = Math.round(domesticMoney * central);
    country.money += moneyProd - maintenance.money;
    country.military += Math.round(report.military * central) - maintenance.military;
```

（其余 open/colonial/agenda 逻辑不动；它们继续对 `country.money` 等累加，符合"贸易/殖民是额外流"语义。）

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-economy.test.cjs`
Expected: PASS，打印 `A2 settleCountry 扣维护 OK`。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/engine/economy.js tests/hifi-economy.test.cjs
git commit -m "feat(hifi): settleCountry 结算扣军团/建筑维护费（#4）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A3: 欠费惩罚走已有压力通道

**Files:**
- Modify: `prototype/hifi/scripts/engine/economy.js`（`settleCountry` 维护后判负）
- Test: `tests/hifi-warfare.test.cjs`

**Interfaces:**
- Consumes: A2 的净额结果；`world.warfare.armies`（`.supply`/`.organization`）；`country.legitimacy`。
- Produces: 当 `country.food < 0` → 该国军团 `supply` 下降；`country.military < 0` → 军团 `organization` 下降；`country.money < 0` → `country.legitimacy` 下降。资源 clamp 回 0。

- [ ] **Step 1: 写失败测试**

在 `tests/hifi-warfare.test.cjs` 追加（沿用文件内 `setupWorld`/加载约定）：

```js
// --- Task A3: 欠费惩罚 ---
{
  const { world, economy } = setupWorld();
  const polity = world.playerPolity;
  world.countries[polity].food = 0; // 逼成粮食赤字
  world.warfare.armies["starve"] = {
    id: "starve", owner: polity, supply: 100, organization: 100,
    units: [{ combatType: "infantry", serviceType: "standing", soldiers: 50000 }],
  };
  economy.settleCountry(world, polity);
  assert(world.warfare.armies["starve"].supply < 100, "粮食赤字应降低军团补给");
  assert(world.countries[polity].food >= 0, "资源应 clamp 回非负");
  console.log("A3 欠费惩罚 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-warfare.test.cjs`
Expected: FAIL（supply 仍为 100）。

- [ ] **Step 3: 实现**

在 `settleCountry` 写完净额后、`country.lastReport = report;` 之前加：

```js
    if (country.food < 0) {
      const armies = Object.values(world.warfare?.armies || {}).filter(a => a.owner === polity);
      armies.forEach(a => { a.supply = Math.max(0, a.supply - 10); });
      report.shortage = { ...(report.shortage || {}), food: -country.food };
      country.food = 0;
    }
    if (country.military < 0) {
      const armies = Object.values(world.warfare?.armies || {}).filter(a => a.owner === polity);
      armies.forEach(a => { a.organization = Math.max(0, a.organization - 8); });
      report.shortage = { ...(report.shortage || {}), military: -country.military };
      country.military = 0;
    }
    if (country.money < 0) {
      country.legitimacy = Math.max(0, country.legitimacy - 3);
      report.shortage = { ...(report.shortage || {}), money: -country.money };
      country.money = 0;
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-warfare.test.cjs`
Expected: PASS，打印 `A3 欠费惩罚 OK`。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/engine/economy.js tests/hifi-warfare.test.cjs
git commit -m "feat(hifi): 资源欠费走补给/组织/合法性已有压力通道（#4）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A4: 事件爆发期资源消耗

**Files:**
- Modify: `prototype/hifi/scripts/engine/history.js`（`processSituations` 爆发期分支）
- Test: `tests/hifi-history.test.cjs`

**Interfaces:**
- Consumes: `world.situations`（item 有 `.phase === "爆发"`、`.key`）；`country.food`/`country.money`。
- Produces: 爆发期每季对在场国家扣粮/钱，并写 `country.lastReport.event = { food, money }`（供季报事件段读取）。

- [ ] **Step 1: 写失败测试**

```js
// --- Task A4: 事件爆发期消耗 ---
{
  const { world, history } = setupWorld();
  const polity = world.playerPolity;
  const c = world.countries[polity];
  c.food = 1000; c.money = 1000;
  c.lastReport = {};
  world.situations = [{ key: "black_death", label: "黑死病", phase: "爆发", progress: 60 }];
  history.processSituations(world);
  assert(c.lastReport.event && c.lastReport.event.food > 0, "黑死病爆发应记录救济粮消耗");
  assert(c.food < 1000, "黑死病爆发应扣粮");
  console.log("A4 事件消耗 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-history.test.cjs`
Expected: FAIL（`lastReport.event` undefined）。

- [ ] **Step 3: 实现**

在 `processSituations` 的爆发期处理块内（现有扣人口逻辑附近，L189-194），对每个在场国家追加：

```js
        // 救济成本：爆发期消耗粮/钱（事件脉冲，写进季报事件段）
        for (const key of Object.keys(world.countries)) {
          const country = world.countries[key];
          country.lastReport = country.lastReport || {};
          const ev = country.lastReport.event || { food: 0, money: 0 };
          const foodCost = Math.min(country.food, 12);
          const moneyCost = Math.min(country.money, 8);
          country.food -= foodCost; country.money -= moneyCost;
          country.lastReport.event = { food: ev.food + foodCost, money: ev.money + moneyCost };
        }
```

（保持只在现有 situation 框架内挂消耗，不新增随机事件系统。）

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-history.test.cjs`
Expected: PASS，打印 `A4 事件消耗 OK`。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/engine/history.js tests/hifi-history.test.cjs
git commit -m "feat(hifi): 局势爆发期追加救济粮/钱消耗（#4 事件脉冲）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A5: quarterLedger 展示产出/维护/事件/净增

**Files:**
- Modify: `prototype/hifi/scripts/engine/history.js`（`quarterLedger`）
- Test: `tests/hifi-history.test.cjs`

**Interfaces:**
- Consumes: `country.lastReport`（含 `maintenance`、`event`）。
- Produces: `quarterLedger` 每资源返回 `{ delta, gross, maintenance, event, net, sources }`，其中 `net = gross - maintenance - event` 且 `delta === net`。

- [ ] **Step 1: 写失败测试**

```js
// --- Task A5: 季报净额三段 ---
{
  const { world, history } = setupWorld();
  const polity = world.playerPolity;
  world.countries[polity].lastReport = {
    food: 100, money: 200, military: 50, tiles: 5,
    maintenance: { food: 30, money: 40, military: 10 },
    event: { food: 12, money: 8 },
  };
  const ledger = history.quarterLedger(world, polity);
  assert(ledger.food.gross === 100 && ledger.food.maintenance === 30 && ledger.food.event === 12,
    "粮食三段应分列");
  assert(ledger.food.net === 100 - 30 - 12, "粮食净额 = 产出-维护-事件");
  assert(ledger.food.delta === ledger.food.net, "delta 应等于 net（兼容旧渲染）");
  console.log("A5 季报净额 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-history.test.cjs`
Expected: FAIL（`ledger.food.gross` undefined）。

- [ ] **Step 3: 实现**

改写 `quarterLedger` 的 return（保留 `turn`/`tiles`/`completedAgenda`），每资源用助手构造：

```js
    const maint = report.maintenance || { food: 0, money: 0, military: 0 };
    const event = report.event || { food: 0, money: 0 };
    const seg = (gross, m, e, sources) => {
      const net = gross - m - e;
      return { gross, maintenance: m, event: e, net, delta: net, sources };
    };
    return {
      turn: world.turn,
      tiles: report.tiles || 0,
      food: seg(report.food || 0, maint.food || 0, event.food || 0,
        report.food ? [`地块产出 +${report.food}`] : []),
      money: seg(moneyProd + moneyTrade + moneyColonial, maint.money || 0, event.money || 0, moneySources),
      military: seg(militaryDelta, maint.military || 0, 0,
        militaryDelta ? [`地块产出 +${militaryDelta}`] : []),
      completedAgenda: report.completedAgenda || null,
    };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-history.test.cjs`
Expected: PASS，打印 `A5 季报净额 OK`。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/engine/history.js tests/hifi-history.test.cjs
git commit -m "feat(hifi): 季报展示产出/维护/事件/净增四段（#4 #12）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A6: 季报 UI 渲染三段构成

**Files:**
- Modify: `prototype/hifi/scripts/ui/dialogs.js:163-176`（季报渲染块）
- Modify: `prototype/hifi/index.html`（bump `dialogs.js?v=N`）
- Test: 手动 + `tests/hifi-ui-smoke.test.cjs`（核对净额负值高亮类字符串存在）

**Interfaces:**
- Consumes: A5 的 `ledger.<resource>.{gross,maintenance,event,net}`。
- Produces: 季报每行显示「产出 +G −维护M −事件E = 净N」，net<0 加 `ledger-neg` 类。

- [ ] **Step 1: 写失败测试**

在 `tests/hifi-ui-smoke.test.cjs` 追加正则断言：

```js
// --- Task A6: 季报三段渲染 ---
{
  const src = fs.readFileSync(path.join(hifiDir, "scripts/ui/dialogs.js"), "utf8");
  assert(/ledger-neg/.test(src), "季报应有净负高亮类 ledger-neg");
  assert(/maintenance/.test(src) && /\.net/.test(src), "季报渲染应读 maintenance 与 net");
  console.log("A6 季报渲染 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs`
Expected: FAIL（无 `ledger-neg`）。

- [ ] **Step 3: 实现**

把 `ledgerRow` 改为读四段：

```js
      const ledgerRow = (label, e) => {
        const parts = [`产出 +${e.gross}`];
        if (e.maintenance) parts.push(`维护 −${e.maintenance}`);
        if (e.event) parts.push(`事件 −${e.event}`);
        const cls = e.net < 0 ? " ledger-neg" : "";
        return `<div class="drawer-row${cls}">${label} <b>${e.net >= 0 ? "+" : ""}${e.net}</b><span>${parts.join(" ")}</span></div>`;
      };
```

`ledgerHtml` 的判空改为 `(ledger.money.net || ledger.food.net || ledger.military.net || ledger.money.gross || ledger.food.gross)`。在 `index.html` 给 `dialogs.js?v=` +1。给 `ledger-neg` 加一条红色样式（在 dialogs 相关 css，颜色沿用现有警示色变量）。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。
手动：`python3 -m http.server 8765`，开 `http://127.0.0.1:8765/prototype/hifi/index.html`，造大军推进一季，开御前会议看季报三段且净负标红。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/ui/dialogs.js prototype/hifi/index.html
git commit -m "feat(hifi): 季报 UI 渲染产出/维护/事件/净增（#12）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A7: longrun 资源不膨胀回归 + 系数标定

**Files:**
- Modify: `tests/hifi-longrun.test.cjs`
- Modify: `prototype/hifi/scripts/engine/economy.js`（按需微调 `MAINTENANCE` 系数）

**Interfaces:**
- Consumes: A1–A5 全部。
- Produces: 持续扩军场景下资源净额不再单调暴涨的回归断言。

- [ ] **Step 1: 写失败/标定测试**

在 `tests/hifi-longrun.test.cjs` 追加：

```js
// --- Task A7: 资源不膨胀 ---
{
  const { world, turn, warfare } = setupLongrun(); // 复用文件内长跑夹具
  const polity = world.playerPolity;
  // 玩家持续扩军：每 4 季动员一次
  const series = [];
  for (let i = 0; i < 40; i++) {
    if (i % 4 === 0) {
      try { warfare.mobilizeArmy(world, polity, { /* 文件内既有的动员参数 */ }); } catch (e) {}
    }
    turn.advanceQuarter(world);
    series.push(world.countries[polity].military);
  }
  // 军需不应单调暴涨：后期至少出现一次下降或持平
  const monotonic = series.every((v, i) => i === 0 || v >= series[i - 1]);
  assert(!monotonic, "持续扩军下军需不应单调上涨（维护费应咬住增长）");
  console.log("A7 资源不膨胀 OK");
}
```

- [ ] **Step 2: 跑测试**

Run: `node tests/hifi-longrun.test.cjs`
Expected: 若 FAIL（仍单调上涨），说明系数太低。

- [ ] **Step 3: 标定系数**

调 `economy.js` `MAINTENANCE`（提高 `military.standing`/`food` 直到测试通过）。每次调完重跑。原则：单国不扩军时净额近零或微正，扩军后转负。

- [ ] **Step 4: 跑全套确认无回归**

Run: `for file in tests/*.test.cjs; do node "$file" || echo "FAIL: $file"; done`
Expected: 全部通过（特别留意 `hifi-demo2-parity`——若因维护费失败，按 spec §一：parity 改为只比对产出段 `report.food/money/military` 而非账面净额，在测试注释说明）。

- [ ] **Step 5: 提交**

```bash
git add tests/hifi-longrun.test.cjs prototype/hifi/scripts/engine/economy.js tests/hifi-demo2-parity.test.cjs
git commit -m "test(hifi): 资源不膨胀长跑回归 + 维护系数标定（#4）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase B — 操作反馈链（#5）

### Task B1: proposals 导出统一动作预览

**Files:**
- Modify: `prototype/hifi/scripts/engine/proposals.js`（导出 `actionPreview`）
- Modify: `prototype/hifi/index.html`（bump `proposals.js?v=N`）
- Test: `tests/hifi-proposals.test.cjs`

**Interfaces:**
- Consumes: proposals.js 现有 catalog（每 type 有 `cost()`、`preview(world,polity,params)`、`available(world,polity,params)`）。
- Produces: `window.HIFI_PROPOSALS.actionPreview(world, polity, type, params) → { cost, effect, available, reason }`，其中 `cost` 是资源对象、`effect` 是 preview 返回、`available.ok` 布尔、`reason` 失败文案。

- [ ] **Step 1: 写失败测试**

在 `tests/hifi-proposals.test.cjs` 追加：

```js
// --- Task B1: actionPreview ---
{
  const { world, proposals } = setupWorld();
  const polity = world.playerPolity;
  const tile = world.tiles.find(t => t.polity === polity && !t.isSea);
  const p = proposals.actionPreview(world, polity, "build_market", { tileId: tile.id });
  assert(p.cost && typeof p.cost === "object", "应返回成本对象");
  assert(p.effect && typeof p.effect === "object", "应返回效果预览");
  assert(typeof p.available.ok === "boolean", "应返回可用性布尔");
  console.log("B1 actionPreview OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-proposals.test.cjs`
Expected: FAIL（`proposals.actionPreview` undefined）。

- [ ] **Step 3: 实现**

在 proposals.js 加（catalog 变量名以文件实际为准，下记为 `catalog`）：

```js
  function actionPreview(world, polity, type, params) {
    const entry = catalog[type];
    if (!entry) return { cost: {}, effect: {}, available: { ok: false }, reason: "未知动作" };
    const avail = entry.available(world, polity, params);
    const ok = avail === true || avail?.ok === true;
    return {
      cost: entry.cost(world, polity, params),
      effect: entry.preview(world, polity, params),
      available: { ok },
      reason: ok ? "" : (avail?.reason || avail || "条件不满足"),
    };
  }
```

加进 `window.HIFI_PROPOSALS = { ... }` 导出。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-proposals.test.cjs`
Expected: PASS，打印 `B1 actionPreview OK`。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/engine/proposals.js prototype/hifi/index.html tests/hifi-proposals.test.cjs
git commit -m "feat(hifi): proposals 导出统一动作预览 actionPreview（#5）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task B2: 预览口径一致性断言（预测==实际）

**Files:**
- Modify: `tests/hifi-proposals.test.cjs`

**Interfaces:**
- Consumes: B1 的 `actionPreview`；对应引擎 apply（如 `economy.constructBuilding`）。
- Produces: 锁定"预览效果与实际执行差值口径一致"的回归测试。

- [ ] **Step 1: 写断言**

```js
// --- Task B2: 预览口径一致 ---
{
  const { world, proposals, economy } = setupWorld();
  const polity = world.playerPolity;
  const tile = world.tiles.find(t => t.polity === polity && !t.isSea && !t.buildings.includes("market"));
  const preview = proposals.actionPreview(world, polity, "build_market", { tileId: tile.id });
  // 成本：执行前后金钱差应等于预览成本
  const moneyBefore = world.countries[polity].money;
  proposals.applyAction
    ? proposals.applyAction(world, polity, "build_market", { tileId: tile.id })
    : economy.constructBuilding(world, polity, tile.id, "market");
  const spent = moneyBefore - world.countries[polity].money;
  assert(spent === (preview.cost.money || 0), `成本预览(${preview.cost.money})应等于实际花费(${spent})`);
  console.log("B2 口径一致 OK");
}
```

> 若 catalog 的 apply 是封装入口（如 `proposals.applyAction`），用它；否则直接调对应引擎函数。实现 B1 时确认入口名并在此对齐。

- [ ] **Step 2: 跑测试**

Run: `node tests/hifi-proposals.test.cjs`
Expected: PASS（若 FAIL 说明 preview 与 apply 口径不一致——修 preview 使其与 apply 同源，不要改测试迁就）。

- [ ] **Step 3: 提交**

```bash
git add tests/hifi-proposals.test.cjs
git commit -m "test(hifi): 锁定动作预览与执行口径一致（#5）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task B3: 抽屉动作按钮渲染成本/预览/置灰

**Files:**
- Modify: `prototype/hifi/scripts/ui/drawers.js`（动作按钮渲染处，经济/政治/外交/军事/发展抽屉）
- Modify: `prototype/hifi/index.html`（bump `drawers.js?v=N`）
- Test: `tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- Consumes: B1 的 `window.HIFI_PROPOSALS.actionPreview`。
- Produces: 抽屉动作按钮下方加 `.action-preview` 小字（成本 + 预期收益）；不可用动作加 `disabled` + `.action-blocked` 类与失败原因 title。

- [ ] **Step 1: 写失败测试**

```js
// --- Task B3: 按钮预览渲染 ---
{
  const src = fs.readFileSync(path.join(hifiDir, "scripts/ui/drawers.js"), "utf8");
  assert(/action-preview/.test(src), "动作按钮应渲染 action-preview 小字");
  assert(/action-blocked/.test(src) || /disabled/.test(src), "不可用动作应置灰");
  console.log("B3 按钮预览渲染 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

在抽屉里凡是绑定到 catalog 动作（`build_market`/`integrate_tile`/`send_envoy`/`mobilize_army`/`propose_trade` 等）的按钮，调 `actionPreview` 生成下方小字。统一助手（加在 drawers.js 顶部）：

```js
  function actionPreviewHtml(world, polity, type, params) {
    const p = window.HIFI_PROPOSALS.actionPreview(world, polity, type, params);
    const costStr = Object.entries(p.cost).map(([k, v]) => `${v}${costLabel(k)}`).join(" + ");
    const effStr = Object.entries(p.effect).map(([k, v]) => `${effectLabel(k)} ${v}`).join("，");
    const blocked = p.available.ok ? "" : ` action-blocked" title="${p.reason}`;
    return `<div class="action-preview${blocked}">成本：${costStr || "—"}　预期：${effStr || "—"}</div>`;
  }
```

`costLabel`/`effectLabel` 把资源 key 映射成中文（money→金钱、administrative→行政点…），复用 HUD 已有的资源标签表（若有则 import，否则在 drawers 内建一份小映射）。按钮 disabled 态：`available.ok` 为 false 时给 `<button disabled class="... action-disabled">`。bump `drawers.js?v=`。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。
手动开经济抽屉，建筑按钮下方应显示「成本：24金钱 + 1行政点　预期：金钱产出 +…」；金钱不足时按钮置灰且 hover 显原因。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/ui/drawers.js prototype/hifi/index.html
git commit -m "feat(hifi): 抽屉动作按钮显示成本/预期收益/不可用置灰（#5）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task B4: 动作执行后差值 toast

**Files:**
- Modify: `prototype/hifi/scripts/main.js`（动作 data-* 点击执行处）
- Modify: `prototype/hifi/index.html`（bump `main.js?v=N`）
- Test: 手动 + `tests/hifi-ui-smoke.test.cjs`（核对 toast 调用字符串）

**Interfaces:**
- Consumes: 现有 toast 机制（main.js 里规则错误已转 toast，复用同一函数）。
- Produces: 动作成功执行后，比对关键资源 before/after，toast「<动作完成>，<资源> +/−N」。

- [ ] **Step 1: 写失败测试**

```js
// --- Task B4: 执行后 toast ---
{
  const src = fs.readFileSync(path.join(hifiDir, "scripts/main.js"), "utf8");
  // 执行动作前后快照资源并 toast 差值
  assert(/toast/.test(src) && /(before|snapshot)/i.test(src), "动作执行应快照并 toast 差值");
  console.log("B4 执行 toast OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs`
Expected: FAIL（无 snapshot/before 逻辑）。

- [ ] **Step 3: 实现**

在 `store.update(mutator)` 包裹动作执行处，先快照 `{food,money,military,...}`，执行后算差值，拼非零项 toast。复用现有 toast 函数（B 阶段前已存在的错误 toast 入口）。示例（接到现有的动作分发回调里）：

```js
    const snap = snapshotResources(world);
    try {
      runAction(); // 现有动作执行
      const diff = diffResources(snap, snapshotResources(world));
      if (diff) showToast(`${actionLabel} —— ${diff}`);
    } catch (e) {
      showToast(e.message); // 已有错误 toast 行为保持
    }
```

`snapshotResources`/`diffResources` 为本地小助手。bump `main.js?v=`。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。
手动建一座市场，应弹「鲁昂建市场 —— 金钱 −24，行政点 −1」之类 toast。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/main.js prototype/hifi/index.html
git commit -m "feat(hifi): 动作执行后 toast 资源实际变化（#5）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase C — 界面减负（纯 UI）

### Task C1: HUD 顶栏重构（去游戏名/时间左挪/资源压缩）

**Files:**
- Modify: `prototype/hifi/index.html`（`.top-command-bar` 块 L23-44）
- Modify: `prototype/hifi/styles/*.css`（顶栏 layout、`.resource-strip` 两栏）
- Test: `tests/hifi-layout.test.cjs`、`tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- Consumes: 无（结构调整）。
- Produces: 删除 `.game-title`、`#topPending`；顶栏三段改为 `盾徽+日期 | 留白 | 资源栏`；`.resource-strip` 窄屏两栏。

- [ ] **Step 1: 写失败测试**

在 `tests/hifi-layout.test.cjs` 调整断言（去掉对 game-title/topPending 的存在核对，新增不存在核对）：

```js
// --- Task C1: HUD 顶栏 ---
{
  const html = fs.readFileSync(path.join(hifiDir, "index.html"), "utf8");
  assert(!/class="game-title"/.test(html), "应删除游戏名称 game-title");
  assert(!/id="topPending"/.test(html), "应删除顶部待办按钮 topPending");
  assert(/id="dateMain"/.test(html), "日期牌保留");
  console.log("C1 HUD 顶栏 OK");
}
```

> 注：若 `hifi-layout.test.cjs` 现有断言核对了 `topPending` 存在，需同步删除那条旧断言。

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-layout.test.cjs`
Expected: FAIL（game-title 仍在）。

- [ ] **Step 3: 实现**

`index.html` 顶栏改为：

```html
    <header class="top-command-bar">
      <div class="chronicle">
        <div class="shield" id="countryShield" aria-label="国家盾徽"><span>⚜</span><span>⚜</span><span>⚜</span><span>⚜</span></div>
        <div class="date-plaque">
          <div class="date-main" id="dateMain">1337年 · 春</div>
          <div class="date-era" id="dateEra">封建纪元 · 瓦卢瓦王朝</div>
        </div>
      </div>
      <div class="resource-strip" aria-label="国家资源">
        <!-- 7 个 resource-token 不变 -->
      </div>
    </header>
```

CSS：`.top-command-bar { justify-content: space-between; }`（左 chronicle、右 resource-strip，中间自动留白）；`.resource-strip { flex-wrap: wrap; max-width: ...; }`，`.resource-token` 给固定宽度使窄屏换两行；token 字号/padding 收窄。删除 `.brand-block`/`.game-title`/`.top-pending` 相关样式（或留 `.shield` 样式，移到 `.chronicle` 下）。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-layout.test.cjs && node tests/hifi-ui-smoke.test.cjs`
Expected: PASS。手动横屏 932×430 看资源栏两栏、不溢出，中间留白。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/index.html prototype/hifi/styles
git commit -m "feat(hifi): HUD 顶栏去游戏名、时间左挪、资源两栏压缩（#6）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C2: 待办并入「问题与对象」面板

**Files:**
- Modify: `prototype/hifi/scripts/ui/store.js` 或渲染 issuePanel 的文件（`renderHud`/`renderIssues` 所在）
- Modify: `prototype/hifi/index.html`（`#issuePanel` heading；bump 对应脚本 `?v`）
- Modify: 处理 `#seasonText` 文案的脚本
- Test: `tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- Consumes: `HIFI_HISTORY_ENGINE.issues(world)`（issue 列表，含 blocking）。
- Produces: `issue-heading` 显示计数「问题与对象 · N」；空列表时面板折叠为小徽章（加 `.issue-empty` 类）；`#topPending` 删除后其计数迁移到此。

- [ ] **Step 1: 写失败测试**

```js
// --- Task C2: 待办并入问题面板 ---
{
  const src = fs.readFileSync(path.join(hifiDir, renderFile), "utf8"); // renderFile = issuePanel 渲染所在脚本
  assert(/问题与对象\s*·|issue-count|issueCount/.test(src), "问题标题应带计数");
  assert(/issue-empty/.test(src), "空状态应有折叠类 issue-empty");
  console.log("C2 待办并入 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

渲染 issuePanel 处：标题改为 ``问题与对象 · ${issues.length}``；issues 为空时给 `#issuePanel` 加 `issue-empty` 类（CSS 收成小徽章）。`#seasonText` 文案从读 `topPending` 改为读 `issues` 计数（原"处理待办 N"逻辑迁移）。bump 对应脚本 `?v`。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。手动：无问题时面板收成小徽章；有问题时标题带计数。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts prototype/hifi/index.html
git commit -m "feat(hifi): 待办计数并入问题与对象面板、空态折叠（#6）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C3: 地块动作按归属（tileActionsFor 纯函数）

**Files:**
- Modify: `prototype/hifi/scripts/ui/map.js`（`updateProvince` + 新增 `tileActionsFor`）
- Modify: `prototype/hifi/index.html`（bump `map.js?v=N`）
- Test: `tests/hifi-map.test.cjs`

**Interfaces:**
- Consumes: `tile`（`.polity`、`.isSea`）、`world.playerPolity`、战争状态（`world.warfare` 判断是否与 owner 交战）。
- Produces: `tileActionsFor(tile, world) → string[]`（动作 key 集合）。

- [ ] **Step 1: 写失败测试**

在 `tests/hifi-map.test.cjs` 追加：

```js
// --- Task C3: 地块动作按归属 ---
{
  const { world, map } = setupWorld();
  const player = world.playerPolity;
  const own = world.tiles.find(t => t.polity === player && !t.isSea);
  const sea = world.tiles.find(t => t.isSea);
  const foreign = world.tiles.find(t => t.polity && t.polity !== player && !t.isSea);

  const ownActions = map.tileActionsFor(own, world);
  assert(ownActions.includes("build") && ownActions.includes("integrate"), "己方应有建设/整合");

  const seaActions = map.tileActionsFor(sea, world);
  assert(!seaActions.includes("build"), "海域不应有建设");

  const foreignActions = map.tileActionsFor(foreign, world);
  assert(!foreignActions.includes("build"), "外国地块不应有建设");
  assert(foreignActions.includes("diplomacy") || foreignActions.includes("declareWar"),
    "外国和平地块应有外交/宣战");
  console.log("C3 地块归属动作 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-map.test.cjs`
Expected: FAIL（`map.tileActionsFor` undefined）。

- [ ] **Step 3: 实现**

在 map.js 加纯函数并导出：

```js
  function tileActionsFor(tile, world) {
    const player = world.playerPolity;
    if (tile.isSea) return ["view"]; // 无海军时只读
    if (tile.polity === player) return ["build", "mobilize", "integrate", "garrison"];
    const atWar = window.HIFI_WARFARE_ENGINE?.atWar?.(world, player, tile.polity);
    return atWar ? ["advance", "siege", "viewWarGoal"] : ["viewCountry", "diplomacy", "declareWar", "markTarget"];
  }
```

（`atWar` 若 warfare 引擎无此助手，用 `world.warfare` 现有战争结构判断；实现时确认函数名。）`updateProvince` 渲染省份面板动作时改为遍历 `tileActionsFor` 结果按 key 输出对应按钮（建设→`data-open-system=经济`、外交→`data-open-system=外交` 等，复用现有 data-* 接线）。bump `map.js?v=`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-map.test.cjs`
Expected: PASS，打印 `C3 地块归属动作 OK`。手动点外国地块，省份面板只显查看/外交/宣战。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/ui/map.js prototype/hifi/index.html tests/hifi-map.test.cjs
git commit -m "feat(hifi): 地块动作按归属区分（己方/外国/交战/海域）（#7）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C4: 地块面板默认迷你卡

**Files:**
- Modify: `prototype/hifi/index.html`（`#provincePanel` 加 `mini` 默认态 + 展开按钮）
- Modify: `prototype/hifi/scripts/ui/map.js`（展开/收起切换）
- Modify: `prototype/hifi/styles/*.css`（迷你卡样式）
- Test: `tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- Consumes: 现有 `#provincePanel` 渲染。
- Produces: `#provincePanel` 默认 `province-mini` 类（只显地名+POP+1 关键值），点击展开完整 `province-data`。

- [ ] **Step 1: 写失败测试**

```js
{
  const html = fs.readFileSync(path.join(hifiDir, "index.html"), "utf8");
  assert(/province-mini|data-province-toggle/.test(html), "地块面板应有迷你态/展开切换");
  console.log("C4 地块迷你卡 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs` → FAIL。

- [ ] **Step 3: 实现**

`#provincePanel` 默认加 `province-mini` 类，加一个 `data-province-toggle` 按钮（▾/▴）。CSS：`.province-mini .province-data { display: none; }` 只留地名 + 一行 POP。map.js 绑定 toggle 切换 `province-mini` 类。bump `map.js?v=`。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。手动：默认迷你，点展开看完整数据。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/index.html prototype/hifi/scripts/ui/map.js prototype/hifi/styles
git commit -m "feat(hifi): 地块详情默认迷你卡、点击展开（#11）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C5: 地图模式盘（当前模式 + 展开分组）

**Files:**
- Modify: `prototype/hifi/index.html`（地图工具区结构）
- Modify: `prototype/hifi/scripts/ui/map.js`（模式盘展开/收起、小地图默认收起）
- Modify: `prototype/hifi/styles/*.css`
- Test: `tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- Consumes: 现有 10 透镜切换逻辑（保持功能不变，只改外观）。
- Produces: 默认只显当前模式名+图标 + `data-mode-dial` 展开按钮；展开后按政治/地理/经济/军事四组列出现存透镜；小地图默认 `collapsed`。

- [ ] **Step 1: 写失败测试**

```js
{
  const html = fs.readFileSync(path.join(hifiDir, "index.html"), "utf8");
  assert(/data-mode-dial|mode-dial/.test(html), "地图工具应改为模式盘");
  console.log("C5 模式盘 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs` → FAIL。

- [ ] **Step 3: 实现**

地图工具区：默认渲染一个显示当前模式的按钮 `mode-dial-current`（点开 `.mode-dial`）。`.mode-dial` 内按四组标题列出现存透镜按钮（沿用现有 `data-map-mode` 接线，只重排分组；不新增未实现透镜）。小地图容器默认 `collapsed` 类，点缩略图图标展开。map.js：选模式后更新 `mode-dial-current` 文案并收起面板。bump `map.js?v=`。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。手动：右下只显当前模式，点开见四组，选后收起；小地图默认收起。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/index.html prototype/hifi/scripts/ui/map.js prototype/hifi/styles
git commit -m "feat(hifi): 地图模式盘（当前模式+分组展开）、小地图默认收起（#10）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C6: 军团面板按钮图标+短文字

**Files:**
- Modify: `prototype/hifi/scripts/ui/drawers.js`（军团抽屉按钮渲染）
- Modify: `prototype/hifi/index.html`（bump `drawers.js?v=N`）
- Test: `tests/hifi-ui-smoke.test.cjs`

**Interfaces:**
- Consumes: 现有军团动作按钮（拆分/合并/补员/训练/复员/领军/规划路线）。
- Produces: 每按钮 = 图标 + 短文字 label。

- [ ] **Step 1: 写失败测试**

```js
{
  const src = fs.readFileSync(path.join(hifiDir, "scripts/ui/drawers.js"), "utf8");
  // 军团动作按钮应含文字 label（如"拆分""规划路线"）
  assert(/拆分/.test(src) && /规划路线/.test(src), "军团按钮应有短文字 label");
  console.log("C6 军令文字 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-ui-smoke.test.cjs` → FAIL（若现仅图标）。

- [ ] **Step 3: 实现**

军团抽屉按钮模板由纯图标改为 `<span class="btn-glyph">⚔</span>拆分` 形式，七个动作各配中文短词。bump `drawers.js?v=`。

- [ ] **Step 4: 验证**

Run: `node tests/hifi-ui-smoke.test.cjs` → PASS。手动开军团抽屉看按钮带文字。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/ui/drawers.js prototype/hifi/index.html
git commit -m "feat(hifi): 军团面板按钮图标+短文字（#9）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C7: 外交列表排序+搜索+默认对象

**Files:**
- Modify: `prototype/hifi/scripts/ui/drawers.js`（外交抽屉 `renderDiplomacy`）
- Modify: `prototype/hifi/index.html`（bump `drawers.js?v=N`）
- Test: `tests/hifi-diplomacy.test.cjs`（纯排序函数）+ `tests/hifi-ui-smoke.test.cjs`（搜索框）

**Interfaces:**
- Consumes: `world.countries`、双边关系（`diplomaticAttitude`）、邻接关系。
- Produces: `sortDiplomacyTargets(world, player) → polity[]`（敌国>邻国>可缔约>其余）；外交抽屉顶部搜索框；默认选中改为列表首项（优先敌国/战争相关）。

- [ ] **Step 1: 写失败测试**

```js
// --- Task C7: 外交列表排序 ---
{
  const { world, drawers } = setupWorld();
  const sorted = drawers.sortDiplomacyTargets(world, world.playerPolity);
  assert(Array.isArray(sorted) && sorted.length > 0, "应返回排序后的对象列表");
  // 敌国（hostile/at war）应排在中立国之前
  // 具体断言按夹具里实际关系构造，至少验证函数存在且非空
  console.log("C7 外交排序 OK");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/hifi-diplomacy.test.cjs` → FAIL（`drawers.sortDiplomacyTargets` undefined）。

> 若 drawers API 未在 hifi-diplomacy 加载，改放到 `tests/hifi-ui-smoke.test.cjs` 用正则核对，或把排序逻辑放进 diplomacy 引擎导出。优先把 `sortDiplomacyTargets` 作为可测纯函数从 drawers.js 导出。

- [ ] **Step 3: 实现**

在 drawers.js 加排序纯函数并导出：按 `atWar/hostile`→0、邻国→1、可缔约(关系达阈值)→2、其余→3 给权重，稳定排序。外交抽屉渲染前用它排列，顶部加 `<input data-diplo-search>` 按国名过滤；默认选中 `sorted[0]`。bump `drawers.js?v=`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/hifi-diplomacy.test.cjs && node tests/hifi-ui-smoke.test.cjs`
Expected: PASS。手动开外交抽屉：敌国/邻国在前，有搜索框，默认选中战争相关国而非固定阿拉贡。

- [ ] **Step 5: 提交**

```bash
git add prototype/hifi/scripts/ui/drawers.js prototype/hifi/index.html tests/hifi-diplomacy.test.cjs
git commit -m "feat(hifi): 外交列表敌国/邻国优先排序+搜索+默认对象（#6）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C8: 全套回归 + 文档回填

**Files:**
- Modify: `docs/design/22-hifi整体体验问题评估.md`（标注 #4–#7/#9–#11 已落地）
- Modify: `docs/design/23-hifi体验闭环二期实现方案.md`（status 改 done）
- Modify: `prototype/hifi/scripts/data/codex.js`（如新增"维护费/季报净额"等术语词条；bump `?v`）
- Test: 全套

- [ ] **Step 1: 跑全套**

Run: `for file in tests/*.test.cjs; do node "$file" || echo "FAIL: $file"; done`
Expected: 全部通过，无 FAIL 行。

- [ ] **Step 2: 百科词条（可选）**

若引入玩家可见新概念（维护费、净增、模式盘），在 `codex.js` 加词条（沿用 `{ term, summary, affectedBy, affects }` 结构 + 欧洲史译名），跑 `node tests/hifi-codex.test.cjs`，bump `codex.js?v`。

- [ ] **Step 3: 文档回填**

在 22 号问题总表对应行标「已落地（见 23 号 + 本期计划）」；23 号 frontmatter `status: done`。

- [ ] **Step 4: 提交**

```bash
git add docs prototype/hifi/scripts/data/codex.js prototype/hifi/index.html
git commit -m "docs(hifi): 二期落地回填 22 号问题总表 + 百科词条

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec 覆盖：**
- #4 数值出口 → A1(维护纯函数)、A2(settle扣减)、A3(欠费惩罚)、A4(事件消耗)、A5/A6(季报)、A7(标定回归) ✅
- #5 反馈链 → B1(actionPreview)、B2(口径一致)、B3(按钮预览/置灰)、B4(执行toast) ✅
- #6 HUD → C1(顶栏)、C2(待办并入)；外交列表 → C7 ✅
- #7 地块归属 → C3 ✅
- #9 军令文字 → C6 ✅
- #10 模式盘 → C5 ✅
- #11 迷你卡 → C4 ✅
- 长期项（AI外交/因果链/发展度真实值）明确排除，无任务 ✅

**2. Placeholder 扫描：** 各任务含具体测试代码与实现代码；UI 任务因依赖现有容器/样式文件名，标注"以文件实际为准"处均给了判定字符串与接线方式，非空泛 TODO。执行者首步即写可运行测试。✅

**3. 类型一致：**
- `armyMaintenance` 返回 `{food, military}`、`buildingMaintenance` 返回 number — A1 定义、A2 消费一致 ✅
- `report.maintenance = {food,money,military}`、`report.event = {food,money}` — A2/A4 写、A5 读一致 ✅
- `quarterLedger` seg 返回 `{gross,maintenance,event,net,delta,sources}` — A5 定义、A6 渲染一致 ✅
- `actionPreview → {cost,effect,available:{ok},reason}` — B1 定义、B2/B3 消费一致 ✅
- `tileActionsFor(tile, world) → string[]` — C3 定义、updateProvince 消费一致 ✅
- `sortDiplomacyTargets(world, player) → polity[]` — C7 定义/消费一致 ✅

**待执行者确认的真实命名**（已在对应任务标注）：proposals catalog 变量名与 apply 入口名（B1/B2）、warfare `atWar` 助手名（C3）、issuePanel 渲染所在脚本名（C2）、各 css 文件名。这些是读现有代码即可确定的局部事实，不影响任务边界。

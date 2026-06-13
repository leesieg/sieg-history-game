# Government Map And Country Switching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有单文件 Demo 中加入政体地图模式、开局选国和游戏中自由切换，并让所有国家独立保存持续状态。

**Architecture:** 保留世界地图、地块、道路和时代作为全局状态，将资源、行动点、政府、阶层和日志下沉到 `state.countries`。地块和单位归属于具体国家，所有 UI 和操作通过当前 `playerPolity` 读取国家状态。

**Tech Stack:** HTML、CSS、原生 JavaScript、SVG。

---

### Task 1: 建立国家状态层

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

**Action:**
- 新增显式初始政体配置。
- 新增 `createCountryState()`、`activeCountry()`、`controlledTiles()`。
- `newState()` 创建 `countries`，不再把资源和政治数据放在世界根节点。
- 地块新增 `controller`，单位 `owner` 改为具体国家。
- 英属加斯科涅映射到英格兰王国。

**Verify:**
- 页面脚本可解析。
- 法兰西、英格兰、威尼斯都拥有不同对象引用的国家状态。
- 可玩国家不包含海域和英属加斯科涅。

**Done:**
- 切换 `playerPolity` 后 `activeCountry()` 返回对应独立状态。

### Task 2: 改造现有国家操作

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

**Action:**
- 资源、行动点、政府、阶层、日志全部读取当前国家。
- 征兵、任命、建设、整合、改革只允许当前国家地块。
- 单位只能选择和移动当前国家单位。
- 政体变更只修改当前国家。
- 地块阵营显示改为“本国、交战国、其他国家”。

**Verify:**
- 搜索代码，不再使用 `tile.owner === "player"` 作为权限依据。
- 切换国家后旧国家资源保持不变。

**Done:**
- 所有国家操作均由具体国家 ID 判权。

### Task 3: 新增政体地图模式

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

**Action:**
- `MAP_MODES` 新增 `government`。
- 新增六类政体颜色。
- `tileFill()` 从控制国国家状态读取政体。
- 图例展示六类政体和海域。
- 当前国家地块保留玩家边界。

**Verify:**
- 模式按钮存在。
- 威尼斯与诺夫哥罗德颜色不同。
- 政体变更后无需重建地图数据即可改色。

**Done:**
- 政体模式完全由国家状态驱动。

### Task 4: 新增国家选择界面

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

**Action:**
- 新增国家选择弹窗、搜索框、国家列表和确认按钮。
- 开局强制选择，游戏中允许取消。
- 当前国家详情增加“切换国家”按钮。
- 外国国家详情保持只读。

**Verify:**
- 国家列表只展示有地块的主权国家。
- 搜索可以按国家名和政体过滤。
- 未选择国家时确认按钮禁用。

**Done:**
- 开局和游戏中共用同一个选择界面。

### Task 5: 实现切换与世界结算

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

**Action:**
- `switchCountry()` 保存旧国状态并切换 `playerPolity`。
- 清除单位选择，选中新国家首都，地图中心移动到首都。
- `endTurn()` 遍历所有国家进行确定性资源结算。
- 当前国家额外执行危机和失败检查。

**Verify:**
- 法兰西消耗金钱后切到英格兰，英格兰金钱不变；切回法兰西仍是消耗后的数值。
- 结束时代后各国行动点恢复。
- 地图和道路不因切换重置。

**Done:**
- 切换是控制权变化，不是重新开局。

### Task 6: Review 与完整验证

**Files:**
- Modify: `lessons.md`

**Action:**
- 记录本次国家切换的数据边界规则。
- 运行 JavaScript 语法检查、DOM 合约检查、资源检查。
- 检查所有旧 `player/enemy/neutral` 权限残留。
- 浏览器可用时验证开局选国、游戏中切换和政体地图。

**Verify:**
- 所有自动检查退出码为 0。
- 没有跨国家共享政府或阶层对象。

**Done:**
- 需求清单逐项通过，已知未验证项明确记录。

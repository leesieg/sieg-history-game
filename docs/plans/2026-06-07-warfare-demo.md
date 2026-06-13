# 战争系统 Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有单文件 HTML Demo 中实现陆军军团、季度军令、逐格移动、战斗、占领和基础和平闭环。

**Architecture:** 保留现有原生 HTML、CSS、JavaScript 和 SVG。战争事实继续以 `state.diplomacy.wars` 为唯一来源，新增 `state.warfare` 保存军团、军令、战斗和战俘；季度结束时使用固定阶段结算器执行所有国家军令。地块法定控制与军事占领分离。

**Tech Stack:** HTML、CSS、原生 JavaScript、SVG、Node.js 测试。

---

### Task 1: 建立战争与军团状态

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Create: `siegtrack/Documents/europe universary 5/tests/warfare-state.test.cjs`

**Action:**
- 新增 `state.warfare`。
- 把陆军从 `tile.units` 迁移到独立军团表。
- 军团单位只允许步兵、骑兵、炮兵。
- 单位另行保存核心卫队、职业、常备、征召、雇佣兵源类型。
- 为现有法兰西、英格兰和奥斯曼军队生成初始编制。

**Verify:**
- 每支军团只有一个 `tileId`。
- 军团总兵力等于内部单位兵力之和。
- 炮兵在未解锁科技时不能招募。

**Done:**
- 地图能从军团表渲染原有三支陆军。

### Task 2: 替换即时移动为季度军令

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Create: `siegtrack/Documents/europe universary 5/tests/warfare-movement.test.cjs`

**Action:**
- 军团点击后进入路线规划模式。
- 使用现有邻接图和地形移动值寻找路线。
- 点击目标只写入 `plannedPath` 和军令。
- 军事点不再按每格移动扣除。
- 结束季度时锁定所有军团军令。

**Verify:**
- 高山不可通行。
- 道路降低移动成本。
- 移动力耗尽时军团停在路线中途。
- 地图拖动与单击选中没有回归。

**Done:**
- 玩家可以预览路线，并在季度结算后看到军团逐格移动。

### Task 3: 实现控制区和遭遇战生成

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Modify: `siegtrack/Documents/europe universary 5/tests/warfare-movement.test.cjs`

**Action:**
- 成建制军团对相邻地块投射控制区。
- 进入敌方控制区后停止移动。
- 禁止从一个敌方控制区直接进入另一个。
- 同格争夺、交叉移动和进攻驻军生成遭遇战。
- 记录先到方、地形和增援军团。

**Verify:**
- 同样军令快照始终生成相同遭遇战。
- 无战争状态的国家不会触发战斗。
- 有军事通行权的中立国家不会阻止移动。

**Done:**
- 所有战斗都由地图移动事实生成，不由 UI 直接调用。

### Task 4: 实现陆战结算

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Create: `siegtrack/Documents/europe universary 5/tests/warfare-combat.test.cjs`

**Action:**
- 实现正面宽度与有效参战兵力。
- 结算侦察、远程、接战、侧翼、士气、撤退与追击。
- 步兵、骑兵、炮兵使用不同阶段作用。
- 加入受地形和阵形条件约束的战机事件。
- 生成包含修正来源的战斗报告。

**Verify:**
- 相同随机种子产生相同结果。
- 数量优势不保证必胜，但无条件大幅翻盘不会出现。
- 山地降低骑兵作用，炮兵科技未解锁时不参与。
- 士气归零触发撤退或溃退。

**Done:**
- 战斗产生兵力、士气、组织度、经验和位置变化。

### Task 5: 分离占领与法定归属

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Create: `siegtrack/Documents/europe universary 5/tests/warfare-occupation.test.cjs`

**Action:**
- 地块新增 `occupier`、`occupation` 和 `devastation`。
- 删除陆军进入后修改 `controller` 的逻辑。
- 无敌军且无要塞阻挡时建立军事占领。
- 军队撤离后按驻军与邻近控制逐季恢复。
- 军事控制地图模式叠加占领纹理。

**Verify:**
- 占领不会改变国家法定领土数量。
- 国家切换后双方看到相同占领事实。
- 无驻军占领能够被原政权恢复。

**Done:**
- 地图能同时表达法定归属与战时占领。

### Task 6: 接入战争分数、意志和疲惫

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Create: `siegtrack/Documents/europe universary 5/tests/warfare-war-state.test.cjs`

**Action:**
- 扩展战争记录，保存战争领袖、主目标、分数和参战贡献。
- 为国家新增战争疲惫。
- 为每场战争的参战国新增战争意志。
- 战斗、目标占领、首都、伤亡和战争持续时间进入季度汇总。
- 避免地块破坏与经济损失重复计入疲惫。

**Verify:**
- 非参战国不获得战争疲惫。
- 战斗伤亡先修改军团，再汇总到疲惫。
- 无关占领只产生少量战争分数。
- 战争意志按每个国家独立计算。

**Done:**
- 战争结果能推动参战国从坚决作战转为求和。

### Task 7: 实现基础和平

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Create: `siegtrack/Documents/europe universary 5/tests/warfare-peace.test.cjs`

**Action:**
- 新增维持现状、目标领土、赔款三类和平要求。
- 计算要求的战争分数成本。
- 领土只能给予拥有目标或宣称的参战国。
- 和平后移除战争、清除占领、建立停战。
- 战争疲惫保留并逐季度恢复。

**Verify:**
- 和平成本超过战争分数时不能提交。
- 领土不会自动交给占领者。
- 和约后双方不再被 `areAtWar()` 判定为交战。

**Done:**
- 从宣战事实到战后停战形成完整状态闭环。

### Task 8: 新增军事与战争界面

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Modify: `siegtrack/Documents/europe universary 5/tests/ui-smoke.test.cjs`

**Action:**
- 左上新增军事入口。
- 左侧抽屉增加军团、动员、佣兵和战争页签。
- 左下军团详情展示编制、状态、将领、路线和军令。
- 战争页展示目标、分数、意志、疲惫、贡献和和平入口。
- 右下新增军事控制地图模式。

**Verify:**
- 查看外国军团时保持只读。
- 国家切换后只允许操作当前国家军团。
- 军团详情与地块详情互斥。
- 窄屏没有遮挡地图主要控制区。

**Done:**
- 玩家不需要阅读日志即可完成规划、战斗和求和。

### Task 9: 回归与自检

**Files:**
- Verify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Verify: `siegtrack/Documents/europe universary 5/tests/*.test.cjs`

**Action:**
- 提取 `<script>` 并运行 `node --check`。
- 运行全部 Node.js 测试。
- 浏览器验证地图点击、拖动、缩放和双指交互。
- 验证国家切换、外交、领导人换代和阶层结算。
- Review 查 Bug，并检查是否存在重复战争状态或悬空数值。

**Verify:**
- 控制台无错误。
- 所有测试通过。
- 战争事实只来自 `state.diplomacy.wars`。
- 军团位置只来自 `army.tileId`。
- 地块损失先发生，再汇总国家战争疲惫。

**Done:**
- Demo 完成陆战与基础和平闭环，且现有系统无行为回归。


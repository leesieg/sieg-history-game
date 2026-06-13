# 高保真版本完整机制接入实施计划

**Goal:** 冻结 Demo2，将完整机制迁移到模块化高保真版本。

**Architecture:** 以唯一世界状态为核心，机制模块只处理数据和命令；高保真 UI 通过适配层读取状态、派发命令。原 Demo2 与静态高保真原型均作为只读历史版本保留。

**Tech Stack:** 原生 HTML、CSS、JavaScript、SVG、Node.js 测试。

---

### Task 1: 建立冻结基线

**Files:**
- Create: `tests/demo2-freeze.test.cjs`
- Create: `tests/hifi-structure.test.cjs`

**Steps:**
1. 增加 Demo2 SHA-1 冻结测试。
2. 增加新高保真目录和模块边界测试。
3. 运行测试，确认结构测试因目录尚不存在而失败。
4. Commit: `test: freeze demo2 behavior`

### Task 2: 建立模块化高保真外壳

**Files:**
- Create: `prototype/hifi/index.html`
- Create: `prototype/hifi/styles/tokens.css`
- Create: `prototype/hifi/styles/layout.css`
- Create: `prototype/hifi/styles/components.css`
- Create: `prototype/hifi/scripts/main.js`

**Steps:**
1. 从静态高保真原型拆出 HTML、CSS 和入口脚本。
2. 保留现有 HUD、地图和面板尺寸关系。
3. 移除静态 Toast 操作，改为适配层入口。
4. 运行结构测试和浏览器烟雾测试。
5. Commit: `refactor: modularize hifi prototype`

### Task 3: 迁移地图数据和交互

**Files:**
- Create: `prototype/hifi/scripts/data/geography.js`
- Create: `prototype/hifi/scripts/ui/map.js`
- Modify: `prototype/hifi/scripts/main.js`
- Test: `tests/hifi-map.test.cjs`

**Steps:**
1. 复用 Demo2 的地图边界、六边形参数和地理数据。
2. 迁移地图模式、图例、缩放、拖动和选格。
3. 保持政治模式为默认模式。
4. 验证单击与拖动阈值不冲突。
5. Commit: `feat: connect hifi map`

### Task 4: 迁移世界状态和季度循环

**Files:**
- Create: `prototype/hifi/scripts/engine/world.js`
- Create: `prototype/hifi/scripts/engine/turn.js`
- Create: `prototype/hifi/scripts/ui/store.js`
- Test: `tests/hifi-world.test.cjs`

**Steps:**
1. 迁移国家状态、时间、玩家国家和唯一状态初始化。
2. 迁移季度行动点获取与季度结算入口。
3. HUD 改为从状态动态渲染。
4. 验证国家切换后各国数据独立。
5. Commit: `feat: migrate world and turn engine`

### Task 5: 迁移国家政治系统

**Files:**
- Create: `prototype/hifi/scripts/data/countries.js`
- Create: `prototype/hifi/scripts/engine/politics.js`
- Create: `prototype/hifi/scripts/ui/drawers.js`
- Test: `tests/hifi-politics.test.cjs`

**Steps:**
1. 迁移领导人、家族、政体、阶层、议会、改革和决议。
2. 接入国家详情与国家选择弹窗。
3. 接入领导人换代与选举弹窗。
4. 验证政体变化同步改变权力结构和领导人制度。
5. Commit: `feat: connect domestic systems`

### Task 6: 迁移经济与发展系统

**Files:**
- Create: `prototype/hifi/scripts/engine/economy.js`
- Create: `prototype/hifi/scripts/data/rules.js`
- Test: `tests/hifi-economy.test.cjs`

**Steps:**
1. 迁移资源、市场、商路、资本池、建筑和敕令。
2. 迁移科技、时代进步和议程。
3. 接入经济与发展抽屉。
4. 验证地块产出、POP 和战争破坏的因果关系。
5. Commit: `feat: connect economy and progression`

### Task 7: 迁移外交系统

**Files:**
- Create: `prototype/hifi/scripts/engine/diplomacy.js`
- Test: `tests/hifi-diplomacy.test.cjs`

**Steps:**
1. 迁移关系、态度、使节、条约和领导人外交。
2. 迁移傀儡、朝贡、诸侯等附属关系。
3. 接入国家外交详情和外交操作。
4. 验证外交容量、限制与关系变化。
5. Commit: `feat: connect diplomacy systems`

### Task 8: 迁移战争系统

**Files:**
- Create: `prototype/hifi/scripts/engine/warfare.js`
- Create: `prototype/hifi/scripts/ui/dialogs.js`
- Test: `tests/hifi-warfare.test.cjs`

**Steps:**
1. 迁移军团、单位、移动、补给、战斗、占领和和平。
2. 接入独立军团窗口。
3. 接入战争详情和和平谈判弹窗。
4. 验证逐格移动、地形成本和战后 POP/产出影响。
5. Commit: `feat: connect warfare systems`

### Task 9: 迁移历史因果和叙事系统

**Files:**
- Create: `prototype/hifi/scripts/engine/history.js`
- Modify: `prototype/hifi/scripts/ui/dialogs.js`
- Test: `tests/hifi-history.test.cjs`

**Steps:**
1. 迁移事件、局势、御前会议、摄政和时代转换。
2. 迁移历史因果链和终局史诗。
3. 右侧局势队列改为真实待办。
4. 验证长程模拟和七跳因果链。
5. Commit: `feat: connect narrative systems`

### Task 10: 完整验收

**Files:**
- Modify: `README.md`
- Modify: `tests/hifi-structure.test.cjs`

**Steps:**
1. 运行全部旧测试和新测试。
2. 检查 Demo2 SHA-1 未变化。
3. 使用浏览器验证桌面和横屏手机布局。
4. 检查所有按钮、弹窗、抽屉和地图交互。
5. 更新运行说明。
6. Commit: `test: complete hifi integration`

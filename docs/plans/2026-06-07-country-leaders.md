# Country Leaders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 1337 年 Demo 中加入真实初始领导人、季度时间、三类行动点以及继承和选举换代。

**Architecture:** 领导人作为各国独立状态的一部分，由显式历史配置初始化。季度结算统一推进日历、行动点和换代；国家详情窗口读取同一状态展示领导人，玩家选举通过独立弹窗完成。

**Tech Stack:** HTML、CSS、原生 JavaScript、SVG、Node.js VM 测试。

---

### Task 1: 领导人历史配置与状态

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Modify: `siegtrack/Documents/europe universary 5/tests/country-switching.test.cjs`

**Action:**
- 为全部可玩国家配置 1337 年真实领导人、家族、头衔、能力和继承制度。
- 新增领导人创建、校验和行动点产出函数。
- 国家状态保存领导人和三类行动点。

**Verify:**
- 每个可玩国家都有姓名、家族、头衔和 0–6 能力。
- 法兰西、威尼斯、教皇国、金帐汗国使用不同头衔和换代制度。

**Done:**
- 新游戏创建后所有国家都有独立领导人对象。

### Task 2: 季度时间与行动点

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Modify: `siegtrack/Documents/europe universary 5/tests/country-switching.test.cjs`

**Action:**
- 将回合转换为 1337 年第一季度起算的季度日历。
- 删除六回合固定终局。
- 每季度按领导人能力补充行政、外交、军事行动点，上限 10。
- 将建设类、议会类和军事类操作绑定到对应行动点。

**Verify:**
- 四次结束回合后年份增加 1。
- 高能力领导人获得更多对应行动点。
- 游戏不会在第六回合自动结束。

**Done:**
- 时间和操作消耗均使用新行动点模型。

### Task 3: 继承、死亡与选举

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Modify: `siegtrack/Documents/europe universary 5/tests/country-switching.test.cjs`

**Action:**
- 历史离任节点优先启用真实继任人。
- 世袭政体历史队列耗尽后生成同家族继任人。
- 定期选举和终身选举生成三名候选人。
- AI 自动选择；玩家国家保存待选举状态。

**Verify:**
- 历史继承保持家族和真实姓名。
- 共和制任期届满产生三名候选人。
- AI 国家可自动完成换代。

**Done:**
- 无限回合下领导人始终能够继续换代。

### Task 4: 国家窗口与选举界面

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`
- Modify: `siegtrack/Documents/europe universary 5/tests/ui-smoke.test.cjs`

**Action:**
- 国家详情加入领导人姓名、家族、头衔、年龄、在位时间、能力与制度。
- 玩家和外国国家使用同一只读领导人信息组件。
- 新增玩家选举弹窗，展示三名候选人及支持阶层。
- 右上行动点 HUD 改为行政、外交、军事三项。

**Verify:**
- 打开任意国家详情都能看到领导人。
- 玩家选举完成后关闭弹窗并更新领导人。
- 国家切换后 HUD 使用目标国家自己的行动点和领导人。

**Done:**
- 领导人机制的状态、结算和界面形成闭环。

### Task 5: 回归验证

**Files:**
- Test: `siegtrack/Documents/europe universary 5/tests/country-switching.test.cjs`
- Test: `siegtrack/Documents/europe universary 5/tests/ui-smoke.test.cjs`

**Action:**
- 执行全部 Node 测试。
- 检查冲突标记和脚本解析。
- Review 领导人数据完整性、选举阻塞和行动点消耗。

**Verify:**
- `node tests/country-switching.test.cjs`
- `node tests/ui-smoke.test.cjs`

**Done:**
- 所有测试通过且没有缺失领导人配置。


# 国家外交系统 Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有单文件 HTML Demo 中加入除完整国际组织玩法外的国家外交闭环。

**Architecture:** 继续使用原生 HTML、CSS、JavaScript 和现有世界状态。外交数据统一放在 `state.diplomacy`，计算、命令、季度结算和界面渲染分别组织；原有固定战争名单改为动态战争记录。国际组织只建立数据结构和身份展示。

**Tech Stack:** HTML、CSS、原生 JavaScript、SVG、Obsidian Markdown。

---

### Task 1: 建立外交世界状态

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

1. 新增双边关系、战争、契约、使节任务、从属关系和国际组织数据结构。
2. 为每个国家新增使节数量和外交容量。
3. 用地图接壤、政体、宗教、国力和战争事实计算初始关系。
4. 将 `areHostile()` 改为读取动态战争记录。
5. 运行 JavaScript 语法检查。

### Task 2: 实现关系与接受意愿计算

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

1. 实现方向性关系读取。
2. 实现国家态度生成。
3. 实现领导人私人关系。
4. 实现各类外交提案的确定性接受意愿明细。
5. 验证同一关系从双方视角读取正确。

### Task 3: 实现外交行动与季度结算

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

1. 实现改善关系使节任务及撤回。
2. 实现赠礼、会晤和威慑。
3. 实现贸易、通行、联姻、互不侵犯和防御同盟。
4. 实现契约退出、到期和外交容量超额惩罚。
5. 实现领导人换代后的私人关系衰减。
6. 接入每季度结算。

### Task 4: 实现从属关系

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

1. 实现朝贡、附庸、傀儡三种从属提案。
2. 保存六项自主权条款。
3. 实现自主权、忠诚度、贡赋和宗主容量占用。
4. 实现安抚附属国使节任务。
5. 验证切换宗主与附属国后数据一致。

### Task 5: 实现外交界面

**Files:**
- Modify: `prototype/demos/帝国的代价-微信小游戏demo.html`

1. 左上新增“外交”入口。
2. 左侧抽屉展示外交资源、国家关系、任务、契约、从属和组织身份。
3. 国家详情增加“概览/外交”页签。
4. 外国详情展示关系因素、领导人关系、提案分数和行动按钮。
5. 玩家只能操作当前国家，查看其他国家时保持只读。
6. 检查桌面与移动端布局。

### Task 6: 验证

**Files:**
- Verify: `prototype/demos/帝国的代价-微信小游戏demo.html`

1. 提取 `<script>` 并运行 `node --check`。
2. 用浏览器加载本地文件，检查控制台错误。
3. 验证外交抽屉、国家外交页签、使节、提案、季度结算和切换国家。
4. 检查地图点击、缩放、抽屉互斥和领导人换代没有回归。
5. Review 查 Bug，并从第一性原理确认数据只有一个来源。


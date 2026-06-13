# High-Fidelity HUD Phase 1-3 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** 重建高保真静态原型的 HUD 骨架、历史材质体系，以及顶部、左侧和季度按钮，使其在结构和气质上接近已确认效果图。

**Architecture:** 保留独立单文件 HTML 作为静态原型，地图仅作为视觉背景。所有 HUD 组件使用统一 CSS 设计令牌和可复用的金属框架类；写实君主肖像作为独立位图资产加载。此阶段不读取、不复制、不修改 `demo2` 的游戏状态与逻辑。

**Tech Stack:** HTML5、CSS、原生 JavaScript、PNG 视觉资产、本地 HTTP 服务。

---

### Task 1: 固化视觉令牌和屏幕骨架

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 建立黑铁、旧金、深蓝珐琅、羊皮纸四组颜色令牌。
2. 建立统一金属框、内描边、铆钉、阴影和按压状态。
3. 将界面划分为君主角标、顶部主栏、资源栏、左侧入口、地图画布和右下季度区。
4. 删除现代半透明卡片的圆角和漂浮感。
5. 在 `1280×720` 下检查 HUD 不遮挡主要欧洲地图。

**Verify:**
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('prototype/demos/帝国的代价-高保真界面静态原型.html','utf8');for(const x of ['ruler-plaque','top-command-bar','system-rail','season-control'])if(!s.includes(x))throw Error(x);console.log('HUD skeleton ok')"
```

### Task 2: 建立历史视觉资产体系

**Files:**
- Create: `assets/ui/ruler-philip-vi.png`
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 生成腓力六世半身肖像，保持统一光向和深色背景。
2. 使用 CSS 建立盾徽、铭牌、金属边框和珐琅按钮。
3. 建立资源图标、系统图标和状态图标的统一双色规则。
4. 所有图标保持同一视觉尺寸和基线。
5. 确认资产路径可在本地 HTTP 服务下正常加载。

**Verify:**
```bash
test -f assets/ui/ruler-philip-vi.png
```

### Task 3: 完成顶部国家与资源栏

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 左上使用大尺寸君主肖像、等级牌和法国盾徽。
2. 顶部依次展示游戏名、时间时代、待办数量和资源。
3. 每项资源展示图标、总量和季度变化。
4. 资源栏压缩为一行，禁止使用独立卡片。
5. 点击国旗或君主区域显示国家信息提示。

**Verify:**
```bash
rg -n "腓力六世|1337年|封建纪元|季度" prototype/demos/帝国的代价-高保真界面静态原型.html
```

### Task 4: 完成左侧系统入口

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 五个入口改为横向金属铭牌。
2. 图标和文字并列，当前入口使用深蓝珐琅高亮。
3. 点击入口打开薄抽屉；关闭后清除选中态。
4. 入口尺寸满足横屏触控热区。

**Verify:**
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('prototype/demos/帝国的代价-高保真界面静态原型.html','utf8');const n=(s.match(/data-system=/g)||[]).length;if(n!==5)throw Error('system count '+n);console.log('system rail ok')"
```

### Task 5: 完成季度主按钮

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 按钮移动到右下，与地图工具形成同一控制区。
2. 未清理待办时显示红色“处理待办 N”。
3. 待办清零后转为绿色“结束季度”。
4. 使用菱形纹章端头和金属内框，形成主操作焦点。

**Verify:**
```bash
rg -n "处理待办|结束季度|season-control" prototype/demos/帝国的代价-高保真界面静态原型.html
```

### Task 6: 响应式与交互回归

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 在 `1280×720` 检查全部 HUD。
2. 在 `844×390` 检查横屏触控布局。
3. 验证五个系统入口、待办状态和季度按钮。
4. 检查页面无水平或垂直滚动。
5. 重新计算 `demo2` SHA-1，确认未修改。

**Verify:**
```bash
shasum prototype/demos/帝国的代价-微信小游戏demo2.html
```

Expected SHA-1:
```text
974178a99e262f03c1b4ecf6e48ca820cf9f045d
```

# High-Fidelity Map Phase 4-6 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** 完成地块详情与问题队列、地图工具与缩略地图，并用 `demo2` 的真实轮廓和 1337 数据替换生成底图。

**Architecture:** 从 `demo2` 机械抽取地图常量为独立只读数据文件，静态原型通过独立地图渲染脚本生成 SVG 六边形地图。主地图和缩略图共用相同投影、地块与地图模式状态；原型不读取或修改 `demo2` 的运行状态。

**Tech Stack:** HTML5、CSS、SVG、原生 JavaScript、Node.js 数据抽取脚本。

---

### Task 1: 抽取真实地图数据

**Files:**
- Create: `scripts/extract-prototype-map-data.cjs`
- Create: `assets/ui/prototype-map-data.js`
- Read only: `prototype/demos/帝国的代价-微信小游戏demo2.html`

**Steps:**
1. 从 `demo2` 提取 `landPolygons`、`seaPolygons`、`labels`、`regionSeeds`、`CITY_BY_REGION`、`CAPITAL_BY_POLITY`、`CITY_COORDS`。
2. 输出为 `window.PROTOTYPE_MAP_DATA`。
3. 验证数据包含法兰西、英格兰、北非、地中海和君士坦丁堡坐标。

**Verify:**
```bash
node scripts/extract-prototype-map-data.cjs
node -e "require('vm').runInNewContext(require('fs').readFileSync('assets/ui/prototype-map-data.js','utf8'),{window:{}})"
```

### Task 2: 建立真实 SVG 六边形地图

**Files:**
- Create: `assets/ui/prototype-map.js`
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 使用与 `demo2` 一致的经纬度边界和投影。
2. 按真实陆地轮廓判断陆海地块，生成完整六边形网格。
3. 按最近区域种子分配政权、地形、人口、产出、文化和宗教。
4. 绘制首都、城市、国家名称和海域名称。
5. 点击地块更新选中描边和地块详情。

**Verify:**
```bash
node -e "const s=require('fs').readFileSync('assets/ui/prototype-map.js','utf8');new (require('vm').Script)(s);console.log('map script ok')"
```

### Task 3: 完成地块详情与问题队列

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`
- Modify: `assets/ui/prototype-map.js`

**Steps:**
1. 地块详情展示名称、地区、气候、POP、产出、控制力、发展度、文化和宗教。
2. 横幅按地形切换已有地形图片。
3. 海域使用独立海域详情。
4. 问题队列显示类型、标题、对象和严重程度。
5. 点击问题定位相关地块。

**Verify:**
```bash
rg -n "provinceClimate|provincePopulation|provinceCulture|data-focus" prototype/demos/帝国的代价-高保真界面静态原型.html
```

### Task 4: 完成地图工具与缩略地图

**Files:**
- Modify: `prototype/demos/帝国的代价-高保真界面静态原型.html`
- Modify: `assets/ui/prototype-map.js`

**Steps:**
1. 支持政治、地形、人口、产出四种模式。
2. 增加图例展开按钮并默认收起。
3. 增加放大、缩小和复位按钮。
4. 缩略地图使用同一陆地轮廓，并显示当前视野框。
5. 点击缩略地图移动主地图视野。

**Verify:**
```bash
rg -n "mapLegend|zoomIn|zoomOut|zoomReset|miniMapSvg" prototype/demos/帝国的代价-高保真界面静态原型.html
```

### Task 5: 双尺寸视觉与交互验证

**Files:**
- Modify when needed: `prototype/demos/帝国的代价-高保真界面静态原型.html`

**Steps:**
1. 在 `1280×720` 验证地图、详情、问题队列和地图工具。
2. 在 `844×390` 验证横屏布局无重叠。
3. 切换四种地图模式。
4. 点击地块、问题和缩略地图。
5. 验证 `demo2` SHA-1 不变。

**Verify:**
```bash
shasum prototype/demos/帝国的代价-微信小游戏demo2.html
```

Expected:
```text
974178a99e262f03c1b4ecf6e48ca820cf9f045d
```

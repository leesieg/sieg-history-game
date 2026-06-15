# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

《帝国的代价》——桌游式中重度历史策略**微信小游戏原型**，1337 年开局、季度回合，背景为欧洲/北非/地中海世界。没有构建系统、没有 `package.json`、没有第三方依赖：交付物是浏览器直开的原生 JS/HTML 原型，测试用 Node 内置 `vm` + `assert`（`.test.cjs`）跑。

**当前主线是 `prototype/hifi/`（模块化多文件版本）；`demos/demo2` 已机制冻结，仅作回归基线，不再直接修改。**

## 常用命令

```bash
# 本地预览（README 用 8765，.claude/launch.json 配置用 8742）
python3 -m http.server 8765
# 主线入口：http://127.0.0.1:8765/prototype/hifi/index.html
# 冻结基线：http://127.0.0.1:8765/prototype/demos/帝国的代价-微信小游戏demo2.html

# 跑全部测试（27 个文件）
for file in tests/*.test.cjs; do node "$file"; done

# 跑单个测试
node tests/hifi-world.test.cjs

# 从 demo2 抽取地图常量到 assets/ui/prototype-map-data.js（修改 demo2 地图数据后同步）
node scripts/extract-prototype-map-data.cjs
```

注意：仓库路径含空格（iCloud 目录），shell 命令中务必加引号。

## 架构

### 三套原型 + 对应测试

| 路径 | 角色 | 测试 |
|---|---|---|
| `prototype/hifi/` | **当前主线**：模块化高保真版，完整机制（政治/经济/外交/战争/历史叙事） | `tests/hifi-*.test.cjs` |
| `prototype/demos/帝国的代价-微信小游戏demo2.html` (~10.6k 行) | **冻结基线**，单文件含完整游戏层与历史因果引擎，不再改 | `tests/demo2-*.test.cjs`，共用 `tests/demo2-harness.cjs` |
| `prototype/demos/帝国的代价-微信小游戏demo.html` (~7.5k 行) | 早期单文件原型，保留**战争系统**逻辑 | `tests/warfare-*.test.cjs`、`country-switching`、`ui-smoke`（各自内联夹具） |

`prototype/demos/帝国的代价-高保真界面静态原型.html` 是早期静态界面稿；`prototype/diagrams/` 是机制框架图。

### hifi 模块约定（改主线必读）

`prototype/hifi/` 不用打包器、也不用 ES module，而是一组 IIFE 脚本：每个文件 `(() => { "use strict"; ... })()` 把自己的 API 挂到全局 `window.HIFI_*`（如 `HIFI_WORLD_ENGINE`、`HIFI_TURN_ENGINE`、`HIFI_STORE`、`HIFI_*_ENGINE`、`HIFI_GEOGRAPHY/COUNTRY_DATA/RULES`、`HIFI_DRAWERS/DIALOGS`）。

分层：`scripts/data/`（geography/countries/rules 纯数据）→ `scripts/engine/`（world/turn/politics/economy/diplomacy/warfare/history 纯逻辑）→ `scripts/ui/`（store/map/drawers/dialogs）→ `scripts/main.js`（接线）。

`index.html` 用按依赖顺序排列的 `<script src="...?v=N">` 标签加载，**`?v=N` 是手动 cache-bust：改某个脚本后要在 index.html 里递增它的 `v`**，否则浏览器吃旧缓存。

世界状态：`HIFI_WORLD_ENGINE.createWorld(tiles, profiles, playerCountry)` 生成 `world`（每国独立状态、`turn` 从 1 起、`1337年·春`），`HIFI_TURN_ENGINE` 推进季度。

### 两套测试如何加载逻辑（关键约定，别混用）

- **hifi 测试**：直接 `vm.runInNewContext` 把需要的 `prototype/hifi/scripts/*.js` 在 `{ window: {} }` 上下文里跑，再从 `context.window.HIFI_*` 取 API 断言（`hifi-world/turn/politics/economy/diplomacy/warfare/history/map`）。另有纯静态检查：`hifi-structure`（必备文件存在）、`hifi-layout`/`hifi-ui-smoke`（正则核对 html/js 里的容器 id 与接线字符串）。
- **demo2 测试**：读单文件 HTML → 正则提取 `<script>` → **从开头切到标记行 `document.getElementById("endTurnBtn").onclick`**（只取纯函数/数据、丢弃 DOM 接线）→ 在 `vm.createContext` 的 stub 里跑 → 通过追加的 `globalThis.__api = {...}` 导出。**因此 demo2 里任何想被测的纯逻辑必须定义在该接线行之前，并加进 `demo2-harness.cjs` 末尾的 `__api`。**

### demo2 状态模型（冻结基线参考）

单一 `state` 对象（`newState()`），`endTurn()` 推进一季。分层：数值体系（合法性 0-100 / 满意度 ±100 / 库存 ×10）、四级不满阶梯 + 叛军、情势引擎（黑死病/小冰期）、**历史因果引擎**三层（流层=贸易/进步/信仰扩散，压力层=多仪表，转折层=六纪元状态机 `ERAS` `feudal→discovery→faith→absolutism→revolution→industrial`）、敕令/议程/科技/外交/AI。左上 9 页签：国家/敕令/议程/科技/商路/外交/军事/政制/纪闻。

## 全项目约定

- **术语用欧洲史标准译名**，不用中国官制词汇（御前会议/宫廷导师/王室总管/内务大臣/王国元帅/大法官/盾牌钱等）。新增文案沿用此风格。
- （demo2 特有，冻结故一般无需触碰）阶层 power 每季被 `refreshPolitics` 按公式重算（base/tilePower/privileges/tradeBonus），`adjustEstate` 式临时增减会被下一季冲掉；旧面板名通过 `PANE_ALIASES` 兼容。

## 文档体系

`docs/design/` 为编号方案（01–16）：设计先行、实现说明随后——09 号=完整策划方案，10 号=Demo2 游戏层实现，11 号=历史因果引擎完整设计，15 号=全机制 Review 与框架图，**16 号=高保真界面优化与交付方案（hifi 主线的设计依据）**。改动较大机制前先读对应编号。`docs/dev-diaries/` 是开发日志，`docs/research/` 是《欧陆风云 5》调研，`docs/plans/` 是历史实施计划。

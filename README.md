# 帝国的代价

一款以 1337 年欧洲、北非与地中海世界为背景的桌游式历史策略微信小游戏原型。

## 目录

| 路径 | 内容 |
|---|---|
| `prototype/hifi/` | 完整机制高保真版本，当前推荐入口 |
| `prototype/demos/` | 原始 Demo、冻结的完整机制 Demo2、历史静态原型 |
| `prototype/diagrams/` | 游戏机制与参考机制框架图 |
| `assets/` | 地图、地形横幅、人物与界面资源 |
| `docs/design/` | 游戏机制设计与实现说明 |
| `docs/dev-diaries/` | 项目开发日志 |
| `docs/research/` | 《欧陆风云 5》调研资料 |
| `docs/plans/` | 历史实施计划 |
| `scripts/` | 数据提取与构建辅助脚本 |
| `tests/` | Demo 机制与界面测试 |

## 本地运行

```bash
python3 -m http.server 8765
```

浏览器打开：

- `http://127.0.0.1:8765/prototype/hifi/index.html`
- `http://127.0.0.1:8765/prototype/demos/帝国的代价-微信小游戏demo2.html`

## 当前版本

`prototype/hifi/index.html` 是完整机制高保真版本，使用模块化原生 JavaScript：

| 模块 | 已接入内容 |
|---|---|
| 世界与季度 | 国家独立状态、春夏秋冬、行动点与国家切换 |
| 国家政治 | 历史领导人、换代、政体、阶层、改革和选举 |
| 经济发展 | 地块产出、建筑、贸易政策、敕令、议程和科技 |
| 外交 | 方向性关系、使节、条约、领导人外交和附属关系 |
| 战争 | 军团编制、逐格移动、战斗、占领、POP 损失与和平 |
| 历史叙事 | 局势、事件、时代转换、御前会议、摄政和编年史 |

Demo2 保留为机制冻结基线，不再直接修改。

## 测试

```bash
for file in tests/*.test.cjs; do node "$file"; done
```

## 资源说明

仓库内图片用于本项目原型展示。未经单独确认，不视为授予项目之外的再分发许可。

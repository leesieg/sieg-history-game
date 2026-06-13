# 帝国的代价

一款以 1337 年欧洲、北非与地中海世界为背景的桌游式历史策略微信小游戏原型。

## 目录

| 路径 | 内容 |
|---|---|
| `prototype/demos/` | 原始 Demo、完整机制 Demo2、高保真界面原型 |
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

- `http://127.0.0.1:8765/prototype/demos/帝国的代价-微信小游戏demo2.html`
- `http://127.0.0.1:8765/prototype/demos/帝国的代价-高保真界面静态原型.html`

## 测试

```bash
for file in tests/*.test.cjs; do node "$file"; done
```

## 资源说明

仓库内图片用于本项目原型展示。未经单独确认，不视为授予项目之外的再分发许可。

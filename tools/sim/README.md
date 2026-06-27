# tools/sim

`tools/sim` 是 30/34/42 号文档要求的 L2 批量模拟评测工具。它只产出数据和报告，不进入 `tests/`，不要把平衡结果写成硬断言。

## 快速运行

```bash
node tools/sim/run.cjs --quarters=40 --limit=all
node tools/sim/metrics.cjs
node tools/sim/report.cjs --title="当前版本 hifi 批量模拟评测"
```

默认输出：

| 文件 | 内容 |
|---|---|
| `tools/sim/baselines/latest-run.json` | 原始逐局数据 |
| `tools/sim/baselines/latest-metrics.json` | 指标分布 |
| `tools/sim/baselines/latest-report.md` | Markdown 报告 |

## 参数

| 参数 | 说明 |
|---|---|
| `--quarters=40` | 每局推进季度数 |
| `--limit=all` | 限制国家数量，调试可用 `--limit=5` |
| `--players=all` | 指定国家，逗号分隔 |
| `--profiles=...` | 策略画像，默认 `balanced` |
| `--out=...` | 指定输出路径 |

多画像对比可手动运行：

```bash
node tools/sim/run.cjs --quarters=40 --limit=all --profiles=passive,balanced,military,economy,diplomacy
```

## 读数原则

| 层级 | 用途 |
|---|---|
| L1 | `tests/*.test.cjs` 判断红绿 |
| L2 | `tools/sim` 看分布和趋势 |
| L3 | 浏览器试玩和交互巡检 |

后续 36–44 全系统重构每完成一个阶段，应至少跑一次 `tools/sim`，对比完成率、资源跨度、机制活性、强弱样本是否改善。

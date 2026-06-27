#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./hifi-loader.cjs");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function q(value) {
  if (!value) return "无数据";
  return `${value.min} / ${value.p25} / ${value.median} / ${value.p75} / ${value.max} / ${value.mean}`;
}

function rows(items, columns) {
  return items.map(item => `| ${columns.map(column => item[column] ?? "").join(" | ")} |`).join("\n");
}

function renderReport(metrics, title = "hifi 批量模拟评测报告") {
  const profileRows = Object.entries(metrics.profiles || {}).map(([profile, item]) => ({
    profile,
    completed: `${item.completed}/${item.total}`,
    score: q(item.score),
    money: q(item.money),
    legitimacy: q(item.legitimacy),
    blocking: q(item.blockingIssues),
    subjects: q(item.subjects),
  }));
  return `# ${title}

> 来源：\`tools/sim\`
> 生成时间：${metrics.generatedAt}
> 样本：${metrics.runCount} 局 × ${metrics.quarters} 季

## 1. 稳定性

| 指标 | 结果 |
|---|---:|
| 完成局数 | ${metrics.completed}/${metrics.runCount} |
| 完成率 | ${metrics.completionRate}% |
| 失败局数 | ${metrics.failed} |
| 战争数 min/p25/中位/p75/max/均值 | ${q(metrics.stability.wars)} |
| 世界事件 min/p25/中位/p75/max/均值 | ${q(metrics.stability.events)} |
| 局势阶段 | ${(metrics.stability.strugglePhaseKinds || []).join("、") || "无"} |

## 2. 资源与强度

| 指标 | min / p25 / 中位 / p75 / max / 均值 |
|---|---|
| 综合强度 | ${q(metrics.resources.score)} |
| 粮食 | ${q(metrics.resources.food)} |
| 金钱 | ${q(metrics.resources.money)} |
| 军需 | ${q(metrics.resources.military)} |
| 合法性 | ${q(metrics.resources.legitimacy)} |
| 金钱跨度 | ${q(metrics.resources.moneySpread)} |
| 军需跨度 | ${q(metrics.resources.militarySpread)} |

| 风险项 | 结果 |
|---|---:|
| 玩家合法性归 0 局数 | ${metrics.resources.zeroLegitimacyRuns} |
| 玩家合法性低于 30 局数 | ${metrics.resources.lowLegitimacyRuns} |

## 3. 机制活性

| 机制 | min / p25 / 中位 / p75 / max / 均值 |
|---|---|
| 待办数量 | ${q(metrics.activity.issues)} |
| 阻塞裁断 | ${q(metrics.activity.blockingIssues)} |
| 条约 | ${q(metrics.activity.treaties)} |
| 从属关系 | ${q(metrics.activity.subjects)} |
| 建筑总数 | ${q(metrics.activity.buildings)} |
| 科技采纳 | ${q(metrics.activity.techAdoptions)} |
| 国家使命完成 | ${q(metrics.activity.missionsDone)} |

## 4. 策略画像

| 画像 | 完成 | 强度 | 金钱 | 合法性 | 阻塞裁断 | 从属 |
|---|---:|---|---|---|---|---|
${rows(profileRows, ["profile", "completed", "score", "money", "legitimacy", "blocking", "subjects"])}

## 5. 强弱样本

### 最强样本

| 国家 | 画像 | 强度 | 金钱 | 合法性 | 战争 |
|---|---|---:|---:|---:|---:|
${rows(metrics.strongest || [], ["player", "profile", "score", "money", "legitimacy", "wars"])}

### 最弱样本

| 国家 | 画像 | 强度 | 金钱 | 合法性 | 战争 |
|---|---|---:|---:|---:|---:|
${rows(metrics.weakest || [], ["player", "profile", "score", "money", "legitimacy", "wars"])}

## 6. 读数原则

| 项 | 原则 |
|---|---|
| L1 正确性 | 仍由 \`tests/*.test.cjs\` 判定红绿 |
| L2 平衡 | 本报告看分布，不把平衡写死成断言 |
| 后续用途 | 36–44 每阶段重构前后各跑一次，比较完成率、资源跨度、机制活性是否改善 |
`;
}

function main() {
  const input = argValue("in", path.join(ROOT, "tools", "sim", "baselines", "latest-metrics.json"));
  const output = argValue("out", path.join(ROOT, "tools", "sim", "baselines", "latest-report.md"));
  const title = argValue("title", "hifi 批量模拟评测报告");
  const metrics = JSON.parse(fs.readFileSync(input, "utf8"));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderReport(metrics, title));
  console.log(`sim report written: ${path.relative(ROOT, output)}`);
}

if (require.main === module) main();

module.exports = { renderReport };

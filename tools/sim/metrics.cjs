#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./hifi-loader.cjs");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = ratio => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0],
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    max: sorted[sorted.length - 1],
    mean: Math.round((sum / sorted.length) * 100) / 100,
  };
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  return map;
}

function profileMetrics(runs) {
  return Object.fromEntries([...groupBy(runs, run => run.profile).entries()].map(([profile, items]) => [
    profile,
    {
      completed: items.filter(run => run.completed).length,
      total: items.length,
      score: quantiles(items.map(run => run.score)),
      money: quantiles(items.map(run => run.resources.money)),
      legitimacy: quantiles(items.map(run => run.resources.legitimacy)),
      blockingIssues: quantiles(items.map(run => run.blockingIssues)),
      subjects: quantiles(items.map(run => run.subjects)),
    },
  ]));
}

function computeMetrics(payload) {
  const runs = payload.runs || [];
  const completed = runs.filter(run => run.completed);
  const failed = runs.filter(run => !run.completed);
  return {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: payload.generatedAt,
    quarters: payload.quarters,
    runCount: runs.length,
    completed: completed.length,
    failed: failed.length,
    completionRate: runs.length ? Math.round((completed.length / runs.length) * 10000) / 100 : 0,
    errors: failed.map(run => ({ player: run.player, profile: run.profile, error: run.error })),
    stability: {
      wars: quantiles(completed.map(run => run.wars)),
      events: quantiles(completed.map(run => run.events)),
      strugglePhaseKinds: [...new Set(completed.flatMap(run => run.strugglePhases || []))].sort(),
    },
    resources: {
      score: quantiles(completed.map(run => run.score)),
      food: quantiles(completed.map(run => run.resources.food)),
      money: quantiles(completed.map(run => run.resources.money)),
      military: quantiles(completed.map(run => run.resources.military)),
      legitimacy: quantiles(completed.map(run => run.resources.legitimacy)),
      moneySpread: quantiles(completed.map(run => Math.round(run.maxMoney - run.minMoney))),
      militarySpread: quantiles(completed.map(run => Math.round(run.maxMilitary - run.minMilitary))),
      zeroLegitimacyRuns: completed.filter(run => run.resources.legitimacy <= 0).length,
      lowLegitimacyRuns: completed.filter(run => run.resources.legitimacy < 30).length,
    },
    activity: {
      issues: quantiles(completed.map(run => run.issues)),
      blockingIssues: quantiles(completed.map(run => run.blockingIssues)),
      treaties: quantiles(completed.map(run => run.treaties)),
      subjects: quantiles(completed.map(run => run.subjects)),
      buildings: quantiles(completed.map(run => run.buildings)),
      techAdoptions: quantiles(completed.map(run => run.techAdoptions)),
      missionsDone: quantiles(completed.map(run => run.missionsDone)),
    },
    profiles: profileMetrics(completed),
    strongest: [...completed].sort((a, b) => b.score - a.score).slice(0, 8)
      .map(run => ({ player: run.player, profile: run.profile, score: run.score, money: run.resources.money, legitimacy: run.resources.legitimacy, wars: run.wars })),
    weakest: [...completed].sort((a, b) => a.score - b.score).slice(0, 8)
      .map(run => ({ player: run.player, profile: run.profile, score: run.score, money: run.resources.money, legitimacy: run.resources.legitimacy, wars: run.wars })),
  };
}

function main() {
  const input = argValue("in", path.join(ROOT, "tools", "sim", "baselines", "latest-run.json"));
  const output = argValue("out", path.join(ROOT, "tools", "sim", "baselines", "latest-metrics.json"));
  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  const metrics = computeMetrics(payload);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`sim metrics written: ${path.relative(ROOT, output)}`);
}

if (require.main === module) main();

module.exports = { computeMetrics, quantiles };

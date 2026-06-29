const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi");
const scripts = path.join(root, "scripts");
const context = { window: {} };
for (const file of [
  "data/rules.js",
  "data/trade.js",
  "engine/world.js",
  "engine/politics.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/trade.js",
  "engine/history.js",
  "engine/strategy.js",
  "engine/turn.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(scripts, file), "utf8"), context);
}

const requiredEngines = [
  "HIFI_POLITICS_ENGINE",
  "HIFI_WARFARE_ENGINE",
  "HIFI_TRADE_ENGINE",
  "HIFI_HISTORY_ENGINE",
  "HIFI_STRATEGY_ENGINE",
];
requiredEngines.forEach(key => assert.ok(context.window[key], `缺少 ${key}`));

assert.equal(Object.keys(context.window.HIFI_TRADE_DATA.routes).length, 10, "必须迁移十条贸易路线");
assert.deepEqual(
  Object.keys(context.window.HIFI_TRADE_DATA.pools).sort(),
  ["north", "orient", "silver", "south", "west"]
);
assert.deepEqual(
  Object.keys(context.window.HIFI_RULES.technologies).sort(),
  [
    "accounting",
    "artillery",
    "bastions",
    "oceanGoingShips",
    "printing",
    "railways",
    "standingArmy",
    "steamEngine",
    "triangleTrade",
  ].sort()
);
assert.equal(context.window.HIFI_HISTORY_ENGINE.eras.length, 6, "必须包含工业纪元");

const politics = context.window.HIFI_POLITICS_ENGINE;
for (const api of ["enactDecision", "holdAssembly", "setInstitution"]) assert.equal(typeof politics[api], "function");
assert.equal(politics.setLaw, undefined, "旧法律入口不应继续导出");
const warfare = context.window.HIFI_WARFARE_ENGINE;
for (const api of [
  "assignGeneral",
  "demobilizeLevies",
  "hireMercenary",
  "mergeArmies",
  "mobilizeArmy",
  "reinforceArmy",
  "renewMercenary",
  "splitArmy",
  "trainArmy",
]) assert.equal(typeof warfare[api], "function", `缺少军团操作 ${api}`);
const history = context.window.HIFI_HISTORY_ENGINE;
for (const api of ["forecast", "missions", "tutorialTask"]) assert.equal(typeof history[api], "function");
assert.equal(typeof context.window.HIFI_STRATEGY_ENGINE.processAI, "function");

const mapSource = fs.readFileSync(path.join(scripts, "ui", "map.js"), "utf8");
for (const mode of [
  "political",
  "terrain",
  "population",
  "goods",
  "trade",
  "religion",
  "dynasty",
  "government",
  "estates",
  "military",
]) assert.match(mapSource, new RegExp(`"${mode}"`), `缺少地图模式 ${mode}`);

const drawers = fs.readFileSync(path.join(scripts, "ui", "drawers.js"), "utf8");
for (const hook of [
  "institution-row",
  "data-assembly",
  "data-decision",
  "data-mobilize",
  "data-hire-mercenary",
  "data-trade-route",
]) assert.ok(drawers.includes(hook), `缺少界面命令 ${hook}`);

console.log("hifi Demo2 parity contract passed");

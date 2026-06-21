// 运行时渲染冒烟：实际执行五个系统抽屉的渲染（含所有 tab），确保 widgets 接线不抛错、产出含可视化标记。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/rules.js", "data/trade.js", "data/countries.js",
  "engine/world.js", "engine/politics.js", "engine/economy.js",
  "engine/diplomacy.js", "engine/warfare.js", "engine/trade.js",
  "engine/history.js", "engine/objectives.js", "engine/proposals.js", "engine/strategy.js", "engine/turn.js",
  "data/codex.js", "ui/widgets.js", "ui/drawers.js",
]) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);

const w = context.window;
const tile = (id, polity, city, x) => ({
  id, x, y: 0, isSea: false, polity, region: city, city, population: 12,
  terrain: "plains", religion: "天主教", good: "grain", control: 85,
  devastation: 0, occupation: 0, buildings: ["market", "fort", "port"],
});
const world = w.HIFI_WORLD_ENGINE.createWorld([
  tile(0, "法兰西王国", "巴黎", 0),
  tile(1, "英格兰王国", "伦敦", 20),
], undefined, "法兰西王国");
w.HIFI_POLITICS_ENGINE.initializePolitics(world);
w.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_WARFARE_ENGINE.initializeWarfare(world);
w.HIFI_HISTORY_ENGINE.initializeHistory(world);
w.HIFI_TRADE_ENGINE.initializeTrade(world);
world.selectedTile = 0; // 选中己方地块，触发建设/整合等分支
w.hifiGame = { store: { getState: () => world }, showToast() {} }; // 浏览器里由 main.js 注入，渲染态需要

const drawers = w.HIFI_DRAWERS;

// 每个系统的每个 tab 都渲染一遍，断言不抛错、返回非空字符串。
const systems = {
  "国家": ["概览", "政制", "议会", "决议"],
  "经济": ["财政", "贸易", "建设"],
  "外交": ["邦交", "条约", "从属"],
  "军事": ["概览", "军团", "战争"],
  "发展": ["概览", "科技"],
};
for (const [system, tabs] of Object.entries(systems)) {
  for (const tab of tabs) {
    drawers.setDrawerTab(`${system}:${tab}`);
    let html;
    assert.doesNotThrow(() => { html = drawers.renderSystem(system, world); }, `${system}·${tab} 渲染不应抛错`);
    assert.ok(html && html.length > 0, `${system}·${tab} 应有内容`);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(html), `${system}·${tab} 不应出现 undefined/NaN/[object Object]`);
  }
}

// 抽查各系统确有可视化基元产出（执行态，而非源码正则）。
drawers.setDrawerTab("国家:概览");
assert.match(drawers.renderSystem("国家", world), /ui-radar-area/, "国家概览应渲染统治者雷达");
drawers.setDrawerTab("国家:政制");
assert.match(drawers.renderSystem("国家", world), /ui-pips/, "政制应渲染改革点阵");
drawers.setDrawerTab("经济:贸易");
const econTrade = drawers.renderSystem("经济", world);
assert.match(econTrade, /ui-radar-area/, "经济贸易应渲染压力雷达");
assert.match(econTrade, /ui-meter-fill/, "经济贸易路线应渲染流量条");
drawers.setDrawerTab("外交:邦交");
assert.match(drawers.renderSystem("外交", world), /ui-dot/, "外交对象应渲染态度色点");
drawers.setDrawerTab("发展:科技");
assert.match(drawers.renderSystem("发展", world), /ui-checklist/, "科技应渲染门槛清单");

console.log("hifi drawers render passed");

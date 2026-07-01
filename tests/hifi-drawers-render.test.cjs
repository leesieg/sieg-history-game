// 运行时渲染冒烟：实际执行五个系统抽屉的渲染（含所有 tab），确保 widgets 接线不抛错、产出含可视化标记。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/techs.js", "data/rules.js", "data/trade.js", "data/countries.js", "data/institutions.js", "data/faiths.js", "data/supranational.js", "data/goods.js",
  "engine/world.js", "engine/politics.js", "engine/economy.js",
  "engine/diplomacy.js", "engine/warfare.js", "engine/trade.js",
  "engine/faith.js", "engine/supranational.js", "engine/history.js", "engine/struggle.js", "engine/objectives.js", "engine/proposals.js", "engine/strategy.js", "engine/turn.js",
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
  tile(2, "巴伐利亚公国", "慕尼黑", 40),
  tile(3, "萨克森选侯国", "莱比锡", 50),
], undefined, "法兰西王国");
w.HIFI_POLITICS_ENGINE.initializePolitics(world);
w.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_WARFARE_ENGINE.initializeWarfare(world);
w.HIFI_HISTORY_ENGINE.initializeHistory(world);
w.HIFI_FAITH_ENGINE.initializeFaith(world);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(world);
w.HIFI_STRUGGLE_ENGINE.initializeStruggles(world);
w.HIFI_TRADE_ENGINE.initializeTrade(world);
world.selectedTile = 0; // 选中己方地块，触发建设/整合等分支
w.hifiGame = { store: { getState: () => world }, showToast() {} }; // 浏览器里由 main.js 注入，渲染态需要

const drawers = w.HIFI_DRAWERS;

// 每个系统的每个 tab 都渲染一遍，断言不抛错、返回非空字符串。
const systems = {
  "国家": ["概览", "政制", "议会", "信仰", "决议"],
  "经济": ["财政", "贸易", "建设"],
  "外交": ["邦交", "条约", "从属", "共主", "帝国"],
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
assert.match(drawers.renderSystem("国家", world), /制度模块/, "政制应渲染制度模块");
assert.match(drawers.renderSystem("国家", world), /institution-row/, "政制应渲染制度模块行");
drawers.setDrawerTab("国家:信仰");
const faithTab = drawers.renderSystem("国家", world);
assert.match(faithTab, /宗教统一/, "国家信仰页应渲染宗教统一");
assert.match(faithTab, /教会财富/, "国家信仰页应渲染教会财富");
assert.match(faithTab, /教产规模/, "国家信仰页应渲染教产规模");
assert.match(faithTab, /宗教权威/, "国家信仰页应渲染宗教权威区");
assert.match(faithTab, /data-faith-authority/, "国家信仰页应提供宗教权威行动入口");
drawers.setDrawerTab("经济:贸易");
const econTrade = drawers.renderSystem("经济", world);
assert.match(econTrade, /ui-radar-area/, "经济贸易应渲染压力雷达");
assert.match(econTrade, /ui-meter-fill/, "经济贸易路线应渲染流量条");
drawers.setDrawerTab("外交:邦交");
assert.match(drawers.renderSystem("外交", world), /ui-dot/, "外交对象应渲染态度色点");
drawers.setDrawerTab("外交:帝国");
assert.match(drawers.renderSystem("外交", world), /神圣罗马帝国/, "外交帝国页应渲染神罗结构");
world.playerPolity = "巴伐利亚公国";
world.diplomacy.selectedTarget = "萨克森选侯国";
w.HIFI_SUPRANATIONAL_ENGINE.structure(world, "hre").authority = 80;
const imperialTab = drawers.renderSystem("外交", world);
assert.match(imperialTab, /征帝国军/, "皇帝视角应提供征帝国军入口");
assert.match(imperialTab, /贿选 萨克森选侯国/, "帝国成员应能对选侯贿选");
assert.match(imperialTab, /教廷认可 萨克森选侯国/, "帝国页应提供教廷认可候选人入口");
world.playerPolity = "法兰西王国";
drawers.setDrawerTab("外交:共主");
assert.match(drawers.renderSystem("外交", world), /共主邦联/, "外交共主页应渲染共主邦联入口");
drawers.setDrawerTab("发展:科技");
assert.match(drawers.renderSystem("发展", world), /ui-checklist/, "科技应渲染门槛清单");

// 军事·战争：作战室已统一到右下角局势浮窗，军事页只留基础战争/议和列表 + 指引
drawers.setDrawerTab("军事:战争");
const warTab = drawers.renderSystem("军事", world);
assert.doesNotMatch(warTab, /war-room/, "作战室应已从军事战争页移除");
assert.match(warTab, /局势浮窗/, "军事战争页应指引到右下角局势浮窗");
console.log("军事·战争页渲染 OK");

console.log("hifi drawers render passed");

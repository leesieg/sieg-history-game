const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const context = { window: {} };
for (const file of [
  "data/rules.js",
  "engine/world.js",
  "engine/economy.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const rules = context.window.HIFI_RULES;
const worldEngine = context.window.HIFI_WORLD_ENGINE;
const economy = context.window.HIFI_ECONOMY_ENGINE;
assert.ok(rules.buildings.market);
assert.ok(rules.technologies.printing);

const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, control: 80, good: "grain", buildings: ["farm", "market"], city: "巴黎", devastation: 0 },
  { id: 2, isSea: false, polity: "法兰西王国", population: 8, control: 55, good: "iron", buildings: ["fort"], city: "", devastation: 60 },
];
const world = worldEngine.createWorld(tiles);
economy.initializeEconomy(world);
const country = world.countries["法兰西王国"];

const healthy = economy.tileOutput(tiles[0], country);
const devastated = economy.tileOutput({ ...tiles[0], devastation: 60 }, country);
assert.ok(healthy.food > devastated.food, "战争破坏必须降低地块产出");
assert.ok(healthy.money > 0, "市场必须产生金钱");

const before = { food: country.food, money: country.money, military: country.military };
const report = economy.settleCountry(world, "法兰西王国");
assert.ok(country.food > before.food);
assert.ok(country.money > before.money);
assert.ok(country.military > before.military);
assert.equal(report.tiles, 2);

country.actionPoints.administrative = 3;
country.money = 100;
economy.constructBuilding(world, "法兰西王国", 2, "market");
assert.ok(tiles[1].buildings.includes("market"));
assert.equal(country.actionPoints.administrative, 2);

country.ideas = 100;
economy.adoptTechnology(world, "法兰西王国", "printing");
assert.equal(country.technology.printing, true);
assert.ok(country.ideas < 100);
assert.ok(country.ageProgress > 0, "采纳科技必须推进时代进度");

economy.setTradePolicy(world, "法兰西王国", "open");
assert.equal(country.tradePolicy, "open");
economy.setAgenda(world, "法兰西王国", "fiscal");
assert.equal(country.agenda, "fiscal");
country.money = 120;
const legitimacyBeforeAgenda = country.legitimacy;
economy.settleCountry(world, "法兰西王国");
assert.equal(country.agenda, null, "完成目标后必须结算并清空议程");
assert.ok(country.legitimacy > legitimacyBeforeAgenda, "完成议程必须获得奖励");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawerSource = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/data/rules.js"), "页面必须加载经济规则");
assert.ok(html.includes("scripts/engine/economy.js"), "页面必须加载经济引擎");
assert.ok(drawerSource.includes("data-trade-policy"), "经济抽屉必须提供贸易政策");
assert.ok(drawerSource.includes("data-edict"), "经济抽屉必须提供敕令");
assert.ok(drawerSource.includes("data-building"), "经济抽屉必须提供地块建设");
assert.ok(drawerSource.includes("data-agenda"), "经济抽屉必须提供国家议程");
assert.ok(drawerSource.includes("data-technology"), "发展抽屉必须提供科技采纳");
assert.ok(mainSource.includes("initializeEconomy"), "入口必须初始化经济状态");
assert.ok(mainSource.includes("constructBuilding"), "入口必须接通建筑操作");

console.log("hifi economy engine passed");

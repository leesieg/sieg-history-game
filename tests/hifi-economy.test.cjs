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
const occupied = economy.tileOutput({ ...tiles[0], occupier: "英格兰王国", occupation: 100 }, country);
assert.deepEqual(
  JSON.parse(JSON.stringify(occupied)),
  { food: 0, money: 0, military: 0 },
  "完全占领的地块不能继续为原政权产出"
);

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

country.actionPoints.administrative = 3;
country.money = 100;
const controlBeforeIntegrate = tiles[1].control;
economy.integrateTile(world, "法兰西王国", 2);
assert.equal(tiles[1].control, controlBeforeIntegrate + 20, "整合必须提升地块控制度");
assert.equal(country.actionPoints.administrative, 2, "整合必须消耗行政点");
tiles[1].control = 100;
assert.throws(() => economy.integrateTile(world, "法兰西王国", 2), /已完全整合/);

country.ideas = 100;
world.turn = (1450 - 1337) * 4 + 1;
country.technologyAwareness.printing = 100;
economy.adoptTechnology(world, "法兰西王国", "printing");
assert.equal(country.technology.printing, true);
assert.ok(country.ideas < 100);
assert.ok(country.ageProgress > 0, "采纳科技必须推进时代进度");

country.actionPoints.administrative = 3;
const foodBeforeEdict = country.food;
economy.enactEdict(world, "法兰西王国", "grainReserve");
assert.ok(country.food > foodBeforeEdict, "敕令必须产生实际资源效果");
assert.equal(country.actionPoints.administrative, 2);

economy.setTradePolicy(world, "法兰西王国", "open");
assert.equal(country.tradePolicy, "open");
const capitalBeforeTrade = country.capital;
economy.setAgenda(world, "法兰西王国", "fiscal");
assert.equal(country.agenda, "fiscal");
country.money = 120;
const legitimacyBeforeAgenda = country.legitimacy;
economy.settleCountry(world, "法兰西王国");
assert.equal(country.agenda, null, "完成目标后必须结算并清空议程");
assert.ok(country.legitimacy > legitimacyBeforeAgenda, "完成议程必须获得奖励");
assert.ok(country.capital > capitalBeforeTrade, "开放贸易必须积累资本");

// 贸易路线投资：点击商路现在有真实后果（流量加成），不再是只写不读的死字段
vm.runInNewContext(fs.readFileSync(path.join(root, "data/trade.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(path.join(root, "engine/trade.js"), "utf8"), context);
const trade = context.window.HIFI_TRADE_ENGINE;
trade.initializeTrade(world);
country.actionPoints.administrative = 2;
country.money = 100;
const boostBefore = world.trade.routes.rhine.boost || 0;
trade.investRoute(world, "法兰西王国", "rhine");
assert.ok((world.trade.routes.rhine.boost || 0) > boostBefore, "投资商路必须提升流量加成");
assert.equal(world.trade.selectedRoute, "rhine", "投资后必须记录选中路线");
assert.throws(() => trade.investRoute(world, "法兰西王国", "maghreb"), /节点/, "无节点的商路必须拒绝投资");

// 王权放大中央从产出流的汲取
const crownWorld = worldEngine.createWorld([
  { id: 1, isSea: false, polity: "法兰西王国", population: 50, control: 100, good: "grain", buildings: ["market"], devastation: 0 },
]);
economy.initializeEconomy(crownWorld);
const crown = crownWorld.countries["法兰西王国"];
const moneyAnchor = crown.money;
crown.government.centralPower = 30;
economy.settleCountry(crownWorld, "法兰西王国");
const lowCrownGain = crown.money - moneyAnchor;
crown.money = moneyAnchor;
crown.government.centralPower = 100;
economy.settleCountry(crownWorld, "法兰西王国");
assert.ok(crown.money - moneyAnchor > lowCrownGain, "王权越高，中央汲取的金钱产出流越多");

// 贸易政策：封闭换取本土产出流加成
crown.government.centralPower = 60;
crown.money = 0; crown.tradePolicy = "normal";
economy.settleCountry(crownWorld, "法兰西王国");
const normalGain = crown.money;
crown.money = 0; crown.tradePolicy = "closed";
economy.settleCountry(crownWorld, "法兰西王国");
assert.ok(crown.money > normalGain, "封闭贸易必须提升本土金钱产出流");

// 资本池消费出口：资本开发地块（贸易流→资本→基底）
crown.capital = 100;
crown.actionPoints.administrative = 2;
const devTile = crownWorld.tiles[0];
const popBeforeDevelop = devTile.population;
economy.developTile(crownWorld, "法兰西王国", devTile.id);
assert.ok(devTile.population > popBeforeDevelop, "资本开发必须提升地块人口（基底）");
assert.equal(crown.capital, 70, "资本开发必须消耗 30 资本");
assert.throws(() => { crown.capital = 5; economy.developTile(crownWorld, "法兰西王国", devTile.id); }, /资本池不足/);

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawerSource = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/data/rules.js"), "页面必须加载经济规则");
assert.ok(html.includes("scripts/engine/economy.js"), "页面必须加载经济引擎");
assert.ok(drawerSource.includes("data-trade-policy"), "经济抽屉必须提供贸易政策");
assert.ok(drawerSource.includes("data-edict"), "经济抽屉必须提供敕令");
assert.ok(drawerSource.includes("data-building"), "经济抽屉必须提供地块建设");
assert.ok(drawerSource.includes("data-develop"), "经济抽屉必须提供资本开发入口");
assert.ok(mainSource.includes("developTile"), "入口必须接通资本开发操作");
assert.ok(drawerSource.includes("data-agenda"), "经济抽屉必须提供国家议程");
assert.ok(drawerSource.includes("data-technology"), "发展抽屉必须提供科技采纳");
assert.ok(mainSource.includes("initializeEconomy"), "入口必须初始化经济状态");
assert.ok(mainSource.includes("constructBuilding"), "入口必须接通建筑操作");
assert.ok(drawerSource.includes("data-integrate"), "国家抽屉必须提供领土整合入口");
assert.ok(mainSource.includes("integrateTile"), "入口必须接通整合操作");
assert.ok(mainSource.includes("investRoute"), "入口必须接通商路投资操作");
assert.ok(mainSource.includes("data-focus-sel") || html.includes("data-focus-sel"), "命令坞/省份按钮必须带聚焦定位");

console.log("hifi economy engine passed");

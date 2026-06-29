const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const context = { window: {} };
for (const file of [
  "data/techs.js",
  "data/goods.js",
  "data/rules.js",
  "engine/world.js",
  "engine/economy.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const rules = context.window.HIFI_RULES;
const worldEngine = context.window.HIFI_WORLD_ENGINE;
const economy = context.window.HIFI_ECONOMY_ENGINE;
context.window.HIFI_DIPLOMACY_ENGINE = {
  embargoBetween(world, a, b) {
    return Boolean((world.diplomacy?.embargoes || []).find(item =>
      item.actor === a && item.target === b
      || item.actor === b && item.target === a
    ));
  },
};
assert.ok(rules.buildings.market);
assert.ok(rules.technologies.printing);
assert.equal(rules.technologies.printing.domain, "cultural");
assert.equal(Object.keys(rules.techDomains).length, 5);
assert.equal(Object.keys(context.window.HIFI_GOODS.goods).length, 30, "经济层必须定义 30 种历史物产");

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
assert.ok(healthy.goods.grain > 0, "谷物地块必须记录具体物产产量");
country.technology.threeFieldSystem = false;
const grainBeforeThreeField = economy.tileOutput(tiles[0], country).food;
country.technology.threeFieldSystem = true;
assert.ok(economy.tileOutput(tiles[0], country).food > grainBeforeThreeField, "三圃制必须实际提高食物产出");
const horseOutput = economy.tileOutput({ ...tiles[0], good: "horses", terrain: "steppe" }, country);
const ironOutput = economy.tileOutput({ ...tiles[0], good: "iron", terrain: "hills" }, country);
assert.ok(horseOutput.goods.horses > 0 && ironOutput.goods.iron > 0, "马和铁必须作为不同物产记录");
assert.ok(horseOutput.market !== ironOutput.market, "马和铁不能再是同一个抽象军事桶");
const minedIron = economy.tileOutput({ ...tiles[0], good: "iron", terrain: "hills", buildings: ["mine"] }, country);
assert.ok(minedIron.goods.iron > ironOutput.goods.iron, "矿场必须提高金属物产产量");
const stableHorse = economy.tileOutput({ ...tiles[0], good: "horses", terrain: "steppe", buildings: ["stable"] }, country);
assert.ok(stableHorse.goods.horses > horseOutput.goods.horses, "马场必须提高马匹物产产量");
const vineyardWine = economy.tileOutput({ ...tiles[0], good: "wine", terrain: "plains", climate: "mediterranean", buildings: ["vineyard"] }, country);
const plainWine = economy.tileOutput({ ...tiles[0], good: "wine", terrain: "plains", climate: "mediterranean", buildings: [] }, country);
assert.ok(vineyardWine.goods.wine > plainWine.goods.wine, "葡萄园必须提高葡萄酒产量");
const occupied = economy.tileOutput({ ...tiles[0], occupier: "英格兰王国", occupation: 100 }, country);
assert.deepEqual(
  JSON.parse(JSON.stringify(occupied)),
  { food: 0, money: 0, military: 0 },
  "完全占领的地块不能继续为原政权产出"
);

// 财政制度模块必须直接影响产出流，不再只是政体展示字段
country.government.institutions = { fiscal: "demesne" };
const demesneMoney = economy.tileOutput(tiles[0], country).money;
country.government.institutions.fiscal = "direct";
assert.ok(economy.tileOutput(tiles[0], country).money > demesneMoney, "直接征税财政制度必须提高金钱产出");
country.government.institutions.fiscal = "nomadic";
assert.ok(economy.tileOutput(tiles[0], country).food < healthy.food, "游牧无税必须压低定居粮食产出");
assert.ok(economy.tileOutput(tiles[0], country).money < demesneMoney, "游牧无税必须压低定居金钱产出");
country.government.institutions = null;

const before = { food: country.food, money: country.money, military: country.military };
const report = economy.settleCountry(world, "法兰西王国");
assert.ok(country.food > before.food);
assert.ok(report.market > 0, "结算报告必须记录物产市场价值");
assert.ok(report.goods.grain > 0 && report.goods.iron > 0, "结算报告必须记录国家物产访问");
assert.equal(country.hasHorseSource, false, "没有马匹地块时不能拥有马匹来源");
// 结算已扣建筑维护费：money 账面变化应等于产出净额（可能小于产出本身），而非简单大于赛前值
assert.equal(country.money - before.money, report.money - report.maintenance.money,
  "money 账面变化应等于产出减建筑维护");
assert.ok(country.military > before.military);
assert.equal(report.tiles, 2);

const accessWorld = worldEngine.createWorld([
  { id: 20, isSea: false, polity: "买马国", population: 8, control: 80, good: "grain", terrain: "plains", buildings: [], city: "买方", devastation: 0 },
  { id: 21, isSea: false, polity: "产马国", population: 8, control: 80, good: "horses", terrain: "steppe", buildings: [], city: "马市", devastation: 0 },
], {}, "买马国");
accessWorld.diplomacy = { embargoes: [] };
economy.initializeEconomy(accessWorld);
economy.settleCountry(accessWorld, "产马国");
assert.equal(economy.hasGoodAccess(accessWorld, "买马国", "horses"), true, "可贸易来源必须提供马匹访问");
accessWorld.diplomacy.embargoes.push({ actor: "产马国", target: "买马国" });
assert.equal(economy.hasGoodAccess(accessWorld, "买马国", "horses"), false, "禁运必须切断贸易马源");

const churchLandWorld = worldEngine.createWorld([
  { id: 40, isSea: false, polity: "教产测试国", population: 20, control: 100, good: "grain", terrain: "plains", climate: "temperate", buildings: ["market"], city: "主教座堂城", devastation: 0, churchLandShare: 0.2 },
]);
economy.initializeEconomy(churchLandWorld);
const churchLandCountry = churchLandWorld.countries["教产测试国"];
churchLandCountry.faith = { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false, churchWealth: 0 };
const churchOutput = economy.tileOutput(churchLandWorld.tiles[0], churchLandCountry);
assert.ok(churchOutput.church > 0, "教会地产必须从地块金钱产出中分流");
const churchMoneyBefore = churchLandCountry.money;
const churchReport = economy.settleCountry(churchLandWorld, "教产测试国");
assert.ok(churchReport.church > 0, "结算报告必须记录教会地产收入");
assert.equal(churchLandCountry.faith.churchWealth, churchReport.church, "教会地产收入必须进入教会财富池");
assert.equal(churchLandCountry.money - churchMoneyBefore, churchReport.money - churchReport.maintenance.money,
  "国家金钱净额不应包含已分给教会的地产收入");
churchLandCountry.faith.secularized = true;
const secularOutput = economy.tileOutput(churchLandWorld.tiles[0], churchLandCountry);
assert.equal(secularOutput.church, 0, "世俗化后教会地产不应继续分流收入");
assert.ok(secularOutput.money > churchOutput.money, "世俗化后原教产收入应回到国家金钱流");

country.actionPoints.administrative = 3;
country.money = 100;
economy.constructBuilding(world, "法兰西王国", 2, "market");
assert.ok(tiles[1].buildings.includes("market"));
assert.equal(country.actionPoints.administrative, 2);
assert.throws(() => economy.constructBuilding(world, "法兰西王国", 2, "stable"), /不适合/, "马场不能建在铁矿地块");
assert.deepEqual(
  economy.canConstructBuilding(world, "法兰西王国", 2, "stable"),
  { ok: false, reason: "该建筑不适合当前物产" },
  "可建性判断必须和真实建设规则同口径"
);
assert.equal(economy.canConstructBuilding(world, "法兰西王国", 2, "mine").ok, true, "铁矿地块必须允许矿场");
economy.constructBuilding(world, "法兰西王国", 2, "mine");
assert.ok(tiles[1].buildings.includes("mine"), "铁矿地块必须允许建设矿场");
assert.equal(country.actionPoints.administrative, 1);

// 粮食赤字连续发生时，人口必须缓慢真减员，而不是只扣抽象粮仓。
const famineTiles = [
  { id: 10, isSea: false, polity: "饥荒测试国", population: 10, basePopulation: 10, control: 80, good: "cloth", terrain: "plains", climate: "temperate", buildings: [], city: "测试城", devastation: 0 },
];
const famineWorld = worldEngine.createWorld(famineTiles, {}, "饥荒测试国");
economy.initializeEconomy(famineWorld);
const famineCountry = famineWorld.countries["饥荒测试国"];
famineCountry.food = 0;
economy.settleCountry(famineWorld, "饥荒测试国");
const popBeforeFamine = famineTiles[0].population;
economy.settleCountry(famineWorld, "饥荒测试国");
assert.ok(famineTiles[0].population < popBeforeFamine, "连续粮食赤字必须造成 POP 缓慢减员");

country.actionPoints.administrative = 3;
country.money = 100;
const controlBeforeIntegrate = tiles[1].control;
economy.integrateTile(world, "法兰西王国", 2);
assert.equal(tiles[1].control, controlBeforeIntegrate + economy.integrationGain(country), "整合必须按制度能力提升地块控制度");
assert.equal(country.actionPoints.administrative, 2, "整合必须消耗行政点");
tiles[1].control = 100;
assert.throws(() => economy.integrateTile(world, "法兰西王国", 2), /已完全整合/);

country.ideas = 100;
world.turn = (1450 - 1337) * 4 + 1;
country.technologyAwareness.printing = 100;
country.technology.universities = true;
economy.adoptTechnology(world, "法兰西王国", "printing");
assert.equal(country.technology.printing, true);
assert.ok(country.ideas < 100);
assert.ok(country.ageProgress > 0, "采纳科技必须推进时代进度");

country.technology.accounting = false;
country.technology.codifiedLaw = false;
country.technology.threeFieldSystem = true;
country.technologyAwareness.accounting = 100;
country.research.economic = 100;
world.turn = (1400 - 1337) * 4 + 1;
assert.throws(() => economy.adoptTechnology(world, "法兰西王国", "accounting"), /成文法典/, "科技树前置必须生效");
country.technology.codifiedLaw = true;
const discountedAccounting = economy.effectiveTechnologyCost(country, "accounting");
assert.ok(discountedAccounting < rules.technologies.accounting.cost, "传播度必须降低科技有效成本，形成追赶机制");
assert.ok(economy.frontierTechnologies(world, country, "economic").some(item => item.key === "accounting"), "前置满足后科技必须进入经济领域前沿");
economy.adoptTechnology(world, "法兰西王国", "accounting");
assert.equal(country.technology.accounting, true);
assert.equal(country.unlockedInstitutions.fiscal.direct, true, "复式记账必须解锁直接征税财政制度能力");
assert.ok(country.research.economic < 100, "经济科技必须消耗经济领域研究");

world.turn = (1550 - 1337) * 4 + 1;
Object.assign(country.technology, { artillery: true, accounting: true, standingArmy: false });
country.technologyAwareness.standingArmy = 100;
country.research.military = 100;
economy.adoptTechnology(world, "法兰西王国", "standingArmy");
assert.equal(country.unlockedInstitutions.military.standing_army, true, "常备军操典必须解锁常备军制度能力");

const industryTile = { ...tiles[0], good: "cloth", buildings: ["workshop"], terrain: "plains", climate: "temperate" };
country.technology.watermills = false;
const workshopBeforeWatermills = economy.tileOutput(industryTile, country).money;
country.technology.watermills = true;
assert.ok(economy.tileOutput(industryTile, country).money > workshopBeforeWatermills, "水力工坊必须提高工坊产出");
country.technology.steamEngine = false;
const workshopBeforeSteam = economy.tileOutput(industryTile, country).money;
country.technology.steamEngine = true;
assert.ok(economy.tileOutput(industryTile, country).money > workshopBeforeSteam, "蒸汽动力必须提高工坊产出");
country.technology.railways = true;
assert.ok(economy.tileOutput(industryTile, country).military > economy.tileOutput({ ...industryTile, buildings: [] }, country).military, "铁路时代的工坊与陆上连接必须继续回灌产出");

country.technology.billsOfExchange = false;
country.technology.jointStockCompanies = false;
const capitalRateBase = economy.tradeCapitalRate(country);
country.technology.billsOfExchange = true;
assert.ok(economy.tradeCapitalRate(country) > capitalRateBase, "银行汇票必须提高贸易资本沉淀率");
country.technology.jointStockCompanies = true;
assert.ok(economy.tradeCapitalRate(country) > capitalRateBase + .06, "股份公司必须继续提高资本沉淀率");

country.technology.bureaucracy = false;
country.technology.constitutionalism = false;
const gainBeforeBureaucracy = economy.integrationGain(country);
country.technology.bureaucracy = true;
assert.ok(economy.integrationGain(country) > gainBeforeBureaucracy, "官僚体系必须提高领土整合效率");

const autoTechWorld = worldEngine.createWorld([
  { id: 30, isSea: false, polity: "自动科研国", population: 10, control: 100, good: "grain", buildings: [], city: "学城", devastation: 0 },
]);
economy.initializeEconomy(autoTechWorld);
const autoCountry = autoTechWorld.countries["自动科研国"];
autoCountry.research.administrative = 30;
const autoAdopted = economy.autoAdoptReadyTechnologies(autoTechWorld, "自动科研国");
assert.ok(autoAdopted.includes("成文法典"), "唯一满足条件的领域前沿科技应可自动采纳");
assert.equal(autoCountry.technology.codifiedLaw, true);
assert.equal(autoCountry.technology.universities, true, "文化领域初始研究满足时也应自动采纳唯一前沿");

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
// 推导本季结算会让 money 净变化多少，从而反推出"结算后恰好打到门槛"所需的赛前 money。
// settleCountry 在 money 写回之后才检查 country[agenda.target] >= agenda.threshold，
// 因此门槛判定用的是净额（产出 - 维护 [+ 开放贸易加成]）落地后的余额，而非产出本身。
// 此处 world 从未设置 world.warfare，armyMaintenance 恒为 0，唯一的维护扣减来自建筑维护。
const fiscalThreshold = rules.agendas.fiscal.threshold;
const territoryBeforeAgenda = worldEngine.controlledTiles(world, "法兰西王国");
const moneyOutputBeforeAgenda = territoryBeforeAgenda.reduce(
  (sum, tile) => sum + economy.tileOutput(tile, country).money, 0
);
const centralBeforeAgenda = .9 + Math.min(100, country.government?.centralPower ?? 60) / 500;
const domesticMoneyBeforeAgenda = country.tradePolicy === "closed"
  ? moneyOutputBeforeAgenda * 1.05
  : moneyOutputBeforeAgenda;
const moneyProdBeforeAgenda = Math.round(domesticMoneyBeforeAgenda * centralBeforeAgenda);
const buildingMaintenanceBeforeAgenda = economy.buildingMaintenance(world, "法兰西王国");
const tradeBonusBeforeAgenda = country.tradePolicy === "open"
  ? Math.max(2, Math.round(territoryBeforeAgenda.reduce(
    (sum, tile) => sum + economy.tileOutput(tile, country).market,
    0
  ) * economy.marketSplit(country).trade * .48))
  : 0;
const netMoneyChange = moneyProdBeforeAgenda - buildingMaintenanceBeforeAgenda + tradeBonusBeforeAgenda;
// 赛前 money = 门槛 - 本季净变化，使结算后 money 恰好等于门槛（边界值，而非留宽松余量）
const requiredMoney = fiscalThreshold - netMoneyChange;
country.money = requiredMoney;
const legitimacyBeforeAgenda = country.legitimacy;
economy.settleCountry(world, "法兰西王国");
assert.equal(country.money, fiscalThreshold, "结算后 money 应恰好落在议程门槛上（边界值）");
assert.equal(country.agenda, null, "完成目标后必须结算并清空议程");
assert.ok(country.legitimacy > legitimacyBeforeAgenda, "完成议程必须获得奖励");

// 边界负例：赛前少 1 金钱，结算后净额差一点未达门槛，议程不应完成
economy.setAgenda(world, "法兰西王国", "fiscal");
country.money = requiredMoney - 1;
const legitimacyBeforeAgendaMiss = country.legitimacy;
economy.settleCountry(world, "法兰西王国");
assert.equal(country.agenda, "fiscal", "未达门槛时议程不应被清空");
assert.equal(country.legitimacy, legitimacyBeforeAgendaMiss, "未完成议程不应发放奖励");
country.agenda = null;
assert.ok(country.capital > capitalBeforeTrade, "开放贸易必须积累资本");

// 商业关税财政制度必须放大开放贸易收益，而不是只改地块显示名
const tradeWorld = worldEngine.createWorld([
  { id: 11, isSea: false, polity: "威尼斯共和国", population: 20, control: 100, good: "fish", buildings: ["market", "port"], city: "威尼斯", devastation: 0 },
]);
economy.initializeEconomy(tradeWorld);
tradeWorld.diplomacy = { embargoes: [] };
const venice = tradeWorld.countries["威尼斯共和国"];
venice.tradePolicy = "open";
venice.government.institutions = { fiscal: "demesne" };
economy.settleCountry(tradeWorld, "威尼斯共和国");
const demesneTrade = venice.lastReport.trade;
venice.money = 0;
venice.capital = 0;
venice.government.institutions.fiscal = "commercial";
economy.settleCountry(tradeWorld, "威尼斯共和国");
assert.ok(venice.lastReport.trade > demesneTrade, "商业关税必须提高开放贸易收益");
assert.equal(venice.lastReport.marketSplit.trade, .4, "商业财政制度必须提高市场外贸占比");

const embargoWorld = worldEngine.createWorld([
  { id: 21, isSea: false, polity: "威尼斯共和国", population: 80, control: 100, good: "spices", terrain: "coast", climate: "mediterranean", buildings: ["market", "port"], city: "威尼斯", devastation: 0 },
]);
economy.initializeEconomy(embargoWorld);
embargoWorld.diplomacy = { embargoes: [] };
const embargoVenice = embargoWorld.countries["威尼斯共和国"];
embargoVenice.tradePolicy = "open";
economy.settleCountry(embargoWorld, "威尼斯共和国");
const tradeWithoutEmbargo = embargoVenice.lastReport.trade;
embargoVenice.money = 0;
embargoVenice.capital = 0;
embargoWorld.diplomacy.embargoes.push({ actor: "热那亚共和国", target: "威尼斯共和国", startedTurn: 1 });
economy.settleCountry(embargoWorld, "威尼斯共和国");
assert.ok(embargoVenice.lastReport.trade < tradeWithoutEmbargo, "被禁运必须降低开放贸易收益");
assert.equal(embargoVenice.lastReport.marketEmbargoPenalty, .2, "单个禁运应产生 20% 市场外贸损耗");

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

// 物价指数推升名义金钱产出流
crown.priceIndex = 1;
const moneyParPrice = economy.tileOutput(devTile, crown).money;
crown.priceIndex = 1.5;
assert.ok(economy.tileOutput(devTile, crown).money > moneyParPrice, "物价指数必须推升名义金钱产出流");
// 军事制度提高军需产出；旧军事改革槽不再暗中放大产出流
crown.priceIndex = 1;
crown.government.institutions = { military: "feudal_levy" };
const feudalMilitaryOutput = economy.tileOutput(devTile, crown).military;
crown.government.institutions.military = "standing_army";
assert.ok(economy.tileOutput(devTile, crown).military > feudalMilitaryOutput, "常备军制度必须提高军需产出流");

// 殖民收入流（探索里程碑）
crown.exploration = { colonial: true };
crown.money = 0;
economy.settleCountry(crownWorld, "法兰西王国");
const withColonial = crown.money;
crown.exploration.colonial = false;
crown.money = 0;
economy.settleCountry(crownWorld, "法兰西王国");
assert.ok(withColonial > crown.money, "殖民收入流必须增加每季结算收入");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawerSource = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/data/rules.js"), "页面必须加载经济规则");
assert.ok(html.includes("scripts/engine/economy.js"), "页面必须加载经济引擎");
assert.ok(drawerSource.includes("data-trade-policy"), "经济抽屉必须提供贸易政策");
assert.ok(drawerSource.includes("data-edict"), "经济抽屉必须提供敕令");
assert.ok(drawerSource.includes("data-building"), "经济抽屉必须提供地块建设");
assert.ok(drawerSource.includes("canConstructBuilding"), "经济抽屉必须使用引擎可建性判断禁用不适配建筑");
assert.ok(drawerSource.includes("check.reason"), "不适配建筑必须在按钮副标题展示原因");
assert.ok(drawerSource.includes("data-develop"), "经济抽屉必须提供资本开发入口");
assert.ok(drawerSource.includes("estate-pie") && drawerSource.includes("estatePie"), "议会必须展示阶层权力饼图");
assert.ok(mainSource.includes("developTile"), "入口必须接通资本开发操作");
assert.ok(drawerSource.includes("data-agenda"), "经济抽屉必须提供国家议程");
assert.ok(drawerSource.includes("data-technology"), "发展抽屉必须提供科技采纳");
assert.ok(mainSource.includes("initializeEconomy"), "入口必须初始化经济状态");
assert.ok(mainSource.includes("constructBuilding"), "入口必须接通建筑操作");
assert.ok(drawerSource.includes("data-integrate"), "国家抽屉必须提供领土整合入口");
assert.ok(mainSource.includes("integrateTile"), "入口必须接通整合操作");
assert.ok(mainSource.includes("investRoute"), "入口必须接通商路投资操作");
const mapSourceEcon = fs.readFileSync(path.join(root, "ui", "map.js"), "utf8");
assert.ok(mapSourceEcon.includes("data-focus-sel") || mainSource.includes("data-focus-sel"), "地块动作按钮必须带聚焦定位");

// --- Task A1: 维护费纯函数 ---
{
  const maintWorld = worldEngine.createWorld([
    { id: 1, isSea: false, polity: "法兰西王国", population: 12, control: 80, good: "grain", buildings: ["farm", "market"], city: "巴黎", devastation: 0 },
    { id: 2, isSea: false, polity: "法兰西王国", population: 8, control: 55, good: "iron", buildings: ["fort"], city: "", devastation: 0 },
  ]);
  economy.initializeEconomy(maintWorld);
  const polity = maintWorld.playerPolity;
  maintWorld.warfare = { armies: {} };
  // 造一支 3000 兵的常备军
  maintWorld.warfare.armies["test-army"] = {
    id: "test-army", owner: polity,
    units: [{ combatType: "infantry", serviceType: "standing", soldiers: 3000 }],
  };
  const am = economy.armyMaintenance(maintWorld, polity);
  assert.ok(am.food > 0, "常备军应产生粮食维护");
  assert.ok(am.military > 0, "常备军应产生军需维护");

  // 征召兵军需维护低于常备军
  maintWorld.warfare.armies["levy-army"] = {
    id: "levy-army", owner: polity,
    units: [{ combatType: "infantry", serviceType: "levy", soldiers: 3000 }],
  };
  // 简化断言：常备军单位的军需维护系数 > 征召兵
  assert.ok(economy.MAINTENANCE.military.standing > economy.MAINTENANCE.military.levy,
    "常备军军需维护系数应高于征召兵");

  // 建筑维护：给首都地块加 2 栋建筑
  const maintTiles = maintWorld.tiles.filter(t => t.polity === polity && !t.isSea);
  maintTiles[0].buildings = ["market", "fort"];
  const bm = economy.buildingMaintenance(maintWorld, polity);
  assert.ok(bm > 0, "建筑应产生金钱维护");
  console.log("A1 维护费纯函数 OK");
}

// --- Task A2: settleCountry 扣维护 ---
{
  const settleWorld = worldEngine.createWorld([
    { id: 1, isSea: false, polity: "法兰西王国", population: 12, control: 80, good: "grain", buildings: ["farm", "market"], city: "巴黎", devastation: 0 },
    { id: 2, isSea: false, polity: "法兰西王国", population: 8, control: 55, good: "iron", buildings: ["fort"], city: "", devastation: 0 },
  ]);
  economy.initializeEconomy(settleWorld);
  const polity = settleWorld.playerPolity;
  settleWorld.warfare = { armies: {} };
  settleWorld.warfare.armies["big"] = {
    id: "big", owner: polity,
    units: [{ combatType: "infantry", serviceType: "standing", soldiers: 20000 }],
  };
  const before = { ...settleWorld.countries[polity] };
  const report = economy.settleCountry(settleWorld, polity);
  assert.ok(report.maintenance, "report 应含 maintenance 段");
  assert.ok(report.maintenance.food > 0 && report.maintenance.military > 0, "大军应有粮/军需维护");
  // 净额 = 产出 - 维护，账面变化应反映扣减
  const foodDelta = settleWorld.countries[polity].food - before.food;
  assert.equal(foodDelta, report.food - report.maintenance.food,
    "粮食账面变化应等于产出减维护");
  console.log("A2 settleCountry 扣维护 OK");
}

console.log("hifi economy engine passed");

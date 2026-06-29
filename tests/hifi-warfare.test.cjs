const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/goods.js",
  "data/rules.js",
  "data/trade.js",
  "engine/world.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/trade.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const economy = context.window.HIFI_ECONOMY_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const warfare = context.window.HIFI_WARFARE_ENGINE;
const trade = context.window.HIFI_TRADE_ENGINE;
const tiles = [
  { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
  { id: 1, isSea: false, polity: "法兰西王国", population: 8, buildings: [], city: "", terrain: "forest", x: 30, y: 10, control: 70, devastation: 0 },
  { id: 2, isSea: false, polity: "英格兰王国", population: 10, buildings: ["fort"], city: "加来", terrain: "plains", x: 50, y: 10, control: 70, devastation: 0 },
  { id: 3, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 30, y: 30, control: 0 },
];
const world = worldEngine.createWorld(tiles);
diplomacy.initializeDiplomacy(world);
warfare.initializeWarfare(world);
assert.ok(Object.keys(world.warfare.armies).length >= 2, "开局必须生成历史对峙军团");
assert.ok(world.diplomacy.wars.length >= 1, "开局必须生成历史战争");
assert.equal(world.countries["英格兰王国"].reputation, 60, "历史开局战争应有宣称，不应误扣声誉");
world.diplomacy.wars = [];
economy.initializeEconomy(world);

const frenchArmy = warfare.createArmy(world, {
  owner: "法兰西王国",
  tileId: 0,
  name: "王室军团",
  units: [
    { combatType: "infantry", serviceType: "levy", soldiers: 3000 },
    { combatType: "cavalry", serviceType: "guard", soldiers: 800 },
  ],
});
const englishArmy = warfare.createArmy(world, {
  owner: "英格兰王国",
  tileId: 2,
  name: "英格兰远征军",
  units: [{ combatType: "infantry", serviceType: "professional", soldiers: 2600 }],
});
assert.equal(warfare.armyTotalSoldiers(frenchArmy), 3800);
assert.equal(warfare.canRecruitCombatType(world, "法兰西王国", "artillery"), false);
assert.equal(warfare.canRecruitCombatType(world, "法兰西王国", "cavalry"), false, "无马匹来源时不能动员骑兵");
tiles[1].good = "horses";
world.countries["法兰西王国"].hasHorseSource = true;
assert.equal(warfare.canRecruitCombatType(world, "法兰西王国", "cavalry"), true, "拥有马匹来源后可以动员骑兵");

const horseTradeWorld = worldEngine.createWorld([
  { id: 20, isSea: false, polity: "法兰西王国", population: 8, buildings: [], city: "巴黎", terrain: "plains", good: "grain", x: 0, y: 0, control: 80, devastation: 0 },
  { id: 21, isSea: false, polity: "英格兰王国", population: 8, buildings: [], city: "约克", terrain: "steppe", good: "horses", x: 20, y: 0, control: 80, devastation: 0 },
]);
diplomacy.initializeDiplomacy(horseTradeWorld);
warfare.initializeWarfare(horseTradeWorld);
horseTradeWorld.diplomacy.wars = [];
economy.initializeEconomy(horseTradeWorld);
economy.settleCountry(horseTradeWorld, "英格兰王国");
assert.equal(warfare.canRecruitCombatType(horseTradeWorld, "法兰西王国", "cavalry"), true, "贸易马源必须允许动员骑兵");
horseTradeWorld.countries["英格兰王国"].actionPoints.diplomatic = 2;
diplomacy.imposeEmbargo(horseTradeWorld, "英格兰王国", "法兰西王国");
assert.equal(warfare.canRecruitCombatType(horseTradeWorld, "法兰西王国", "cavalry"), false, "被产马国禁运后不能继续动员骑兵");

const navalTiles = [
  { id: 10, isSea: false, polity: "威尼斯共和国", population: 10, buildings: ["port"], city: "威尼斯", terrain: "coast", good: "naval_supplies", x: 0, y: 0, control: 90, devastation: 0 },
  { id: 11, isSea: false, polity: "威尼斯共和国", population: 6, buildings: [], city: "", terrain: "forest", good: "timber", x: 0, y: 10, control: 80, devastation: 0 },
  { id: 12, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 10, y: 0, control: 0 },
  { id: 13, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 25, y: 0, control: 0 },
  { id: 14, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 40, y: 0, control: 0 },
];
const navalWorld = worldEngine.createWorld(navalTiles, {}, "威尼斯共和国");
diplomacy.initializeDiplomacy(navalWorld);
warfare.initializeWarfare(navalWorld);
economy.initializeEconomy(navalWorld);
navalWorld.countries["威尼斯共和国"].money = 200;
navalWorld.countries["威尼斯共和国"].military = 100;
assert.deepEqual(Object.keys(warfare.shipTypes).sort(), ["carrack", "cog", "frigate", "galleon", "galley", "shipOfLine"], "海军系统必须实现 6 类历史舰种");
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "galley").ok, true, "港口国家有木材时可建基础舰队");
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "carrack").ok, false, "卡拉克必须先有远洋帆装");
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "galleon").ok, false, "盖伦船必须先有跨洋贸易体系");
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "frigate").ok, false, "护卫舰必须先有风帆战列舰科技");
navalWorld.countries["威尼斯共和国"].technology.oceanGoingShips = true;
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "carrack").ok, true, "远洋帆装应解锁卡拉克");
navalWorld.countries["威尼斯共和国"].technology.triangleTrade = true;
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "galleon").ok, true, "跨洋贸易体系应解锁盖伦船");
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "shipOfLine").ok, false, "风帆战列舰必须先有对应科技");
navalWorld.countries["威尼斯共和国"].technology.shipOfLine = true;
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "shipOfLine").ok, true, "风帆战列舰科技必须解锁战列舰舰种");
assert.equal(warfare.canBuildShipType(navalWorld, "威尼斯共和国", "frigate").ok, true, "风帆战列舰科技必须解锁护卫舰");
const fleet = warfare.buildFleet(navalWorld, "威尼斯共和国", 10, "galley");
assert.equal(fleet.tileId, 12, "舰队必须生成在港口附近海域");
assert.equal(warfare.fleetTotalShips(fleet), 4);
const galleonFleet = warfare.buildFleet(navalWorld, "威尼斯共和国", 10, "galleon");
assert.equal(galleonFleet.units[0].ships, 2, "盖伦船队应按大型舰船数量生成");
navalWorld.countries["威尼斯共和国"].actionPoints.military = 2;
const fleetPowerWithoutAdmiral = warfare.navalPower(navalWorld, [fleet.id], navalTiles[2]);
const admiral = warfare.recruitAdmiral(navalWorld, "威尼斯共和国");
assert.equal(admiral.type, "admiral", "海军将领必须标记为 admiral");
assert.equal(navalWorld.countries["威尼斯共和国"].actionPoints.military, 1, "招募海军将领应消耗军事点");
warfare.assignAdmiral(navalWorld, fleet.id, admiral.id);
assert.equal(fleet.admiralId, admiral.id, "舰队应能任命海军将领");
assert.ok(warfare.navalPower(navalWorld, [fleet.id], navalTiles[2]) > fleetPowerWithoutAdmiral, "海军将领指挥力必须提高舰队制海权");
const admiralArmy = warfare.createArmy(navalWorld, {
  owner: "威尼斯共和国",
  tileId: 10,
  name: "海军将领误任陆军测试",
  units: [{ combatType: "infantry", serviceType: "levy", soldiers: 300 }],
});
assert.throws(() => warfare.assignGeneral(navalWorld, admiralArmy.id, admiral.id), /海军将领不能指挥陆军/, "海军将领不能指挥陆军");
assert.deepEqual(warfare.planFleetRoute(navalWorld, fleet.id, 14), [13, 14], "舰队必须沿海域邻接寻路");
warfare.executeNavalMovementPhase(navalWorld);
assert.equal(fleet.tileId, 13, "舰队每季度移动一格海域");
warfare.executeNavalMovementPhase(navalWorld);
assert.equal(fleet.tileId, 14);

const amphibiousTiles = [
  { id: 30, isSea: false, polity: "威尼斯共和国", population: 10, buildings: ["port"], city: "威尼斯", terrain: "coast", good: "timber", x: 0, y: 0, control: 90, devastation: 0 },
  { id: 31, isSea: false, polity: "热那亚共和国", population: 9, buildings: ["port"], city: "热那亚", terrain: "coast", good: "naval_supplies", x: 40, y: 0, control: 85, devastation: 0 },
  { id: 32, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 10, y: 0, control: 0 },
  { id: 33, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 30, y: 0, control: 0 },
];
const amphibiousWorld = worldEngine.createWorld(amphibiousTiles, {}, "威尼斯共和国");
diplomacy.initializeDiplomacy(amphibiousWorld);
warfare.initializeWarfare(amphibiousWorld);
amphibiousWorld.diplomacy.wars = [];
const transportFleet = warfare.createFleet(amphibiousWorld, {
  owner: "威尼斯共和国",
  tileId: 32,
  name: "亚得里亚运输舰队",
  units: [{ shipType: "galley", ships: 4 }],
});
const landingArmy = warfare.createArmy(amphibiousWorld, {
  owner: "威尼斯共和国",
  tileId: 30,
  name: "登陆军团",
  units: [{ combatType: "infantry", serviceType: "professional", soldiers: 1200 }],
});
const oversizedArmy = warfare.createArmy(amphibiousWorld, {
  owner: "威尼斯共和国",
  tileId: 30,
  name: "超载测试军团",
  units: [{ combatType: "infantry", serviceType: "levy", soldiers: 3000 }],
});
assert.equal(warfare.fleetTransportCapacity(transportFleet), 2000, "舰队运载容量应由舰种和舰船数决定");
assert.throws(() => warfare.embarkArmy(amphibiousWorld, oversizedArmy.id, transportFleet.id), /运载容量/, "舰队不能超载运兵");
delete amphibiousWorld.warfare.armies[oversizedArmy.id];
warfare.embarkArmy(amphibiousWorld, landingArmy.id, transportFleet.id);
assert.equal(landingArmy.status, "embarked", "军团应能从相邻海岸登上本国舰队");
assert.equal(warfare.fleetTransportLoad(amphibiousWorld, transportFleet.id), 1200, "舰队应记录已装载兵力");
warfare.planFleetRoute(amphibiousWorld, transportFleet.id, 33);
warfare.executeNavalMovementPhase(amphibiousWorld);
assert.equal(transportFleet.tileId, 33, "运输舰队应能把登船军团带到目标海域");
warfare.declareWar(amphibiousWorld, "威尼斯共和国", "热那亚共和国", 31, "利古里亚登陆战");
warfare.disembarkArmy(amphibiousWorld, landingArmy.id, 31);
assert.equal(landingArmy.status, "ready", "军团应能在交战敌岸登陆");
assert.equal(landingArmy.tileId, 31, "登陆后军团位置必须变为目标陆地");
warfare.advanceOccupation(amphibiousWorld, landingArmy.id);
assert.equal(amphibiousTiles[1].occupier, "威尼斯共和国", "登陆军团应能继续执行占领");

const interceptionWorld = worldEngine.createWorld([
  { id: 70, isSea: false, polity: "威尼斯共和国", population: 10, buildings: ["port"], city: "威尼斯", terrain: "coast", good: "timber", x: 0, y: 0, control: 90, devastation: 0 },
  { id: 71, isSea: false, polity: "热那亚共和国", population: 9, buildings: ["port"], city: "热那亚", terrain: "coast", good: "naval_supplies", x: 40, y: 0, control: 85, devastation: 0 },
  { id: 72, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 20, y: 0, control: 0 },
], {}, "威尼斯共和国");
diplomacy.initializeDiplomacy(interceptionWorld);
warfare.initializeWarfare(interceptionWorld);
interceptionWorld.diplomacy.wars = [];
const weakTransportFleet = warfare.createFleet(interceptionWorld, {
  owner: "威尼斯共和国",
  tileId: 72,
  name: "弱运输舰队",
  units: [{ shipType: "cog", ships: 2 }],
});
const transportedArmy = warfare.createArmy(interceptionWorld, {
  owner: "威尼斯共和国",
  tileId: 70,
  name: "被拦截登陆军",
  units: [{ combatType: "infantry", serviceType: "professional", soldiers: 1000 }],
});
warfare.embarkArmy(interceptionWorld, transportedArmy.id, weakTransportFleet.id);
warfare.createFleet(interceptionWorld, {
  owner: "热那亚共和国",
  tileId: 72,
  name: "拦截舰队",
  units: [{ shipType: "galley", ships: 8 }],
});
warfare.declareWar(interceptionWorld, "威尼斯共和国", "热那亚共和国", 71, "运输拦截测试", "plunder");
warfare.processWarfare(interceptionWorld);
assert.ok(transportedArmy.units[0].soldiers < 1000, "运输舰队被拦截败退时，船上军团必须损失兵力");
assert.ok(transportedArmy.organization < 90, "运输舰队被拦截败退时，船上军团组织必须受损");

const navalBattleTiles = [
  { id: 20, isSea: false, polity: "威尼斯共和国", population: 10, buildings: ["port"], city: "威尼斯", terrain: "coast", good: "timber", x: 0, y: 0, control: 90, devastation: 0 },
  { id: 21, isSea: false, polity: "热那亚共和国", population: 9, buildings: ["port"], city: "热那亚", terrain: "coast", good: "naval_supplies", x: 30, y: 0, control: 85, devastation: 0 },
  { id: 22, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 15, y: 0, control: 0 },
];
const navalBattleWorld = worldEngine.createWorld(navalBattleTiles, {}, "威尼斯共和国");
diplomacy.initializeDiplomacy(navalBattleWorld);
warfare.initializeWarfare(navalBattleWorld);
navalBattleWorld.diplomacy.wars = [];
const venetianFleet = warfare.createFleet(navalBattleWorld, {
  owner: "威尼斯共和国",
  tileId: 22,
  name: "威尼斯战舰队",
  units: [{ shipType: "galley", ships: 6 }],
});
const genoeseFleet = warfare.createFleet(navalBattleWorld, {
  owner: "热那亚共和国",
  tileId: 22,
  name: "热那亚运输护航队",
  units: [{ shipType: "cog", ships: 5 }],
});
const navalWar = warfare.declareWar(navalBattleWorld, "威尼斯共和国", "热那亚共和国", 21, "利古里亚海战", "plunder");
const navalPowerBeforeLine = warfare.navalPower(navalBattleWorld, [venetianFleet.id], navalBattleTiles[2]);
navalBattleWorld.countries["威尼斯共和国"].technology.shipOfLine = true;
assert.ok(warfare.navalPower(navalBattleWorld, [venetianFleet.id], navalBattleTiles[2]) > navalPowerBeforeLine, "风帆战列舰科技必须提高舰队制海权");
const venetianShipsBefore = warfare.fleetTotalShips(venetianFleet);
const genoeseShipsBefore = warfare.fleetTotalShips(genoeseFleet);
warfare.processWarfare(navalBattleWorld);
assert.equal(navalBattleWorld.warfare.battles[0].naval, true, "敌对舰队同海域必须自动结算海战");
assert.ok(warfare.fleetTotalShips(venetianFleet) < venetianShipsBefore, "海战应造成胜方舰船损失");
assert.ok(warfare.fleetTotalShips(genoeseFleet) < genoeseShipsBefore, "海战应造成败方舰船损失");
assert.notEqual(navalWar.score, 0, "海战胜负必须影响战争分数");

const blockadeTiles = [
  { id: 40, isSea: false, polity: "威尼斯共和国", population: 10, buildings: ["port"], city: "威尼斯", terrain: "coast", good: "timber", x: 0, y: 0, control: 90, devastation: 0 },
  { id: 41, isSea: false, polity: "热那亚共和国", population: 9, buildings: ["port"], city: "热那亚", terrain: "coast", good: "naval_supplies", x: 30, y: 0, control: 85, devastation: 0 },
  { id: 42, isSea: false, polity: "拜占庭帝国", population: 8, buildings: ["port"], city: "君士坦丁堡", terrain: "coast", good: "spices", x: 55, y: 0, control: 80, devastation: 0 },
  { id: 43, isSea: false, polity: "马穆鲁克苏丹国", population: 8, buildings: ["port"], city: "亚历山大", terrain: "coast", good: "spices", x: 75, y: 0, control: 80, devastation: 0 },
  { id: 44, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 15, y: 0, control: 0 },
  { id: 45, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 30, y: 10, control: 0 },
];
const blockadeWorld = worldEngine.createWorld(blockadeTiles, {}, "威尼斯共和国");
diplomacy.initializeDiplomacy(blockadeWorld);
warfare.initializeWarfare(blockadeWorld);
blockadeWorld.diplomacy.wars = [];
trade.initializeTrade(blockadeWorld);
trade.processTrade(blockadeWorld);
const genoeseTradeBeforeBlockade = blockadeWorld.trade.lastIncome["热那亚共和国"];
const blockadeFleet = warfare.createFleet(blockadeWorld, {
  owner: "威尼斯共和国",
  tileId: 45,
  name: "亚得里亚封锁舰队",
  units: [{ shipType: "galley", ships: 5 }],
});
warfare.declareWar(blockadeWorld, "威尼斯共和国", "热那亚共和国", 41, "利古里亚封锁战", "plunder");
warfare.startBlockade(blockadeWorld, blockadeFleet.id, 41);
assert.equal(warfare.blockadeAtPort(blockadeWorld, 41).id, blockadeFleet.id, "舰队必须记录正在封锁的港口");
const trappedGenoeseFleet = warfare.createFleet(blockadeWorld, {
  owner: "热那亚共和国",
  tileId: 45,
  name: "热那亚港内舰队",
  units: [{ shipType: "cog", ships: 3 }],
});
assert.throws(
  () => warfare.planFleetRoute(blockadeWorld, trappedGenoeseFleet.id, 44),
  /港口被封锁/,
  "封锁港口外海时，应阻止被封锁方舰队直接离港"
);
trade.processTrade(blockadeWorld);
assert.ok(blockadeWorld.trade.routes.levant.cost > 5, "封锁港口必须抬高相关商路成本");
assert.ok(blockadeWorld.trade.lastIncome["热那亚共和国"] < genoeseTradeBeforeBlockade, "封锁必须降低被封锁港口收入");

const privateerWorld = worldEngine.createWorld(blockadeTiles, {}, "威尼斯共和国");
diplomacy.initializeDiplomacy(privateerWorld);
warfare.initializeWarfare(privateerWorld);
trade.initializeTrade(privateerWorld);
trade.processTrade(privateerWorld);
const venetianIncomeBeforePrivateer = privateerWorld.trade.lastIncome["威尼斯共和国"];
const genoeseMoneyBeforePrivateer = privateerWorld.countries["热那亚共和国"].money;
const genoeseReputationBeforePrivateer = privateerWorld.countries["热那亚共和国"].reputation;
const privateerFleet = warfare.createFleet(privateerWorld, {
  owner: "热那亚共和国",
  tileId: 45,
  name: "热那亚私掠舰队",
  units: [{ shipType: "cog", ships: 4 }],
});
warfare.startPrivateering(privateerWorld, privateerFleet.id, "levant");
assert.equal(privateerFleet.targetRouteKey, "levant", "私掠舰队必须记录目标商路");
assert.ok(privateerWorld.countries["热那亚共和国"].reputation < genoeseReputationBeforePrivateer, "和平私掠必须损害声誉");
trade.processTrade(privateerWorld);
assert.ok(privateerWorld.trade.lastIncome["威尼斯共和国"] < venetianIncomeBeforePrivateer, "私掠必须降低商路节点收入");
assert.ok(privateerWorld.countries["热那亚共和国"].money > genoeseMoneyBeforePrivateer, "私掠收益必须进入私掠方国库");

assert.ok(warfare.terrainMoveCost(tiles[1]) > warfare.terrainMoveCost(tiles[0]));
tiles[1].terrain = "mountains";
assert.equal(warfare.terrainMoveCost(tiles[1]), Infinity);
tiles[1].terrain = "forest";
assert.deepEqual(Array.from(warfare.planArmyRoute(world, frenchArmy.id, 2)), [1, 2]);

const war = warfare.declareWar(world, "法兰西王国", "英格兰王国", 2, "加来战争");
assert.equal(warfare.areAtWar(world, "法兰西王国", "英格兰王国"), true);
warfare.executeMovementPhase(world);
assert.equal(frenchArmy.tileId, 1, "军团每季度必须逐格移动");
warfare.executeMovementPhase(world);
assert.equal(frenchArmy.tileId, 2);

frenchArmy.tileId = 0;
frenchArmy.plannedPath = [1];
frenchArmy.order = "hold";
warfare.executeMovementPhase(world);
assert.equal(frenchArmy.tileId, 0, "驻守命令不能执行残留路线");
frenchArmy.tileId = 2;
frenchArmy.plannedPath = [];

const populationBefore = tiles[2].population;
const frenchPowerBeforeTech = warfare.sidePower(world, [frenchArmy.id], tiles[2]);
world.countries["法兰西王国"].technology.plateCavalry = true;
world.countries["法兰西王国"].technology.bayonetVolley = true;
assert.ok(warfare.sidePower(world, [frenchArmy.id], tiles[2]) > frenchPowerBeforeTech, "板甲重骑与刺刀齐射必须提高陆军战斗力");
const englishDefenseBeforeBastions = warfare.sidePower(world, [englishArmy.id], tiles[2]);
world.countries["英格兰王国"].technology.bastions = true;
assert.ok(englishDefenseBeforeBastions > 0, "战斗力基线必须有效");
assert.ok(warfare.defensiveTechnologyFactor(world, [englishArmy.id], tiles[2]) > 1, "棱堡体系必须提高堡垒守军防御系数");
const battle = warfare.resolveBattle(world, 2, [frenchArmy.id], [englishArmy.id]);
assert.ok(battle.casualties.attackers > 0);
assert.ok(battle.casualties.defenders > 0);
assert.notEqual(war.score, 0, "战斗胜负必须计入战争分数");
assert.ok(tiles[2].devastation > 0, "战斗必须先造成地块破坏");
assert.ok(tiles[2].population < populationBefore, "战斗伤亡必须减少地块 POP");

englishArmy.status = "routed";
warfare.advanceOccupation(world, frenchArmy.id);
warfare.advanceOccupation(world, frenchArmy.id);
assert.equal(tiles[2].occupier, "法兰西王国");
assert.equal(tiles[2].polity, "英格兰王国", "占领不能直接改变法定归属");
assert.ok(world.countries["英格兰王国"].warfare.warExhaustion > 0);
const exhaustionAfterOccupation = world.countries["英格兰王国"].warfare.warExhaustion;
const scoreAfterOccupation = war.score;
warfare.advanceOccupation(world, frenchArmy.id);
assert.equal(world.countries["英格兰王国"].warfare.warExhaustion, exhaustionAfterOccupation);
assert.equal(war.score, scoreAfterOccupation, "同一地块完成占领后不能重复刷战争分数");

const autoFrench = warfare.createArmy(world, {
  owner: "法兰西王国",
  tileId: 1,
  name: "自动战斗测试军",
  units: [{ combatType: "infantry", serviceType: "professional", soldiers: 1200 }],
});
const autoEnglish = warfare.createArmy(world, {
  owner: "英格兰王国",
  tileId: 1,
  name: "自动迎战测试军",
  units: [{ combatType: "infantry", serviceType: "professional", soldiers: 1000 }],
});
const battleCountBefore = world.warfare.battles.length;
autoEnglish.supply = 30;
warfare.processWarfare(world);
assert.ok(world.warfare.battles.length > battleCountBefore, "敌对军团同格时必须自动结算战斗");
assert.ok(
  autoFrench.status === "routed" || autoEnglish.status === "routed",
  "自动战斗必须产生胜负结果"
);
assert.ok(autoEnglish.supply < 30, "敌境中的军团必须消耗补给");

const neutralTile = { id: 4, isSea: false, polity: "布列塔尼公国", population: 4, buildings: [], city: "南特", terrain: "plains", x: 70, y: 10, control: 60, devastation: 0, occupier: null, occupation: 0 };
world.tiles.push(neutralTile);
const neutralArmy = warfare.createArmy(world, {
  owner: "法兰西王国",
  tileId: 4,
  name: "中立地块测试军",
  units: [{ combatType: "infantry", serviceType: "levy", soldiers: 500 }],
});
warfare.advanceOccupation(world, neutralArmy.id);
assert.equal(neutralTile.occupier, null, "未宣战不能占领中立或和平国家地块");

war.score = 100;
assert.throws(
  () => warfare.concludePeace(world, war.id, "英格兰王国", [{ type: "target_territory" }]),
  /战争目标提出方/
);
warfare.concludePeace(world, war.id, "法兰西王国", [{ type: "target_territory" }]);
assert.equal(tiles[2].polity, "法兰西王国");
assert.equal(tiles[2].occupier, null);
assert.equal(warfare.areAtWar(world, "法兰西王国", "英格兰王国"), false);

// declareWarOn / 停战 / 炮兵：独立小世界，避免历史战争与失地国家干扰
const freshTiles = [
  { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0, occupier: null, occupation: 0 },
  { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", x: 50, y: 10, control: 70, devastation: 0, occupier: null, occupation: 0 },
];
const freshWorld = worldEngine.createWorld(freshTiles);
diplomacy.initializeDiplomacy(freshWorld);
warfare.initializeWarfare(freshWorld);
freshWorld.diplomacy.wars = [];
freshWorld.diplomacy.truces = [];

const reputationBeforeNoClaim = freshWorld.countries["法兰西王国"].reputation;
const onWar = warfare.declareWarOn(freshWorld, "法兰西王国", "英格兰王国");
assert.equal(onWar.primaryGoal.tileId, 1, "declareWarOn 必须以目标国首都为战争目标");
assert.equal(onWar.goal.type, "conquest", "默认宣战必须是征服目标");
assert.equal(onWar.cbMatched, false, "无宣称战争必须标记为无战争理由");
assert.ok(freshWorld.countries["法兰西王国"].reputation < reputationBeforeNoClaim, "无宣称宣战必须损害声誉");
assert.equal(warfare.areAtWar(freshWorld, "法兰西王国", "英格兰王国"), true);
assert.throws(() => warfare.declareWarOn(freshWorld, "法兰西王国", "法兰西王国"), /本国/);

freshWorld.diplomacy.wars = [];
freshWorld.diplomacy.truces.push({ parties: ["法兰西王国", "英格兰王国"], endsTurn: freshWorld.turn + 5 });
assert.equal(warfare.underTruce(freshWorld, "法兰西王国", "英格兰王国"), true);
assert.throws(() => warfare.declareWarOn(freshWorld, "法兰西王国", "英格兰王国"), /停战/);

const claimedWorld = worldEngine.createWorld(freshTiles);
diplomacy.initializeDiplomacy(claimedWorld);
warfare.initializeWarfare(claimedWorld);
claimedWorld.diplomacy.wars = [];
diplomacy.addClaim(claimedWorld, "法兰西王国", "英格兰王国", "territorial", { tileId: 1 });
const reputationBeforeClaim = claimedWorld.countries["法兰西王国"].reputation;
const claimedWar = warfare.declareWarOn(claimedWorld, "法兰西王国", "英格兰王国");
assert.equal(claimedWar.cbMatched, true, "匹配宣称的战争必须标记为有战争理由");
assert.equal(claimedWorld.countries["法兰西王国"].reputation, reputationBeforeClaim, "有宣称宣战不应损害声誉");

const peaceWorld = worldEngine.createWorld(freshTiles);
diplomacy.initializeDiplomacy(peaceWorld);
warfare.initializeWarfare(peaceWorld);
peaceWorld.diplomacy.wars = [];
const peaceWar = warfare.declareWarOn(peaceWorld, "法兰西王国", "英格兰王国");
peaceWar.score = 40;
peaceWorld.countries["英格兰王国"].money = 80;
assert.equal(warfare.peaceTermsCost(peaceWorld, peaceWar, [{ type: "reparations", amount: 30 }]), 15, "赔款条款必须有战争分数成本");
assert.equal(warfare.canConcludePeace(peaceWorld, peaceWar, "法兰西王国", [{ type: "reparations", amount: 30 }]), true);
warfare.concludePeace(peaceWorld, peaceWar.id, "法兰西王国", [{ type: "reparations", amount: 30 }]);
assert.equal(peaceWorld.countries["法兰西王国"].money >= 70, true, "胜方必须收到赔款");
assert.equal(warfare.areAtWar(peaceWorld, "法兰西王国", "英格兰王国"), false, "赔款和约必须结束战争");

const subjectWarWorld = worldEngine.createWorld(freshTiles);
diplomacy.initializeDiplomacy(subjectWarWorld);
warfare.initializeWarfare(subjectWarWorld);
subjectWarWorld.diplomacy.wars = [];
const subjectWar = warfare.declareWarOn(subjectWarWorld, "法兰西王国", "英格兰王国");
subjectWar.score = 40;
assert.equal(warfare.canConcludePeace(subjectWarWorld, subjectWar, "法兰西王国", [{ type: "subject", subjectType: "tributary" }]), false, "征服战不能直接签从属条款");
assert.throws(
  () => warfare.concludePeace(subjectWarWorld, subjectWar.id, "法兰西王国", [{ type: "subject", subjectType: "tributary" }]),
  /不支持/
);
subjectWarWorld.diplomacy.wars = [];
const subjugationWar = warfare.declareWarOn(subjectWarWorld, "法兰西王国", "英格兰王国", "附庸战争", "subjugation");
assert.equal(subjugationWar.goal.type, "subjugation", "宣战应支持附庸战目标");
subjugationWar.score = 40;
assert.equal(warfare.canConcludePeace(subjectWarWorld, subjugationWar, "法兰西王国", [{ type: "target_territory" }]), false, "附庸战不能索取目标领土");
warfare.concludePeace(subjectWarWorld, subjugationWar.id, "法兰西王国", [{ type: "subject", subjectType: "tributary" }]);
assert.ok(diplomacy.subjectBetween(subjectWarWorld, "法兰西王国", "英格兰王国"), "强制朝贡和约必须建立从属关系");

const plunderWorld = worldEngine.createWorld(freshTiles);
diplomacy.initializeDiplomacy(plunderWorld);
warfare.initializeWarfare(plunderWorld);
plunderWorld.diplomacy.wars = [];
plunderWorld.countries["英格兰王国"].money = 100;
const plunderWar = warfare.declareWarOn(plunderWorld, "法兰西王国", "英格兰王国", "劫掠战争", "plunder");
plunderWar.score = 30;
assert.equal(warfare.termAllowedByGoal(plunderWar, { type: "target_territory" }), false, "劫掠战不能割地");
const plunderRepBefore = plunderWorld.countries["法兰西王国"].reputation;
warfare.concludePeace(plunderWorld, plunderWar.id, "法兰西王国", [{ type: "reparations", amount: 30 }]);
assert.ok(plunderWorld.countries["法兰西王国"].money > 0, "劫掠战应能通过赔款拿到资源");
assert.ok(plunderWorld.countries["英格兰王国"].warfare.warExhaustion >= 2, "劫掠赔款应提高目标战争疲惫");
assert.ok(plunderWorld.countries["法兰西王国"].reputation < plunderRepBefore, "劫掠战应带来额外声誉代价");

const truceWorld = worldEngine.createWorld(freshTiles);
diplomacy.initializeDiplomacy(truceWorld);
warfare.initializeWarfare(truceWorld);
truceWorld.diplomacy.wars = [];
const truceWar = warfare.declareWarOn(truceWorld, "法兰西王国", "英格兰王国");
assert.equal(warfare.canConcludePeace(truceWorld, truceWar, "英格兰王国", [{ type: "truce" }]), true, "停战条款不应需要战争分数");
warfare.concludePeace(truceWorld, truceWar.id, "英格兰王国", [{ type: "truce" }]);
assert.equal(warfare.areAtWar(truceWorld, "法兰西王国", "英格兰王国"), false, "停战和约必须结束战争");

const fr = freshWorld.countries["法兰西王国"];
fr.actionPoints.military = 2;
fr.military = 100;
assert.throws(() => warfare.mobilizeArmy(freshWorld, "法兰西王国", 0, "artillery"), /火炮/);
fr.technology.artillery = true;
assert.equal(warfare.canRecruitCombatType(freshWorld, "法兰西王国", "artillery"), false, "有火炮科技但无硝石来源时不能动员炮兵");
assert.throws(() => warfare.mobilizeArmy(freshWorld, "法兰西王国", 0, "artillery"), /硝石/);
freshWorld.tiles[0].good = "saltpeter";
assert.equal(warfare.canRecruitCombatType(freshWorld, "法兰西王国", "artillery"), true, "火炮科技 + 硝石来源同时满足后才能动员炮兵");
const artilleryArmy = warfare.mobilizeArmy(freshWorld, "法兰西王国", 0, "artillery");
assert.equal(artilleryArmy.units[0].combatType, "artillery");
assert.equal(fr.military, 70, "铸炮必须消耗军需 30");

// 战争疲惫硬惩罚 + 和平消退
freshWorld.diplomacy.wars = [];
fr.warfare.warExhaustion = 30;
fr.legitimacy = 80;
warfare.processWarfare(freshWorld);
assert.ok(fr.legitimacy < 80, "战争疲惫必须拖累合法性");
assert.equal(fr.warfare.warExhaustion, 28, "和平时战争疲惫必须逐季消退");
// 疲惫过高封锁征召
fr.warfare.warExhaustion = 45;
fr.actionPoints.military = 2;
assert.throws(() => warfare.mobilizeArmy(freshWorld, "法兰西王国", 0, "infantry"), /战争疲惫/);
// 战争系统只衰减破坏，不负责人口自然恢复；人口增长归经济系统。
fr.warfare.warExhaustion = 0;
const recoverTile = freshWorld.tiles[0];
recoverTile.population = recoverTile.basePopulation - 2;
recoverTile.devastation = 12;
warfare.processWarfare(freshWorld);
assert.equal(recoverTile.population, recoverTile.basePopulation - 2, "战争流程不应直接恢复人口");
assert.equal(recoverTile.devastation, 10, "战争破坏应在和平时逐季衰减");

// 防御同盟自动参战
const allyWorld = worldEngine.createWorld([
  { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
  { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", x: 50, y: 10, control: 70, devastation: 0 },
  { id: 2, isSea: false, polity: "卡斯蒂利亚王国", population: 9, buildings: [], city: "布尔戈斯", terrain: "plains", x: 30, y: 40, control: 70, devastation: 0 },
]);
diplomacy.initializeDiplomacy(allyWorld);
warfare.initializeWarfare(allyWorld);
allyWorld.diplomacy.wars = [];
allyWorld.diplomacy.truces = [];
allyWorld.diplomacy.treaties.push({ id: "treaty-x", type: "alliance", parties: ["英格兰王国", "卡斯蒂利亚王国"], startedTurn: 1, minimumUntilTurn: 5, endsTurn: 99 });
const allyWar = warfare.declareWarOn(allyWorld, "法兰西王国", "英格兰王国");
assert.ok(allyWar.defenders.includes("卡斯蒂利亚王国"), "防御同盟必须让盟友自动参战");

// 军事制度调节征召的人口流成本
const levyWorld = worldEngine.createWorld([
  { id: 0, isSea: false, polity: "法兰西王国", population: 30, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
]);
warfare.initializeWarfare(levyWorld);
const levyCountry = levyWorld.countries["法兰西王国"];
levyCountry.government.institutions = { military: "feudal_levy" };
levyCountry.actionPoints.military = 5;
const popBeforeFeudalLevy = levyWorld.tiles[0].population;
warfare.mobilizeArmy(levyWorld, "法兰西王国", 0, "infantry");
const feudalLevyDrain = popBeforeFeudalLevy - levyWorld.tiles[0].population;
levyCountry.government.institutions.military = "nation_in_arms";
const popBeforeNationLevy = levyWorld.tiles[0].population;
warfare.mobilizeArmy(levyWorld, "法兰西王国", 0, "infantry");
const nationLevyDrain = popBeforeNationLevy - levyWorld.tiles[0].population;
assert.ok(nationLevyDrain < feudalLevyDrain, "全民皆兵必须比封建征召更省人口流");

// 军事制度模块必须直接影响动员，不再只是政体展示字段
const moduleWorld = worldEngine.createWorld([
  { id: 0, isSea: false, polity: "法兰西王国", population: 30, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
]);
warfare.initializeWarfare(moduleWorld);
const moduleCountry = moduleWorld.countries["法兰西王国"];
moduleCountry.actionPoints.military = 5;
moduleCountry.military = 100;
moduleCountry.government.institutions = { military: "feudal_levy" };
const popBeforeFeudal = moduleWorld.tiles[0].population;
const feudalArmy = warfare.mobilizeArmy(moduleWorld, "法兰西王国", 0, "infantry");
const feudalDrain = popBeforeFeudal - moduleWorld.tiles[0].population;
assert.equal(feudalArmy.units[0].serviceType, "levy", "封建征召必须生成征召兵");
moduleCountry.government.institutions.military = "nation_in_arms";
const popBeforeNation = moduleWorld.tiles[0].population;
warfare.mobilizeArmy(moduleWorld, "法兰西王国", 0, "infantry");
const nationDrain = popBeforeNation - moduleWorld.tiles[0].population;
assert.ok(nationDrain < feudalDrain, "全民皆兵必须降低人口流成本");
moduleCountry.government.institutions.military = "standing_army";
const popBeforeStanding = moduleWorld.tiles[0].population;
const militaryBeforeStanding = moduleCountry.military;
const standingArmy = warfare.mobilizeArmy(moduleWorld, "法兰西王国", 0, "infantry");
assert.equal(standingArmy.units[0].serviceType, "standing", "常备军制度必须生成常备单位");
assert.equal(moduleWorld.tiles[0].population, popBeforeStanding, "常备军不应直接消耗地块人口");
assert.ok(moduleCountry.military < militaryBeforeStanding, "常备军动员必须消耗军需");
moduleCountry.government.institutions.military = "mercenary_state";
moduleCountry.money = 100;
const moneyBeforeMercenaryState = moduleCountry.money;
const mercenary = warfare.hireMercenary(moduleWorld, "法兰西王国", 0);
assert.ok(moneyBeforeMercenaryState - moduleCountry.money < 40, "雇佣立国必须降低雇佣兵签约成本");
assert.ok(mercenary.mercenaryWage < 20, "雇佣立国必须降低佣兵工资");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const mapSource = fs.readFileSync(path.join(root, "ui", "map.js"), "utf8");
const drawerSource = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
assert.ok(html.includes("scripts/engine/warfare.js"));
assert.ok(html.includes("scripts/ui/dialogs.js"));
assert.ok(html.includes("armyDrawer"));
assert.ok(mapSource.includes("data-army-marker"));
assert.ok(drawerSource.includes("data-army-open"));
assert.ok(fs.readFileSync(path.join(root, "ui", "dialogs.js"), "utf8").includes("data-army-plan"));
assert.ok(drawerSource.includes("data-peace-war"));
assert.ok(drawerSource.includes("data-peace-term"));
assert.ok(drawerSource.includes("war:declare"), "外交抽屉必须提供宣战入口");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(mainSource.includes("declareWarOn"), "入口必须接通宣战操作");

// --- Task A3: 欠费惩罚 ---
{
  const shortageWorld = worldEngine.createWorld([
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
  ]);
  economy.initializeEconomy(shortageWorld);
  warfare.initializeWarfare(shortageWorld);
  const polity = shortageWorld.playerPolity;
  shortageWorld.countries[polity].food = 0; // 逼成粮食赤字
  shortageWorld.warfare.armies["starve"] = {
    id: "starve", owner: polity, supply: 100, organization: 100,
    units: [{ combatType: "infantry", serviceType: "standing", soldiers: 50000 }],
  };
  economy.settleCountry(shortageWorld, polity);
  assert.ok(shortageWorld.warfare.armies["starve"].supply < 100, "粮食赤字应降低军团补给");
  assert.ok(shortageWorld.countries[polity].food >= 0, "资源应 clamp 回非负");
  console.log("A3 欠费惩罚 OK");
}


// --- Phase E2: 招募非统治者将领并任命（将领系统不止"统治者领军"）---
{
  const gw = worldEngine.createWorld([
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
  ]);
  diplomacy.initializeDiplomacy(gw);
  warfare.initializeWarfare(gw);
  const army = warfare.createArmy(gw, { owner: "法兰西王国", tileId: 0, name: "王军", units: [{ combatType: "infantry", serviceType: "levy", soldiers: 1000 }] });
  gw.countries["法兰西王国"].government.institutions = { military: "feudal_levy", assembly: { type: "none" } };
  gw.countries["法兰西王国"].technology = {};

  const pointsBefore = gw.countries["法兰西王国"].actionPoints.military;
  const general = warfare.recruitGeneral(gw, "法兰西王国");
  assert.equal(general.ruler, false, "招募的应是非统治者将领");
  assert.equal(general.owner, "法兰西王国");
  assert.ok(general.command >= 2, "将领应有指挥力");
  assert.equal(general.command, 3, "封建征召制度下将领指挥力应只读制度模块");
  assert.equal(gw.countries["法兰西王国"].actionPoints.military, pointsBefore - 1, "招募应消耗 1 军事点");
  assert.ok(gw.warfare.generals[general.id], "将领应进入将领池");

  gw.countries["法兰西王国"].actionPoints.military = 5;
  gw.countries["法兰西王国"].government.institutions = { military: "standing_army", assembly: { type: "parliamentary" } };
  gw.countries["法兰西王国"].technology = { standingArmy: true };
  const institutionalGeneral = warfare.recruitGeneral(gw, "法兰西王国");
  assert.ok(institutionalGeneral.command > general.command, "军事制度、议会和常备军科技必须提高将领指挥力");

  warfare.assignGeneral(gw, army.id, general.id);
  assert.equal(gw.warfare.armies[army.id].generalId, general.id, "应能任命非统治者将领领军");

  gw.countries["法兰西王国"].actionPoints.military = 0;
  assert.throws(() => warfare.recruitGeneral(gw, "法兰西王国"), /军事点不足/, "军事点不足不能招募");
  console.log("Phase E2 将领招募/任命 OK");
}

console.log("hifi warfare engine passed");

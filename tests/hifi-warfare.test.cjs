const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "engine/world.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const warfare = context.window.HIFI_WARFARE_ENGINE;
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
world.diplomacy.wars = [];

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
const battle = warfare.resolveBattle(world, 2, [frenchArmy.id], [englishArmy.id]);
assert.ok(battle.casualties.attackers > 0);
assert.ok(battle.casualties.defenders > 0);
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

const onWar = warfare.declareWarOn(freshWorld, "法兰西王国", "英格兰王国");
assert.equal(onWar.primaryGoal.tileId, 1, "declareWarOn 必须以目标国首都为战争目标");
assert.equal(warfare.areAtWar(freshWorld, "法兰西王国", "英格兰王国"), true);
assert.throws(() => warfare.declareWarOn(freshWorld, "法兰西王国", "法兰西王国"), /本国/);

freshWorld.diplomacy.wars = [];
freshWorld.diplomacy.truces.push({ parties: ["法兰西王国", "英格兰王国"], endsTurn: freshWorld.turn + 5 });
assert.equal(warfare.underTruce(freshWorld, "法兰西王国", "英格兰王国"), true);
assert.throws(() => warfare.declareWarOn(freshWorld, "法兰西王国", "英格兰王国"), /停战/);

const fr = freshWorld.countries["法兰西王国"];
fr.actionPoints.military = 2;
fr.military = 100;
assert.throws(() => warfare.mobilizeArmy(freshWorld, "法兰西王国", 0, "artillery"), /火炮/);
fr.technology.artillery = true;
const artilleryArmy = warfare.mobilizeArmy(freshWorld, "法兰西王国", 0, "artillery");
assert.equal(artilleryArmy.units[0].combatType, "artillery");
assert.equal(fr.military, 70, "铸炮必须消耗军需 30");

// 动员法律调节征召的人口流成本（需 politics 的 lawEffects）
vm.runInNewContext(fs.readFileSync(path.join(root, "engine", "politics.js"), "utf8"), context);
const levyWorld = worldEngine.createWorld([
  { id: 0, isSea: false, polity: "法兰西王国", population: 30, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
]);
warfare.initializeWarfare(levyWorld);
const levyCountry = levyWorld.countries["法兰西王国"];
levyCountry.government.laws = { mobilization: "limited" };
levyCountry.actionPoints.military = 5;
const popBeforeLimited = levyWorld.tiles[0].population;
warfare.mobilizeArmy(levyWorld, "法兰西王国", 0, "infantry");
const limitedDrain = popBeforeLimited - levyWorld.tiles[0].population;
levyCountry.government.laws.mobilization = "levy";
const popBeforeLevy = levyWorld.tiles[0].population;
warfare.mobilizeArmy(levyWorld, "法兰西王国", 0, "infantry");
const levyDrain = popBeforeLevy - levyWorld.tiles[0].population;
assert.ok(levyDrain < limitedDrain, "征召兵役必须比有限动员更省人口流");

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

console.log("hifi warfare engine passed");

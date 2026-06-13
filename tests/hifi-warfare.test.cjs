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

war.score = 100;
warfare.concludePeace(world, war.id, "法兰西王国", [{ type: "target_territory" }]);
assert.equal(tiles[2].polity, "法兰西王国");
assert.equal(tiles[2].occupier, null);
assert.equal(warfare.areAtWar(world, "法兰西王国", "英格兰王国"), false);

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

console.log("hifi warfare engine passed");

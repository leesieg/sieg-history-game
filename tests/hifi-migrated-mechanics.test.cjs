const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/techs.js",
  "data/rules.js",
  "data/trade.js",
  "data/countries.js",
  "data/institutions.js",
  "engine/world.js",
  "engine/politics.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/trade.js",
  "engine/history.js",
  "engine/strategy.js",
  "engine/turn.js",
]) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);

const w = context.window;
const tiles = [
  { id: 0, x: 0, y: 0, isSea: false, polity: "法兰西王国", region: "巴黎盆地", city: "巴黎", population: 12, terrain: "plains", religion: "天主教", good: "grain", control: 85, devastation: 0, occupation: 0, buildings: ["market"] },
  { id: 1, x: 20, y: 0, isSea: false, polity: "法兰西王国", region: "诺曼底", city: "鲁昂", population: 8, terrain: "plains", religion: "天主教", good: "fish", control: 75, devastation: 0, occupation: 0, buildings: ["port"] },
  { id: 2, x: 40, y: 0, isSea: false, polity: "英格兰王国", region: "英格兰南部", city: "伦敦", population: 10, terrain: "plains", religion: "天主教", good: "cloth", control: 80, devastation: 0, occupation: 0, buildings: ["market", "port"] },
];
const world = w.HIFI_WORLD_ENGINE.createWorld(tiles);
w.HIFI_POLITICS_ENGINE.initializePolitics(world);
w.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_WARFARE_ENGINE.initializeWarfare(world);
w.HIFI_HISTORY_ENGINE.initializeHistory(world);
w.HIFI_TRADE_ENGINE.initializeTrade(world);

const france = world.countries["法兰西王国"];
france.government.institutions.assembly.type = "none";
w.HIFI_POLITICS_ENGINE.enactDecision(world, france.name, "estates_general");
assert.equal(france.government.assembly.unlocked, true);
assert.ok(france.decisionLedger.length);
w.HIFI_POLITICS_ENGINE.setInstitution(france, "fiscal", "direct");
assert.equal(france.government.institutions.fiscal, "direct");
assert.equal(france.government.laws, undefined, "国家对象不应保留旧法律字段");

const populationBefore = tiles[0].population;
const levy = w.HIFI_WARFARE_ENGINE.mobilizeArmy(world, france.name, 0, "infantry");
assert.ok(tiles[0].population < populationBefore);
const split = w.HIFI_WARFARE_ENGINE.splitArmy(world, levy.id);
assert.ok(w.HIFI_WARFARE_ENGINE.armyTotalSoldiers(split) > 0);
w.HIFI_WARFARE_ENGINE.mergeArmies(world, levy.id, split.id);
w.HIFI_WARFARE_ENGINE.assignGeneral(world, levy.id, w.HIFI_WARFARE_ENGINE.rulerGeneral(world, france.name).id);
assert.ok(levy.generalId);
const mercenary = w.HIFI_WARFARE_ENGINE.hireMercenary(world, france.name, 0);
assert.equal(mercenary.mercenaryLoyalty, 70);

w.HIFI_TRADE_ENGINE.processTrade(world);
assert.ok(france.pressures.trade >= 0);
assert.ok(france.capital >= 0);
const oldCost = world.trade.routes.levant.cost;
world.flags.constantinopleFallen = true;
w.HIFI_TRADE_ENGINE.processTrade(world);
assert.ok(world.trade.routes.levant.cost > oldCost);

france.technologyAwareness.printing = 100;
france.technology.universities = true;
france.ideas = 100;
world.turn = (1450 - 1337) * 4 + 1;
w.HIFI_ECONOMY_ENGINE.adoptTechnology(world, france.name, "printing");
world.turn = (1517 - 1337) * 4 + 1;
w.HIFI_HISTORY_ENGINE.processHistory(world);
assert.equal(world.flags.reformation, true);
assert.ok(w.HIFI_HISTORY_ENGINE.forecast(world).risks.length);
assert.ok(w.HIFI_HISTORY_ENGINE.missions(world).length >= 4);

for (let index = 0; index < 12; index += 1) {
  if (world.pendingElection) w.HIFI_POLITICS_ENGINE.completeElection(world, 0);
  world.playerEvents.splice(0);
  world.pendingTransition = null;
  w.HIFI_TURN_ENGINE.advanceQuarter(world);
}
assert.ok(world.turn > (1517 - 1337) * 4 + 1);

console.log("hifi migrated mechanics passed");

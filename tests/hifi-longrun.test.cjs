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
  "engine/history.js", "engine/strategy.js", "engine/turn.js",
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
]);
w.HIFI_POLITICS_ENGINE.initializePolitics(world);
w.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_WARFARE_ENGINE.initializeWarfare(world);
w.HIFI_HISTORY_ENGINE.initializeHistory(world);
w.HIFI_TRADE_ENGINE.initializeTrade(world);

const finalTurn = (1830 - 1337) * 4 + 1;
while (world.turn < finalTurn) {
  if (world.pendingElection) w.HIFI_POLITICS_ENGINE.completeElection(world, 0);
  world.playerEvents.splice(0);
  world.pendingTransition = null;
  const player = world.countries[world.playerPolity];
  for (const [key, technology] of Object.entries(w.HIFI_RULES.technologies)) {
    if (!player.technology[key] && player.ideas >= technology.cost && player.technologyAwareness[key] >= 25) {
      w.HIFI_ECONOMY_ENGINE.adoptTechnology(world, world.playerPolity, key);
    }
  }
  w.HIFI_TURN_ENGINE.advanceQuarter(world);
}

assert.equal(w.HIFI_HISTORY_ENGINE.eras[world.eraIndex].key, "industrial");
assert.equal(world.flags.reformation, true);
assert.equal(world.flags.industrialization, true);
assert.ok(Object.values(world.countries).some(country => country.technology.railways));
assert.ok(Object.values(world.countries).every(country => country.missionsDone.length > 0));
assert.ok(world.trade.routes.newWorld.active);
assert.ok(world.worldEvents.length > 0);

console.log(`hifi longrun passed: ${world.turn} · ${w.HIFI_HISTORY_ENGINE.eras[world.eraIndex].label}`);

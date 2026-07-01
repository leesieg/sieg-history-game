const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {}, console };

for (const file of [
  "data/geography.js",
  "data/countries.js",
  "data/institutions.js",
  "data/codex.js",
  "data/techs.js",
  "data/rules.js",
  "data/trade.js",
  "engine/world.js",
  "engine/turn.js",
  "engine/politics.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/trade.js",
  "engine/history.js",
  "engine/struggle.js",
  "engine/objectives.js",
  "engine/proposals.js",
  "engine/narrative.js",
  "engine/strategy.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const w = context.window;
const data = w.HIFI_GEOGRAPHY;

function seedTiles() {
  return data.regionSeeds.map((seed, id) => {
    const isSea = seed[3] === "sea";
    return {
      id,
      x: seed[1],
      y: seed[2],
      lon: seed[1],
      lat: seed[2],
      isSea,
      region: seed[0],
      terrain: seed[3],
      climate: seed[4],
      river: seed[5],
      good: isSea ? "fish" : seed[6],
      culture: isSea ? "海域" : seed[7],
      religion: isSea ? "无" : seed[8],
      population: seed[9].reduce((sum, value) => sum + value, 0),
      buildings: isSea ? [] : [...seed[10]],
      alignment: isSea ? "neutral" : seed[11],
      polity: isSea ? "海域" : seed[12],
      city: isSea ? "" : data.CITY_BY_REGION[seed[0]] || "",
      control: isSea ? 0 : seed[11] === "player" ? 85 : seed[11] === "enemy" ? 58 : 70,
    };
  });
}

function initializeWorld(player = "法兰西王国") {
  const world = w.HIFI_WORLD_ENGINE.createWorld(seedTiles(), {}, player);
  w.HIFI_POLITICS_ENGINE.initializePolitics(world);
  w.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
  w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
  w.HIFI_WARFARE_ENGINE.initializeWarfare(world);
  w.HIFI_HISTORY_ENGINE.initializeHistory(world);
  w.HIFI_STRUGGLE_ENGINE.initializeStruggles(world);
  w.HIFI_TRADE_ENGINE.initializeTrade(world);
  return world;
}

function assertInvariants(world, previousTurn) {
  assert.equal(world.turn, previousTurn + 1, "回合必须严格 +1");

  for (const [polity, country] of Object.entries(world.countries)) {
    assert.ok(country.government?.assembly, `${polity} 必须有完整议会结构`);
    assert.ok(country.government?.institutions, `${polity} 必须有制度模块`);
    assert.ok(country.government?.archetype, `${polity} 必须有派生政体原型`);
    assert.ok(country.displayName, `${polity} 必须有展示国名`);
    assert.ok(country.leader?.abilities, `${polity} 必须有领导人能力`);
    for (const key of ["food", "money", "military", "legitimacy"]) {
      assert.ok(Number.isFinite(country[key]), `${polity}.${key} 必须是有限数`);
      assert.ok(country[key] >= 0, `${polity}.${key} 不得为负`);
    }
  }

  const warPairs = new Set();
  for (const war of world.diplomacy.wars) {
    for (const attacker of war.attackers) {
      for (const defender of war.defenders) {
        const pair = [attacker, defender].sort().join("::");
        assert.ok(!warPairs.has(pair), `同一对国家不得有重复战争：${pair}`);
        warPairs.add(pair);
        assert.equal(w.HIFI_WARFARE_ENGINE.underTruce(world, attacker, defender), false, "交战双方不得同时处于停战期");
      }
    }
  }

  for (const struggle of w.HIFI_STRUGGLE_ENGINE.activeStruggles(world)) {
    assert.ok(["standoff", "open_war", "truce", "resolution"].includes(struggle.phase), `非法局势阶段：${struggle.phase}`);
  }
}

for (const player of ["法兰西王国", "英格兰王国", "卡斯蒂利亚王国", "威尼斯共和国", "马穆鲁克苏丹国"]) {
  const world = initializeWorld(player);
  for (let index = 0; index < 200; index += 1) {
    const previousTurn = world.turn;
    w.HIFI_TURN_ENGINE.advanceQuarter(world);
    assertInvariants(world, previousTurn);
    if (world.pendingElection) w.HIFI_POLITICS_ENGINE.completeElection(world, 0);
    world.playerEvents.splice(0);
    if (world.pendingTransition) w.HIFI_HISTORY_ENGINE.acknowledgeTransition(world);
  }
}

console.log("hifi invariants passed: 5 players × 200 quarters");

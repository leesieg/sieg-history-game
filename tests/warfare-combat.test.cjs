const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.match(script, /function resolveEncounter\(/, "combat resolver should exist");

const pureScript = script.slice(0, script.indexOf('document.getElementById("endTurnBtn").onclick'));
const context = { console, Math, Map, Set, document:{ createElementNS(){ return { setAttribute(){} }; } } };
vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__combatTest = { newState, armyTotalSoldiers, resolveEncounter, combatSidePower };`,
  context
);

function setupBattle() {
  const world = context.__combatTest.newState();
  const france = Object.values(world.warfare.armies).find(army => army.owner === "法兰西王国");
  const england = Object.values(world.warfare.armies).find(army => army.owner === "英格兰王国");
  england.tileId = france.tileId;
  return {
    world,
    france,
    england,
    encounter: {
      id: "test-battle",
      tileId: france.tileId,
      armyIds: [england.id, france.id],
      attackerIds: [england.id],
      defenderIds: [france.id],
      terrain: world.tiles[france.tileId].terrain
    }
  };
}

const first = setupBattle();
const firstBefore = context.__combatTest.armyTotalSoldiers(first.france) + context.__combatTest.armyTotalSoldiers(first.england);
const firstResult = context.__combatTest.resolveEncounter(first.world, first.encounter, 1337);
const firstAfter = context.__combatTest.armyTotalSoldiers(first.france) + context.__combatTest.armyTotalSoldiers(first.england);

assert.ok(firstAfter < firstBefore);
assert.ok(["attackers", "defenders"].includes(firstResult.winner));
assert.ok(firstResult.report.length >= 4);
assert.ok(first.world.warfare.battles.some(battle => battle.id === firstResult.id));
assert.ok(firstResult.casualties.attackers > 0);
assert.ok(firstResult.casualties.defenders > 0);
assert.ok(
  first.world.tiles.some(tile => (tile.warLosses || 0) > 0),
  "combat casualties should be recorded against source POP tiles"
);

const second = setupBattle();
const secondResult = context.__combatTest.resolveEncounter(second.world, second.encounter, 1337);
assert.deepEqual(
  JSON.parse(JSON.stringify(secondResult.casualties)),
  JSON.parse(JSON.stringify(firstResult.casualties)),
  "same seed and inputs should produce the same casualties"
);
assert.equal(secondResult.winner, firstResult.winner);

const mountainWorld = setupBattle();
const mountainTile = mountainWorld.world.tiles[mountainWorld.france.tileId];
mountainTile.terrain = "mountains";
const cavalryPower = context.__combatTest.combatSidePower(
  mountainWorld.world,
  [mountainWorld.england],
  mountainTile,
  false
);
mountainTile.terrain = "plains";
const plainsPower = context.__combatTest.combatSidePower(
  mountainWorld.world,
  [mountainWorld.england],
  mountainTile,
  false
);
assert.ok(cavalryPower < plainsPower, "mountains should reduce cavalry effectiveness");

console.log("warfare combat tests passed");

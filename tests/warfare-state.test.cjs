const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const demoPath = path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html");
const html = fs.readFileSync(demoPath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

assert.ok(script, "demo script should exist");
assert.match(script, /function createWarfareState\(/, "warfare state factory should exist");

const eventWiring = 'document.getElementById("endTurnBtn").onclick';
const pureScript = script.slice(0, script.indexOf(eventWiring));
const context = {
  console,
  Math,
  Map,
  Set,
  document: {
    createElementNS() {
      return { setAttribute() {} };
    }
  }
};

vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__warfareTest = {
    newState,
    armyTotalSoldiers,
    armiesAtTile,
    validateArmy,
    canRecruitCombatType,
    mobilizeArmy,
    hireMercenary
  };`,
  context
);

const game = context.__warfareTest;
const world = game.newState();
context.state = world;

assert.ok(world.warfare);
assert.ok(Object.keys(world.warfare.armies).length >= 3);

for (const army of Object.values(world.warfare.armies)) {
  assert.equal(
    game.armiesAtTile(world, army.tileId).filter(candidate => candidate.id === army.id).length,
    1,
    `${army.name} should have exactly one map position`
  );
  assert.equal(
    game.armyTotalSoldiers(army),
    army.units.reduce((sum, unit) => sum + unit.soldiers, 0)
  );
  assert.equal(game.validateArmy(army), true);
  for (const unit of army.units) {
    assert.ok(["infantry", "cavalry", "artillery"].includes(unit.combatType));
    assert.ok(["guard", "professional", "standing", "levy", "mercenary"].includes(unit.serviceType));
  }
}

assert.equal(game.canRecruitCombatType(world, "法兰西王国", "infantry"), true);
assert.equal(game.canRecruitCombatType(world, "法兰西王国", "cavalry"), true);
assert.equal(game.canRecruitCombatType(world, "法兰西王国", "artillery"), false);

const frenchTile = world.tiles.find(tile => tile.controller === "法兰西王国" && tile.city && tile.pop.peasants > 0 && tile.pop.nobles > 0);
assert.ok(frenchTile);
const peasantsBefore = frenchTile.pop.peasants;
const levy = game.mobilizeArmy(world, "法兰西王国", frenchTile.id, "infantry");
assert.equal(frenchTile.pop.peasants, peasantsBefore - 1);
assert.equal(levy.units[0].combatType, "infantry");
assert.equal(levy.units[0].serviceType, "levy");

frenchTile.occupier = "英格兰王国";
frenchTile.occupation = 100;
assert.throws(
  () => game.mobilizeArmy(world, "法兰西王国", frenchTile.id, "infantry"),
  /被占领/
);
frenchTile.occupier = null;
frenchTile.occupation = 0;

const popBeforeMercenary = JSON.stringify(frenchTile.pop);
const mercenary = game.hireMercenary(world, "法兰西王国", frenchTile.id);
assert.equal(JSON.stringify(frenchTile.pop), popBeforeMercenary);
assert.ok(mercenary.units.every(unit => unit.serviceType === "mercenary"));
assert.equal(mercenary.mercenaryLoyalty, 70);

console.log("warfare state tests passed");

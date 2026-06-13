const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const demoPath = path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html");
const html = fs.readFileSync(demoPath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

assert.ok(script, "demo script should exist");
assert.match(script, /function planArmyRoute\(/, "army route planning should exist");

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
  globalThis.__warfareMovementTest = {
    newState,
    worldNeighbors,
    terrainMoveCost,
    planArmyRoute,
    planAiWarOrders,
    executeMovementPhase,
    enemyControlZone,
    areAtWar
  };`,
  context
);

const game = context.__warfareMovementTest;
const world = game.newState();
context.state = world;

const franceArmy = Object.values(world.warfare.armies).find(army => army.owner === "法兰西王国");
assert.ok(franceArmy);

const adjacent = game.worldNeighbors(world, franceArmy.tileId).find(id => !world.tiles[id].isSea);
assert.notEqual(adjacent, undefined);
const adjacentTile = world.tiles[adjacent];
const baseCost = game.terrainMoveCost(world, franceArmy.tileId, adjacent);
world.roads.add([franceArmy.tileId, adjacent].sort((a, b) => a - b).join("-"));
assert.ok(game.terrainMoveCost(world, franceArmy.tileId, adjacent) < baseCost);

const mountain = world.tiles.find(tile => !tile.isSea && tile.terrain === "mountains");
assert.ok(mountain);
mountain.climate = "alpine";
assert.equal(game.terrainMoveCost(world, franceArmy.tileId, mountain.id), Infinity);

const route = game.planArmyRoute(world, franceArmy.id, adjacent);
assert.deepEqual(JSON.parse(JSON.stringify(route)), [adjacent]);
assert.equal(franceArmy.tileId === adjacent, false, "planning should not move immediately");
assert.deepEqual(JSON.parse(JSON.stringify(franceArmy.plannedPath)), [adjacent]);

const startTile = franceArmy.tileId;
const result = game.executeMovementPhase(world);
assert.equal(franceArmy.tileId, adjacent);
assert.equal(result.moved.some(move => move.armyId === franceArmy.id && move.from === startTile && move.to === adjacent), true);

const englandArmy = Object.values(world.warfare.armies).find(army => army.owner === "英格兰王国");
assert.ok(englandArmy);
const enemyNeighbor = game.worldNeighbors(world, franceArmy.tileId).find(id => !world.tiles[id].isSea);
englandArmy.tileId = enemyNeighbor;
assert.equal(game.enemyControlZone(world, "法兰西王国", franceArmy.tileId), true);

franceArmy.plannedPath = [enemyNeighbor];
franceArmy.order = "march";
const encounterResult = game.executeMovementPhase(world);
assert.equal(encounterResult.encounters.length, 1);
assert.ok(encounterResult.encounters[0].armyIds.includes(franceArmy.id));
assert.ok(encounterResult.encounters[0].armyIds.includes(englandArmy.id));
assert.equal(game.areAtWar("法兰西王国", "英格兰王国", world), true);

const zocWorld = game.newState();
const zocFrance = Object.values(zocWorld.warfare.armies).find(army => army.owner === "法兰西王国");
const zocEngland = Object.values(zocWorld.warfare.armies).find(army => army.owner === "英格兰王国");
const zocLayout = zocWorld.tiles
  .filter(tile => !tile.isSea)
  .map(center => {
    const landNeighbors = game.worldNeighbors(zocWorld, center.id).filter(id => !zocWorld.tiles[id].isSea);
    const pair = landNeighbors.flatMap((left, index) =>
      landNeighbors.slice(index + 1)
        .filter(right => game.worldNeighbors(zocWorld, left).includes(right))
        .map(right => [left, right])
    )[0];
    return pair ? { center, pair } : null;
  })
  .find(Boolean);
assert.ok(zocLayout);
zocEngland.tileId = zocLayout.center.id;
zocFrance.tileId = zocLayout.pair[0];
for (const id of zocLayout.pair) zocWorld.tiles[id].controller = "法兰西王国";
zocFrance.plannedPath = [zocLayout.pair[1]];
zocFrance.order = "march";
const zocResult = game.executeMovementPhase(zocWorld);
assert.equal(zocFrance.tileId, zocLayout.pair[0], "an army cannot move directly between hostile control zones");
assert.equal(zocResult.moved.some(move => move.armyId === zocFrance.id), false);

const crossingWorld = game.newState();
const crossingFrance = Object.values(crossingWorld.warfare.armies).find(army => army.owner === "法兰西王国");
const crossingEngland = Object.values(crossingWorld.warfare.armies).find(army => army.owner === "英格兰王国");
const crossingNeighbor = game.worldNeighbors(crossingWorld, crossingFrance.tileId).find(id => !crossingWorld.tiles[id].isSea);
crossingEngland.tileId = crossingNeighbor;
crossingFrance.plannedPath = [crossingNeighbor];
crossingEngland.plannedPath = [crossingFrance.tileId];
crossingFrance.order = "march";
crossingEngland.order = "march";
const crossingResult = game.executeMovementPhase(crossingWorld);
assert.equal(crossingResult.encounters.length, 1, "crossing hostile armies should create one encounter");

const aiWorld = game.newState();
const aiEngland = Object.values(aiWorld.warfare.armies).find(army => army.owner === "英格兰王国");
assert.equal(aiEngland.plannedPath.length, 0);
game.planAiWarOrders(aiWorld);
assert.ok(aiEngland.plannedPath.length > 0, "AI attacker should plan a route toward its war goal");

console.log("warfare movement tests passed");

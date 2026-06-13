const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.match(script, /function applyOccupation\(/, "occupation resolver should exist");

const pureScript = script.slice(0, script.indexOf('document.getElementById("endTurnBtn").onclick'));
const context = { console, Math, Map, Set, document:{ createElementNS(){ return { setAttribute(){} }; } } };
vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__occupationTest = {
    newState,
    applyOccupation,
    processOccupations,
    controlledTiles,
    countryOccupiedPopulation,
    devastationOutputFactor,
    output
  };`,
  context
);

const game = context.__occupationTest;
const world = game.newState();
const franceArmy = Object.values(world.warfare.armies).find(army => army.owner === "法兰西王国");
const target = world.tiles.find(tile =>
  !tile.isSea
  && tile.controller === "英格兰王国"
  && !tile.buildings.includes("fort")
);
assert.ok(target);

const legalOwner = target.controller;
franceArmy.tileId = target.id;
game.applyOccupation(world, franceArmy);
assert.equal(target.controller, legalOwner);
assert.equal(target.occupier, "法兰西王国");
assert.ok(target.occupation > 0);
const occupiedOutput = game.output(target, legalOwner, new Map([[target.id, 0]]));
assert.deepEqual(
  JSON.parse(JSON.stringify(occupiedOutput)),
  { food:0, money:0, military:0, control:target.control, proximity:0 }
);
const occupiedShareBeforeSiege = game.countryOccupiedPopulation(world, "英格兰王国");

const fort = world.tiles.find(tile =>
  !tile.isSea
  && tile.controller === "英格兰王国"
  && tile.buildings.includes("fort")
);
assert.ok(fort);
franceArmy.tileId = fort.id;
const fortCaptured = game.applyOccupation(world, franceArmy);
assert.equal(fortCaptured, false);
assert.equal(fort.controller, "英格兰王国");
assert.equal(fort.occupier, "法兰西王国");
assert.ok(fort.occupation > 0 && fort.occupation < 100);
assert.equal(game.countryOccupiedPopulation(world, "英格兰王国"), occupiedShareBeforeSiege);

franceArmy.tileId = world.tiles.find(tile => tile.controller === "法兰西王国" && !tile.isSea).id;
const previousOccupation = target.occupation;
game.processOccupations(world);
assert.ok(target.occupation < previousOccupation);

target.occupation = 5;
game.processOccupations(world);
assert.equal(target.occupier, null);
assert.equal(target.controller, legalOwner);
target.devastation = 80;
assert.equal(game.devastationOutputFactor(target), 0.6);

console.log("warfare occupation tests passed");

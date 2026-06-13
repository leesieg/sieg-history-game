const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.match(script, /function processWarState\(/, "war state processor should exist");

const pureScript = script.slice(0, script.indexOf('document.getElementById("endTurnBtn").onclick'));
const context = { console, Math, Map, Set, document:{ createElementNS(){ return { setAttribute(){} }; } } };
vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__warStateTest = { newState, processWarState };`,
  context
);

const game = context.__warStateTest;
const world = game.newState();
const war = world.diplomacy.wars.find(item => item.name === "百年战争");
assert.ok(war.primaryGoal);
assert.ok(war.participants["法兰西王国"]);
assert.ok(war.participants["英格兰王国"]);

world.countries["法兰西王国"].warfare.quarterCasualties = 3000;
const frenchGoalTile = world.tiles[war.primaryGoal.tileId];
frenchGoalTile.occupier = "英格兰王国";
frenchGoalTile.occupation = 100;
const unrelatedExhaustion = world.countries["威尼斯共和国"].warfare.warExhaustion;

game.processWarState(world);

assert.ok(world.countries["法兰西王国"].warfare.warExhaustion > 0);
assert.equal(world.countries["威尼斯共和国"].warfare.warExhaustion, unrelatedExhaustion);
assert.ok(war.score > 0, "attacker occupation of the main goal should produce positive score");
assert.ok(war.participants["法兰西王国"].warWill < war.participants["英格兰王国"].warWill);

console.log("warfare war state tests passed");

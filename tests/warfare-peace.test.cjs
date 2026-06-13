const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.match(script, /function concludePeace\(/, "peace resolver should exist");

const pureScript = script.slice(0, script.indexOf('document.getElementById("endTurnBtn").onclick'));
const context = { console, Math, Map, Set, document:{ createElementNS(){ return { setAttribute(){} }; } } };
vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__peaceTest = { newState, peaceTermsCost, canConcludePeace, concludePeace, areAtWar };`,
  context
);

const game = context.__peaceTest;
const world = game.newState();
const war = world.diplomacy.wars.find(item => item.name === "百年战争");
const target = world.tiles[war.primaryGoal.tileId];
world.countries["法兰西王国"].warfare.warExhaustion = 7;
assert.equal(
  game.canConcludePeace(world, war, "法兰西王国", [{ type:"status_quo" }]),
  false,
  "the defender should not be able to force an immediate white peace"
);
assert.throws(
  () => game.concludePeace(world, war.id, "法兰西王国", [{ type:"status_quo" }]),
  /尚未接受/
);
war.score = 100;
target.occupier = "布列塔尼公国";
target.occupation = 100;

assert.ok(game.peaceTermsCost(world, war, [{ type:"target_territory" }]) > 0);
assert.throws(
  () => game.concludePeace(world, war.id, "英格兰王国", [{ type:"reparations", amount:999 }]),
  /战争分数不足/
);

game.concludePeace(world, war.id, "英格兰王国", [{ type:"target_territory" }]);

assert.equal(target.controller, "英格兰王国", "war goal should go to the claimant, not the occupier");
assert.equal(target.occupier, null);
assert.equal(game.areAtWar("法兰西王国", "英格兰王国", world), false);
assert.ok(world.diplomacy.truces.some(truce => truce.parties.includes("法兰西王国") && truce.parties.includes("英格兰王国")));
assert.equal(world.countries["法兰西王国"].warfare.warExhaustion, 7, "peace should preserve war exhaustion");

console.log("warfare peace tests passed");

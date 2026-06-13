const assert = require("node:assert/strict");
const { loadDemo2 } = require("./demo2-harness.cjs");

const api = loadDemo2();
api.state = api.newState();
const world = api.state;
const player = "法兰西王国";
assert.equal(world.playerPolity, player);

const initialBuildings = world.tiles.reduce((s, t) => s + (t.buildings ? t.buildings.length : 0), 0);
let survivedTurns = 0;
let redEventsSeen = 0;
const seenSituations = new Set();

for (let i = 0; i < 48; i++) {
  while (world.playerEvents.length) {
    const event = world.playerEvents[0];
    redEventsSeen += 1;
    const country = world.countries[event.polity];
    const choice = event.type === "estate_ultimatum"
      ? (country.money >= 40 ? "concede" : country.military >= 30 ? "suppress" : "ignore")
      : "accept";
    api.resolvePlayerEvent(event, choice);
  }
  if (world.pendingElection) api.completeLeaderElection(world, 0);
  api.endTurn();
  for (const sit of world.situations) seenSituations.add(`${sit.key}`);
  if (world.gameOver) break;
  survivedTurns = world.turn;
}

console.log("survived to turn", survivedTurns, "gameOver:", world.gameOver, "year:", api.calendarForTurn(world.turn).year);
console.log("red events handled:", redEventsSeen);
console.log("world events:", world.worldEvents.length, "sample:", world.worldEvents.slice(0, 5).map(e => e.text));

// ---- P0 验收：被动玩家中位存活 ≥ 20 回合 ----
assert.ok(survivedTurns >= 20, `被动存活应≥20回合，实际 ${survivedTurns}`);

// ---- 情势按期发生 ----
console.log("situations seen:", [...seenSituations]);
assert.ok(seenSituations.has("little_ice_age"), "小冰期发生过");
assert.ok(seenSituations.has("trade_boom"), "商贸繁荣发生过");
assert.ok(seenSituations.has("black_death"), "黑死病发生过");
if (survivedTurns >= 42) {
  assert.ok(world.tiles.some(t => t.plagueHitTurn), "黑死病应已侵袭部分地区");
}

// ---- 世界活着：AI 有建设/事件 ----
const finalBuildings = world.tiles.reduce((s, t) => s + (t.buildings ? t.buildings.length : 0), 0);
console.log("buildings:", initialBuildings, "->", finalBuildings);
assert.ok(finalBuildings > initialBuildings, "AI 应当兴建了建筑");
assert.ok(world.worldEvents.length >= 5, "世界事件流非空");

// ---- 因果报告存在 ----
const playerCountry = world.countries[player];
assert.ok(playerCountry.report && playerCountry.report.foodParts.length, "玩家季度报告已生成");
assert.ok(playerCountry.trend.length >= 3, "趋势快照累积");

// ---- 预测可用 ----
const forecast = api.forecastCountry(player);
assert.ok(Number.isFinite(forecast.food) && Number.isFinite(forecast.legitimacy));

// ---- 编年史与史诗数据 ----
assert.ok(playerCountry.chronicle.length >= 1, "编年史有记录");

// ---- AI 战争存在或结束过（开局两场脚本战争 + AI 宣战窗口）----
const warEvents = world.worldEvents.filter(e => e.kind === "war" || e.kind === "battle");
console.log("war/battle events:", warEvents.length);

console.log("demo2-sim48: all assertions passed");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/techs.js", "data/rules.js", "data/faiths.js", "data/trade.js", "data/countries.js",
  "engine/world.js", "engine/politics.js", "engine/economy.js",
  "engine/diplomacy.js", "engine/warfare.js", "engine/faith.js", "engine/trade.js",
  "engine/history.js", "engine/objectives.js", "engine/proposals.js", "engine/strategy.js", "engine/turn.js",
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
w.HIFI_FAITH_ENGINE.initializeFaith(world);
w.HIFI_TRADE_ENGINE.initializeTrade(world);

// 3.1：新增引擎在各时代/战争/和平态都返回合法结构、不抛错
function assertNewEngines(label) {
  const obj = w.HIFI_OBJECTIVES_ENGINE;
  const prop = w.HIFI_PROPOSALS_ENGINE;
  const hist = w.HIFI_HISTORY_ENGINE;
  const polity = world.playerPolity;
  const mission = obj.nationalMission(world, polity);
  assert.ok(mission && mission.title && mission.why && Array.isArray(mission.targets), `nationalMission 合法 @${label}`);
  const seasons = obj.seasonTasks(world, polity);
  assert.ok(Array.isArray(seasons) && seasons.length >= 1, `seasonTasks 非空 @${label}`);
  const advice = obj.advisorProposals(world, polity);
  assert.ok(Array.isArray(advice) && advice.length <= 3, `advisorProposals ≤3 @${label}`);
  for (const item of advice) {
    if (item.proposal.type === "goto") continue;
    assert.ok(prop.actionCatalog[item.proposal.type], `advisorProposals 行动必须在白名单内 @${label}`);
    assert.ok(item.preview && item.preview.cost && item.preview.gain && item.preview.risk, `advisorProposals 预览三字段完整 @${label}`);
  }
  const ledger = hist.quarterLedger(world, polity);
  for (const key of ["food", "money", "military"]) {
    assert.equal(typeof ledger[key].delta, "number", `账本 ${key}.delta 必须为数值 @${label}`);
    assert.ok(Array.isArray(ledger[key].sources), `账本 ${key}.sources 必须为数组 @${label}`);
  }
}

const finalTurn = (1830 - 1337) * 4 + 1;
while (world.turn < finalTurn) {
  if (world.pendingElection) w.HIFI_POLITICS_ENGINE.completeElection(world, 0);
  world.playerEvents.splice(0);
  world.pendingTransition = null;
  const player = world.countries[world.playerPolity];
  for (const key of Object.keys(w.HIFI_RULES.technologies)) {
    if (w.HIFI_ECONOMY_ENGINE.technologyReady(world, player, key).ready) {
      w.HIFI_ECONOMY_ENGINE.adoptTechnology(world, world.playerPolity, key);
    }
  }
  w.HIFI_TURN_ENGINE.advanceQuarter(world);
  if (world.turn % 40 === 0) assertNewEngines(world.turn);
}

assert.equal(w.HIFI_HISTORY_ENGINE.eras[world.eraIndex].key, "industrial");
assert.equal(world.flags.reformation, true);
assert.equal(world.flags.industrialization, true);
assert.ok(Object.values(world.countries).some(country => country.technology.railways));
assert.ok(Object.values(world.countries).every(country => country.missionsDone.length > 0));
assert.ok(world.trade.routes.newWorld.active);
assert.ok(world.worldEvents.length > 0);

assertNewEngines("final");
// 资源膨胀基线快照：仅记录数值有限，不作平衡断言（数值出口调整属 docs/design/20，本计划不动）
const baseline = world.countries[world.playerPolity];
for (const key of ["food", "money", "military"]) {
  assert.ok(Number.isFinite(baseline[key]), `资源 ${key} 必须是有限数值（非 NaN/Infinity）`);
}

console.log(`hifi longrun passed: ${world.turn} · ${w.HIFI_HISTORY_ENGINE.eras[world.eraIndex].label}`);

// --- Task A7: 持续扩军场景下资源不膨胀回归 ---
// 复用本文件已加载的引擎（context/w），起一个独立的新世界，避免和上面 1337→1830 的长跑互相影响。
{
  const expandWorld = w.HIFI_WORLD_ENGINE.createWorld([
    tile(0, "法兰西王国", "巴黎", 0),
    tile(1, "英格兰王国", "伦敦", 20),
  ]);
  w.HIFI_POLITICS_ENGINE.initializePolitics(expandWorld);
  w.HIFI_ECONOMY_ENGINE.initializeEconomy(expandWorld);
  w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(expandWorld);
  w.HIFI_WARFARE_ENGINE.initializeWarfare(expandWorld);
  w.HIFI_HISTORY_ENGINE.initializeHistory(expandWorld);
  w.HIFI_FAITH_ENGINE.initializeFaith(expandWorld);
  w.HIFI_TRADE_ENGINE.initializeTrade(expandWorld);

  const polity = expandWorld.playerPolity;
  const playerTileId = expandWorld.tiles.find(t => t.polity === polity && !t.isSea).id;
  const series = [];
  for (let i = 0; i < 40; i++) {
    if (i % 4 === 0) {
      try {
        w.HIFI_WARFARE_ENGINE.mobilizeArmy(expandWorld, polity, playerTileId, "infantry");
      } catch (e) { /* 行动点/人口不足时跳过，不影响回归本身 */ }
    }
    w.HIFI_TURN_ENGINE.advanceQuarter(expandWorld);
    series.push(expandWorld.countries[polity].military);
  }
  // 军需不应单调暴涨：维护费应在持续扩军下咬住增长，后期至少出现一次下降或持平
  const monotonic = series.every((v, i) => i === 0 || v >= series[i - 1]);
  assert.ok(!monotonic, `持续扩军下军需不应单调上涨（维护费应咬住增长），序列：${series.join(",")}`);
  console.log("A7 资源不膨胀（持续扩军）OK");
}

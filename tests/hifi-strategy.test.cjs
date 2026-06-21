"use strict";

// Phase A：AI 主动性（宣战 / 议和 / 索附属）。
// 验证 strategy.js 的决策纯函数与 processAI 集成行为，全部走真实引擎 API。

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/rules.js",
  "engine/world.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/history.js",
  "engine/strategy.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const warfare = context.window.HIFI_WARFARE_ENGINE;
const strategy = context.window.HIFI_STRATEGY_ENGINE;

// 用非历史国名，避免 initializeWarfare 预置军团 / 历史战争干扰场景。
function buildScenario(extraTiles = []) {
  const tiles = [
    { id: 0, isSea: false, polity: "卡斯蒂利亚王国", population: 20, buildings: [], city: "托莱多", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
    { id: 1, isSea: false, polity: "卡斯蒂利亚王国", population: 15, buildings: [], city: "", terrain: "plains", x: 30, y: 10, control: 75, devastation: 0 },
    { id: 2, isSea: false, polity: "格拉纳达酋长国", population: 3, buildings: [], city: "格拉纳达", terrain: "hills", x: 50, y: 10, control: 70, devastation: 0 },
    { id: 3, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 30, y: 40, control: 0 },
    { id: 4, isSea: false, polity: "波兰王国", population: 10, buildings: [], city: "克拉科夫", terrain: "plains", x: 220, y: 220, control: 70, devastation: 0 },
    ...extraTiles,
  ];
  const world = worldEngine.createWorld(tiles, {}, "波兰王国"); // 让卡斯蒂利亚/格拉纳达都是 AI
  diplomacy.initializeDiplomacy(world);
  warfare.initializeWarfare(world);
  // 补 politics 引擎未加载时缺失的字段，使 processCountry 的政治分支不触发、不崩。
  for (const country of Object.values(world.countries)) {
    country.government.assembly = { unlocked: false, support: 50 };
    country.pressures = { military: 0, fiscal: 0, trade: 0, exploration: 0, faith: 0, idea: 0 };
    country.ideas = 0;
  }
  world.diplomacy.wars = [];
  world.diplomacy.truces = [];
  return world;
}

function armCastile(world, soldiers = 1500) {
  return warfare.createArmy(world, {
    owner: "卡斯蒂利亚王国",
    tileId: 0,
    name: "卡斯蒂利亚军团",
    units: [{ combatType: "infantry", serviceType: "levy", soldiers }],
  });
}

// ===== warTarget =====
(() => {
  const world = buildScenario();
  armCastile(world);
  assert.strictEqual(
    strategy.warTarget(world, "卡斯蒂利亚王国"),
    "格拉纳达酋长国",
    "军力占优、接壤、态度中立的弱邻应成为宣战目标"
  );
  // 波兰非接壤，不应被选
  assert.notStrictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), "波兰王国", "非接壤国不应被宣战");
})();

// warTarget 各否决条件
(() => {
  // 无军队
  let world = buildScenario();
  assert.strictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), null, "没有军队不应主动宣战");

  // 自身军事压力过高
  world = buildScenario();
  armCastile(world);
  world.countries["卡斯蒂利亚王国"].pressures.military = 60;
  assert.strictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), null, "自身军事压力高不应另开战");

  // 互不侵犯条约
  world = buildScenario();
  armCastile(world);
  world.diplomacy.treaties.push({ id: "t1", type: "nonaggression", parties: ["卡斯蒂利亚王国", "格拉纳达酋长国"], startedTurn: 1, endsTurn: 99 });
  assert.strictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), null, "互不侵犯关系不应宣战");

  // 停战协定期内
  world = buildScenario();
  armCastile(world);
  world.diplomacy.truces.push({ parties: ["卡斯蒂利亚王国", "格拉纳达酋长国"], endsTurn: 50 });
  assert.strictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), null, "停战期内不应宣战");

  // 已在战争中
  world = buildScenario();
  armCastile(world);
  warfare.declareWarOn(world, "卡斯蒂利亚王国", "格拉纳达酋长国");
  assert.strictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), null, "已参战则不另开新战");

  // 目标军力不弱于自己
  world = buildScenario();
  armCastile(world, 1000);
  warfare.createArmy(world, { owner: "格拉纳达酋长国", tileId: 2, name: "酋长卫队", units: [{ combatType: "infantry", serviceType: "levy", soldiers: 1500 }] });
  assert.strictEqual(strategy.warTarget(world, "卡斯蒂利亚王国"), null, "目标军力不弱不应主动宣战");
})();

// ===== shouldSeekPeace =====
(() => {
  const mkWorld = (turn, exhaustion) => ({ turn, countries: { A: { warfare: { warExhaustion: exhaustion } } } });
  const war = (side, score, startedTurn) => ({ score, startedTurn, participants: { A: { side } } });

  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(20, 0), "A", war("defender", 60, 10)), true, "防守方被逼近战争目标应求和");
  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(20, 0), "A", war("defender", 10, 10)), false, "防守方局势尚可不求和");
  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(20, 30), "A", war("defender", 30, 10)), true, "防守方疲惫且落后应求和");
  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(20, 0), "A", war("attacker", 10, 8)), true, "进攻方久攻不下应收手");
  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(20, 0), "A", war("attacker", 60, 18)), false, "进攻方占优不求和");
  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(5, 36), "A", war("attacker", 10, 4)), true, "进攻方疲惫过高应收手");
  assert.strictEqual(strategy.shouldSeekPeace(mkWorld(5, 0), "A", war("attacker", 10, 4)), false, "进攻方开战不久不轻易收手");
})();

// ===== subjectTarget：门控 + 与 evaluateProposal 一致 =====
(() => {
  // 非接壤目标不应被选为附属对象（即使可能被接受）
  let world = buildScenario();
  assert.notStrictEqual(strategy.subjectTarget(world, "卡斯蒂利亚王国"), "波兰王国", "非接壤国不应索附属");

  // 已是附属则不重复索取
  world = buildScenario();
  world.diplomacy.subjects.push({ id: "s1", type: "tributary", overlord: "卡斯蒂利亚王国", subject: "格拉纳达酋长国" });
  assert.strictEqual(strategy.subjectTarget(world, "卡斯蒂利亚王国"), null, "已有从属关系不应重复索取");

  // 关系拉满 → 接壤弱邻可被索附属，且结果与 evaluateProposal 判定一致
  world = buildScenario();
  const view = diplomacy.relationView(world, "格拉纳达酋长国", "卡斯蒂利亚王国");
  view.trust = 100;
  view.threat = 0;
  view.territorialConflict = 0;
  view.strategicInterest = 20;
  const target = strategy.subjectTarget(world, "卡斯蒂利亚王国");
  assert.strictEqual(target, "格拉纳达酋长国", "关系拉满时接壤弱邻应成为附属目标");
  assert.ok(
    diplomacy.evaluateProposal(world, "卡斯蒂利亚王国", target, "tributary").accepted,
    "subjectTarget 的结果必须与 evaluateProposal 的接受判定一致"
  );
})();

// ===== 集成：AI 主动对玩家宣战 =====
(() => {
  const tiles = [
    { id: 0, isSea: false, polity: "卡斯蒂利亚王国", population: 20, buildings: [], city: "托莱多", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
    { id: 1, isSea: false, polity: "卡斯蒂利亚王国", population: 15, buildings: [], city: "", terrain: "plains", x: 30, y: 10, control: 75, devastation: 0 },
    { id: 2, isSea: false, polity: "格拉纳达酋长国", population: 3, buildings: [], city: "格拉纳达", terrain: "hills", x: 50, y: 10, control: 70, devastation: 0 },
    { id: 3, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 30, y: 40, control: 0 },
  ];
  const world = worldEngine.createWorld(tiles, {}, "格拉纳达酋长国"); // 玩家扮演弱国格拉纳达
  diplomacy.initializeDiplomacy(world);
  warfare.initializeWarfare(world);
  context.window.HIFI_HISTORY_ENGINE.initializeHistory(world);
  for (const country of Object.values(world.countries)) {
    country.government.assembly = { unlocked: false, support: 50 };
    country.pressures = { military: 0, fiscal: 0, trade: 0, exploration: 0, faith: 0, idea: 0 };
    country.ideas = 0;
  }
  world.diplomacy.wars = [];
  world.diplomacy.truces = [];
  armCastile(world);

  const eventsBefore = world.worldEvents.length;
  strategy.processAI(world);
  assert.ok(world.diplomacy.wars.length >= 1, "AI 应主动对玩家宣战，产生一场战争");
  const war = world.diplomacy.wars[0];
  assert.ok(war.attackers.includes("卡斯蒂利亚王国"), "卡斯蒂利亚应为进攻方");
  assert.ok(war.defenders.includes("格拉纳达酋长国"), "玩家国家应为防守方");
  assert.ok(world.worldEvents.length > eventsBefore, "AI 宣战应写入世界事件供玩家感知");
  assert.ok(world.__aiWarsThisQuarter <= 2, "单季 AI 新开战争不超过预算上限");
})();

// ===== 集成：AI 在明显劣势时求和 =====
(() => {
  const tiles = [
    { id: 0, isSea: false, polity: "卡斯蒂利亚王国", population: 20, buildings: [], city: "托莱多", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
    { id: 1, isSea: false, polity: "格拉纳达酋长国", population: 3, buildings: [], city: "格拉纳达", terrain: "hills", x: 30, y: 10, control: 70, devastation: 0 },
    { id: 2, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 20, y: 40, control: 0 },
  ];
  const world = worldEngine.createWorld(tiles, {}, "卡斯蒂利亚王国"); // 玩家是进攻方
  diplomacy.initializeDiplomacy(world);
  warfare.initializeWarfare(world);
  context.window.HIFI_HISTORY_ENGINE.initializeHistory(world);
  for (const country of Object.values(world.countries)) {
    country.government.assembly = { unlocked: false, support: 50 };
    country.pressures = { military: 0, fiscal: 0, trade: 0, exploration: 0, faith: 0, idea: 0 };
    country.ideas = 0;
  }
  world.diplomacy.wars = [];
  world.diplomacy.truces = [];

  // 玩家（卡斯蒂利亚）对 AI（格拉纳达）宣战并大幅领先 → AI 防守方应求和
  const war = warfare.declareWarOn(world, "卡斯蒂利亚王国", "格拉纳达酋长国");
  war.score = 60;
  strategy.processAI(world);
  assert.ok(!world.diplomacy.wars.some(item => item.id === war.id), "处于明显劣势的 AI 防守方应主动议和结束战争");
  assert.ok(world.diplomacy.truces.length >= 1, "议和后应建立停战");
})();

console.log("hifi-strategy.test.cjs ✓");

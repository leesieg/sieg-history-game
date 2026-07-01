const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/geography.js",
  "data/countries.js",
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
  "engine/proposals.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const economy = context.window.HIFI_ECONOMY_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const warfare = context.window.HIFI_WARFARE_ENGINE;
const proposals = context.window.HIFI_PROPOSALS_ENGINE;

assert.ok(proposals, "必须挂载 window.HIFI_PROPOSALS_ENGINE");
assert.ok(proposals.actionCatalog, "必须暴露 actionCatalog");
assert.equal(typeof proposals.validate, "function");
assert.equal(typeof proposals.preview, "function");
assert.equal(typeof proposals.execute, "function");

// --- 构造一个有两国地块的世界，覆盖经济/外交/军事三类行动 ---
const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, control: 80, good: "grain", buildings: [], city: "巴黎", devastation: 0 },
  { id: 2, isSea: false, polity: "法兰西王国", population: 8, control: 55, good: "iron", buildings: [], city: "", devastation: 0 },
  { id: 3, isSea: false, polity: "英格兰王国", population: 10, control: 70, good: "wool", buildings: [], city: "伦敦", devastation: 0 },
];
const world = worldEngine.createWorld(tiles);
economy.initializeEconomy(world);
diplomacy.initializeDiplomacy(world);
warfare.initializeWarfare(world);
const polity = "法兰西王国";
const country = world.countries[polity];

// --- 1) actionCatalog 结构：每个 type 都有六键 ---
const requiredKeys = ["label", "advisor", "cost", "apply", "preview", "available"];
const types = Object.keys(proposals.actionCatalog);
assert.ok(types.length >= 6, "行动目录至少应覆盖经济/外交/军事六类行动");
for (const type of types) {
  const entry = proposals.actionCatalog[type];
  for (const key of requiredKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(entry, key), `${type} 缺少 ${key}`);
  }
}

// --- 2) 资源不足场景：validate.ok === false，reason 为非空中文 ---
country.money = 0;
country.actionPoints.administrative = 0;
const insufficientProposal = { type: "build_market", params: { tileId: 1 } };
const insufficientResult = proposals.validate(world, polity, insufficientProposal);
assert.equal(insufficientResult.ok, false, "资源不足必须 validate 失败");
assert.ok(insufficientResult.reason && /[一-龥]/.test(insufficientResult.reason), "失败原因必须是非空中文");

// --- 3) 可行场景：validate.ok === true，execute 后 state 真实变化 ---
country.money = 100;
country.actionPoints.administrative = 3;
const feasibleProposal = { type: "build_market", params: { tileId: 1 } };
const feasibleResult = proposals.validate(world, polity, feasibleProposal);
assert.equal(feasibleResult.ok, true, "可行方案必须 validate 通过");
const moneyBefore = country.money;
const apBefore = country.actionPoints.administrative;
proposals.execute(world, polity, feasibleProposal);
assert.ok(country.money < moneyBefore, "建设市场必须扣减金钱");
assert.ok(country.actionPoints.administrative < apBefore, "建设市场必须消耗行政点");
assert.ok(tiles[0].buildings.includes("market"), "地块必须真实出现市场建筑");

// --- 外交行动：send_envoy 可行场景，state 出现 mission ---
country.actionPoints.diplomatic = 5;
const envoyProposal = { type: "send_envoy", params: { target: "英格兰王国" } };
assert.equal(proposals.validate(world, polity, envoyProposal).ok, true);
const missionsBefore = world.diplomacy.missions.length;
proposals.execute(world, polity, envoyProposal);
assert.equal(world.diplomacy.missions.length, missionsBefore + 1, "派遣使节必须真实产生 mission");

// --- 外交行动：使节耗尽后 send_envoy 不可行 ---
country.diplomacy.envoys = 0;
const envoyProposal2 = { type: "send_envoy", params: { target: "英格兰王国" } };
const noEnvoyResult = proposals.validate(world, polity, envoyProposal2);
assert.equal(noEnvoyResult.ok, false, "无空闲使节必须 validate 失败");
assert.ok(/[一-龥]/.test(noEnvoyResult.reason));

// --- 外交行动：propose_trade 在 evaluateProposal.available===true 但 .accepted===false 时，
//     validate 必须拦截（否则 execute 会委托 proposeTreaty 抛出"对方拒绝"未捕获异常）---
country.actionPoints.diplomatic = 5;
const tradeEvaluation = diplomacy.evaluateProposal(world, polity, "英格兰王国", "trade");
assert.equal(tradeEvaluation.available, true, "初始世界的贸易提案应当是 available（无重复契约/容量未满）");
assert.equal(tradeEvaluation.accepted, false, "初始世界法兰西/英格兰初始信任不足以达到贸易门槛，应天然被拒绝");
const tradeProposal = { type: "propose_trade", params: { target: "英格兰王国" } };
const tradeResult = proposals.validate(world, polity, tradeProposal);
assert.equal(tradeResult.ok, false, "对方会拒绝的贸易提案必须 validate 失败，不能留给 execute 抛异常");
assert.ok(tradeResult.reason && /[一-龥]/.test(tradeResult.reason), "失败原因必须是非空中文");
assert.throws(
  () => proposals.execute(world, polity, tradeProposal),
  /[一-龥]/,
  "若强行 execute 不可行的贸易提案，proposeTreaty 仍应抛出中文错误（双重防线）"
);

// --- 军事行动：mobilize_army 可行场景 ---
country.actionPoints.military = 3;
country.warfare.warExhaustion = 0;
const cavalryProposal = { type: "mobilize_army", params: { tileId: 1, combatType: "cavalry" } };
const cavalryResult = proposals.validate(world, polity, cavalryProposal);
assert.equal(cavalryResult.ok, false, "缺少马匹来源时骑兵动员必须 validate 失败");
assert.match(cavalryResult.reason, /马匹/, "骑兵动员失败原因必须说明马匹来源");
assert.equal(
  proposals.actionPreview(world, polity, "mobilize_army", cavalryProposal.params).available.ok,
  false,
  "缺少马匹来源时行动预览必须显示不可用"
);
country.technology.artillery = true;
country.military = 100;
const artilleryProposal = { type: "mobilize_army", params: { tileId: 1, combatType: "artillery" } };
const artilleryResult = proposals.validate(world, polity, artilleryProposal);
assert.equal(artilleryResult.ok, false, "缺少硝石来源时炮兵动员必须 validate 失败");
assert.match(artilleryResult.reason, /硝石/, "炮兵动员失败原因必须说明硝石来源");
assert.equal(
  proposals.actionPreview(world, polity, "mobilize_army", artilleryProposal.params).available.ok,
  false,
  "缺少硝石来源时行动预览必须显示不可用"
);
const mobilizeProposal = { type: "mobilize_army", params: { tileId: 1, combatType: "infantry" } };
assert.equal(proposals.validate(world, polity, mobilizeProposal).ok, true);
const armyCountBefore = Object.keys(world.warfare.armies).length;
proposals.execute(world, polity, mobilizeProposal);
assert.equal(Object.keys(world.warfare.armies).length, armyCountBefore + 1, "动员必须真实产生军团");

// --- preview 必须返回人类可读中文三段 ---
const preview = proposals.preview(world, polity, { type: "develop_tile", params: { tileId: 1 } });
assert.equal(typeof preview.cost, "string");
assert.equal(typeof preview.gain, "string");
assert.equal(typeof preview.risk, "string");
assert.ok(preview.cost.length > 0 && preview.gain.length > 0 && preview.risk.length > 0);

// --- 4) 白名单外的 type：validate.ok === false，且不抛异常 ---
let threw = false;
let outOfListResult;
try {
  outOfListResult = proposals.validate(world, polity, { type: "not_a_real_action", params: {} });
} catch (error) {
  threw = true;
}
assert.equal(threw, false, "白名单外的 type 不应抛出未捕获异常");
assert.equal(outOfListResult.ok, false, "白名单外的 type 必须 validate 失败");
assert.ok(outOfListResult.reason && /[一-龥]/.test(outOfListResult.reason));

// --- execute 对不可行方案应抛出可读中文错误（委托引擎自身的 throw） ---
country.money = 0;
country.actionPoints.administrative = 0;
assert.throws(
  () => proposals.execute(world, polity, { type: "build_market", params: { tileId: 2 } }),
  /[一-龥]/,
  "execute 失败必须抛出中文错误"
);

// --- index.html 必须按依赖顺序加载 proposals.js（在 objectives.js 之后）---
const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
assert.ok(html.includes("scripts/engine/proposals.js"), "页面必须加载 proposals 引擎");
const objectivesIndex = html.indexOf("scripts/engine/objectives.js");
const proposalsIndex = html.indexOf("scripts/engine/proposals.js");
assert.ok(objectivesIndex >= 0 && proposalsIndex > objectivesIndex, "proposals.js 必须在 objectives.js 之后加载");

// --- Task B1: actionPreview ---
{
  country.money = 100;
  country.actionPoints.administrative = 3;
  const tile = tiles.find(t => t.polity === polity && !t.isSea && !t.buildings.includes("market"));
  const p = proposals.actionPreview(world, polity, "build_market", { tileId: tile.id });
  assert.ok(p.cost && typeof p.cost === "object", "应返回成本对象");
  assert.ok(p.effect && typeof p.effect === "object", "应返回效果预览");
  assert.equal(typeof p.available.ok, "boolean", "应返回可用性布尔");
  console.log("B1 actionPreview OK");
}

// --- Task B2: 预览口径一致 ---
{
  country.money = 100;
  country.actionPoints.administrative = 3;
  const tile = tiles.find(t => t.polity === polity && !t.isSea && !t.buildings.includes("market"));
  const preview = proposals.actionPreview(world, polity, "build_market", { tileId: tile.id });
  const moneyBefore = country.money;
  proposals.execute(world, polity, { type: "build_market", params: { tileId: tile.id } });
  const spent = moneyBefore - country.money;
  assert.equal(spent, preview.cost.money || 0, `成本预览(${preview.cost.money})应等于实际花费(${spent})`);
  console.log("B2 口径一致 OK");
}

// --- Task B3 修复：actionPreview 必须纳入可负担性校验（structurallyOk && !resourceReason）---
{
  // 前面 B1/B2 已在两块己方地块上建过市场，这里重置其中一块以恢复"结构上可行"的前提
  const tile = tiles.find(t => t.polity === polity && !t.isSea);
  tile.buildings = tile.buildings.filter(b => b !== "market");

  // 结构上合法，但负担不起：money=0、行政点=0
  country.money = 0;
  country.actionPoints.administrative = 0;
  const unaffordable = proposals.actionPreview(world, polity, "build_market", { tileId: tile.id });
  assert.equal(unaffordable.available.ok, false, "负担不起时 actionPreview.available.ok 必须为 false");
  assert.ok(
    unaffordable.reason && /[一-龥]/.test(unaffordable.reason),
    "负担不起时必须给出非空中文原因"
  );

  // 同一动作，完全负担得起时，必须为 true（防止门闩永远 false）
  country.money = 100;
  country.actionPoints.administrative = 3;
  const affordable = proposals.actionPreview(world, polity, "build_market", { tileId: tile.id });
  assert.equal(affordable.available.ok, true, "负担得起且结构合法时 actionPreview.available.ok 必须为 true");
  console.log("B3 修复 actionPreview 可负担性校验 OK");
}

console.log("hifi proposals engine passed");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/countries.js",
  "data/institutions.js",
  "data/supranational.js",
  "engine/world.js",
  "engine/diplomacy.js",
  "engine/politics.js",
  "engine/warfare.js",
  "engine/supranational.js",
]) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);

const w = context.window;
const tile = (id, polity, city, x, religion = "天主教", population = 8) => ({
  id,
  x,
  y: 0,
  isSea: false,
  polity,
  region: city,
  city,
  population,
  terrain: "plains",
  climate: "temperate",
  religion,
  good: "grain",
  control: 75,
  buildings: [],
});

const world = w.HIFI_WORLD_ENGINE.createWorld([
  tile(0, "法兰西王国", "巴黎", 0, "天主教", 16),
  tile(1, "布列塔尼公国", "南特", 2, "天主教", 6),
  tile(2, "英格兰王国", "伦敦", 12, "天主教", 14),
], undefined, "法兰西王国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_WARFARE_ENGINE.initializeWarfare(world);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(world);

world.countries["法兰西王国"].actionPoints.diplomatic = 4;
w.HIFI_DIPLOMACY_ENGINE.addClaim(world, "法兰西王国", "布列塔尼公国", "dynastic");
w.HIFI_DIPLOMACY_ENGINE.leaderRelationView(world, "法兰西王国", "布列塔尼公国").kinship = true;
w.HIFI_DIPLOMACY_ENGINE.leaderRelationView(world, "布列塔尼公国", "法兰西王国").kinship = true;

const union = w.HIFI_SUPRANATIONAL_ENGINE.claimPersonalUnion(world, "法兰西王国", "布列塔尼公国");
assert.equal(union.type, "dynastic", "宣告继承应创建 dynastic 共主结构");
assert.equal(union.head, "法兰西王国", "共主主邦应为宣告继承者");
assert.equal(world.countries["布列塔尼公国"].union.senior, "法兰西王国", "从邦国家状态应记录主邦");
assert.equal(world.countries["布列塔尼公国"].leader.unionSenior, "法兰西王国", "从邦应共享主邦共君");
assert.equal(world.countries["法兰西王国"].actionPoints.diplomatic, 2, "宣告继承应消耗外交点");
assert.ok(world.diplomacy.organizations.some(item => item.id === "union:法兰西王国"), "共主结构应同步到外交组织");

assert.equal(
  w.HIFI_DIPLOMACY_ENGINE.evaluateProposal(world, "布列塔尼公国", "英格兰王国", "trade").available,
  false,
  "共主从邦不能独立缔结条约"
);
assert.equal(
  w.HIFI_WARFARE_ENGINE.canDeclareWar(world, "布列塔尼公国", "英格兰王国").ok,
  false,
  "共主从邦不能独立宣战"
);

union.cohesion = 60;
w.HIFI_SUPRANATIONAL_ENGINE.processSupranational(world);
assert.ok(Number.isFinite(union.cohesion), "共主向心力必须每季结算为数值");
assert.ok(union.lastDrift.parts.length, "共主向心力漂移应记录来源");

union.cohesion = 0;
w.HIFI_SUPRANATIONAL_ENGINE.processSupranational(world);
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.unionFor(world, "布列塔尼公国"), undefined, "向心力归零应解体共主邦联");
assert.equal(world.countries["布列塔尼公国"].union, undefined, "解体后从邦状态应清空");
assert.equal(world.diplomacy.organizations.some(item => item.id === "union:法兰西王国"), false, "解体后外交组织不应残留");

const second = w.HIFI_SUPRANATIONAL_ENGINE.createPersonalUnion(world, "法兰西王国", "布列塔尼公国", "测试继承");
second.cohesion = 90;
world.countries["法兰西王国"].actionPoints.administrative = 10;
world.countries["法兰西王国"].money = 200;
assert.throws(
  () => w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国"),
  /官僚体系|直接征税|高王权/,
  "共主整合必须要求官僚、财政或高王权能力"
);
world.countries["法兰西王国"].technology ||= {};
world.countries["法兰西王国"].technology.bureaucracy = true;
w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国");
assert.throws(
  () => w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国"),
  /同一季度/,
  "共主整合不能在同一季度连续推进"
);
world.turn += 1;
w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国");
world.turn += 1;
w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国");
assert.equal(world.tiles.find(candidate => candidate.city === "南特").polity, "法兰西王国", "整合完成后从邦地块应并入主邦");
assert.equal(world.countries["布列塔尼公国"].absorbedBy, "法兰西王国", "整合完成后从邦应标记被吸收");

const peacefulWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(10, "法兰西王国", "巴黎", 0, "天主教", 16),
  tile(11, "纳瓦拉王国", "潘普洛纳", 2, "天主教", 5),
], undefined, "法兰西王国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(peacefulWorld);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(peacefulWorld);
peacefulWorld.turn = 12;
peacefulWorld.countries["纳瓦拉王国"].leader.historicalEndAtTurn = 12;
w.HIFI_DIPLOMACY_ENGINE.addClaim(peacefulWorld, "法兰西王国", "纳瓦拉王国", "dynastic");
w.HIFI_DIPLOMACY_ENGINE.leaderRelationView(peacefulWorld, "法兰西王国", "纳瓦拉王国").kinship = true;
w.HIFI_DIPLOMACY_ENGINE.leaderRelationView(peacefulWorld, "纳瓦拉王国", "法兰西王国").kinship = true;
w.HIFI_DIPLOMACY_ENGINE.relationView(peacefulWorld, "纳瓦拉王国", "法兰西王国").trust = 85;
w.HIFI_SUPRANATIONAL_ENGINE.processDynasticSuccession(peacefulWorld);
assert.equal(
  w.HIFI_SUPRANATIONAL_ENGINE.unionFor(peacefulWorld, "纳瓦拉王国").head,
  "法兰西王国",
  "单一强王朝宣称者应在继承危机中和平形成共主"
);
const unionRulerName = peacefulWorld.countries["纳瓦拉王国"].leader.name;
w.HIFI_POLITICS_ENGINE.processLeadership(peacefulWorld, "纳瓦拉王国");
assert.equal(peacefulWorld.countries["纳瓦拉王国"].leader.name, unionRulerName, "共主从邦不能被本国继承流程覆盖共君");

const contestedWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(20, "法兰西王国", "巴黎", 0, "天主教", 16),
  tile(21, "英格兰王国", "伦敦", 4, "天主教", 14),
  tile(22, "布列塔尼公国", "南特", 2, "天主教", 6),
], undefined, "法兰西王国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(contestedWorld);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(contestedWorld);
contestedWorld.turn = 20;
contestedWorld.countries["布列塔尼公国"].leader.historicalEndAtTurn = 20;
for (const claimant of ["法兰西王国", "英格兰王国"]) {
  w.HIFI_DIPLOMACY_ENGINE.addClaim(contestedWorld, claimant, "布列塔尼公国", "dynastic");
  w.HIFI_DIPLOMACY_ENGINE.leaderRelationView(contestedWorld, claimant, "布列塔尼公国").kinship = true;
  w.HIFI_DIPLOMACY_ENGINE.leaderRelationView(contestedWorld, "布列塔尼公国", claimant).kinship = true;
  w.HIFI_DIPLOMACY_ENGINE.relationView(contestedWorld, "布列塔尼公国", claimant).trust = 70;
}
w.HIFI_SUPRANATIONAL_ENGINE.processDynasticSuccession(contestedWorld);
const successionWar = contestedWorld.diplomacy.wars.find(war => war.goal?.type === "succession" && war.goal.target === "布列塔尼公国");
assert.ok(successionWar, "多个接近的强王朝宣称者应触发继承战");
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.unionFor(contestedWorld, "布列塔尼公国"), undefined, "继承战未决前不应直接形成共主");
const successionVictor = successionWar.attackers[0];
successionWar.score = 55;
assert.equal(
  w.HIFI_WARFARE_ENGINE.canConcludePeace(contestedWorld, successionWar, successionVictor, [{ type: "personal_union" }]),
  true,
  "继承战胜方应能以战争分数强制共主邦联"
);
w.HIFI_WARFARE_ENGINE.concludePeace(contestedWorld, successionWar.id, successionVictor, [{ type: "personal_union" }]);
assert.equal(
  w.HIFI_SUPRANATIONAL_ENGINE.unionFor(contestedWorld, "布列塔尼公国").head,
  successionVictor,
  "继承战和约必须形成胜方主导的共主邦联"
);
assert.equal(contestedWorld.diplomacy.wars.length, 0, "继承战和约必须结束战争");

const independenceWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(30, "法兰西王国", "巴黎", 0, "天主教", 16),
  tile(31, "布列塔尼公国", "南特", 2, "天主教", 6),
], undefined, "法兰西王国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(independenceWorld);
w.HIFI_WARFARE_ENGINE.initializeWarfare(independenceWorld);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(independenceWorld);
const unstableUnion = w.HIFI_SUPRANATIONAL_ENGINE.createPersonalUnion(independenceWorld, "法兰西王国", "布列塔尼公国", "低向心力测试");
unstableUnion.cohesion = 10;
w.HIFI_SUPRANATIONAL_ENGINE.processSupranational(independenceWorld);
const independenceWar = independenceWorld.diplomacy.wars.find(war => war.goal?.type === "independence" && war.goal.target === "布列塔尼公国");
assert.ok(independenceWar, "共主向心力过低应触发从邦独立战争");
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.unionFor(independenceWorld, "布列塔尼公国").head, "法兰西王国", "独立战争未决前从邦仍处于共主结构");
independenceWar.score = 40;
assert.equal(
  w.HIFI_WARFARE_ENGINE.canConcludePeace(independenceWorld, independenceWar, "布列塔尼公国", [{ type: "independence" }]),
  true,
  "独立战争胜方应能要求脱离共主"
);
w.HIFI_WARFARE_ENGINE.concludePeace(independenceWorld, independenceWar.id, "布列塔尼公国", [{ type: "independence" }]);
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.unionFor(independenceWorld, "布列塔尼公国"), undefined, "独立战争胜利后从邦应脱离共主");
assert.equal(independenceWorld.countries["布列塔尼公国"].union, undefined, "独立战争胜利后国家状态应清空共主标记");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawers = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/engine/supranational.js"), "页面必须加载超国家结构引擎");
assert.ok(drawers.includes("data-union-action"), "外交抽屉必须提供共主操作");
assert.ok(main.includes("claimPersonalUnion"), "main.js 必须接通宣告继承操作");
assert.ok(main.includes("integrateUnionMember"), "main.js 必须接通共主整合操作");
assert.ok(main.includes("dissolveUnion"), "main.js 必须接通共主解体操作");
assert.ok(main.includes("initializeSupranational"), "页面启动必须初始化共主继承引擎");

console.log("hifi personal union passed");

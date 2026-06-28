const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/supranational.js",
  "engine/world.js",
  "engine/diplomacy.js",
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
w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国");
w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国");
w.HIFI_SUPRANATIONAL_ENGINE.integrateUnionMember(world, "法兰西王国", "布列塔尼公国");
assert.equal(world.tiles.find(candidate => candidate.city === "南特").polity, "法兰西王国", "整合完成后从邦地块应并入主邦");
assert.equal(world.countries["布列塔尼公国"].absorbedBy, "法兰西王国", "整合完成后从邦应标记被吸收");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawers = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/engine/supranational.js"), "页面必须加载超国家结构引擎");
assert.ok(drawers.includes("data-union-action"), "外交抽屉必须提供共主操作");
assert.ok(main.includes("claimPersonalUnion"), "main.js 必须接通宣告继承操作");

console.log("hifi personal union passed");

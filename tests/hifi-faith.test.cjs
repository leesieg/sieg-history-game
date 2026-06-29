const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/faiths.js",
  "engine/world.js",
  "engine/diplomacy.js",
  "engine/faith.js",
  "engine/warfare.js",
]) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);

const w = context.window;
const tile = (id, polity, city, religion, population = 10) => ({
  id,
  x: id * 10,
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
  control: 80,
  buildings: [],
});

const world = w.HIFI_WORLD_ENGINE.createWorld([
  tile(0, "法兰西王国", "巴黎", "天主教", 20),
  tile(1, "法兰西王国", "马赛", "东正教", 10),
  tile(2, "格拉纳达酋长国", "格拉纳达", "逊尼派", 12),
], undefined, "法兰西王国");

w.HIFI_FAITH_ENGINE.initializeFaith(world);
const france = world.countries["法兰西王国"];
france.estates = { church: { label: "教士", satisfaction: 0 } };
france.money = 50;
france.actionPoints.diplomatic = 2;

assert.equal(france.stateConfession, "catholic", "人口多数信仰应成为国教");
assert.equal(world.tiles[1].confession, "orthodox", "地块信仰应归一到 confession key");
assert.equal(world.tiles[1].religion, "东正教", "展示字段仍应保持中文信仰名");
assert.equal(w.HIFI_FAITH_ENGINE.unity(world, "法兰西王国"), 67, "宗教统一度应按人口加权");
assert.ok(w.HIFI_FAITH_ENGINE.pressure(world, "法兰西王国") > 0, "非国教地块应产生信仰张力");
assert.ok(world.tiles[0].churchLandShare > 0, "基督教地块应初始化教会地产份额");

const secularWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(10, "萨克森选侯国", "莱比锡", "天主教", 12),
], undefined, "萨克森选侯国");
w.HIFI_FAITH_ENGINE.initializeFaith(secularWorld);
const saxony = secularWorld.countries["萨克森选侯国"];
saxony.estates = { church: { label: "教士", power: 30, satisfaction: 20 } };
saxony.money = 10;
const secularized = w.HIFI_FAITH_ENGINE.secularizeChurchLands(secularWorld, "萨克森选侯国", "测试世俗化");
assert.ok(secularized.money > 0, "世俗化教产应按地块教产份额带来一次性国库收入");
assert.equal(secularWorld.tiles[0].churchLandShare, 0, "世俗化后地块教产份额应清零");
assert.equal(saxony.faith.secularized, true, "世俗化状态应写入国家信仰状态");
assert.ok(saxony.estates.church.power < 30, "世俗化应削弱教士阶层权力");

w.HIFI_FAITH_ENGINE.setPolicy(world, "法兰西王国", "conversion");
assert.equal(france.faith.policy, "conversion", "信仰政策应可切换");
assert.ok(france.estates.church.satisfaction > 0, "强制传教应提高教士满意");

const target = world.tiles[1];
const beforeStrength = target.faithStrength;
w.HIFI_FAITH_ENGINE.sendMissionary(world, "法兰西王国", target.id);
assert.equal(france.actionPoints.diplomatic, 1, "传教应消耗外交点");
assert.equal(france.money, 40, "传教应消耗金钱");
assert.ok(target.faithStrength < beforeStrength, "传教应削弱异端信仰强度");

for (let i = 0; i < 8; i += 1) w.HIFI_FAITH_ENGINE.spreadFaith(world);
assert.equal(target.confession, "catholic", "持续强制传教后地块应皈依国教");
assert.equal(target.religion, "天主教", "皈依后展示信仰应同步更新");
assert.equal(france.faith.unity, 100, "完全皈依后宗教统一应达到 100");

const authorityWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(20, "法兰西王国", "巴黎", "天主教", 20),
  tile(21, "布列塔尼公国", "南特", "天主教", 8),
  tile(22, "格拉纳达酋长国", "格拉纳达", "逊尼派", 12),
], undefined, "法兰西王国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(authorityWorld);
w.HIFI_FAITH_ENGINE.initializeFaith(authorityWorld);

const brittany = authorityWorld.countries["布列塔尼公国"];
const beforeLegitimacy = brittany.legitimacy;
const excommunication = w.HIFI_FAITH_ENGINE.excommunicate(authorityWorld, "法兰西王国", "布列塔尼公国");
assert.equal(excommunication.target, "布列塔尼公国", "绝罚结果应返回目标国家");
assert.equal(brittany.faith.excommunicated, true, "绝罚应写入目标国家状态");
assert.ok(brittany.legitimacy < beforeLegitimacy, "绝罚应削弱目标合法性");
assert.ok(
  w.HIFI_DIPLOMACY_ENGINE.claimsAgainst(authorityWorld, "法兰西王国", "布列塔尼公国")
    .some(claim => claim.type === "excommunication"),
  "绝罚应给天主教国家生成绝罚宣称"
);

const crusade = w.HIFI_FAITH_ENGINE.callCrusade(authorityWorld, "法兰西王国", "格拉纳达酋长国");
assert.equal(crusade.target, "格拉纳达酋长国", "十字军结果应返回目标国家");
assert.equal(authorityWorld.faith.papacy.crusadeTarget, "格拉纳达酋长国", "十字军目标应写入教廷状态");
assert.ok(
  w.HIFI_DIPLOMACY_ENGINE.claimsAgainst(authorityWorld, "法兰西王国", "格拉纳达酋长国")
    .some(claim => claim.type === "crusade"),
  "十字军应给天主教国家生成十字军宣称"
);

w.HIFI_WARFARE_ENGINE.initializeWarfare(authorityWorld);
const reputationBeforeWar = authorityWorld.countries["法兰西王国"].reputation;
const religiousWar = w.HIFI_WARFARE_ENGINE.declareWarOn(
  authorityWorld,
  "法兰西王国",
  "格拉纳达酋长国",
  "十字军",
  "conquest"
);
assert.equal(religiousWar.cbMatched, true, "十字军宣称应被战争系统识别为宣战理由");
assert.equal(authorityWorld.countries["法兰西王国"].reputation, reputationBeforeWar, "有十字军宣称宣战不应扣声望");

console.log("hifi faith passed");

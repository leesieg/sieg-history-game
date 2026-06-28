const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/faiths.js",
  "engine/world.js",
  "engine/faith.js",
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

console.log("hifi faith passed");

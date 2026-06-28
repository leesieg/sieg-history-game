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
  "engine/supranational.js",
]) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);

const w = context.window;
const tile = (id, polity, city, population = 8) => ({
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
  religion: "天主教",
  good: "grain",
  control: 75,
  buildings: [],
});

const world = w.HIFI_WORLD_ENGINE.createWorld([
  tile(0, "神圣罗马帝国", "布拉格", 14),
  tile(1, "勃艮第公国", "第戎", 8),
  tile(2, "弗兰德斯伯国", "布鲁日", 7),
  tile(3, "米兰领", "米兰", 9),
  tile(4, "法兰西王国", "巴黎", 12),
], undefined, "神圣罗马帝国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(world);

const hre = w.HIFI_SUPRANATIONAL_ENGINE.structure(world, "hre");
assert.equal(hre.emperor, "神圣罗马帝国", "神罗开局皇帝应为神圣罗马帝国");
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.isMember(world, "勃艮第公国"), true, "勃艮第应是帝国成员");
assert.equal(world.countries["米兰领"].supranational.hre.role, "诸侯", "成员身份应同步到国家状态");
assert.ok(world.diplomacy.organizations.some(item => item.id === "hre"), "超国家结构应同步到外交组织列表");

const scores = w.HIFI_SUPRANATIONAL_ENGINE.electionScores(world, "hre");
assert.ok(scores.length >= 4, "选举形势应覆盖存在的帝国成员");
assert.equal(scores[0].polity, "神圣罗马帝国", "初始皇帝应在选举中占优");

const authorityBefore = hre.authority;
world.countries["神圣罗马帝国"].actionPoints.diplomatic = 2;
w.HIFI_SUPRANATIONAL_ENGINE.callImperialDiet(world, "神圣罗马帝国");
assert.equal(hre.authority, authorityBefore - 12, "召开帝国会议应消耗帝国权威");
assert.equal(world.countries["神圣罗马帝国"].actionPoints.diplomatic, 1, "召开帝国会议应消耗外交点");

world.playerPolity = "勃艮第公国";
world.countries["勃艮第公国"].actionPoints.diplomatic = 2;
const authorityBeforeMediation = hre.authority;
w.HIFI_SUPRANATIONAL_ENGINE.requestImperialMediation(world, "勃艮第公国");
assert.equal(hre.authority, authorityBeforeMediation - 6, "请求帝国调停应消耗帝国权威");
assert.equal(world.countries["勃艮第公国"].actionPoints.diplomatic, 1, "请求帝国调停应消耗外交点");

hre.authority = 50;
world.diplomacy.wars.push({
  id: "imperial-war",
  attackers: ["勃艮第公国"],
  defenders: ["米兰领"],
  participants: {},
  primaryGoal: {},
  score: 0,
});
w.HIFI_SUPRANATIONAL_ENGINE.processSupranational(world);
assert.ok(hre.authority < 50, "帝国内战应压低帝国权威");
assert.ok(hre.lastDrift.parts.some(part => part[0] === "帝国内战"), "权威漂移应记录帝国内战来源");

const summary = w.HIFI_SUPRANATIONAL_ENGINE.summary(world, "勃艮第公国", "hre");
assert.equal(summary.member.role, "诸侯", "摘要应返回玩家帝国身份");
assert.equal(summary.internalWars, 1, "摘要应返回帝国内战数量");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const drawers = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
assert.ok(html.includes("scripts/data/supranational.js"), "页面必须加载超国家结构数据");
assert.ok(html.includes("scripts/engine/supranational.js"), "页面必须加载超国家结构引擎");
assert.ok(main.includes("initializeSupranational"), "启动流程必须初始化超国家结构");
assert.ok(drawers.includes("data-imperial-action"), "外交界面必须提供帝国行动入口");

console.log("hifi supranational passed");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/faiths.js",
  "data/supranational.js",
  "engine/world.js",
  "engine/diplomacy.js",
  "engine/faith.js",
  "engine/warfare.js",
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
  tile(0, "巴伐利亚公国", "慕尼黑", 14),
  tile(1, "勃艮第公国", "第戎", 8),
  tile(2, "弗兰德斯伯国", "布鲁日", 7),
  tile(3, "米兰领", "米兰", 9),
  tile(4, "法兰西王国", "巴黎", 12),
  tile(5, "科隆大主教区", "科隆", 8),
  tile(6, "萨克森选侯国", "莱比锡", 8),
  tile(7, "波西米亚王国", "布拉格", 10),
], undefined, "巴伐利亚公国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
w.HIFI_FAITH_ENGINE.initializeFaith(world);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(world);

const hre = w.HIFI_SUPRANATIONAL_ENGINE.structure(world, "hre");
assert.equal(hre.emperor, "巴伐利亚公国", "1337 神罗开局皇帝应为巴伐利亚的路易四世");
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.isMember(world, "勃艮第公国"), true, "勃艮第应是帝国成员");
assert.equal(world.countries["米兰领"].supranational.hre.role, "诸侯", "成员身份应同步到国家状态");
assert.ok(world.diplomacy.organizations.some(item => item.id === "hre"), "超国家结构应同步到外交组织列表");

const papacy = w.HIFI_SUPRANATIONAL_ENGINE.structure(world, "papacy");
assert.equal(papacy.type, "religious", "教廷应回填为超国家宗教权威结构");
assert.equal(papacy.authority, world.faith.papacy.authority, "教廷权威应同步旧信仰字段");
assert.equal(world.countries["法兰西王国"].supranational.papacy.role, "天主教国", "天主教国家应成为教廷成员");

const scores = w.HIFI_SUPRANATIONAL_ENGINE.electionScores(world, "hre");
assert.ok(scores.length >= 4, "选举形势应覆盖存在的帝国成员");
assert.equal(scores[0].polity, "巴伐利亚公国", "初始皇帝应在选举中占优");

const authorityBefore = hre.authority;
world.countries["巴伐利亚公国"].actionPoints.diplomatic = 2;
w.HIFI_SUPRANATIONAL_ENGINE.callImperialDiet(world, "巴伐利亚公国");
assert.equal(hre.authority, authorityBefore - 12, "召开帝国会议应消耗帝国权威");
assert.equal(world.countries["巴伐利亚公国"].actionPoints.diplomatic, 1, "召开帝国会议应消耗外交点");

world.playerPolity = "勃艮第公国";
world.countries["勃艮第公国"].actionPoints.diplomatic = 2;
const authorityBeforeMediation = hre.authority;
w.HIFI_SUPRANATIONAL_ENGINE.requestImperialMediation(world, "勃艮第公国");
assert.equal(hre.authority, authorityBeforeMediation - 6, "请求帝国调停应消耗帝国权威");
assert.equal(world.countries["勃艮第公国"].actionPoints.diplomatic, 1, "请求帝国调停应消耗外交点");

hre.authority = 80;
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.imperialPeaceActive(world, "hre"), true, "高权威应启动帝国和平");
assert.equal(
  w.HIFI_WARFARE_ENGINE.canDeclareWar(world, "勃艮第公国", "米兰领").ok,
  false,
  "帝国和平应禁止成员私战"
);
world.countries["巴伐利亚公国"].actionPoints.diplomatic = 2;
w.HIFI_SUPRANATIONAL_ENGINE.declareImperialBan(world, "巴伐利亚公国", "米兰领");
assert.equal(w.HIFI_SUPRANATIONAL_ENGINE.isImperialOutlaw(world, "米兰领"), true, "帝国除籍应标记目标成员");
assert.equal(
  w.HIFI_WARFARE_ENGINE.canDeclareWar(world, "巴伐利亚公国", "米兰领").ok,
  true,
  "除籍目标应允许皇帝讨伐"
);
assert.ok(
  w.HIFI_DIPLOMACY_ENGINE.claimsAgainst(world, "巴伐利亚公国", "米兰领").some(claim => claim.type === "imperial_ban"),
  "帝国除籍应给皇帝生成讨伐宣称"
);
assert.ok(
  w.HIFI_DIPLOMACY_ENGINE.claimsAgainst(world, "勃艮第公国", "米兰领").some(claim => claim.type === "imperial_ban"),
  "帝国除籍应给其他帝国成员生成讨伐宣称"
);

const levyWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(10, "巴伐利亚公国", "慕尼黑", 14),
  tile(11, "勃艮第公国", "第戎", 8),
  tile(12, "弗兰德斯伯国", "布鲁日", 7),
  tile(13, "米兰领", "米兰", 9),
], undefined, "巴伐利亚公国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(levyWorld);
w.HIFI_FAITH_ENGINE.initializeFaith(levyWorld);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(levyWorld);
w.HIFI_WARFARE_ENGINE.initializeWarfare(levyWorld);
const levyHre = w.HIFI_SUPRANATIONAL_ENGINE.structure(levyWorld, "hre");
levyHre.authority = 80;
levyWorld.countries["巴伐利亚公国"].actionPoints.military = 2;
const armyCountBefore = Object.keys(levyWorld.warfare.armies).length;
const imperialLevy = w.HIFI_SUPRANATIONAL_ENGINE.raiseImperialArmy(levyWorld, "巴伐利亚公国");
assert.equal(levyWorld.countries["巴伐利亚公国"].actionPoints.military, 1, "征帝国军应消耗军事点");
assert.equal(levyHre.authority, 65, "征帝国军应消耗帝国权威");
assert.equal(Object.keys(levyWorld.warfare.armies).length, armyCountBefore + 1, "征帝国军应生成军团");
assert.equal(imperialLevy.army.owner, "巴伐利亚公国", "帝国军应归皇帝控制");
assert.equal(imperialLevy.army.tileId, 10, "帝国军应在皇帝首府集结");
assert.equal(imperialLevy.army.name, "帝国军", "帝国军名称应稳定");
assert.equal(imperialLevy.army.units[0].serviceType, "levy", "帝国军应以征召兵形式生成");
assert.ok(imperialLevy.contributors.includes("米兰领"), "征帝国军应记录成员贡献");
levyHre.authority = 50;
assert.throws(
  () => w.HIFI_SUPRANATIONAL_ENGINE.raiseImperialArmy(levyWorld, "巴伐利亚公国"),
  /帝国权威不足/,
  "帝国权威不足时不能征帝国军"
);

const defenseWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(20, "巴伐利亚公国", "慕尼黑", 14),
  tile(21, "米兰领", "米兰", 9),
  tile(22, "法兰西王国", "巴黎", 12),
], undefined, "巴伐利亚公国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(defenseWorld);
w.HIFI_FAITH_ENGINE.initializeFaith(defenseWorld);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(defenseWorld);
w.HIFI_WARFARE_ENGINE.initializeWarfare(defenseWorld);
defenseWorld.diplomacy.wars = [];
w.HIFI_SUPRANATIONAL_ENGINE.structure(defenseWorld, "hre").authority = 52;
const imperialDefenseWar = w.HIFI_WARFARE_ENGINE.declareWarOn(defenseWorld, "法兰西王国", "米兰领", "帝国防御测试");
assert.ok(imperialDefenseWar.defenders.includes("巴伐利亚公国"), "外敌攻击帝国成员时，皇帝应作为帝国防御方参战");

const weakDefenseWorld = w.HIFI_WORLD_ENGINE.createWorld([
  tile(30, "巴伐利亚公国", "慕尼黑", 14),
  tile(31, "米兰领", "米兰", 9),
  tile(32, "法兰西王国", "巴黎", 12),
], undefined, "巴伐利亚公国");
w.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(weakDefenseWorld);
w.HIFI_FAITH_ENGINE.initializeFaith(weakDefenseWorld);
w.HIFI_SUPRANATIONAL_ENGINE.initializeSupranational(weakDefenseWorld);
w.HIFI_WARFARE_ENGINE.initializeWarfare(weakDefenseWorld);
weakDefenseWorld.diplomacy.wars = [];
w.HIFI_SUPRANATIONAL_ENGINE.structure(weakDefenseWorld, "hre").authority = 20;
const weakImperialDefenseWar = w.HIFI_WARFARE_ENGINE.declareWarOn(weakDefenseWorld, "法兰西王国", "米兰领", "帝国防御测试");
assert.equal(weakImperialDefenseWar.defenders.includes("巴伐利亚公国"), false, "帝国权威过低时，皇帝不能自动集体防御成员");

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

const papacyBeforeReformation = papacy.authority;
world.flags = { reformation: true };
w.HIFI_SUPRANATIONAL_ENGINE.processSupranational(world);
assert.ok(papacy.authority < papacyBeforeReformation, "宗教改革应冲击教廷权威");
assert.equal(world.faith.papacy.authority, papacy.authority, "处理后教廷权威仍应同步回信仰字段");

const summary = w.HIFI_SUPRANATIONAL_ENGINE.summary(world, "勃艮第公国", "hre");
assert.equal(summary.member.role, "诸侯", "摘要应返回玩家帝国身份");
assert.equal(summary.internalWars, 1, "摘要应返回帝国内战数量");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const drawers = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
assert.ok(html.includes("scripts/data/supranational.js"), "页面必须加载超国家结构数据");
assert.ok(html.includes("scripts/engine/supranational.js"), "页面必须加载超国家结构引擎");
assert.ok(main.includes("initializeSupranational"), "启动流程必须初始化超国家结构");
assert.ok(main.includes("declareImperialBan"), "main.js 必须接通帝国除籍操作");
assert.ok(drawers.includes("data-imperial-action"), "外交界面必须提供帝国行动入口");
assert.ok(drawers.includes("ban:"), "帝国界面必须提供除籍操作");

console.log("hifi supranational passed");

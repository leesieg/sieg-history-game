const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of ["engine/world.js", "engine/struggle.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}
const worldEngine = context.window.HIFI_WORLD_ENGINE;
const struggle = context.window.HIFI_STRUGGLE_ENGINE;
assert.ok(worldEngine && struggle, "局势引擎应加载");

const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, city: "巴黎" },
  { id: 2, isSea: false, polity: "英格兰王国", population: 9, city: "伦敦" },
  { id: 3, isSea: false, polity: "勃艮第公国", population: 6, city: "第戎" },
  { id: 4, isSea: false, polity: "卡斯蒂利亚王国", population: 7, city: "布尔戈斯" },
];
const world = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(world);

const hyw = struggle.struggleFor(world, "hundred_years_war");
assert.ok(hyw, "法兰西开局应存在百年战争局势");
assert.equal(hyw.phase, "standoff", "初始阶段为对峙");
assert.equal(hyw.resolved, false);
assert.ok(hyw.parties["法兰西王国"] && hyw.parties["英格兰王国"], "法英应为当事方");

// 参与度判定
assert.equal(struggle.involvement(world, "法兰西王国", hyw), "principal");
assert.equal(struggle.involvement(world, "英格兰王国", hyw), "principal");
assert.equal(struggle.involvement(world, "勃艮第公国", hyw), "interloper");
assert.equal(struggle.involvement(world, "卡斯蒂利亚王国", hyw), "bystander");

// 缺当事国时不开局（参与方表里没有的世界）
const lonely = worldEngine.createWorld(
  [{ id: 1, isSea: false, polity: "勃艮第公国", population: 5, city: "第戎" }],
  {},
  "勃艮第公国"
);
struggle.initializeStruggles(lonely);
assert.equal(struggle.struggleFor(lonely, "hundred_years_war"), null, "缺当事国时不开局");

// 时间默认诱因：standoff 默认流向 open_war，处理一季后 open_war 计量上升
const before = hyw.meters.open_war;
struggle.processStruggles(world);
assert.ok(hyw.meters.open_war > before, "时间漂移应增加默认下一阶段计量");

// 持续推进会翻出对峙阶段
for (let i = 0; i < 20; i++) struggle.processStruggles(world);
assert.notEqual(hyw.phase, "standoff", "持续推进后应翻出对峙阶段");

// 显式诱因能立刻推动指定阶段翻转
const fresh = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(fresh);
const w = struggle.struggleFor(fresh, "hundred_years_war");
struggle.addCatalyst(w, "open_war", 100);
struggle.processStruggles(fresh);
assert.equal(w.phase, "open_war", "大量 open_war 诱因应立即翻到鏖战阶段");

// 不报错：已结束的局势不再推进
w.resolved = true;
const phaseAfter = w.phase;
struggle.processStruggles(fresh);
assert.equal(w.phase, phaseAfter, "已结束局势不再翻阶段");

// --- Task 3.1：战况诱因推动阶段翻转 ---
// 战况：war.score 上升（占领/会战）应额外注入鏖战诱因，超过单纯时间漂移(+1)
const cw = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(cw);
const cs = struggle.struggleFor(cw, "hundred_years_war");
cw.diplomacy = { wars: [{ id: "w1", attackers: ["英格兰王国"], defenders: ["法兰西王国"], score: 25, primaryGoal: {} }] };
const owBefore = cs.meters.open_war;
struggle.processStruggles(cw);
assert.ok(cs.meters.open_war - owBefore > 1, "war.score 上升应额外注入鏖战诱因（超过时间漂移）");

// 议和：上季在战、这季战争消失 → 疲惫议和诱因（足以翻到 truce）
cw.diplomacy.wars = [];
struggle.processStruggles(cw);
assert.ok(cs.meters.truce > 0 || cs.phase === "truce", "议和达成应注入疲惫议和诱因");

// 财政崩溃：当事国 money<0 → 疲惫议和诱因
const fw = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(fw);
const fs2 = struggle.struggleFor(fw, "hundred_years_war");
fw.countries["法兰西王国"].money = -5;
const trBefore = fs2.meters.truce;
struggle.processStruggles(fw);
assert.ok(fs2.meters.truce > trBefore, "当事国财政崩溃应注入疲惫议和诱因");

console.log("hifi struggle engine passed");

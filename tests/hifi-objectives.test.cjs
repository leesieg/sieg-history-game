const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/countries.js",
  "data/rules.js",
  "engine/world.js",
  "engine/turn.js",
  "engine/politics.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/history.js",
  "engine/objectives.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const politics = context.window.HIFI_POLITICS_ENGINE;
const economy = context.window.HIFI_ECONOMY_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const warfare = context.window.HIFI_WARFARE_ENGINE;
const history = context.window.HIFI_HISTORY_ENGINE;
const objectives = context.window.HIFI_OBJECTIVES_ENGINE;

assert.ok(objectives, "HIFI_OBJECTIVES_ENGINE 必须挂到 window 上");
assert.equal(typeof objectives.nationalMission, "function");
assert.equal(typeof objectives.midAgenda, "function");
assert.equal(typeof objectives.seasonTasks, "function");

const tiles = [
  { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: ["market"], city: "巴黎", terrain: "plains", control: 80, devastation: 0 },
  { id: 1, isSea: false, polity: "法兰西王国", population: 8, buildings: [], city: "", terrain: "forest", control: 40, devastation: 0 },
  { id: 2, isSea: false, polity: "英格兰王国", population: 10, buildings: ["fort"], city: "伦敦", terrain: "plains", control: 70, devastation: 0 },
  { id: 3, isSea: false, polity: "威尼斯共和国", population: 9, buildings: ["market", "port"], city: "威尼斯", terrain: "plains", control: 85, devastation: 0 },
];

const world = worldEngine.createWorld(tiles);
politics.initializePolitics(world);
economy.initializeEconomy(world);
diplomacy.initializeDiplomacy(world);
warfare.initializeWarfare(world); // 自动声明法兰西/英格兰百年战争
history.initializeHistory(world);

// --- nationalMission：法兰西处于百年战争，应走「收复领土」分支 ---
const franceMission = objectives.nationalMission(world, "法兰西王国");
assert.ok(franceMission.id, "nationalMission 必须有 id");
assert.ok(franceMission.title && franceMission.title.length > 0, "title 不能为空");
assert.ok(franceMission.why && franceMission.why.length > 0, "why 不能为空");
assert.ok(Array.isArray(franceMission.targets) && franceMission.targets.length > 0, "targets 不能为空");

// --- nationalMission：和平国家（威尼斯）也必须得到非空使命，且不是法兰西的战争文案 ---
const veniceMission = objectives.nationalMission(world, "威尼斯共和国");
assert.ok(veniceMission.title && veniceMission.title.length > 0, "和平国家也必须有非空 title");
assert.ok(veniceMission.why && veniceMission.why.length > 0, "和平国家也必须有非空 why");
assert.ok(Array.isArray(veniceMission.targets) && veniceMission.targets.length > 0, "和平国家也必须有非空 targets");
assert.notEqual(veniceMission.id, franceMission.id, "战争国与和平国不应给出同一条使命");

// 默认 polity 参数：world.playerPolity
const defaultMission = objectives.nationalMission(world);
assert.equal(defaultMission.id, objectives.nationalMission(world, world.playerPolity).id);

// --- midAgenda：0-2 条，结构完整 ---
const franceAgenda = objectives.midAgenda(world, "法兰西王国");
assert.ok(Array.isArray(franceAgenda));
assert.ok(franceAgenda.length <= 2);
for (const item of franceAgenda) {
  assert.ok(item.id, "midAgenda 每条必须有 id");
  assert.ok(item.title && item.title.length > 0, "midAgenda 每条必须有非空 title");
  assert.ok(item.why && item.why.length > 0, "midAgenda 每条必须有非空 why");
}

const veniceAgenda = objectives.midAgenda(world, "威尼斯共和国");
assert.ok(Array.isArray(veniceAgenda));
assert.ok(veniceAgenda.length <= 2);

// --- seasonTasks：2-3 条，advisor 枚举合法，确定性（同一 state 调两次必须一致） ---
const validAdvisors = new Set(["fiscal", "diplomacy", "military", "internal"]);
const tasksFirst = objectives.seasonTasks(world, "法兰西王国");
assert.ok(Array.isArray(tasksFirst));
assert.ok(tasksFirst.length >= 2 && tasksFirst.length <= 3, "seasonTasks 必须返回 2-3 条");
for (const task of tasksFirst) {
  assert.ok(task.id, "seasonTasks 每条必须有 id");
  assert.ok(task.label && task.label.length > 0, "seasonTasks 每条必须有非空 label");
  assert.ok(validAdvisors.has(task.advisor), `advisor 必须是四类枚举之一，实际：${task.advisor}`);
  assert.ok(task.reason && task.reason.length > 0, "seasonTasks 每条必须有非空 reason");
}

const tasksSecond = objectives.seasonTasks(world, "法兰西王国");
assert.deepEqual(tasksSecond, tasksFirst, "同一 state 重复调用 seasonTasks 必须返回完全相同的结构");

// 财政紧张时必须出现 fiscal 顾问任务（复用 councilSummary 的 money<50 判定）
const poorFrance = world.countries["法兰西王国"];
poorFrance.money = 10;
const poorTasks = objectives.seasonTasks(world, "法兰西王国");
assert.ok(poorTasks.some(task => task.advisor === "fiscal"), "国库枯竭时必须出现财政顾问任务");

console.log("hifi objectives engine passed");

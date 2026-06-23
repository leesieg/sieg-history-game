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
  "data/geography.js",
  "data/trade.js",
  "engine/world.js",
  "engine/turn.js",
  "engine/politics.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/history.js",
  "engine/struggle.js",
  "engine/objectives.js",
  "engine/proposals.js",
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
const proposals = context.window.HIFI_PROPOSALS_ENGINE;

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
const struggle = context.window.HIFI_STRUGGLE_ENGINE;
struggle.initializeStruggles(world); // 法兰西=百年战争当事国

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

// --- missionStages：法兰西数据驱动三段使命，状态按顺序派生 ---
assert.equal(typeof objectives.missionStages, "function", "必须提供 missionStages");
const validStatus = new Set(["未开始", "进行中", "已完成"]);
const franceStages = objectives.missionStages(world, "法兰西王国");
assert.equal(franceStages.length, 3, "法兰西开局应返回 3 个阶段");
for (const stage of franceStages) {
  assert.ok(stage.id && stage.name && stage.detail, "每段必须有 id/name/detail");
  assert.ok(validStatus.has(stage.status), `status 必须是三态之一，实际：${stage.status}`);
}
// 巴黎控制力 80 ≥ 60 → 第一段「稳住王国核心」已完成
assert.equal(franceStages[0].id, "secure-core");
assert.equal(franceStages[0].status, "已完成", "巴黎控制力达标时第一段应已完成");
// 有且仅有一个「进行中」（首个未完成段）
assert.equal(franceStages.filter(stage => stage.status === "进行中").length, 1, "应恰有一个进行中阶段");

// 核心控制力跌破阈值 → 第一段回退为进行中
world.tiles.find(tile => tile.city === "巴黎").control = 30;
const weakStages = objectives.missionStages(world, "法兰西王国");
assert.equal(weakStages[0].status, "进行中", "核心控制力不达标时第一段应为进行中");
world.tiles.find(tile => tile.city === "巴黎").control = 80; // 还原

// 非法兰西国家不走专属阶段
assert.deepEqual(objectives.missionStages(world, "威尼斯共和国"), [], "非法兰西国家应返回空阶段数组");
// 默认 polity 参数
assert.deepEqual(objectives.missionStages(world), objectives.missionStages(world, world.playerPolity));

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

// --- advisorProposals：≤3 条，每条非降级建议必须落在 actionCatalog 内并通过校验，预览三字段非空 ---
assert.equal(typeof objectives.advisorProposals, "function", "HIFI_OBJECTIVES_ENGINE 必须提供 advisorProposals");
assert.ok(proposals, "需要 HIFI_PROPOSALS_ENGINE 配合校验");

const franceProposals = objectives.advisorProposals(world, "法兰西王国");
assert.ok(Array.isArray(franceProposals));
assert.ok(franceProposals.length <= 3, "advisorProposals 最多 3 条");
for (const item of franceProposals) {
  assert.ok(item.advisor, "每条必须标明 advisor");
  assert.ok(item.proposal && item.proposal.type, "每条必须有 proposal.type");
  if (item.proposal.type === "goto") {
    assert.ok(item.proposal.panel, "降级卡必须带 panel");
    assert.equal(item.preview, null, "降级卡 preview 必须为 null");
  } else {
    assert.ok(
      Object.keys(proposals.actionCatalog).includes(item.proposal.type),
      `非降级建议的 type 必须在 actionCatalog 内，实际：${item.proposal.type}`
    );
    const validation = proposals.validate(world, "法兰西王国", item.proposal);
    assert.ok(validation.ok, `advisorProposals 给出的非降级建议必须通过 validate：${validation.reason || ""}`);
    assert.ok(item.preview, "非降级建议必须带 preview");
    assert.ok(item.preview.cost && item.preview.cost.length > 0, "preview.cost 不能为空");
    assert.ok(item.preview.gain && item.preview.gain.length > 0, "preview.gain 不能为空");
    assert.ok(item.preview.risk && item.preview.risk.length > 0, "preview.risk 不能为空");
  }
}

// --- Task 5.1：局势当事国（法兰西）顾问草案围绕百年战争，至少 2 张相关且军务领先 ---
const franceStruggleProposals = objectives.advisorProposals(world, "法兰西王国");
assert.ok(franceStruggleProposals.filter(item => item.struggleRelated).length >= 2,
  "法兰西开局应至少 2 张草案与百年战争相关");
assert.equal(franceStruggleProposals[0].advisor, "military", "局势当事国军务草案应领先呈现");
// 非当事国（威尼斯）不强行标注战争草案
const veniceStruggleProposals = objectives.advisorProposals(world, "威尼斯共和国");
assert.equal(veniceStruggleProposals.filter(item => item.struggleRelated).length, 0,
  "非局势当事国不应出现局势相关草案标注");

console.log("hifi objectives engine passed");

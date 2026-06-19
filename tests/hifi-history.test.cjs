const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/rules.js",
  "engine/world.js",
  "engine/history.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const history = context.window.HIFI_HISTORY_ENGINE;
const tiles = [
  { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 },
  { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", control: 70 },
];
const world = worldEngine.createWorld(tiles);
history.initializeHistory(world);

assert.equal(world.eraIndex, 0);
assert.ok(Array.isArray(world.situations));
assert.ok(Array.isArray(world.countries["法兰西王国"].chronicle));

world.turn = 12;
history.processHistory(world);
assert.ok(world.situations.some(item => item.key === "black_death"));
assert.ok(world.worldEvents.some(event => event.kind === "situation"));

// --- Task A4: 事件爆发期消耗 ---
{
  const polity = world.playerPolity;
  const c = world.countries[polity];
  c.food = 1000; c.money = 1000;
  c.lastReport = {};
  world.situations = [{ key: "black_death", label: "黑死病", phase: "爆发", progress: 60, lastEffectTurn: null, eventGenerated: true }];
  history.processSituations(world);
  assert.ok(c.lastReport.event && c.lastReport.event.food > 0, "黑死病爆发应记录救济粮消耗");
  assert.ok(c.food < 1000, "黑死病爆发应扣粮");
  console.log("A4 事件消耗 OK");
}

const chain = history.applyCausalChain(world, "constantinople_falls");
assert.equal(chain.length, 7, "历史因果链必须有七跳");
assert.equal(world.flags.constantinopleFallen, true);
assert.ok(world.countries["法兰西王国"].pressures.exploration > 0);
const epic = history.epic(world, "法兰西王国");
assert.equal(epic.title, "法兰西王国编年史");
assert.ok(Array.isArray(epic.worldEvents));

world.turn = 465;
history.processHistory(world);
assert.equal(world.eraIndex, 1);
assert.ok(world.pendingTransition);
history.acknowledgeTransition(world);
assert.equal(world.pendingTransition, null);

world.playerEvents.push({
  id: "event-1",
  title: "阶层最后通牒",
  choices: [{ id: "accept", label: "接受", effect: { legitimacy: -5 } }],
});
const issues = history.issues(world);
assert.ok(issues.some(issue => issue.blocking));
assert.equal(history.blockingIssues(world).length, 1);
history.resolvePlayerEvent(world, "event-1", "accept");
assert.equal(world.playerEvents.length, 0);

const council = history.councilSummary(world, "法兰西王国");
assert.ok(council.warnings.length);
assert.ok(council.advisors.length);
history.startRegency(world);
assert.equal(world.regency.active, true);
const advanced = history.runRegency(world, current => { current.turn += 1; }, 2);
assert.equal(advanced, 2);
world.playerEvents.push({ id: "event-2", title: "危机", choices: [] });
assert.equal(history.shouldInterruptRegency(world), true);

// 探索里程碑回报：累积 20 探索点开辟大西洋航路，解锁殖民收入流
const explorer = world.countries["法兰西王国"];
explorer.exploration.points = 20;
explorer.exploration.milestones = [];
explorer.ideas = 0; // 本测试未加载经济引擎，手动初始化思想点
const ideasBeforeMilestone = explorer.ideas;
history.spreadTechnology(world);
assert.ok(explorer.exploration.milestones.includes("atlantic"), "累积探索点必须开辟大西洋航路");
assert.equal(explorer.exploration.colonial, true, "里程碑必须解锁殖民收入流");
assert.ok(explorer.ideas > ideasBeforeMilestone, "里程碑必须给一次性思想奖励");

// 压力层驱动转折：军事压力加速战争疲惫、财政压力压低合法性
const pressured = world.countries["法兰西王国"];
pressured.pressures = { military: 70, fiscal: 70, faith: 0, exploration: 0, trade: 0, ideas: 0 };
pressured.warfare = { warExhaustion: 0 };
pressured.legitimacy = 80;
history.applyPressureEffects(world);
assert.equal(pressured.warfare.warExhaustion, 1, "高军事压力必须加速战争疲惫");
assert.ok(pressured.legitimacy < 80, "高财政压力必须压低合法性");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
const dialogSource = fs.readFileSync(path.join(root, "ui", "dialogs.js"), "utf8");
assert.ok(html.includes("scripts/engine/history.js"));
assert.ok(html.includes("councilModal"));
assert.ok(mainSource.includes("blockingIssues"));
assert.ok(dialogSource.includes("bindNarrativeDialogs"));

// --- 2.1：战争/外交/经济进入待办队列（issues 队列扩展）---
context.window.HIFI_DIPLOMACY_ENGINE = { capacityUsed: () => 0, diplomaticAttitude: () => "wary" };
world.playerPolity = "法兰西王国";
world.diplomacy = { wars: [{ attackers: ["英格兰王国"], defenders: ["法兰西王国"], name: "百年战争" }] };
const queue = history.issues(world);
assert.ok(queue.some(item => item.kind === "war"), "进行中战争必须进入待办队列");
assert.ok(queue.some(item => item.kind === "war" && item.label.includes("英格兰王国")), "战争待办应指明交战对手");
assert.ok(queue.some(item => item.kind === "diplomacy"), "紧张邻国必须形成外交待办");

// --- 2.2：季度账本 quarterLedger ---
const ledgerCountry = world.countries["法兰西王国"];
ledgerCountry.lastReport = { food: 12, money: 40, military: 8, trade: 5, tiles: 3 };
ledgerCountry.government = Object.assign({}, ledgerCountry.government, { centralPower: 60 });
ledgerCountry.tradePolicy = "open";
const ledger2 = history.quarterLedger(world, "法兰西王国");
assert.ok(ledger2.money.delta > 0, "季报国库变化必须为正数值");
assert.ok(Array.isArray(ledger2.money.sources) && ledger2.money.sources.length > 0, "季报国库必须有来源构成");
assert.ok(ledger2.money.sources.some(s => s.includes("贸易")), "开放贸易时季报应含贸易来源");
assert.equal(ledger2.food.delta, 12, "季报粮食 delta 取自 lastReport.food");

// --- Task A5: 季报净额三段 ---
{
  const polity = world.playerPolity;
  world.countries[polity].lastReport = {
    food: 100, money: 200, military: 50, tiles: 5,
    maintenance: { food: 30, money: 40, military: 10 },
    event: { food: 12, money: 8 },
  };
  const ledger = history.quarterLedger(world, polity);
  assert(ledger.food.gross === 100 && ledger.food.maintenance === 30 && ledger.food.event === 12,
    "粮食三段应分列");
  assert(ledger.food.net === 100 - 30 - 12, "粮食净额 = 产出-维护-事件");
  assert(ledger.food.delta === ledger.food.net, "delta 应等于 net（兼容旧渲染）");
  console.log("A5 季报净额 OK");
}

console.log("hifi history engine passed");

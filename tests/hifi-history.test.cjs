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
  "engine/struggle.js",
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

// --- Task A7: 救济成本与人口损耗同步，每 4 季才结算一次（节奏标定，非逐季） ---
{
  const polity = world.playerPolity;
  const c = world.countries[polity];
  c.food = 1000; c.money = 1000;
  c.lastReport = {};
  const situation = { key: "black_death", label: "黑死病", phase: "爆发", progress: 60, lastEffectTurn: null, eventGenerated: true };
  world.situations = [situation];
  world.turn = 100;

  // 首次脉冲：lastEffectTurn 为 null，应当立即结算救济成本
  history.processSituations(world);
  assert.ok(c.lastReport.event && c.lastReport.event.food > 0, "首次爆发脉冲应结算救济成本");
  const firstReliefFood = c.lastReport.event.food;
  assert.equal(situation.lastEffectTurn, 100, "首次脉冲后应记录 lastEffectTurn");

  // 未满 4 季：再次调用不应重复结算救济成本
  world.turn = 102;
  c.lastReport = {};
  history.processSituations(world);
  assert.ok(!c.lastReport.event || c.lastReport.event.food === 0, "未满 4 季不应再次结算救济成本");
  assert.equal(situation.lastEffectTurn, 100, "未满 4 季 lastEffectTurn 不应推进");

  // 满 4 季：应再次结算救济成本
  world.turn = 104;
  c.lastReport = {};
  history.processSituations(world);
  assert.ok(c.lastReport.event && c.lastReport.event.food > 0, "满 4 季应再次结算救济成本");
  assert.equal(c.lastReport.event.food, firstReliefFood, "节流后的救济成本结构应与首次脉冲一致");
  assert.equal(situation.lastEffectTurn, 104, "满 4 季后应更新 lastEffectTurn");
  console.log("A7 救济成本 4 季节流 OK");
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

// --- Phase C：历史因果链扩展（数据驱动 + 机制后果 + 纪元/流触发）---
{
  const cw = worldEngine.createWorld([
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 },
    { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", control: 70 },
  ]);
  history.initializeHistory(cw);

  // 未知链仍报错（防呆保留）
  assert.throws(() => history.applyCausalChain(cw, "no_such_chain"), /未知历史因果链/);

  // 君堡链行为不变（回归）：七跳 + flag + 探索压力 + 物价上行
  const priceBefore = cw.countries["法兰西王国"].priceIndex;
  const chain = history.applyCausalChain(cw, "constantinople_falls");
  assert.equal(chain.length, 7, "君堡链必须仍是七跳");
  assert.equal(cw.flags.constantinopleFallen, true);
  assert.ok(cw.countries["法兰西王国"].pressures.exploration > 0, "君堡链必须抬升探索压力");
  assert.ok(cw.countries["法兰西王国"].priceIndex > priceBefore, "君堡链必须推升物价");

  // 价格革命：物价上行 + 财政压力上行 + 置位
  const cw2 = worldEngine.createWorld([{ id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 }]);
  history.initializeHistory(cw2);
  const pr = cw2.countries["法兰西王国"];
  pr.pressures.fiscal = 0;
  const priceBefore2 = pr.priceIndex;
  history.applyCausalChain(cw2, "price_revolution");
  assert.equal(cw2.flags.priceRevolution, true);
  assert.ok(pr.priceIndex > priceBefore2, "价格革命必须推升物价");
  assert.ok(pr.pressures.fiscal > 0, "价格革命必须抬升财政压力");

  // 火药革命：旧式（征召/卫队）军团组织度下挫，职业军不受影响
  const cw3 = worldEngine.createWorld([{ id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 }]);
  history.initializeHistory(cw3);
  cw3.warfare = { armies: {
    levyArmy: { owner: "法兰西王国", units: [{ serviceType: "levy", soldiers: 1000 }], organization: 100 },
    proArmy: { owner: "法兰西王国", units: [{ serviceType: "professional", soldiers: 1000 }], organization: 100 },
  } };
  history.applyCausalChain(cw3, "gunpowder_revolution");
  assert.equal(cw3.flags.gunpowderRevolution, true);
  assert.ok(cw3.warfare.armies.levyArmy.organization < 100, "旧式征召军组织度必须下挫");
  assert.equal(cw3.warfare.armies.proArmy.organization, 100, "职业军不受火药革命冲击");

  // 工业起飞：思想/金钱加速
  const cw4 = worldEngine.createWorld([{ id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 }]);
  history.initializeHistory(cw4);
  const it = cw4.countries["法兰西王国"];
  it.ideas = 0;
  const moneyBefore = it.money;
  history.applyCausalChain(cw4, "industrial_takeoff");
  assert.equal(cw4.flags.industrialTakeoff, true);
  assert.ok(it.ideas >= 15 && it.money > moneyBefore, "工业起飞必须加速思想与金钱");

  // 纪元跨越自动触发绑定链：跨入信仰分裂纪元（1517）→ 触发 reformation_split
  const cw5 = worldEngine.createWorld([{ id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 }]);
  history.initializeHistory(cw5);
  cw5.turn = (1517 - 1337) * 4 + 1; // year 1517
  const fired = history.checkEra(cw5);
  assert.equal(fired, true, "跨年应推进纪元");
  assert.equal(cw5.flags.reformationSplit, true, "跨入信仰分裂纪元应自动触发宗教改革因果链");
  assert.ok(cw5.pendingTransition && cw5.pendingTransition.title === "信仰分裂", "纪元转折应使用因果链文案");

  // 流触发：新大陆白银航路开通 → processHistory 触发价格革命（仅一次）
  const cw6 = worldEngine.createWorld([{ id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 }]);
  history.initializeHistory(cw6);
  cw6.trade = { routes: { newWorld: { active: true } } };
  cw6.turn = 50;
  history.processHistory(cw6);
  assert.equal(cw6.flags.priceRevolution, true, "白银航路开通应触发价格革命");
  assert.ok(cw6.firedChains.has("price_revolution"), "价格革命应记入已触发集合，避免重复");
  console.log("Phase C 因果链扩展 OK");
}

// --- 垂帘听政启动守卫（修「点击无响应」：有待裁断事项时应明确受阻而非静默 0 推进）---
{
  const rw = worldEngine.createWorld([
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 },
  ]);
  history.initializeHistory(rw);

  assert.equal(history.canRunRegency(rw), true, "无待裁断事项时应可垂帘听政");
  assert.equal(history.regencyBlocker(rw), null, "无阻碍时 blocker 为 null");

  rw.pendingTransition = { title: "信仰分裂", sub: "", chain: [] };
  assert.equal(history.canRunRegency(rw), false, "时代转折未确认时不能垂帘听政");
  assert.ok(history.regencyBlocker(rw).includes("时代转折"), "应说明需先确认时代转折");

  rw.pendingTransition = null;
  rw.playerEvents = [{ id: "e1", title: "危机", choices: [] }];
  assert.equal(history.canRunRegency(rw), false, "有待裁断事件时不能垂帘听政");
  assert.ok(history.regencyBlocker(rw).includes("裁断"), "应说明需先裁断事件");

  rw.playerEvents = [];
  rw.pendingElection = { polity: "法兰西王国" };
  assert.equal(history.canRunRegency(rw), false, "待选举时不能垂帘听政");
  assert.ok(history.regencyBlocker(rw).includes("选立"), "应说明需先选立领导人");

  // 清空阻碍后，runRegency 真正推进（回归：守卫与 runRegency 口径一致）
  rw.pendingElection = null;
  const advanced = history.runRegency(rw, current => { current.turn += 1; }, 4);
  assert.equal(advanced, 4, "无阻碍时垂帘听政应推进满 4 季");
  console.log("垂帘听政启动守卫 OK");
}

// --- Task 3.2: 鏖战阶段战争压力回灌核心循环 ---
{
  const struggleEngine = context.window.HIFI_STRUGGLE_ENGINE;
  const sw = worldEngine.createWorld([
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 },
    { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", control: 70 },
  ]);
  history.initializeHistory(sw);
  struggleEngine.initializeStruggles(sw);
  const hyw = struggleEngine.struggleFor(sw, "hundred_years_war");
  assert.ok(hyw, "百年战争局势应成立");

  const fr = sw.countries["法兰西王国"];
  const en = sw.countries["英格兰王国"];

  // 对峙阶段：当事国不应被战争压力扣资源
  hyw.phase = "standoff";
  fr.food = 500; fr.military = 500;
  history.processHistory(sw);
  assert.ok(!fr.lastReport || fr.lastReport.war === undefined, "对峙阶段不产生战争压力段");
  assert.equal(fr.food, 500, "对峙阶段不扣粮");

  // 鏖战阶段：每季消耗军需与粮食，资源停止无脑增长，并写进季度账本
  hyw.phase = "open_war";
  fr.food = 500; fr.military = 500;
  en.food = 500; en.military = 500;
  for (let i = 0; i < 4; i++) {
    hyw.phase = "open_war"; // 隔离测试：固定阶段，只检验压力回灌
    history.processHistory(sw);
  }
  assert.ok(fr.food < 500, "鏖战阶段连续 4 季应消耗法兰西粮食");
  assert.ok(fr.military < 500, "鏖战阶段连续 4 季应消耗法兰西军需");
  assert.ok(en.food < 500 && en.military < 500, "对手英格兰同为当事国，亦被战争压力消耗");
  assert.ok(fr.lastReport.war && fr.lastReport.war.phase === "鏖战", "lastReport.war 应记录鏖战阶段来源");

  const ledger = history.quarterLedger(sw, "法兰西王国");
  assert.ok(ledger.food.war > 0, "季度账本食物段应区分出战争消耗");
  assert.ok(ledger.military.war > 0, "季度账本军需段应区分出战争消耗");
  assert.ok(ledger.food.war !== ledger.food.event, "战争消耗与黑死病救济(event)分列，不叠加成双重砍");
  assert.ok(ledger.food.sources.some(s => s.includes("百年战争")), "账本食物来源应说明战争消耗");
  assert.ok(ledger.war && ledger.war.phase === "鏖战", "账本顶层 war 段供季度总结读取");

  // 旁观国（非当事国）不被战争压力波及
  assert.equal(struggleEngine.involvement(sw, "苏格兰王国", hyw) === "bystander" || !sw.countries["苏格兰王国"], true);
  console.log("Task 3.2 鏖战战争压力回灌 OK");
}

console.log("hifi history engine passed");

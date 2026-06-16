const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi");
const context = { window: {} };
for (const file of [
  "scripts/data/countries.js",
  "scripts/engine/world.js",
  "scripts/engine/politics.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const data = context.window.HIFI_COUNTRY_DATA;
const worldEngine = context.window.HIFI_WORLD_ENGINE;
const politics = context.window.HIFI_POLITICS_ENGINE;
assert.equal(data.leaders["法兰西王国"].history[0].name, "腓力六世");
assert.equal(data.leaders["威尼斯共和国"].history[0].title, "总督");

const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, buildings: ["market"], city: "巴黎" },
  { id: 2, isSea: false, polity: "威尼斯共和国", population: 8, buildings: ["market", "port"], city: "威尼斯" },
];
const world = worldEngine.createWorld(tiles);
politics.initializePolitics(world);

const france = world.countries["法兰西王国"];
assert.equal(france.leader.name, "腓力六世");
assert.equal(france.government.type, "monarchy");
assert.ok(france.estates.nobles);
assert.equal(france.government.assembly.unlocked, false);

const moneyBefore = france.money;
politics.advanceReform(world, "法兰西王国", "administrative");
assert.equal(france.government.reforms.administrative, 2);
assert.equal(france.money, moneyBefore - 10);

france.government.reforms.administrative = 5;
const moneyBeforeFullReform = france.money;
assert.throws(
  () => politics.advanceReform(world, "法兰西王国", "administrative"),
  /已满级/
);
assert.equal(france.money, moneyBeforeFullReform, "满级改革不能继续扣费");

politics.changeGovernment(world, "法兰西王国", "republic");
assert.equal(france.government.type, "republic");
assert.equal(france.leader.title, "执政官");
assert.equal(france.government.assembly.unlocked, true);
assert.ok(france.estates.citizens);

const venice = world.countries["威尼斯共和国"];
assert.equal(venice.government.type, "merchant_republic");
world.playerPolity = "威尼斯共和国";
world.turn = 12;
venice.leader.termEndsAtTurn = 12;
politics.processLeadership(world, "威尼斯共和国");
assert.equal(world.pendingElection.polity, "威尼斯共和国");
const elected = politics.completeElection(world, 0);
assert.equal(venice.leader.name, elected.name);
assert.equal(world.pendingElection, null);

politics.changeGovernment(world, "法兰西王国", "monarchy");
world.playerPolity = "法兰西王国";
world.turn = france.leader.historicalEndAtTurn;
const succession = politics.processLeadership(world, "法兰西王国");
assert.equal(france.leader.name, "让二世", "历史领导人到期后必须进入下一位历史领导人");
assert.equal(france.leader.dynasty, "瓦卢瓦家族");
assert.equal(world.pendingElection, null, "世袭换代不能阻塞为玩家选举");
assert.equal(succession.type, "succession");

world.playerPolity = "法兰西王国";
world.turn = venice.leader.historicalEndAtTurn;
const foreignElection = politics.processLeadership(world, "威尼斯共和国");
assert.equal(world.pendingElection, null, "外国选举必须自动结算，不能阻塞玩家季度");
assert.equal(foreignElection.type, "auto_election");

// 法律接入流：税收→金钱产出流；切换即时增减阶层满意；前置条件与重复颁布拦截
vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/engine/economy.js"), "utf8"), context);
const economy = context.window.HIFI_ECONOMY_ENGINE;
france.technology = {}; // tileOutput 只读 technology 标志，置空即可（无需 HIFI_RULES）
// france 经 line 65 已切回君主制，含 nobles 阶层、改革重置（fiscal=1）
france.government.laws.taxation = "customary";
france.actionPoints.administrative = 3;
france.government.centralPower = 62;
const taxTile = { id: 91, isSea: false, polity: "法兰西王国", population: 12, control: 80, devastation: 0, good: "grain", buildings: ["market"] };
const moneyCustomary = economy.tileOutput(taxTile, france).money;
const noblesBefore = france.estates.nobles.satisfaction;
politics.setLaw(world, "法兰西王国", "taxation", "uniform");
assert.ok(economy.tileOutput(taxTile, france).money > moneyCustomary, "统一税制必须提高金钱产出流");
assert.ok(france.estates.nobles.satisfaction < noblesBefore, "统一税制必须压低贵族满意度");
assert.throws(() => politics.setLaw(world, "法兰西王国", "taxation", "uniform"), /已是当前法律/);
// 前置条件：常备军制需财政改革 ≥2（france 当前 fiscal=1）
france.actionPoints.administrative = 3;
assert.throws(() => politics.setLaw(world, "法兰西王国", "mobilization", "standing"), /财政改革/);
// 统一税前置：王权不足时拒绝
france.government.laws.taxation = "customary";
france.government.centralPower = 40;
france.actionPoints.administrative = 3;
assert.throws(() => politics.setLaw(world, "法兰西王国", "taxation", "uniform"), /王权/);
assert.ok(context.window.HIFI_POLITICS_ENGINE.lawEffects.taxation.uniform.moneyMultiplier > 1, "法律效果表必须导出");

// 改革槽每级加成：财政改革提高金钱产出流
france.government.laws.taxation = "customary";
france.government.reforms.fiscal = 0;
const moneyNoFiscal = economy.tileOutput(taxTile, france).money;
france.government.reforms.fiscal = 5;
assert.ok(economy.tileOutput(taxTile, france).money > moneyNoFiscal, "财政改革必须提高金钱产出流");
// 行政改革提高整合效率（无改革 +20，有改革更多）
world.tiles.push({ id: 92, isSea: false, polity: "法兰西王国", control: 40, buildings: [] });
world.tiles.push({ id: 93, isSea: false, polity: "法兰西王国", control: 40, buildings: [] });
france.money = 200;
france.actionPoints.administrative = 5;
france.government.reforms.administrative = 0;
economy.integrateTile(world, "法兰西王国", 92);
assert.equal(world.tiles.find(t => t.id === 92).control, 60, "无行政改革时整合 +20 控制度");
france.government.reforms.administrative = 3;
economy.integrateTile(world, "法兰西王国", 93);
assert.ok(world.tiles.find(t => t.id === 93).control > 60, "行政改革必须提高整合效率");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes('id="countryModal"'));
assert.ok(html.includes('id="countrySelectModal"'));
assert.ok(html.includes('id="leaderElectionModal"'));

console.log("hifi politics engine passed");

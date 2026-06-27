const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi");
const context = { window: {} };
for (const file of [
  "scripts/data/countries.js",
  "scripts/data/institutions.js",
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
assert.equal(france.name, "法兰西王国");
assert.equal(france.displayName, "法兰西王国");
assert.equal(france.government.institutions.succession, "hereditary");
assert.equal(france.government.institutions.fiscal, "demesne");
assert.equal(france.government.archetype, "feudal_monarchy");
assert.ok(france.government.estateKeys.includes("nobles"));
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
assert.equal(france.name, "法兰西王国", "国家身份主键不能因政体变化而改变");
assert.equal(france.displayName, "法兰西共和国", "展示名应随政体派生变化");
assert.equal(france.government.institutions.succession, "republican_term");
assert.equal(france.government.archetype, "republic");
assert.equal(france.leader.title, "执政官");
assert.equal(france.government.assembly.unlocked, true);
assert.ok(france.estates.citizens);

const venice = world.countries["威尼斯共和国"];
assert.equal(venice.government.type, "merchant_republic");
assert.equal(venice.government.archetype, "merchant_republic");
assert.equal(venice.government.institutions.fiscal, "commercial");
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
assert.equal(france.government.institutions.fiscal, "direct", "统一税制必须同步派生为直接征税财政模块");
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

// 阶层满意度接入流：不满阶层每季惩罚关联资源流 + 累积不满 + 满意度向 0 回归
france.estates.nobles.satisfaction = -60;
france.estates.nobles.power = 42;
france.military = 100;
france.unrest = 0;
politics.processEstates(world, "法兰西王国");
assert.ok(france.military < 100, "不满的贵族必须惩罚军需流");
assert.ok(france.unrest >= 1, "不满必须累积国内不满");
assert.equal(france.estates.nobles.satisfaction, -59, "满意度必须向 0 缓慢回归");

// 王权 ↔ 阶层权力此消彼长：高王权压低阶层权力
france.government.centralPower = 80;
france.estates.nobles.power = 50;
politics.processEstates(world, "法兰西王国");
assert.ok(france.estates.nobles.power < 50, "高王权必须压低阶层权力");

// 王权压力漂移：内压推动集权，并同步到制度模块
france.government.centralPower = 50;
france.legitimacy = 18;
france.unrest = 8;
for (const estate of Object.values(france.estates)) estate.satisfaction = 0;
const centralBeforeInternal = france.government.centralPower;
politics.processEstates(world, "法兰西王国");
assert.ok(france.government.centralPower > centralBeforeInternal, "低合法性与内乱必须推动王权集权");
assert.equal(france.government.institutions.centralization, france.government.centralPower, "王权漂移必须同步制度中央化轴");
assert.ok(france.government.lastCentralizationDrift.internal > 0, "必须记录内压来源");

// 王权压力漂移：资本阶层主导时，外部战争压力推动让权
venice.government.centralPower = 50;
venice.unrest = 0;
venice.legitimacy = 70;
for (const estate of Object.values(venice.estates)) {
  estate.satisfaction = 0;
  estate.power = 10;
}
venice.estates.companies.power = 70;
venice.estates.oligarchs.power = 60;
world.diplomacy = { wars: [{ attackers: ["威尼斯共和国"], defenders: ["法兰西王国"] }] };
const centralBeforeExternal = venice.government.centralPower;
politics.processEstates(world, "威尼斯共和国");
assert.ok(venice.government.centralPower < centralBeforeExternal, "资本阶层主导时外部战争压力必须推动让权");
assert.ok(venice.government.lastCentralizationDrift.capital > venice.government.lastCentralizationDrift.coercion, "必须识别资本阶层主导");

// 纪元改规则：绝对主义财政路线只在绝对主义纪元后开放
vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/engine/history.js"), "utf8"), context);
france.government.reforms.fiscal = 3;
france.government.centralPower = 60;
world.eraIndex = 0;
assert.equal(politics.decisions.fiscal_absolutism.can(france, world), false, "未到绝对主义纪元不能行绝对主义财政");
world.eraIndex = 3;
assert.equal(politics.decisions.fiscal_absolutism.can(france, world), true, "绝对主义纪元后可行绝对主义财政");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes('id="countryModal"'));
assert.ok(html.includes('id="countrySelectModal"'));
assert.ok(html.includes('id="leaderElectionModal"'));

console.log("hifi politics engine passed");

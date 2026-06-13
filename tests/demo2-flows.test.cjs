const assert = require("node:assert/strict");
const { loadDemo2 } = require("./demo2-harness.cjs");

// ============ A. 人口流：同一场瘟疫，两种后果 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  const france = world.countries["法兰西王国"];
  const horde = world.countries["金帐汗国"];
  france.plagueTouched = true; france.plagueTouchedTurn = 1;
  horde.plagueTouched = true; horde.plagueTouchedTurn = 1;
  const fs = api.laborStructure("法兰西王国", world);
  console.log("法兰西结构：西欧型", fs.west.toFixed(2), "东欧型", fs.east.toFixed(2));
  const peasantsBefore = france.estates.peasants.satisfaction;
  api.applyLaborPath(world, france, "free");
  assert.equal(france.laborSettled, "free");
  assert.ok(france.estates.peasants.satisfaction > peasantsBefore, "劳役松动：平民受益");
  assert.ok(france.modifiers.some(m => m.key === "labor_free"), "人口恢复修正");
  const nobleKey = Object.keys(horde.estates).find(k => ["nobles","clans"].includes(k)) || Object.keys(horde.estates)[0];
  const noblesBefore = horde.estates[nobleKey].satisfaction;
  api.applyLaborPath(world, horde, "serfdom");
  assert.equal(horde.laborSettled, "serfdom");
  assert.ok(horde.estates[nobleKey].satisfaction > noblesBefore, "再版农奴制：贵族类受益");
  assert.ok(horde.modifiers.some(m => m.key === "labor_serf"), "庄园谷物修正");
  assert.ok(world.worldEvents.some(e => e.text.includes("劳役")) && world.worldEvents.some(e => e.text.includes("农奴制")), "两条路都进入纪闻");
  console.log("人口流 OK：同疫不同命");
}

// ============ B. 资本池 → 蒸汽机门槛 → 铁路 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  const venice = world.countries["威尼斯共和国"];
  api.processTrade(world);
  api.beginCountryReport(venice);
  api.settleCountry("威尼斯共和国");
  assert.ok((venice.capital || 0) > 0, `商路收入沉淀资本池（${venice.capital}）`);
  const france = world.countries["法兰西王国"];
  api.advanceEra(world, "revolution", ["测试"]);
  france.money = 1000;
  france.capital = 100;
  assert.equal(api.ADVANCES.steamEngine.can(world, france), false, "资本不足蒸汽机不可采纳");
  france.capital = 200;
  assert.equal(api.ADVANCES.steamEngine.can(world, france), true, "资本充足解锁蒸汽机");
  assert.equal(api.adoptAdvance(world, "法兰西王国", "steamEngine"), true);
  api.advanceEra(world, "industrial", ["测试"]);
  france.capital = 300; france.money = 600;
  assert.equal(api.adoptAdvance(world, "法兰西王国", "railways"), true, "铁路采纳（耗资本池）");
  assert.ok(france.capital <= 50, "铁路扣减资本池");
  console.log("资本池 OK：贸易→资本→蒸汽机→铁路");
}

// ============ C. 波罗的海粮道：信仰纪元解锁 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  const baltic = api.TRADE_ROUTES.find(r => r.key === "baltic_grain");
  assert.equal(baltic.locked, true, "开局锁定");
  api.advanceEra(world, "faith", ["测试"]);
  assert.equal(baltic.locked, false, "信仰纪元解锁");
  api.processTrade(world);
  assert.ok(world.trade.routes.baltic_grain.flow > 0, "粮道有流量");
  assert.ok(world.worldEvents.some(e => e.text.includes("波罗的海粮道")), "解锁事件带因果链");
  console.log("波罗的海粮道 OK，流量", world.trade.routes.baltic_grain.flow);
}

// ============ D. 财政-军事国家分岔 + 国债 + 财政压力 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.advanceEra(world, "absolutism", ["测试"]);
  const france = world.countries["法兰西王国"];
  world.playerPolity = "法兰西王国";
  france.government.assembly.unlocked = true;
  france.estates.merchants.power = 40;
  const parliament = api.DECISIONS.find(d => d.key === "fiscal_parliament");
  assert.equal(parliament.can(france, world), true, "议会举债制可选");
  parliament.apply(france, world);
  assert.equal(france.fiscalState, "parliamentary");
  const bonds = api.EDICTS.find(e => e.key === "issue_bonds");
  assert.equal(bonds.available(france), true, "国债敕令解锁");
  const moneyBefore = france.money;
  bonds.apply(france);
  assert.equal(france.money, moneyBefore + 200, "国债 +200");
  assert.ok(france.modifiers.some(m => m.key === "bond_interest"), "债息修正挂账");
  api.processTrade(world);
  api.beginCountryReport(france);
  api.settleCountry("法兰西王国");
  assert.ok(france.pressures.fiscal >= 10, `债息计入财政压力（${france.pressures.fiscal}）`);
  // 绝对主义路线（另一国）
  const castile = world.countries["卡斯蒂利亚王国"];
  castile.government.centralPower = 65;
  const absolutist = api.DECISIONS.find(d => d.key === "fiscal_absolutist");
  assert.equal(absolutist.can(castile, world), true, "绝对主义财政可选");
  console.log("财政分岔 OK：同一道财政题，两个答案");
}

// ============ E. 消费端：东方奢侈品涨价 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.processTrade(world);
  world.trade.orientCostIndex = 1.5;
  world.turn = 6; // %4===2
  const france = world.countries["法兰西王国"];
  assert.equal(api.hasOrientNode("法兰西王国", world), false);
  api.beginCountryReport(france);
  api.settleCountry("法兰西王国");
  assert.ok(france.report.events.some(e => e.includes("香料与丝绸")), "宫廷感到物价之痛");
  assert.ok(france.echoLog.some(e => e.reason === "东方奢侈品腾贵"), "贵族满意度受波及");
  const mamluk = world.countries["马穆鲁克苏丹国"];
  assert.equal(api.hasOrientNode("马穆鲁克苏丹国", world), true, "节点主不受奢侈品惩罚");
  console.log("消费端 OK：君堡的代价传到了巴黎的餐桌");
}

// ============ F. 棱堡：围攻进度衰减 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  const fortTile = world.tiles.find(t => !t.isSea && t.buildings.includes("fort") && t.controller === "法兰西王国");
  assert.ok(fortTile, "法兰西有要塞");
  world.diplomacy.wars.push({ id: "war-test", name: "测试战争", attackers: ["英格兰王国"], defenders: ["法兰西王国"],
    warLeaderAttack: "英格兰王国", warLeaderDefense: "法兰西王国",
    primaryGoal: { tileId: fortTile.id, label: "x", claimant: "英格兰王国" }, secondaryDemands: [],
    startedTurn: 1, truceUntilTurn: null, score: 0,
    participants: { "英格兰王国": { side: "attacker", contribution: 0, warWill: 85 }, "法兰西王国": { side: "defender", contribution: 0, warWill: 85 } } });
  const army = api.addArmy(world, { owner: "英格兰王国", tileId: fortTile.id, name: "围攻军", units: [api.armyUnit("infantry", "levy", 4000, fortTile.id, "peasants")] });
  fortTile.occupation = 0;
  api.applyOccupation(world, army);
  const plainGain = fortTile.occupation;
  fortTile.occupation = 0;
  world.countries["法兰西王国"].technology.bastions = true;
  api.applyOccupation(world, army);
  const bastionGain = fortTile.occupation;
  assert.ok(bastionGain < plainGain, `棱堡减缓围攻（${plainGain}→${bastionGain}）`);
  console.log("棱堡 OK：", plainGain, "→", bastionGain);
}

// ============ G. 总督代理 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.advanceEra(world, "absolutism", ["测试"]);
  const france = world.countries["法兰西王国"];
  france.governorAuto = true;
  france.actionPoints.administrative = 3;
  const low = api.controlledTiles("法兰西王国", world).sort((a, b) => a.control - b.control)[0];
  const controlBefore = low.control;
  api.beginCountryReport(france);
  api.runGovernor(world);
  assert.ok(france.actionPoints.administrative < 3, "总督消耗闲置行政点");
  assert.ok(france.report.events.some(e => e.includes("总督代理")), "代理行为入季报");
  console.log("总督代理 OK：行政点", 3, "→", france.actionPoints.administrative);
}

// ============ H. 商人权力挂钩商路 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  const venice = world.countries["威尼斯共和国"];
  api.processTrade(world);
  api.beginCountryReport(venice);
  api.settleCountry("威尼斯共和国");
  const powerWithTrade = venice.estates.companies.power;
  world.trade.income["威尼斯共和国"] = 0;
  api.beginCountryReport(venice);
  api.settleCountry("威尼斯共和国");
  const powerWithoutTrade = venice.estates.companies.power;
  assert.ok(powerWithTrade > powerWithoutTrade, `商路收入结构性滋养商人权力（${powerWithoutTrade}→${powerWithTrade}）`);
  console.log("商人权力 OK：无商路", powerWithoutTrade, "vs 有商路", powerWithTrade);
}

console.log("demo2-flows: all assertions passed");

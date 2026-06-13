const assert = require("node:assert/strict");
const { loadDemo2 } = require("./demo2-harness.cjs");

// ============ A. 贸易基线与关税干预 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.processTrade(world);
  const base = JSON.parse(JSON.stringify(world.trade.routes));
  assert.ok(base.levant.flow > 0, "黎凡特线有流量");
  assert.ok((world.trade.income["威尼斯共和国"] || 0) > 0, "威尼斯有商路收入");
  assert.ok((world.trade.income["热那亚共和国"] || world.trade.income["米兰领"] || world.trade.income["英格兰王国"] || 0) >= 0);

  // 拜占庭改高关税 → 黎凡特/黑海成本升、流量降，红海获益
  world.countries["拜占庭帝国"].tradePolicy = "high";
  api.processTrade(world);
  assert.ok(world.trade.routes.levant.cost > base.levant.cost, "高关税推高黎凡特成本");
  assert.ok(world.trade.routes.levant.flow < base.levant.flow, "黎凡特流量下降");
  assert.ok(world.trade.routes.redsea.flow > base.redsea.flow, "红海线承接分流");
  world.countries["拜占庭帝国"].tradePolicy = "normal";
}

// ============ B. 七跳因果链端到端 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.processTrade(world);
  const veniceBase = world.trade.income["威尼斯共和国"];
  const portugal = world.countries["葡萄牙王国"];
  api.beginCountryReport(portugal);
  const portugalPressureBase = api.computePressures(world, "葡萄牙王国").exploration;

  // ② 君堡易手
  const constantinople = world.tiles.find(t => t.city === "君士坦丁堡");
  constantinople.controller = "奥斯曼贝伊国";
  constantinople.polity = "奥斯曼贝伊国";
  api.processSituations(world);
  assert.equal(world.flags.constantinopleFallen, true, "陷落旗帜");
  assert.equal(world.flags.discoveryImpulse, true, "大发现冲动");
  assert.ok(world.trade.shock && world.trade.shock.routes.includes("levant"), "商路冲击生效");
  assert.ok(world.worldEvents.some(e => e.kind === "era" && e.chain && e.chain.length >= 3), "纪元事件带因果链");
  assert.ok(world.pendingTransition, "转折卡待展示");

  // ③ 流改道：黎凡特单线重挫、威尼斯总收入下跌（红海分流部分补偿——威尼斯转向亚历山大，正是史实）
  const levantBase = world.trade.routes.levant.flow;
  api.processTrade(world);
  const veniceAfterFall = world.trade.income["威尼斯共和国"] || 0;
  assert.ok(world.trade.routes.levant.flow <= levantBase * .7, `黎凡特流量重挫（${levantBase}→${world.trade.routes.levant.flow}）`);
  assert.ok(veniceAfterFall <= veniceBase * .85, `威尼斯总收入下跌（${veniceBase}→${veniceAfterFall}）`);
  assert.ok(world.trade.orientCostIndex > 1.25, "东方商路成本指数上升");

  // ④ 压力转化：葡萄牙新航路冲动上涨
  const portugalPressure = api.computePressures(world, "葡萄牙王国").exploration;
  assert.ok(portugalPressure > portugalPressureBase + 15, `探索压力上涨（${portugalPressureBase}→${portugalPressure}）`);

  // ⑤ 玩家工程：采纳远洋帆船 → 里程碑推进
  portugal.money = 500;
  world.turn = api.turnForDate(1460, 1);
  assert.equal(api.adoptAdvance(world, "葡萄牙王国", "oceanShips"), true, "葡萄牙采纳远洋帆船");
  portugal.exploration.points = 60;
  for (let i = 0; i < 5 && !portugal.exploration.done.includes("cape"); i++) {
    api.processExploration(world);
    world.turn += 6; // 远征节奏：一次远航一年半
  }
  assert.ok(portugal.exploration.done.includes("cape"), "好望角里程碑达成");

  // ⑥ 流的新生：好望角线开通、流量改道
  const cape = api.TRADE_ROUTES.find(r => r.key === "cape");
  assert.equal(cape.locked, false, "好望角线解锁");
  assert.equal(cape.patron, "葡萄牙王国", "开拓者归属");
  api.processTrade(world);
  assert.ok(world.trade.routes.cape.flow > 0, "好望角线有流量");
  const veniceAfterCape = world.trade.income["威尼斯共和国"] || 0;
  assert.ok(veniceAfterCape < veniceAfterFall, `威尼斯结构性衰退（${veniceAfterFall}→${veniceAfterCape}）`);
  assert.ok((world.trade.income["葡萄牙王国"] || 0) > 10, "葡萄牙商路收入崛起");

  // ⑦ 二阶后果：新大陆白银 → 物价侵蚀
  portugal.exploration.points = 120;
  for (let i = 0; i < 4 && api.TRADE_ROUTES.find(r => r.key === "newworld").locked; i++) {
    api.processExploration(world);
    world.turn += 6;
  }
  assert.ok(!api.TRADE_ROUTES.find(r => r.key === "newworld").locked, "新大陆线解锁");
  for (let i = 0; i < 8; i++) {
    api.processTrade(world);
    api.beginCountryReport(portugal);
    api.settleCountry("葡萄牙王国");
  }
  assert.ok(portugal.priceIndex > 1.1, `白银推高物价（指数 ${portugal.priceIndex.toFixed(2)}）`);
  assert.ok(portugal.report.moneyParts.some(p => p.label === "物价侵蚀" && p.amount < 0), "物价侵蚀在季报中可见");
  console.log("七跳链 OK：威尼斯", veniceBase, "→", veniceAfterFall, "→", veniceAfterCape,
    "| 葡萄牙物价", portugal.priceIndex.toFixed(2));
}

// ============ C. 偏转对照：君堡不陷落 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.processTrade(world);
  const pressure = api.computePressures(world, "葡萄牙王国").exploration;
  assert.ok(!world.flags.constantinopleFallen, "未陷落");
  assert.ok(pressure <= 30, `未陷落时探索压力低位（${pressure}）`);
  // 但压力非零路径仍在：把东方成本推高（战争/瘟疫）也会缓慢积累——用高关税模拟
  world.countries["拜占庭帝国"].tradePolicy = "high";
  world.countries["马穆鲁克苏丹国"].tradePolicy = "high";
  api.processTrade(world);
  const pressureCostly = api.computePressures(world, "葡萄牙王国").exploration;
  assert.ok(pressureCostly > pressure, "即使君堡未失，商路成本本身也制造探索压力");
  console.log("偏转 OK：探索压力", pressure, "→（仅成本上升）", pressureCostly);
}

// ============ D. 奥斯曼战略驱动 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  world.turn = api.turnForDate(1390, 1);
  const ottoman = world.countries["奥斯曼贝伊国"];
  ottoman.military = 500;
  // 结束尼科米底亚围城以解除既有战争状态
  world.diplomacy.wars = world.diplomacy.wars.filter(w => !w.attackers.includes("奥斯曼贝伊国"));
  const declared = api.aiStrategicWar(world, "奥斯曼贝伊国", ottoman);
  assert.equal(declared, true, "战略驱动宣战");
  const war = world.diplomacy.wars.find(w => w.name === "海峡之战");
  assert.ok(war, "海峡之战存在");
  assert.equal(world.tiles[war.primaryGoal.tileId].city, "君士坦丁堡", "战争目标=君堡");
  console.log("战略驱动 OK");
}

// ============ E. 决策回响 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  const france = world.countries["法兰西王国"];
  api.beginCountryReport(france);
  api.registerDecision(france, "《盾牌钱》", "军需+40，商人不满");
  france.military += 40;
  api.adjustEstateForCountry(france, "merchants", { satisfaction: -8 }, "盾牌钱");
  const echoes = api.decisionEchoes(france);
  assert.ok(echoes.length >= 1 && echoes[0].includes("盾牌钱"), "回响包含决策");
  assert.ok(echoes[0].includes("商人满意"), `回响包含后果（${echoes[0]}）`);
  console.log("决策回响 OK：", echoes[0]);
}

// ============ F. 垂帘速演稳定性 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  let total = 0;
  const reasons = [];
  for (let i = 0; i < 5 && !world.gameOver; i++) {
    while (world.playerEvents.length) {
      const ev = world.playerEvents[0];
      api.resolvePlayerEvent(ev, ev.type === "estate_ultimatum" ? "concede" : "accept");
    }
    if (world.pendingElection) api.completeLeaderElection(world, 0);
    const report = api.runRegency(world, 40);
    total += report.quarters;
    reasons.push(report.interrupt);
    assert.ok(report.quarters >= 1, "垂帘至少推进一季");
    assert.ok(typeof report.interrupt === "string" && report.interrupt.length, "有唤醒缘由");
  }
  assert.ok(total >= 25, `五轮垂帘合计推进 ${total} 季（中断缘由：${reasons.join("/")}）`);
  assert.ok(!Number.isNaN(world.countries[world.playerPolity].money), "数值健康");
  console.log(`垂帘 OK：共 ${total} 季，现为 ${api.calendarForTurn(world.turn).year} 年，唤醒缘由：${reasons.join(" / ")}`);
}

console.log("demo2-causality: all assertions passed");

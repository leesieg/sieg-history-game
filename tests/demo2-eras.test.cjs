const assert = require("node:assert/strict");
const { loadDemo2 } = require("./demo2-harness.cjs");

// ============ A. 封建→发现：君堡触发 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  assert.equal(api.currentEra(world).key, "feudal");
  world.tiles.find(t => t.city === "君士坦丁堡").controller = "奥斯曼贝伊国";
  api.processSituations(world);
  api.checkEras(world);
  assert.equal(api.currentEra(world).key, "discovery", "君堡陷落开启发现纪元");
  assert.ok(world.pendingTransition.chain.some(line => line.includes("新纪元的规则")), "纪元卷轴含新规则");
}

// ============ B. 发现→信仰：宗教改革 + 改宗随局不同 ============
function reformationScenario(printers, aggrievedPolity) {
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  world.tiles.find(t => t.city === "君士坦丁堡").controller = "奥斯曼贝伊国";
  api.processSituations(world);
  api.checkEras(world);
  world.turn = api.turnForDate(1456, 1);
  for (const p of printers) world.countries[p].technology.printing = true;
  const aggrieved = world.countries[aggrievedPolity];
  const churchKey = Object.keys(aggrieved.estates).find(k => ["church","clergy","imperial_church"].includes(k)) || "church";
  aggrieved.estates[churchKey].satisfaction = -20;
  api.processSituations(world);
  api.checkEras(world);
  assert.equal(world.flags.reformation, true, "宗教改革爆发");
  assert.equal(api.currentEra(world).key, "faith", "信仰纪元开启");
  assert.ok(world.tiles.some(t => t.religion === "新教"), "萨克森火种已点燃");
  for (let i = 0; i < 16; i++) { world.turn += 1; api.processReformation(world); }
  return world.tiles.filter(t => t.religion === "新教").map(t => t.controller);
}
{
  const runA = reformationScenario(["威尼斯共和国", "米兰领", "法兰西王国"], "法兰西王国");
  const runB = reformationScenario(["威尼斯共和国", "米兰领", "英格兰王国"], "英格兰王国");
  assert.ok(runA.length >= 3 && runB.length >= 3, "两局都有改宗扩散");
  const aSet = new Set(runA), bSet = new Set(runB);
  assert.ok(runA.includes("法兰西王国") || runB.includes("英格兰王国"), "改宗发生在印刷+不满的国家");
  assert.notDeepEqual([...aSet].sort(), [...bSet].sort(), `改宗地图随局不同（A:${[...aSet]} vs B:${[...bSet]}）`);
  console.log("改宗扩散 OK：局A", [...aSet].slice(0,4).join("/"), "· 局B", [...bSet].slice(0,4).join("/"));
}

// ============ C. 信仰→王权：大和会规则可被言明且生效 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  world.tiles.find(t => t.city === "君士坦丁堡").controller = "奥斯曼贝伊国";
  api.processSituations(world); api.checkEras(world);
  world.turn = api.turnForDate(1456, 1);
  for (const p of ["威尼斯共和国", "米兰领", "法兰西王国"]) world.countries[p].technology.printing = true;
  world.countries["法兰西王国"].estates.church.satisfaction = -20;
  api.processSituations(world); api.checkEras(world);
  assert.equal(api.currentEra(world).key, "faith");
  const capBefore = api.diplomaticCapacity("法兰西王国", world);
  world.faithWarCount = 2;
  world.eraFaithStart = world.turn - 30;
  api.processSituations(world);
  assert.equal(world.flags.peaceOfFaith, true, "大和会落幕");
  const congress = world.worldEvents.find(e => e.text.includes("诸国和会"));
  assert.ok(congress && congress.chain.some(l => l.includes("教随国定")) && congress.chain.some(l => l.includes("条约神圣")), "和会规则可被言明");
  assert.equal(api.diplomaticCapacity("法兰西王国", world), capBefore + 1, "常驻使节：外交容量 +1 生效");
  api.checkEras(world);
  assert.equal(api.currentEra(world).key, "absolutism", "王权纪元开启");
  console.log("大和会 OK：", congress.chain.filter(l => /一、|二、|三、/.test(l)).join(" "));
}

// ============ D. 王权→革命→工业 ============
{
  const api = loadDemo2();
  api.state = api.newState();
  const world = api.state;
  api.advanceEra(world, "absolutism", ["测试推进"]);
  // 常备军
  const france = world.countries["法兰西王国"];
  france.government.reforms.fiscal = 1;
  france.money = 500; france.military = 200;
  assert.equal(api.adoptAdvance(world, "法兰西王国", "standingArmy"), true, "采纳常备军");
  api.beginCountryReport(france);
  api.settleCountry("法兰西王国");
  assert.ok(france.report.militaryParts.some(p => p.label === "常备军体系" && p.amount > 0), "常备军军需加成可见");
  // 革命
  france.ideas = 70;
  france.pressures.fiscal = 80;
  api.processEnlightenment(world);
  assert.equal(world.flags.firstRevolution, true, "革命爆发");
  assert.ok(france.revolt && france.revolt.revolutionary, "革命军在地图上");
  api.checkEras(world);
  assert.equal(api.currentEra(world).key, "revolution", "革命纪元开启");
  const neighbor = world.countries["勃艮第公国"] || world.countries["英格兰王国"];
  assert.ok((neighbor.ideas || 0) >= 15, "思想跨国传染");
  // 工业
  for (const p of ["英格兰王国", "法兰西王国", "神圣罗马帝国"]) world.countries[p].technology.steamEngine = true;
  api.checkEras(world);
  assert.equal(api.currentEra(world).key, "industrial", "工业纪元开启");
  assert.ok(world.pendingTransition.chain.some(l => l.includes("大分流榜")), "大分流榜随卷轴展示");
  console.log("王权→革命→工业 OK");
}

console.log("demo2-eras: all assertions passed");

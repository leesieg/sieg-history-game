const assert = require("node:assert/strict");
const { loadDemo2 } = require("./demo2-harness.cjs");

const api = loadDemo2();
api.state = api.newState();
const world = api.state;

// --- 数值体系 ---
const france = world.countries["法兰西王国"];
assert.equal(france.legitimacy, 62, "合法性开局 62");
assert.ok(france.food >= 40 && france.money >= 40, "资源 ×10 量级");
assert.ok(Object.values(france.estates).every(e => e.satisfaction >= -100 && e.satisfaction <= 100));

// --- 阶梯阈值 ---
assert.equal(api.estateStageInfo(0).level, 0);
assert.equal(api.estateStageInfo(-30).level, 1);
assert.equal(api.estateStageInfo(-55).level, 2);
assert.equal(api.estateStageInfo(-75).level, 3);
assert.equal(api.estateStageInfo(50).level, -1);

// --- 因果记录 ---
api.beginCountryReport(france);
api.changeLegitimacy(france, -5, "测试原因");
assert.equal(france.report.legitimacy[0].reason, "测试原因");
api.adjustEstateForCountry(france, "peasants", { satisfaction: -8 }, "测试征发");
assert.ok(france.report.estates.some(e => e.reason === "测试征发"));

// --- 预测 ---
const forecast = api.forecastCountry("法兰西王国");
assert.ok(Number.isFinite(forecast.food) && Number.isFinite(forecast.money));
assert.equal(forecast.food, forecast.foodParts.reduce((s, p) => s + p.amount, 0), "预测各分项求和一致");

// --- 敕令 ---
const tour = api.EDICTS.find(e => e.key === "coronation_tour");
const before = france.legitimacy;
france.money = 200;
api.applyEdict(france, tour);
assert.ok(france.legitimacy > before, "加冕巡游提升合法性");
assert.ok(api.canEnactEdict(france, tour).ok === false, "冷却生效");
const quarantine = api.EDICTS.find(e => e.key === "quarantine");
assert.equal(api.canEnactEdict(france, quarantine).ok, false, "黑死病前封港不可用");

// --- 平民恢复手段存在 ---
const peasantHeals = api.EDICTS.filter(e => JSON.stringify(e.apply.toString()).includes("peasants") && e.apply.toString().includes("satisfaction: 1"));
assert.ok(peasantHeals.length >= 2, "平民至少有两种恢复手段");

// --- 叛乱 ---
france.estates.nobles.satisfaction = -80;
api.triggerRevolt(world, "法兰西王国", "nobles");
const rebels = Object.values(world.warfare.armies).filter(a => a.owner.startsWith("叛军·法兰西王国"));
assert.ok(rebels.length >= 1, "贵族叛军生成");
assert.equal(api.areAtWar(rebels[0].owner, "法兰西王国"), true, "叛军与本国敌对");
assert.equal(api.areAtWar(rebels[0].owner, "英格兰王国"), false, "叛军不与他国敌对");
api.planRevoltOrders(world);
assert.ok(rebels.some(a => a.plannedPath.length || a.tileId === api.capital("法兰西王国", world).id), "叛军向都城进军");
// 清场：平叛
for (const a of rebels) delete world.warfare.armies[a.id];
api.processRevolts(world);
assert.equal(france.revolt, null, "叛军覆灭后叛乱结束");

// --- 使命 ---
france.government.centralPower = 70;
api.checkObjectives(world);
assert.ok(france.missionsDone.includes("fr_crown"), "王权稳固使命达成");

// --- 情势 ---
world.turn = api.turnForDate(1340, 1);
api.processSituations(world);
assert.ok(world.situations.some(s => s.key === "little_ice_age" && s.phase === "active"), "1340 小冰期激活");
assert.ok(world.tiles.some(t => !t.isSea && (t.climate === "cold" || t.climate === "alpine") && t.tempPenalty === 1), "寒带减产生效");

// --- 灭亡与继承 ---
const victim = "纳瓦拉王国";
const victimTiles = world.tiles.filter(t => !t.isSea && t.controller === victim).length;
assert.ok(victimTiles >= 1);
api.eliminateCountry(world, victim, "测试灭亡");
assert.equal(world.tiles.filter(t => !t.isSea && t.controller === victim).length, 0, "灭亡国家地块被瓜分");
assert.ok(!api.playableCountries(world).includes(victim), "灭亡国家退出国家列表");

// --- 预警与谏言 ---
const warnings = api.computeWarnings(france);
assert.ok(Array.isArray(warnings));
const tips = api.advisorSuggestions(france);
assert.ok(tips.length === 3, "顾问谏言固定三条");

console.log("demo2-gamelayer: all assertions passed");

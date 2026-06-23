const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of ["engine/world.js", "engine/struggle.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}
const worldEngine = context.window.HIFI_WORLD_ENGINE;
const struggle = context.window.HIFI_STRUGGLE_ENGINE;
assert.ok(worldEngine && struggle, "局势引擎应加载");

const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, city: "巴黎" },
  { id: 2, isSea: false, polity: "英格兰王国", population: 9, city: "伦敦" },
  { id: 3, isSea: false, polity: "勃艮第公国", population: 6, city: "第戎" },
  { id: 4, isSea: false, polity: "卡斯蒂利亚王国", population: 7, city: "布尔戈斯" },
];
const world = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(world);

const hyw = struggle.struggleFor(world, "hundred_years_war");
assert.ok(hyw, "法兰西开局应存在百年战争局势");
assert.equal(hyw.phase, "standoff", "初始阶段为对峙");
assert.equal(hyw.resolved, false);
assert.ok(hyw.parties["法兰西王国"] && hyw.parties["英格兰王国"], "法英应为当事方");

// 参与度判定
assert.equal(struggle.involvement(world, "法兰西王国", hyw), "principal");
assert.equal(struggle.involvement(world, "英格兰王国", hyw), "principal");
assert.equal(struggle.involvement(world, "勃艮第公国", hyw), "interloper");
assert.equal(struggle.involvement(world, "卡斯蒂利亚王国", hyw), "interloper"); // 卡斯蒂利亚现为盟法干涉者
assert.equal(struggle.involvement(world, "奥斯曼贝伊国", hyw), "bystander");     // 参与方表外的国家=旁观

// 缺当事国时不开局（参与方表里没有的世界）
const lonely = worldEngine.createWorld(
  [{ id: 1, isSea: false, polity: "勃艮第公国", population: 5, city: "第戎" }],
  {},
  "勃艮第公国"
);
struggle.initializeStruggles(lonely);
assert.equal(struggle.struggleFor(lonely, "hundred_years_war"), null, "缺当事国时不开局");

// 时间默认诱因：standoff 默认流向 open_war，处理一季后 open_war 计量上升
const before = hyw.meters.open_war;
struggle.processStruggles(world);
assert.ok(hyw.meters.open_war > before, "时间漂移应增加默认下一阶段计量");

// 持续推进会翻出对峙阶段
for (let i = 0; i < 20; i++) struggle.processStruggles(world);
assert.notEqual(hyw.phase, "standoff", "持续推进后应翻出对峙阶段");

// 显式诱因能立刻推动指定阶段翻转
const fresh = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(fresh);
const w = struggle.struggleFor(fresh, "hundred_years_war");
struggle.addCatalyst(w, "open_war", 100);
struggle.processStruggles(fresh);
assert.equal(w.phase, "open_war", "大量 open_war 诱因应立即翻到鏖战阶段");

// 不报错：已结束的局势不再推进
w.resolved = true;
const phaseAfter = w.phase;
struggle.processStruggles(fresh);
assert.equal(w.phase, phaseAfter, "已结束局势不再翻阶段");

// --- Task 3.1：战况诱因推动阶段翻转 ---
// 战况：war.score 上升（占领/会战）应额外注入鏖战诱因，超过单纯时间漂移(+1)
const cw = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(cw);
const cs = struggle.struggleFor(cw, "hundred_years_war");
cw.diplomacy = { wars: [{ id: "w1", attackers: ["英格兰王国"], defenders: ["法兰西王国"], score: 25, primaryGoal: {} }] };
const owBefore = cs.meters.open_war;
struggle.processStruggles(cw);
assert.ok(cs.meters.open_war - owBefore > 1, "war.score 上升应额外注入鏖战诱因（超过时间漂移）");

// 议和：上季在战、这季战争消失 → 疲惫议和诱因（足以翻到 truce）
cw.diplomacy.wars = [];
struggle.processStruggles(cw);
assert.ok(cs.meters.truce > 0 || cs.phase === "truce", "议和达成应注入疲惫议和诱因");

// 财政崩溃：当事国 money<0 → 疲惫议和诱因
const fw = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(fw);
const fs2 = struggle.struggleFor(fw, "hundred_years_war");
fw.countries["法兰西王国"].money = -5;
const trBefore = fs2.meters.truce;
struggle.processStruggles(fw);
assert.ok(fs2.meters.truce > trBefore, "当事国财政崩溃应注入疲惫议和诱因");

// --- Task 4.1：局势态势摘要 struggleSummary ---
const sumWorld = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(sumWorld);
const ss = struggle.struggleFor(sumWorld, "hundred_years_war");
ss.phase = "open_war";
sumWorld.diplomacy = { wars: [{ id: "w", name: "百年战争", attackers: ["英格兰王国"], defenders: ["法兰西王国"], score: 30, primaryGoal: { tileId: 1 } }] };
sumWorld.warfare = { armies: {
  fr1: { id: "fr1", owner: "法兰西王国", tileId: 1, units: [{ soldiers: 3000 }], organization: 90 },
  en1: { id: "en1", owner: "英格兰王国", tileId: 2, units: [{ soldiers: 2000 }], organization: 80 },
} };
sumWorld.countries["法兰西王国"].warfare = { warExhaustion: 25 };

const summary = struggle.struggleSummary(sumWorld, "法兰西王国");
assert.ok(summary, "法兰西应能拿到局势摘要");
assert.equal(summary.label, "百年战争");
assert.equal(summary.phase, "open_war");
assert.equal(summary.involvement, "principal");
assert.ok(summary.principals.includes("法兰西王国") && summary.opponents.includes("英格兰王国"), "应区分我方当事国与对手");
assert.ok(summary.war && summary.war.score === 30, "应带出战争分数");
assert.equal(summary.war.goalTile, "巴黎", "应带出战争目标地块名");
assert.equal(summary.warExhaustion, 25, "应带出战争疲惫");
assert.ok(summary.ourArmy && summary.ourArmy.owner === "法兰西王国", "应识别我方主力军");
assert.equal(summary.ourArmy.location, "巴黎", "我方主力军应带出位置");
assert.ok(summary.enemyThreat && summary.enemyThreat.owner === "英格兰王国", "应识别敌方威胁");
assert.ok(summary.actions.some(a => a.id === "muster_battle"), "鏖战阶段当事国应可决战集结");
assert.ok(!summary.actions.some(a => a.id === "press_claim"), "非对峙阶段不出现提王位主张");
assert.ok(Array.isArray(summary.endings) && summary.endings.length === 4, "应预览四终局");
assert.ok(summary.recommendations.some(r => r.includes("停战")), "疲惫高应建议停战");

// 干涉者视图：只能选边，没有当事国操作
const interSummary = struggle.struggleSummary(sumWorld, "勃艮第公国", "hundred_years_war");
assert.equal(interSummary.involvement, "interloper");
assert.ok(interSummary.actions.some(a => a.id === "pick_side"), "干涉者应能选边");
assert.ok(!interSummary.actions.some(a => a.id === "muster_battle"), "干涉者不能用当事国操作");

// 没有局势 → null（不报错）
const noStruggleWorld = worldEngine.createWorld([{ id: 1, isSea: false, polity: "卡斯蒂利亚王国", population: 5, city: "布尔戈斯" }], {}, "卡斯蒂利亚王国");
struggle.initializeStruggles(noStruggleWorld);
assert.equal(struggle.struggleSummary(noStruggleWorld, "卡斯蒂利亚王国"), null, "没有局势应返回 null 不报错");

// 没有战争时 war 为 null，但摘要仍可生成（主力军不在前线 → 建议集结）
const peaceWorld = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(peaceWorld);
const ps = struggle.struggleSummary(peaceWorld, "法兰西王国");
assert.ok(ps && ps.war === null, "没有战争时 war 为 null 且不报错");
assert.ok(ps.recommendations.some(r => r.includes("集结")), "无主力军在前线应建议集结");

// 统一界面用字段：两大阵营 / 全部决议（含置灰原因）/ 时期
assert.ok(summary.camps && summary.camps.france && summary.camps.england, "摘要应带两大阵营");
assert.ok(summary.camps.england.members.includes("勃艮第公国"), "勃艮第(lean>0)应归英格兰阵营");
assert.ok(summary.camps.france.members.includes("卡斯蒂利亚王国"), "卡斯蒂利亚(lean<0)应归法兰西阵营");
assert.equal(summary.ourSide, "france", "法兰西玩家所属阵营为法方");
assert.ok(Array.isArray(summary.decisions) && summary.decisions.length >= 3, "摘要应带当前国家全部决议");
const muster = summary.decisions.find(d => d.id === "muster_battle");
const claim = summary.decisions.find(d => d.id === "press_claim");
assert.ok(muster && muster.enabled, "鏖战阶段决战集结应可用");
assert.ok(claim && !claim.enabled && claim.reason, "非当前阶段决议应置灰并附中文原因");
assert.equal(summary.year, 1337, "摘要应带当前年份（开局 1337）");
assert.equal(summary.endYear, 1453, "摘要应带历史终点年 1453");

console.log("Task 4.1 局势态势摘要 OK");

// --- Task 4.2：阶段限定操作 gate + 选边 ---
const gateWorld = worldEngine.createWorld(tiles, {}, "法兰西王国");
struggle.initializeStruggles(gateWorld);
const gs = struggle.struggleFor(gateWorld, "hundred_years_war");

// 对峙阶段：当事国可提王位主张，但不能决战集结（鏖战专属）
gs.phase = "standoff";
assert.doesNotThrow(() => struggle.phaseActionGate(gateWorld, "法兰西王国", "press_claim"), "对峙阶段当事国应可提王位主张");
assert.throws(() => struggle.phaseActionGate(gateWorld, "法兰西王国", "muster_battle"), /鏖战/, "非鏖战阶段决战集结应中文报错");

// 鏖战阶段：可决战集结，不能提王位主张
gs.phase = "open_war";
assert.doesNotThrow(() => struggle.phaseActionGate(gateWorld, "法兰西王国", "muster_battle"), "鏖战阶段应可决战集结");
assert.throws(() => struggle.phaseActionGate(gateWorld, "法兰西王国", "press_claim"), /对峙/, "非对峙阶段提王位主张应中文报错");

// 干涉者不能用当事国操作；当事国不能用干涉者操作
assert.throws(() => struggle.phaseActionGate(gateWorld, "勃艮第公国", "muster_battle"), /当事国/, "干涉者用当事国操作应中文报错");
assert.throws(() => struggle.phaseActionGate(gateWorld, "法兰西王国", "pick_side"), /干涉者/, "当事国用选边操作应中文报错");

// 选边：干涉者改 lean 并注入诱因；当事国选边报错（勃艮第初始 lean=1 盟英，改为 -1 偏法）
const leanBefore = gs.parties["勃艮第公国"].lean;
struggle.pickSide(gateWorld, "勃艮第公国", -1);
assert.equal(gs.parties["勃艮第公国"].lean, -1, "干涉者选边应改 lean");
assert.notEqual(gs.parties["勃艮第公国"].lean, leanBefore);
assert.throws(() => struggle.pickSide(gateWorld, "法兰西王国"), /干涉者/, "当事国不能选边");
console.log("Task 4.2 阶段限定操作 gate OK");

// --- Task 6.1（改）：百年终局结算——决定性终局随时触发，否则跑到 1453 拍板 ---
function freshStruggleWorld() {
  const w = worldEngine.createWorld(tiles.map(tile => ({ ...tile })), {}, "法兰西王国"); // 克隆地块隔离各世界
  struggle.initializeStruggles(w);
  return w;
}
const stubMissions = stages => { context.window.HIFI_OBJECTIVES_ENGINE = { missionStages: () => stages }; };
const allDone = [{ name: "稳住核心", status: "已完成" }, { name: "收复争议", status: "已完成" }, { name: "有利和平", status: "已完成" }];
const notDone = [{ name: "稳住核心", status: "进行中" }, { name: "收复争议", status: "未开始" }, { name: "有利和平", status: "未开始" }];
const TURN_1453 = 465; // 1337 + floor((465-1)/4) = 1337 + 116 = 1453

// 真正持续百年：未达决定性终局且远未到 1453，过了几十季也不结算
const earlyWorld = freshStruggleWorld();
stubMissions(notDone);
earlyWorld.turn = 200; // 约 1386 年
struggle.settleStruggles(earlyWorld);
assert.equal(struggle.struggleFor(earlyWorld, "hundred_years_war").resolved, false, "未达决定性终局且未到 1453 不应结算（持续百年）");

// 法兰西霸权：三段全完成 → 决定性终局，任一年立即触发
const hegWorld = freshStruggleWorld();
stubMissions(allDone);
hegWorld.turn = 40; // 早早达成
hegWorld.countries["法兰西王国"].legitimacy = 70;
struggle.settleStruggles(hegWorld);
const hegStruggle = struggle.struggleFor(hegWorld, "hundred_years_war");
assert.equal(hegStruggle.resolved, true, "决定性终局应随时触发");
assert.equal(hegStruggle.ending, "france_hegemony", "三段全完成应判法兰西霸权");
assert.equal(hegStruggle.phase, "resolution", "结算后进入定局阶段");
assert.ok(hegWorld.countries["法兰西王国"].legitimacy > 70, "霸权应给法兰西合法性加成");
assert.ok(hegWorld.pendingStruggleEnding && hegWorld.pendingStruggleEnding.ending === "france_hegemony", "应设 pendingStruggleEnding 供 UI");

// 英格兰占据核心 → 决定性终局，立即触发
const engWorld = freshStruggleWorld();
stubMissions(notDone);
engWorld.turn = 60;
engWorld.tiles.find(tile => tile.city === "巴黎").polity = "英格兰王国";
struggle.settleStruggles(engWorld);
assert.equal(struggle.struggleFor(engWorld, "hundred_years_war").ending, "england_claim", "英占核心应随时判英格兰主张得逞");
assert.ok(engWorld.countries["法兰西王国"].legitimacy < 70 || engWorld.countries["法兰西王国"].struggleLegacy?.coreDebuff, "核心崩坏应有 debuff");

// 谈判和平：到 1453、议和阶段且无当事国战争
const peaceWorld2 = freshStruggleWorld();
stubMissions(notDone);
peaceWorld2.turn = TURN_1453;
struggle.struggleFor(peaceWorld2, "hundred_years_war").phase = "truce";
peaceWorld2.diplomacy = { wars: [] };
peaceWorld2.countries["法兰西王国"].warfare = { warExhaustion: 30 };
struggle.settleStruggles(peaceWorld2);
assert.equal(struggle.struggleFor(peaceWorld2, "hundred_years_war").ending, "negotiated_peace", "1453 议和阶段无战争应判谈判和平");
assert.equal(peaceWorld2.countries["法兰西王国"].warfare.warExhaustion, 0, "谈判和平应解除战争疲惫");

// 长期僵局：到 1453 仍未分胜负
const staleWorld = freshStruggleWorld();
stubMissions(notDone);
staleWorld.turn = TURN_1453;
struggle.struggleFor(staleWorld, "hundred_years_war").phase = "standoff";
struggle.settleStruggles(staleWorld);
const staleStruggle = struggle.struggleFor(staleWorld, "hundred_years_war");
assert.equal(staleStruggle.ending, "stalemate", "1453 未分胜负应判长期僵局");

// 1452（未到终点）且无决定性终局：不结算
const notYetWorld = freshStruggleWorld();
stubMissions(notDone);
notYetWorld.turn = TURN_1453 - 4; // 约 1452 年
struggle.settleStruggles(notYetWorld);
assert.equal(struggle.struggleFor(notYetWorld, "hundred_years_war").resolved, false, "1453 之前未达决定性终局不结算");

// 结算后沙盒可继续：再推进不崩、保持已结束
assert.doesNotThrow(() => { struggle.processStruggles(staleWorld); struggle.settleStruggles(staleWorld); }, "结算后继续推进不应报错");
assert.equal(staleStruggle.resolved, true, "结算后局势保持已结束");
assert.equal(staleStruggle.phase, "resolution", "已结束局势阶段保持定局");

delete context.window.HIFI_OBJECTIVES_ENGINE;
console.log("Task 6.1 百年终局结算 OK");

console.log("hifi struggle engine passed");

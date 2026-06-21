const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "engine/world.js",
  "engine/diplomacy.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", x: 10, y: 10 },
  { id: 2, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", x: 20, y: 10 },
  { id: 3, isSea: false, polity: "布列塔尼公国", population: 4, buildings: [], city: "南特", x: 14, y: 10 },
];
const world = worldEngine.createWorld(tiles);
diplomacy.initializeDiplomacy(world);

assert.equal(world.countries["法兰西王国"].diplomacy.envoys, 2);
assert.equal(diplomacy.freeEnvoys(world, "法兰西王国"), 2);
const frenchView = diplomacy.relationView(world, "法兰西王国", "英格兰王国");
const englishView = diplomacy.relationView(world, "英格兰王国", "法兰西王国");
frenchView.trust = 80;
assert.notEqual(frenchView.trust, englishView.trust, "国家关系必须按方向保存");
assert.ok(["close", "cooperative", "neutral", "wary", "rival", "hostile"].includes(
  diplomacy.diplomaticAttitude(world, "法兰西王国", "英格兰王国")
));

world.countries["法兰西王国"].actionPoints.diplomatic = 10;
diplomacy.startMission(world, "法兰西王国", "英格兰王国", "improve");
assert.equal(diplomacy.freeEnvoys(world, "法兰西王国"), 1);
const trustBeforeMission = englishView.trust;
diplomacy.processDiplomacy(world);
assert.ok(englishView.trust > trustBeforeMission);

const friendshipBefore = diplomacy.leaderRelationView(world, "英格兰王国", "法兰西王国").friendship;
diplomacy.performLeaderAction(world, "法兰西王国", "英格兰王国", "meeting");
assert.ok(diplomacy.leaderRelationView(world, "英格兰王国", "法兰西王国").friendship > friendshipBefore);
world.countries["法兰西王国"].money = 0;
const pointsBeforeFailedGift = world.countries["法兰西王国"].actionPoints.diplomatic;
assert.throws(() => diplomacy.performLeaderAction(world, "法兰西王国", "英格兰王国", "gift"), /金钱/);
assert.equal(world.countries["法兰西王国"].actionPoints.diplomatic, pointsBeforeFailedGift);
world.countries["法兰西王国"].money = 100;

Object.assign(englishView, {
  trust: 100,
  threat: 0,
  territorialConflict: 0,
  institutionalConflict: 0,
  strategicInterest: 60,
});
const evaluation = diplomacy.evaluateProposal(world, "法兰西王国", "英格兰王国", "trade");
assert.equal(evaluation.accepted, true);
diplomacy.proposeTreaty(world, "法兰西王国", "英格兰王国", "trade");
assert.ok(diplomacy.treatyBetween(world, "法兰西王国", "英格兰王国", "trade"));
assert.ok(diplomacy.capacityUsed(world, "法兰西王国") > 0);

const rejectedTargetView = diplomacy.relationView(world, "英格兰王国", "法兰西王国");
Object.assign(rejectedTargetView, {
  trust: 0,
  threat: 100,
  territorialConflict: 100,
  institutionalConflict: 100,
  strategicInterest: 0,
});
const pointsBeforeRejectedTreaty = world.countries["法兰西王国"].actionPoints.diplomatic;
assert.throws(
  () => diplomacy.proposeTreaty(world, "法兰西王国", "英格兰王国", "alliance"),
  /拒绝/
);
assert.equal(
  world.countries["法兰西王国"].actionPoints.diplomatic,
  pointsBeforeRejectedTreaty,
  "被拒绝的外交提案不能扣除行动点"
);

const brittanyView = diplomacy.relationView(world, "布列塔尼公国", "法兰西王国");
Object.assign(brittanyView, {
  trust: 100,
  threat: 0,
  territorialConflict: 0,
  institutionalConflict: 0,
  strategicInterest: 80,
});
diplomacy.proposeSubject(world, "法兰西王国", "布列塔尼公国", "tributary");
const subject = diplomacy.subjectBetween(world, "法兰西王国", "布列塔尼公国");
assert.equal(subject.type, "tributary");
const autonomyBefore = subject.autonomy;
const loyaltyBefore = subject.loyalty;
diplomacy.adjustSubjectControl(world, "法兰西王国", subject.id, "tighten");
assert.ok(subject.autonomy < autonomyBefore);
assert.ok(subject.loyalty < loyaltyBefore);

// 关系随战争演化：交战逐季累积领土矛盾
diplomacy.relationView(world, "法兰西王国", "英格兰王国").territorialConflict = 0;
diplomacy.relationView(world, "英格兰王国", "法兰西王国").territorialConflict = 0;
world.diplomacy.wars.push({
  id: "war-evolve", attackers: ["法兰西王国"], defenders: ["英格兰王国"],
  primaryGoal: { tileId: 2, claimant: "法兰西王国" }, score: 0, startedTurn: world.turn, participants: {},
});
diplomacy.processDiplomacy(world);
assert.ok(diplomacy.relationView(world, "法兰西王国", "英格兰王国").territorialConflict > 0, "交战必须抬升领土矛盾");

// 王朝纽带（联姻）提升从属提案接受度
const engViewOfFr = diplomacy.leaderRelationView(world, "英格兰王国", "法兰西王国");
engViewOfFr.kinship = false;
const subjectScoreNoKin = diplomacy.evaluateProposal(world, "法兰西王国", "英格兰王国", "vassal").score;
engViewOfFr.kinship = true;
assert.ok(diplomacy.evaluateProposal(world, "法兰西王国", "英格兰王国", "vassal").score > subjectScoreNoKin, "王朝纽带必须提升从属提案接受度");
// proposeTreaty 联姻结成王朝纽带
diplomacy.relationView(world, "布列塔尼公国", "法兰西王国").trust = 95;
diplomacy.leaderRelationView(world, "布列塔尼公国", "法兰西王国").friendship = 80;
world.countries["法兰西王国"].actionPoints.diplomatic = 5;
diplomacy.proposeTreaty(world, "法兰西王国", "布列塔尼公国", "marriage");
assert.equal(diplomacy.leaderRelationView(world, "法兰西王国", "布列塔尼公国").kinship, true, "联姻必须结成王朝纽带");

// 共享商路抬升战略利益
world.trade = { routes: { rhine: { active: true, nodes: ["巴黎", "伦敦"] } }, lastIncome: {} };
const strategicBefore = diplomacy.relationView(world, "法兰西王国", "英格兰王国").strategicInterest;
diplomacy.processDiplomacy(world);
assert.ok(diplomacy.relationView(world, "法兰西王国", "英格兰王国").strategicInterest > strategicBefore, "共享商路必须抬升战略利益");

// 贸易协定按真实贸易流计酬
world.trade.lastIncome = { "法兰西王国": 100 };
world.diplomacy.treaties.push({ id: "treaty-flow", type: "trade", parties: ["法兰西王国", "英格兰王国"], startedTurn: world.turn, minimumUntilTurn: world.turn + 4, endsTurn: world.turn + 16 });
const moneyBeforeTradeTreaty = world.countries["法兰西王国"].money;
diplomacy.processDiplomacy(world);
assert.ok(world.countries["法兰西王国"].money - moneyBeforeTradeTreaty >= 15, "贸易协定必须按贸易流计酬（100×0.15=15）");

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawerSource = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/engine/diplomacy.js"));
assert.ok(drawerSource.includes("data-diplomatic-target"));
assert.ok(drawerSource.includes("data-diplomatic-action"));
assert.ok(mainSource.includes("initializeDiplomacy"));

// --- Task C7: 外交对象排序（敌国 > 邻国/接触 > 可缔约 > 其余）+ 搜索 ---
{
  diplomacy.relationView(world, "法兰西王国", "英格兰王国").trust = 0;
  diplomacy.relationView(world, "法兰西王国", "英格兰王国").threat = 100;
  diplomacy.relationView(world, "法兰西王国", "英格兰王国").territorialConflict = 60;
  diplomacy.relationView(world, "法兰西王国", "布列塔尼公国").trust = 60;
  diplomacy.relationView(world, "法兰西王国", "布列塔尼公国").threat = 0;
  diplomacy.relationView(world, "法兰西王国", "布列塔尼公国").strategicInterest = 0;
  diplomacy.relationView(world, "法兰西王国", "布列塔尼公国").territorialConflict = 0;
  const sorted = diplomacy.sortDiplomacyTargets(world, "法兰西王国");
  assert.equal(sorted.length, 2, "应返回除己方外的全部外交对象");
  assert.equal(sorted[0], "英格兰王国", "敌国/敌意对象应排在最前");
  assert.ok(drawerSource.includes("sortDiplomacyTargets"), "外交抽屉应按 sortDiplomacyTargets 排序对象");
  assert.ok(drawerSource.includes("data-diplo-search"), "外交抽屉应提供搜索框 data-diplo-search");
  console.log("C7 外交排序 OK");
}

console.log("hifi diplomacy engine passed");

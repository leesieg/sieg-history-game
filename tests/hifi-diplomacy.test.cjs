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

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const drawerSource = fs.readFileSync(path.join(root, "ui", "drawers.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.ok(html.includes("scripts/engine/diplomacy.js"));
assert.ok(drawerSource.includes("data-diplomatic-target"));
assert.ok(drawerSource.includes("data-diplomatic-action"));
assert.ok(mainSource.includes("initializeDiplomacy"));

console.log("hifi diplomacy engine passed");

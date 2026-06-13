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

politics.changeGovernment(world, "法兰西王国", "republic");
assert.equal(france.government.type, "republic");
assert.equal(france.leader.title, "执政官");
assert.equal(france.government.assembly.unlocked, true);
assert.ok(france.estates.citizens);

const venice = world.countries["威尼斯共和国"];
assert.equal(venice.government.type, "merchant_republic");
world.turn = 12;
venice.leader.termEndsAtTurn = 12;
politics.processLeadership(world, "威尼斯共和国");
assert.equal(world.pendingElection.polity, "威尼斯共和国");
const elected = politics.completeElection(world, 0);
assert.equal(venice.leader.name, elected.name);
assert.equal(world.pendingElection, null);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes('id="countryModal"'));
assert.ok(html.includes('id="countrySelectModal"'));
assert.ok(html.includes('id="leaderElectionModal"'));

console.log("hifi politics engine passed");

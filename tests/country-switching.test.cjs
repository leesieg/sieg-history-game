const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const demoPath = path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html");
const html = fs.readFileSync(demoPath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

assert.ok(script, "demo script should exist");

const eventWiring = 'document.getElementById("endTurnBtn").onclick';
const pureScript = script.slice(0, script.indexOf(eventWiring));
const context = {
  console,
  Math,
  Map,
  Set,
  document: {
    createElementNS() {
      return { setAttribute() {} };
    }
  }
};

vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__gameTest = {
    newState,
    activeCountry,
    controlledTiles,
    governmentColorForTile,
    dynastyColorForTile,
    playableCountries,
    setPlayerCountry,
    countryIntroduction,
    calendarForTurn,
    seasonName,
    calendarLabel,
    leaderActionGain,
    processLeadership,
    grantQuarterlyActionPoints,
    completeLeaderElection,
    configureLeaderForGovernment
  };`,
  context
);

const game = context.__gameTest;
const world = game.newState();
context.state = world;

assert.equal(world.playerPolity, "法兰西王国");
assert.ok(world.countries["法兰西王国"]);
assert.ok(world.countries["英格兰王国"]);
assert.notStrictEqual(world.countries["法兰西王国"], world.countries["英格兰王国"]);
assert.notStrictEqual(
  world.countries["法兰西王国"].government,
  world.countries["英格兰王国"].government
);
assert.equal(world.countries["威尼斯共和国"].government.type, "merchant_republic");
assert.equal(world.countries["教皇国"].government.type, "theocracy");
assert.equal(world.countries["金帐汗国"].government.type, "tribal");
assert.equal(world.countries["法兰西王国"].leader.name, "腓力六世");
assert.equal(world.countries["法兰西王国"].leader.dynasty, "瓦卢瓦家族");
assert.equal(world.countries["威尼斯共和国"].leader.title, "总督");
assert.equal(world.countries["教皇国"].leader.title, "教皇");
assert.equal(world.countries["神圣罗马帝国"].leader.title, "皇帝");
assert.equal(world.countries["金帐汗国"].leader.title, "大汗");
assert.deepEqual(
  JSON.parse(JSON.stringify(game.calendarForTurn(5))),
  { year: 1338, quarter: 1 }
);
assert.deepEqual([1, 2, 3, 4].map(game.seasonName), ["春", "夏", "秋", "冬"]);
assert.equal(game.calendarLabel(5), "1338年春");
assert.equal(game.leaderActionGain(0), 1);
assert.equal(game.leaderActionGain(5), 3);

const gascony = world.tiles.find(tile => tile.name === "英属加斯科涅");
assert.equal(gascony.controller, "英格兰王国");
const playable = game.playableCountries(world);
assert.ok(!playable.includes("英属加斯科涅"));
assert.ok(!playable.includes("海域"));
for (const polity of playable) {
  const introduction = game.countryIntroduction(polity);
  assert.ok(introduction.length >= 25, `${polity} should have a historical introduction`);
  const leader = world.countries[polity].leader;
  assert.ok(leader.name, `${polity} should have a leader name`);
  assert.ok(leader.dynasty, `${polity} should have a leader dynasty`);
  assert.ok(leader.title, `${polity} should have a leader title`);
  for (const ability of ["administrative", "diplomatic", "military"]) {
    assert.ok(
      leader.abilities[ability] >= 0 && leader.abilities[ability] <= 6,
      `${polity} leader ${ability} should be between 0 and 6`
    );
  }
  const capitalTile = game.setPlayerCountry(world, polity);
  assert.equal(world.playerPolity, polity);
  assert.equal(capitalTile.controller, polity);
}
assert.match(game.countryIntroduction("法兰西王国"), /百年战争/);
assert.match(game.countryIntroduction("丹麦王国"), /王位空缺|无王/);
assert.match(game.countryIntroduction("金帐汗国"), /月即别|乌兹别克/);

const france = world.countries["法兰西王国"];
france.actionPoints = { administrative: 0, diplomatic: 0, military: 0 };
game.grantQuarterlyActionPoints(france);
assert.equal(
  france.actionPoints.administrative,
  game.leaderActionGain(france.leader.abilities.administrative)
);

world.turn = (1350 - 1337) * 4 + 3;
game.processLeadership(world, "法兰西王国");
assert.equal(world.countries["法兰西王国"].leader.name, "让二世");
assert.equal(world.countries["法兰西王国"].leader.dynasty, "瓦卢瓦家族");

game.setPlayerCountry(world, "诺夫哥罗德共和国");
const novgorod = world.countries["诺夫哥罗德共和国"];
assert.equal(game.calendarForTurn(novgorod.leader.termEndsAtTurn).year, 1339);
world.turn = novgorod.leader.termEndsAtTurn;
game.processLeadership(world, "诺夫哥罗德共和国");
assert.equal(world.pendingElection.polity, "诺夫哥罗德共和国");
assert.equal(world.pendingElection.candidates.length, 3);
const electedName = world.pendingElection.candidates[1].name;
game.completeLeaderElection(world, 1);
assert.equal(world.pendingElection, null);
assert.equal(world.countries["诺夫哥罗德共和国"].leader.name, electedName);

game.setPlayerCountry(world, "威尼斯共和国");
const veniceLeader = world.countries["威尼斯共和国"].leader;
world.turn = veniceLeader.historicalEndAtTurn;
game.processLeadership(world, "威尼斯共和国");
assert.equal(world.pendingElection.polity, "威尼斯共和国");
assert.ok(
  world.pendingElection.candidates.some(candidate => candidate.name === "巴尔托洛梅奥·格拉代尼戈")
);
game.completeLeaderElection(world, 0);

const convertedCountry = JSON.parse(JSON.stringify(world.countries["法兰西王国"]));
game.configureLeaderForGovernment(convertedCountry, "republic", world.turn);
assert.equal(convertedCountry.leader.title, "执政官");
assert.equal(convertedCountry.leader.succession, "elective_term");
assert.ok(convertedCountry.leader.termEndsAtTurn > world.turn);

game.setPlayerCountry(world, "法兰西王国");
assert.equal(game.activeCountry(world).name, "法兰西王国");
assert.ok(game.controlledTiles("法兰西王国", world).length > 0);

world.countries["法兰西王国"].money = 1;
game.setPlayerCountry(world, "英格兰王国");
assert.equal(world.playerPolity, "英格兰王国");
assert.notEqual(game.activeCountry(world).money, 1);
game.activeCountry(world).money = 12;
game.setPlayerCountry(world, "法兰西王国");
assert.equal(game.activeCountry(world).money, 1);
assert.equal(world.countries["英格兰王国"].money, 12);

const venice = world.tiles.find(tile => tile.controller === "威尼斯共和国");
assert.equal(
  game.governmentColorForTile(venice, world),
  "#c59a3d",
  "Venice should use the merchant republic map color"
);
world.countries["威尼斯共和国"].government.type = "empire";
assert.equal(
  game.governmentColorForTile(venice, world),
  "#a6544f",
  "Government map color should follow the current government state"
);

const naples = world.tiles.find(tile => tile.controller === "那不勒斯王国");
const hungary = world.tiles.find(tile => tile.controller === "匈牙利王国");
assert.equal(
  game.dynastyColorForTile(naples, world),
  game.dynastyColorForTile(hungary, world),
  "Countries led by the same dynasty should share a map color"
);
const oldFranceDynastyColor = game.dynastyColorForTile(
  world.tiles.find(tile => tile.controller === "法兰西王国"),
  world
);
world.countries["法兰西王国"].leader.dynasty = "波旁家族";
assert.notEqual(
  game.dynastyColorForTile(world.tiles.find(tile => tile.controller === "法兰西王国"), world),
  oldFranceDynastyColor,
  "Dynasty map color should follow the current leader"
);

console.log("country switching state tests passed");

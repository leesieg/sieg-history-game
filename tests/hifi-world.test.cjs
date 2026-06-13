const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };

for (const file of ["engine/world.js", "engine/turn.js", "ui/store.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const turnEngine = context.window.HIFI_TURN_ENGINE;
const storeApi = context.window.HIFI_STORE;
assert.ok(worldEngine && turnEngine && storeApi);

const tiles = [
  { id: 1, isSea: false, polity: "法兰西王国", population: 12, buildings: ["market", "fort"], city: "巴黎" },
  { id: 2, isSea: false, polity: "英格兰王国", population: 9, buildings: ["port"], city: "伦敦" },
];
const profiles = {
  "法兰西王国": { leader: { name: "腓力六世", dynasty: "瓦卢瓦", title: "国王", abilities: { administrative: 4, diplomatic: 3, military: 4 } } },
  "英格兰王国": { leader: { name: "爱德华三世", dynasty: "金雀花", title: "国王", abilities: { administrative: 3, diplomatic: 4, military: 5 } } },
};

const world = worldEngine.createWorld(tiles, profiles, "法兰西王国");
assert.equal(world.turn, 1);
assert.equal(worldEngine.calendarLabel(world.turn), "1337年 · 春");
assert.equal(worldEngine.activeCountry(world).leader.name, "腓力六世");

const franceMoney = world.countries["法兰西王国"].money;
worldEngine.setPlayerCountry(world, "英格兰王国");
world.countries["英格兰王国"].money += 25;
assert.equal(world.countries["法兰西王国"].money, franceMoney, "国家资源必须独立");

const beforeAp = world.countries["英格兰王国"].actionPoints.military;
turnEngine.advanceQuarter(world);
assert.equal(world.turn, 2);
assert.ok(world.countries["英格兰王国"].actionPoints.military > beforeAp);
assert.equal(worldEngine.calendarLabel(world.turn), "1337年 · 夏");

const store = storeApi.createStore(world);
let notifications = 0;
store.subscribe(() => { notifications += 1; });
store.update(current => { current.pendingIssues = []; });
assert.equal(notifications, 1);
assert.equal(store.getState(), world);

console.log("hifi world and turn engine passed");

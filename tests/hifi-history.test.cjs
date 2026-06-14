const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const hifiRoot = path.join(__dirname, "..", "prototype", "hifi");
const root = path.join(hifiRoot, "scripts");
const context = { window: {} };
for (const file of [
  "data/rules.js",
  "engine/world.js",
  "engine/history.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const history = context.window.HIFI_HISTORY_ENGINE;
const tiles = [
  { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", control: 80 },
  { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", control: 70 },
];
const world = worldEngine.createWorld(tiles);
history.initializeHistory(world);

assert.equal(world.eraIndex, 0);
assert.ok(Array.isArray(world.situations));
assert.ok(Array.isArray(world.countries["法兰西王国"].chronicle));

world.turn = 12;
history.processHistory(world);
assert.ok(world.situations.some(item => item.key === "black_death"));
assert.ok(world.worldEvents.some(event => event.kind === "situation"));

const chain = history.applyCausalChain(world, "constantinople_falls");
assert.equal(chain.length, 7, "历史因果链必须有七跳");
assert.equal(world.flags.constantinopleFallen, true);
assert.ok(world.countries["法兰西王国"].pressures.exploration > 0);
const epic = history.epic(world, "法兰西王国");
assert.equal(epic.title, "法兰西王国编年史");
assert.ok(Array.isArray(epic.worldEvents));

world.turn = 465;
history.processHistory(world);
assert.equal(world.eraIndex, 1);
assert.ok(world.pendingTransition);
history.acknowledgeTransition(world);
assert.equal(world.pendingTransition, null);

world.playerEvents.push({
  id: "event-1",
  title: "阶层最后通牒",
  choices: [{ id: "accept", label: "接受", effect: { legitimacy: -5 } }],
});
const issues = history.issues(world);
assert.ok(issues.some(issue => issue.blocking));
assert.equal(history.blockingIssues(world).length, 1);
history.resolvePlayerEvent(world, "event-1", "accept");
assert.equal(world.playerEvents.length, 0);

const council = history.councilSummary(world, "法兰西王国");
assert.ok(council.warnings.length);
assert.ok(council.advisors.length);
history.startRegency(world);
assert.equal(world.regency.active, true);
const advanced = history.runRegency(world, current => { current.turn += 1; }, 2);
assert.equal(advanced, 2);
world.playerEvents.push({ id: "event-2", title: "危机", choices: [] });
assert.equal(history.shouldInterruptRegency(world), true);

const html = fs.readFileSync(path.join(hifiRoot, "index.html"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
const dialogSource = fs.readFileSync(path.join(root, "ui", "dialogs.js"), "utf8");
assert.ok(html.includes("scripts/engine/history.js"));
assert.ok(html.includes("councilModal"));
assert.ok(mainSource.includes("blockingIssues"));
assert.ok(dialogSource.includes("bindNarrativeDialogs"));

console.log("hifi history engine passed");

const assert = require("node:assert/strict");
const { loadDemo2 } = require("./demo2-harness.cjs");

const api = loadDemo2();
api.state = api.newState();
const world = api.state;

let straitWarTurn = null;
let fallTurn = null;
while (world.turn < 290 && !world.gameOver) {
  while (world.playerEvents.length) {
    const ev = world.playerEvents[0];
    const c = world.countries[ev.polity];
    api.resolvePlayerEvent(ev, ev.type === "estate_ultimatum" ? (c.money >= 40 ? "concede" : "suppress") : "accept");
  }
  if (world.pendingElection) api.completeLeaderElection(world, 0);
  api.runRegency(world, 12);
  if (!straitWarTurn && world.worldEvents.some(e => e.text.includes("海峡之战") || e.text.includes("剑指君士坦丁堡"))) straitWarTurn = world.turn;
  if (!fallTurn && world.flags.constantinopleFallen) fallTurn = world.turn;
  world.pendingTransition = null;
}

const year = api.calendarForTurn(world.turn).year;
const ottomanTiles = api.controlledTiles("奥斯曼贝伊国", world).length;
const byzantineAlive = !world.countries["拜占庭帝国"].eliminated;
console.log(`长程模拟至 ${year} 年（回合 ${world.turn}）· 当前纪元：${api.currentEra(world).label}`);
console.log(`印刷采纳国：${api.playableCountries(world).filter(p => world.countries[p]?.technology.printing).length}；宗教改革：${world.flags.reformation ? "已爆发" : "未爆发"}`);
console.log(`奥斯曼地块：${ottomanTiles}；拜占庭存续：${byzantineAlive}`);
console.log(`海峡之战宣战回合：${straitWarTurn ? straitWarTurn + "（" + api.calendarForTurn(straitWarTurn).year + " 年）" : "未发生"}`);
console.log(`君堡陷落：${fallTurn ? fallTurn + "（" + api.calendarForTurn(fallTurn).year + " 年）" : "未陷落"}`);
console.log(`东方商路成本指数：${(world.trade?.orientCostIndex || 1).toFixed(2)}`);
const explorers = api.playableCountries(world).map(p => [p, world.countries[p]?.exploration?.points || 0]).filter(([, v]) => v > 0);
console.log("探索中的国家：", explorers.length ? explorers.map(([p, v]) => `${p}(${v})`).join("、") : "尚无");

assert.ok(world.turn >= 280, "模拟推进到位");
assert.ok(!world.gameOver, "被动玩家存活");
assert.ok(world.trade && Object.keys(world.trade.income).length >= 5, "贸易网络持续运转");
assert.ok(world.worldEvents.length >= 10, "世界持续产生事件");
const adopted = api.playableCountries(world).filter(p => world.countries[p]?.technology.artillery || world.countries[p]?.technology.oceanGoingShips);
console.log("已采纳进步的国家数：", adopted.length);
assert.ok(adopted.length >= 1, "进步在世界中扩散");
console.log("demo2-longrun: all assertions passed");

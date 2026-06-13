const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) {
    names.forEach(name => this.values.add(name));
  }
  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }
  toggle(name, force) {
    if (force === true) this.values.add(name);
    else if (force === false) this.values.delete(name);
    else if (this.values.has(name)) this.values.delete(name);
    else this.values.add(name);
    return this.values.has(name);
  }
  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.children = [];
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener() {}
  querySelectorAll() {
    return [];
  }
  focus() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1050, height: 720 };
  }
}

const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  },
  createElement() {
    return new FakeElement();
  },
  createElementNS() {
    return new FakeElement();
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {}
};

const demoPath = path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html");
const html = fs.readFileSync(demoPath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.doesNotMatch(script, /state\.turn\s*>=\s*6/);
assert.doesNotMatch(script, /\.ap\b|spend\(\)/);
assert.doesNotMatch(script, /第 \$\{[^}]*quarter[^}]*\} 季度/);

const context = {
  console,
  document,
  Math,
  Map,
  Set,
  clearTimeout,
  setTimeout,
  WheelEvent: { DOM_DELTA_LINE: 1 }
};

vm.createContext(context);
vm.runInContext(
  `${script}
  globalThis.__uiTest = {
    getState: () => state,
    switchCountry,
    openCountryDetails,
    renderCountrySelector,
    selectCountryChoice,
    renderLegend,
    renderMilitaryPanel,
    renderArmyCard,
    openArmyDrawer,
    endTurn
  };`,
  context
);

const game = context.__uiTest;
assert.ok(document.getElementById("countrySelectWrap").classList.contains("show"));
assert.match(html, /class="country-carousel"/);
assert.match(html, /id="countryPreview"/);
assert.match(html, /id="leaderElectionWrap"/);
assert.match(document.getElementById("countryList").innerHTML, /法兰西王国/);
assert.match(document.getElementById("countryList").innerHTML, /威尼斯共和国/);
assert.doesNotMatch(document.getElementById("countryList").innerHTML, /英属加斯科涅/);
assert.match(document.getElementById("countryPreview").innerHTML, /百年战争/);
assert.match(document.getElementById("countryPreview").innerHTML, /总 POP/);

game.selectCountryChoice("威尼斯共和国", false);
assert.match(document.getElementById("countryPreview").innerHTML, /亚得里亚海贸易/);
assert.match(document.getElementById("countrySelectSummary").textContent, /威尼斯共和国/);

document.getElementById("countrySearch").value = "共和国";
game.renderCountrySelector();
assert.match(document.getElementById("countryList").innerHTML, /威尼斯共和国/);
assert.match(document.getElementById("countryList").innerHTML, /诺夫哥罗德共和国/);
assert.doesNotMatch(document.getElementById("countryList").innerHTML, /法兰西王国/);

document.getElementById("countrySearch").value = "不存在的国家";
game.renderCountrySelector();
assert.match(document.getElementById("countryPreview").innerHTML, /没有符合条件的国家/);
assert.equal(document.getElementById("countrySelectConfirm").disabled, true);

document.getElementById("countrySearch").value = "";
game.renderCountrySelector();
game.switchCountry("威尼斯共和国");
assert.equal(game.getState().playerPolity, "威尼斯共和国");
assert.equal(game.getState().countries["威尼斯共和国"].government.type, "merchant_republic");
assert.match(document.getElementById("playerCountryFlag").title, /威尼斯共和国/);
assert.ok(!document.getElementById("countrySelectWrap").classList.contains("show"));

game.openCountryDetails("威尼斯共和国");
assert.match(document.getElementById("countryModalBody").innerHTML, /openCountrySwitch/);
assert.match(document.getElementById("countryModalBody").innerHTML, /弗朗切斯科·丹多洛/);
assert.match(document.getElementById("countryModalBody").innerHTML, /行政能力/);

game.openCountryDetails("法兰西王国");
assert.doesNotMatch(document.getElementById("countryModalBody").innerHTML, /openCountrySwitch/);
assert.match(document.getElementById("countryModalBody").innerHTML, /腓力六世/);

assert.match(document.getElementById("modebar").innerHTML, /政体/);
assert.match(document.getElementById("modebar").innerHTML, /家族/);
assert.match(document.getElementById("modebar").innerHTML, /军事控制/);
assert.match(html, /data-pane="military"/);
assert.match(html, /id="militaryPanel"/);
assert.match(html, /id="armyDrawer"/);
assert.match(html, /id="armyCard"/);

game.switchCountry("法兰西王国");
game.renderMilitaryPanel();
assert.match(document.getElementById("militaryPanel").innerHTML, /法兰西王家军/);
assert.match(document.getElementById("militaryPanel").innerHTML, /百年战争/);
assert.match(document.getElementById("militaryPanel").innerHTML, /战争疲惫/);
assert.match(document.getElementById("militaryPanel").innerHTML, /动员步兵/);
assert.match(document.getElementById("militaryPanel").innerHTML, /雇佣兵团/);
assert.match(script, /只读查看/);
assert.doesNotMatch(script, /只能操作当前国家的军团/);

const frenchArmy = Object.values(game.getState().warfare.armies).find(army => army.owner === "法兰西王国");
game.getState().selectedUnit = frenchArmy.id;
game.getState().selectedTile = frenchArmy.tileId;
game.renderArmyCard();
game.openArmyDrawer();
assert.ok(document.getElementById("armyDrawer").classList.contains("open"));
assert.ok(!document.getElementById("tileDrawer").classList.contains("open"));
assert.match(document.getElementById("armyDrawerHead").innerHTML, /法兰西王家军/);
assert.match(document.getElementById("armyCard").innerHTML, /取消军令/);
assert.match(document.getElementById("armyCard").innerHTML, /拆分军团/);
assert.match(document.getElementById("armyCard").innerHTML, /补充兵员/);
assert.match(document.getElementById("armyCard").innerHTML, /训练军团/);
assert.match(document.getElementById("armyCard").innerHTML, /统治者领军/);
assert.match(document.getElementById("armyCard").innerHTML, /复员征召兵/);
assert.doesNotMatch(document.getElementById("tileCard").innerHTML, /取消军令|强行军/);

game.getState().mapMode = "dynasty";
game.getState().legendOpen = true;
game.renderLegend();
assert.match(document.getElementById("legend").innerHTML, /瓦卢瓦家族/);
assert.doesNotMatch(document.getElementById("legend").innerHTML, /腓力六世|法兰西王国/);

game.getState().countries["法兰西王国"].actionPoints.administrative = 0;
game.getState().countries["英格兰王国"].actionPoints.administrative = 0;
const englandMoney = game.getState().countries["英格兰王国"].money;
const startingTurn = game.getState().turn;
game.endTurn();
assert.equal(game.getState().turn, startingTurn + 1);
assert.ok(game.getState().countries["法兰西王国"].actionPoints.administrative > 0);
assert.ok(game.getState().countries["英格兰王国"].actionPoints.administrative > 0);
assert.ok(game.getState().countries["英格兰王国"].money >= englandMoney);

console.log("country switching UI smoke tests passed");

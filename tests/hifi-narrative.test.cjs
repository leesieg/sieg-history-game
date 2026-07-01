"use strict";

// Phase B：Agent 表达层（规则模板版）。
// 验证 narrative.js 的领导人来信 / 阶层诉求 / 季报叙事三类表达条目与 narrate() 文案适配器。

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
for (const file of [
  "data/techs.js",
  "data/rules.js",
  "engine/world.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/history.js",
  "engine/narrative.js",
]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const worldEngine = context.window.HIFI_WORLD_ENGINE;
const diplomacy = context.window.HIFI_DIPLOMACY_ENGINE;
const warfare = context.window.HIFI_WARFARE_ENGINE;
const history = context.window.HIFI_HISTORY_ENGINE;
const narrative = context.window.HIFI_NARRATIVE_ENGINE;

function buildWorld() {
  const tiles = [
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
    { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: [], city: "伦敦", terrain: "plains", x: 30, y: 10, control: 70, devastation: 0 },
  ];
  const world = worldEngine.createWorld(tiles, {}, "法兰西王国");
  diplomacy.initializeDiplomacy(world);
  warfare.initializeWarfare(world);
  history.initializeHistory(world);
  world.diplomacy.wars = [];
  world.diplomacy.truces = [];
  return world;
}

// ===== narrate() 文案适配器：各 tone/kind 不抛错、不空串 =====
(() => {
  const samples = [
    { kind: "letter", from: "英格兰王国", fromLeader: "爱德华三世", tone: "hostile" },
    { kind: "letter", from: "英格兰王国", fromLeader: "爱德华三世", tone: "threat" },
    { kind: "letter", from: "英格兰王国", fromLeader: "爱德华三世", tone: "warm" },
    { kind: "letter", from: "英格兰王国", fromLeader: "爱德华三世", tone: "cordial" },
    { kind: "estate", estate: "教会", satisfaction: -30, appeal: "请求维护信仰秩序" },
    { kind: "quarter", resource: "国库", net: 92, source: "地块产出 +102" },
    { kind: "quarter", resource: "粮食", net: -10, maintenance: 30 },
    { kind: "quarter", resource: "军需", net: 0 },
  ];
  for (const entry of samples) {
    const text = narrative.narrate(entry);
    assert.ok(typeof text === "string" && text.length > 0, `narrate 必须为 ${entry.kind}/${entry.tone || ""} 产出非空文案`);
  }
  assert.strictEqual(narrative.narrate(null), "", "无效条目应返回空串而非抛错");
})();

// ===== 领导人来信：战争 → 战书；王朝纽带 → 友好信；宿怨 → 威胁信 =====
(() => {
  const world = buildWorld();
  warfare.declareWarOn(world, "英格兰王国", "法兰西王国"); // 英格兰对玩家宣战
  const letters = narrative.leaderLetters(world, "法兰西王国");
  const warLetter = letters.find(l => l.from === "英格兰王国");
  assert.ok(warLetter, "交战国君主应来信");
  assert.strictEqual(warLetter.tone, "hostile", "交战应为战书语气");
  assert.strictEqual(warLetter.intent, "war");
  assert.ok(warLetter.basis, "来信必须带来源（basis 可追溯）");
  assert.ok(warLetter.text.includes("英格兰王国"), "来信文案应点明来信国");

  // 王朝纽带 + 友好态度 → 友好信
  const warm = buildWorld();
  const kin = diplomacy.leaderRelationView(warm, "英格兰王国", "法兰西王国");
  kin.kinship = true;
  Object.assign(diplomacy.relationView(warm, "英格兰王国", "法兰西王国"), { trust: 100, threat: 0, strategicInterest: 40, territorialConflict: 0, institutionalConflict: 0 });
  const warmLetters = narrative.leaderLetters(warm, "法兰西王国");
  assert.ok(warmLetters.some(l => l.tone === "warm"), "王朝纽带 + 友好态度应产生友好来信");

  // 宿怨 → 威胁信
  const grudgeWorld = buildWorld();
  diplomacy.leaderRelationView(grudgeWorld, "英格兰王国", "法兰西王国").grudge = 60;
  const grudgeLetters = narrative.leaderLetters(grudgeWorld, "法兰西王国");
  assert.ok(grudgeLetters.some(l => l.tone === "threat"), "高宿怨应产生威胁来信");

  // 平淡关系不刷信
  const calm = buildWorld();
  assert.strictEqual(narrative.leaderLetters(calm, "法兰西王国").length, 0, "无战争/纽带/宿怨时不应刷屏来信");
})();

// ===== 阶层诉求：信仰压力 → 教士发声；不满阶层 → 绑定合法行动；不可执行的不生成 =====
(() => {
  const world = buildWorld();
  const france = world.countries["法兰西王国"];
  france.estates = {
    church: { label: "教会", power: 50, satisfaction: 5, privileges: [] },
    merchants: { label: "商人", power: 40, satisfaction: -35, privileges: [] },
    nobles: { label: "贵族", power: 60, satisfaction: 10, privileges: [] },
  };
  france.pressures = { faith: 45, fiscal: 0, military: 0, trade: 0, exploration: 0 };

  const demands = narrative.estateDemands(world, "法兰西王国");
  assert.ok(demands.length >= 2, "信仰压力高 + 不满商人应产生诉求");

  const faithDemand = demands.find(d => d.theme === "faith");
  assert.ok(faithDemand, "信仰压力高时教士阶层应主动发声");
  assert.ok(faithDemand.basis.includes("信仰压力"), "信仰诉求来源应标注信仰压力");
  assert.ok(faithDemand.panel, "信仰诉求应给出跳转面板（改革/法律不在行动目录内）");

  const merchantDemand = demands.find(d => d.estateKey === "merchants");
  assert.ok(merchantDemand, "明显不满的商人阶层应发声");
  const catalog = new Set(["build_market", "develop_tile", "integrate_tile", "send_envoy", "propose_trade", "mobilize_army"]);
  assert.ok(catalog.has(merchantDemand.actionKey), "阶层诉求绑定的行动必须在行动目录白名单内（可执行）");

  // 满意阶层不发声（贵族 satisfaction 10、无信仰压力驱动）
  assert.ok(!demands.some(d => d.estateKey === "nobles"), "满意的贵族阶层不应发声");

  // 无阶层数据时安全返回空
  const bare = buildWorld();
  assert.strictEqual(narrative.estateDemands(bare, "法兰西王国").length, 0, "无阶层数据应返回空数组");
})();

// ===== 季报叙事：把 quarterLedger 净额翻译成一句话 =====
(() => {
  const world = buildWorld();
  const france = world.countries["法兰西王国"];
  france.lastReport = { money: 100, food: 50, military: 20, trade: 10, maintenance: { money: 20, food: 10, military: 5 }, event: {} };
  const note = narrative.quarterNarrative(world, "法兰西王国");
  assert.strictEqual(note.kind, "quarter");
  assert.ok(note.text.length > 0, "季报叙事应产出文案");
  assert.strictEqual(note.basis, "quarterLedger", "季报叙事来源应标注账本");
  assert.ok(typeof note.net === "number", "季报叙事应带净额");
})();

console.log("hifi-narrative.test.cjs ✓");

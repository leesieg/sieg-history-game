const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeElement() {
  const el = {
    innerHTML: "", textContent: "", title: "", disabled: false, value: "",
    style: {}, dataset: {}, scrollLeft: 0, onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }),
    focus() {}, blur() {}, scrollIntoView() {}
  };
  return el;
}

function loadDemo2() {
  const demoPath = path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo2.html");
  const html = fs.readFileSync(demoPath, "utf8");
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error("demo2 script missing");
  const marker = 'document.getElementById("endTurnBtn").onclick';
  const pureScript = script.slice(0, script.indexOf(marker));
  const context = {
    console, Math, Map, Set, Date, JSON, Object, Array, Number, String, Boolean, Infinity, NaN,
    document: {
      getElementById: () => makeElement(),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElementNS: () => makeElement(),
      createElement: () => makeElement(),
      body: makeElement(),
      addEventListener() {}, removeEventListener() {},
      documentElement: makeElement()
    },
    window: { addEventListener() {}, removeEventListener() {}, visualViewport: null },
    requestAnimationFrame: fn => fn(),
    setTimeout: () => 0,
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(`${pureScript}
  globalThis.__api = {
    get state() { return state; },
    set state(v) { state = v; },
    get EDICTS() { return EDICTS; },
    get MISSIONS() { return MISSIONS; },
    get AGENDA_POOL() { return AGENDA_POOL; },
    get TUTORIAL_TASKS() { return TUTORIAL_TASKS; },
    newState, endTurn, resolvePlayerEvent, completeLeaderElection,
    forecastCountry, estateStageInfo, changeLegitimacy, publicMorale,
    canEnactEdict, applyEdict, enactEdict, chooseAgenda, checkObjectives,
    triggerRevolt, planRevoltOrders, processRevolts, processEstateLadder,
    areAtWar, eliminateCountry, checkCountryCollapse, playableCountries,
    processSituations, turnForDate, controlledTiles, capital, calendarForTurn,
    adjustEstateForCountry, settleCountry, beginCountryReport, computeWarnings,
    advisorSuggestions, aiGovernCountry, aiConsiderWar, mobilizeArmy,
    armyTotalSoldiers, openCouncil, openPreview, openEpic, sumPop,
    get TRADE_ROUTES() { return TRADE_ROUTES; },
    get TRADE_POOLS() { return TRADE_POOLS; },
    get ADVANCES() { return ADVANCES; },
    get EXPLORATION_MILESTONES() { return EXPLORATION_MILESTONES; },
    get STRATEGIC_DRIVES() { return STRATEGIC_DRIVES; },
    processTrade, computePressures, processExploration, unlockTradeRoute,
    adoptAdvance, runRegency, decisionEchoes, registerDecision,
    aiStrategicWar, applyQuarterModifiers, militaryWarsFor,
    get ERAS() { return ERAS; },
    currentEra, eraAtLeast, advanceEra, checkEras,
    fireReformation, processReformation, processEnlightenment,
    majorityReligion, convertedShare, processConditionalSituations,
    diplomaticCapacity, get DECISIONS() { return DECISIONS; },
    get EDICTS() { return EDICTS; },
    laborStructure, applyLaborPath, hasOrientNode, runGovernor,
    applyOccupation, addArmy, armyUnit, capital
  };`, context);
  return context.__api;
}

module.exports = { loadDemo2 };

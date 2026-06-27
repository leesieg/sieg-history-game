const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const SCRIPT_ROOT = path.join(ROOT, "prototype", "hifi", "scripts");

const ENGINE_FILES = [
  "data/geography.js",
  "data/countries.js",
  "data/codex.js",
  "data/rules.js",
  "data/trade.js",
  "engine/world.js",
  "engine/turn.js",
  "engine/politics.js",
  "engine/economy.js",
  "engine/diplomacy.js",
  "engine/warfare.js",
  "engine/trade.js",
  "engine/history.js",
  "engine/struggle.js",
  "engine/objectives.js",
  "engine/proposals.js",
  "engine/narrative.js",
  "engine/strategy.js",
];

function loadHifiEngines() {
  const context = { window: {}, console };
  for (const file of ENGINE_FILES) {
    const source = fs.readFileSync(path.join(SCRIPT_ROOT, file), "utf8");
    vm.runInNewContext(source, context, { filename: file });
  }
  return context.window;
}

function seedTiles(windowApi) {
  const data = windowApi.HIFI_GEOGRAPHY;
  return data.regionSeeds.map((seed, id) => {
    const isSea = seed[3] === "sea";
    return {
      id,
      x: seed[1],
      y: seed[2],
      lon: seed[1],
      lat: seed[2],
      isSea,
      region: seed[0],
      terrain: seed[3],
      climate: seed[4],
      river: seed[5],
      good: isSea ? "fish" : seed[6],
      culture: isSea ? "海域" : seed[7],
      religion: isSea ? "无" : seed[8],
      population: seed[9].reduce((sum, value) => sum + value, 0),
      buildings: isSea ? [] : [...seed[10]],
      alignment: isSea ? "neutral" : seed[11],
      polity: isSea ? "海域" : seed[12],
      city: isSea ? "" : data.CITY_BY_REGION[seed[0]] || "",
      control: isSea ? 0 : seed[11] === "player" ? 85 : seed[11] === "enemy" ? 58 : 70,
    };
  });
}

function initializeWorld(windowApi, player = "法兰西王国") {
  const world = windowApi.HIFI_WORLD_ENGINE.createWorld(seedTiles(windowApi), {}, player);
  windowApi.HIFI_POLITICS_ENGINE.initializePolitics(world);
  windowApi.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
  windowApi.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
  windowApi.HIFI_WARFARE_ENGINE.initializeWarfare(world);
  windowApi.HIFI_HISTORY_ENGINE.initializeHistory(world);
  windowApi.HIFI_STRUGGLE_ENGINE.initializeStruggles(world);
  windowApi.HIFI_TRADE_ENGINE.initializeTrade(world);
  return world;
}

function playableCountries(windowApi) {
  const world = initializeWorld(windowApi);
  return Object.keys(world.countries).filter(name => name !== "海域").sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

module.exports = {
  ROOT,
  initializeWorld,
  loadHifiEngines,
  playableCountries,
  seedTiles,
};

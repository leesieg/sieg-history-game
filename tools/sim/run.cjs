#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT,
  initializeWorld,
  loadHifiEngines,
  playableCountries,
} = require("./hifi-loader.cjs");

const DEFAULT_PROFILES = ["balanced"];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function parseList(value) {
  if (!value || value === "all") return null;
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function clampRuns(list, limit) {
  if (!limit || limit === "all") return list;
  return list.slice(0, Number(limit));
}

function controlledTiles(w, world, polity) {
  return w.HIFI_WORLD_ENGINE.controlledTiles(world, polity).filter(tile => !tile.isSea);
}

function resolveBlocking(w, world) {
  if (world.pendingElection) w.HIFI_POLITICS_ENGINE.completeElection(world, 0);
  if (world.playerEvents?.length) {
    const event = world.playerEvents[0];
    const choice = event.choices?.[0]?.id;
    if (choice) w.HIFI_HISTORY_ENGINE.resolvePlayerEvent(world, event.id, choice);
    else world.playerEvents.shift();
  }
  if (world.pendingTransition) w.HIFI_HISTORY_ENGINE.acknowledgeTransition(world);
}

function firstBuildableTile(w, world, polity, buildingKey) {
  return controlledTiles(w, world, polity).find(tile => !tile.buildings.includes(buildingKey));
}

function tryAction(fn) {
  try {
    fn();
    return true;
  } catch (_) {
    return false;
  }
}

function applyProfileAction(w, world, profile, quarterIndex) {
  const polity = world.playerPolity;
  const country = world.countries[polity];
  if (!country) return;
  if (profile === "passive") return;

  if (profile === "military" || (profile === "balanced" && quarterIndex % 4 === 0)) {
    const tile = controlledTiles(w, world, polity)[0];
    if (tile) {
      const mobilized = tryAction(() => w.HIFI_WARFARE_ENGINE.mobilizeArmy(world, polity, tile.id, "infantry"));
      if (profile === "military" && mobilized) return;
    }
  }

  if (profile === "economy" || profile === "balanced") {
    const priority = ["farm", "market", "workshop", "fort", "port"];
    for (const building of priority) {
      const tile = firstBuildableTile(w, world, polity, building);
      if (tile && tryAction(() => w.HIFI_ECONOMY_ENGINE.constructBuilding(world, polity, tile.id, building))) return;
    }
    const devTile = controlledTiles(w, world, polity)[0];
    if (devTile && tryAction(() => w.HIFI_ECONOMY_ENGINE.developTile(world, polity, devTile.id))) return;
  }

  if (profile === "diplomacy" || profile === "balanced") {
    const targets = w.HIFI_DIPLOMACY_ENGINE.sortDiplomacyTargets(world, polity);
    for (const target of targets) {
      if (tryAction(() => w.HIFI_DIPLOMACY_ENGINE.proposeTreaty(world, polity, target, "trade"))) return;
      if (tryAction(() => w.HIFI_DIPLOMACY_ENGINE.startMission(world, polity, target, "improve"))) return;
    }
  }
}

function countryScore(country, tiles) {
  return Math.round(
    (country.money || 0)
    + (country.food || 0) * 0.2
    + (country.military || 0) * 0.4
    + (country.legitimacy || 0) * 4
    + tiles.length * 70
    + (country.ideas || 0) * 3
  );
}

function summarizeRun(w, world, player, profile, completed, error) {
  const countries = Object.values(world.countries);
  const country = world.countries[player];
  const tiles = controlledTiles(w, world, player);
  const issues = w.HIFI_HISTORY_ENGINE.issues(world);
  const activeStruggles = w.HIFI_STRUGGLE_ENGINE.activeStruggles(world);
  return {
    player,
    profile,
    completed,
    error: error || null,
    turn: world.turn,
    year: w.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year,
    score: countryScore(country, tiles),
    resources: {
      food: Math.round(country.food || 0),
      money: Math.round(country.money || 0),
      military: Math.round(country.military || 0),
      legitimacy: Math.round(country.legitimacy || 0),
      ideas: Math.round(country.ideas || 0),
      capital: Math.round(country.capital || 0),
    },
    tiles: tiles.length,
    issues: issues.length,
    blockingIssues: issues.filter(issue => issue.blocking).length,
    wars: world.diplomacy?.wars?.length || 0,
    treaties: world.diplomacy?.treaties?.length || 0,
    subjects: world.diplomacy?.subjects?.length || 0,
    events: world.worldEvents?.length || 0,
    buildings: world.tiles.reduce((sum, tile) => sum + (tile.buildings?.length || 0), 0),
    techAdoptions: countries.reduce((sum, item) => sum + Object.values(item.technology || {}).filter(Boolean).length, 0),
    missionsDone: countries.reduce((sum, item) => sum + (item.missionsDone?.length || 0), 0),
    zeroLegitimacyCountries: countries.filter(item => item.legitimacy <= 0).length,
    lowLegitimacyCountries: countries.filter(item => item.legitimacy < 30).length,
    maxMoney: Math.max(...countries.map(item => item.money || 0)),
    minMoney: Math.min(...countries.map(item => item.money || 0)),
    maxMilitary: Math.max(...countries.map(item => item.military || 0)),
    minMilitary: Math.min(...countries.map(item => item.military || 0)),
    strugglePhases: activeStruggles.map(item => item.phase),
  };
}

function runSimulation() {
  const w = loadHifiEngines();
  const quarters = Number(argValue("quarters", "40"));
  const limit = argValue("limit", "all");
  const playerArg = parseList(argValue("players", "all"));
  const profileArg = parseList(argValue("profiles", DEFAULT_PROFILES.join(",")));
  const output = argValue("out", path.join(ROOT, "tools", "sim", "baselines", "latest-run.json"));
  const players = clampRuns(playerArg || playableCountries(w), limit);
  const profiles = profileArg || DEFAULT_PROFILES;
  const runs = [];

  for (const profile of profiles) {
    for (const player of players) {
      const world = initializeWorld(w, player);
      let completed = false;
      let error = null;
      try {
        for (let quarter = 0; quarter < quarters; quarter += 1) {
          resolveBlocking(w, world);
          applyProfileAction(w, world, profile, quarter);
          w.HIFI_TURN_ENGINE.advanceQuarter(world);
        }
        resolveBlocking(w, world);
        completed = true;
      } catch (caught) {
        error = caught.message;
      }
      runs.push(summarizeRun(w, world, player, profile, completed, error));
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    quarters,
    players,
    profiles,
    runs,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`sim run written: ${path.relative(ROOT, output)} (${runs.length} runs)`);
}

if (require.main === module) runSimulation();

module.exports = { runSimulation };

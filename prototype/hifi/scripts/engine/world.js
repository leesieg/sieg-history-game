(() => {
  "use strict";

  function seasonName(quarter) {
    const season = ["春", "夏", "秋", "冬"][quarter - 1];
    if (!season) throw new Error(`无效季度：${quarter}`);
    return season;
  }

  function calendarForTurn(turn) {
    const offset = Math.max(0, turn - 1);
    return {
      year: 1337 + Math.floor(offset / 4),
      quarter: offset % 4 + 1,
    };
  }

  function calendarLabel(turn) {
    const calendar = calendarForTurn(turn);
    return `${calendar.year}年 · ${seasonName(calendar.quarter)}`;
  }

  function leaderActionGain(ability) {
    return 1 + Math.floor(Math.max(0, Math.min(6, ability)) / 2);
  }

  function controlledTiles(world, polity = world.playerPolity) {
    return world.tiles.filter(tile => !tile.isSea && tile.polity === polity);
  }

  function countryNames(tiles) {
    return [...new Set(
      tiles
        .filter(tile => !tile.isSea && tile.polity && tile.polity !== "海域")
        .map(tile => tile.polity)
    )].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }

  function defaultLeader(name) {
    return {
      name: `${name}摄政者`,
      dynasty: "未定家族",
      title: "统治者",
      abilities: { administrative: 3, diplomatic: 3, military: 3 },
    };
  }

  function createCountryState(name, tiles, profile = {}) {
    const territory = tiles.filter(tile => !tile.isSea && tile.polity === name);
    if (!territory.length) throw new Error(`国家没有可控制地块：${name}`);
    const population = territory.reduce((sum, tile) => sum + (tile.population || 0), 0);
    const markets = territory.filter(tile => tile.buildings?.includes("market")).length;
    const ports = territory.filter(tile => tile.buildings?.includes("port")).length;
    const forts = territory.filter(tile => tile.buildings?.includes("fort")).length;
    const leader = profile.leader || defaultLeader(name);
    return {
      name,
      leader: {
        ...leader,
        abilities: { ...leader.abilities },
      },
      actionPoints: {
        administrative: leaderActionGain(leader.abilities.administrative),
        diplomatic: leaderActionGain(leader.abilities.diplomatic),
        military: leaderActionGain(leader.abilities.military),
      },
      food: Math.max(40, Math.round(population * 2.4) + 20),
      money: Math.max(40, (markets + ports + 3) * 10),
      military: Math.max(30, (forts + Math.round(population / 3) + 2) * 10),
      legitimacy: profile.legitimacy ?? 62,
      government: profile.government || { type: "monarchy", typeLabel: "封建君主制", powerName: "王权", centralPower: 62 },
      estates: profile.estates || {},
      estateSeed: profile.estateSeed || {},
      technology: {},
      capital: 0,
      log: [`${name}进入 1337 年的时代棋局。`],
    };
  }

  function activeCountry(world) {
    return world.countries[world.playerPolity];
  }

  function setPlayerCountry(world, polity) {
    if (!world.countries[polity]) throw new Error(`无法切换到未知国家：${polity}`);
    world.playerPolity = polity;
    const capital = controlledTiles(world, polity).find(tile => tile.city)
      || controlledTiles(world, polity)[0];
    world.selectedTile = capital?.id ?? null;
    return capital;
  }

  function createWorld(tiles, profiles = {}, initialPolity = "法兰西王国") {
    const countries = Object.fromEntries(
      countryNames(tiles).map(name => [name, createCountryState(name, tiles, profiles[name])])
    );
    const playerPolity = countries[initialPolity] ? initialPolity : Object.keys(countries)[0];
    const world = {
      turn: 1,
      tiles,
      countries,
      playerPolity,
      selectedTile: null,
      worldEvents: [],
      gameOver: false,
    };
    setPlayerCountry(world, playerPolity);
    return world;
  }

  window.HIFI_WORLD_ENGINE = {
    activeCountry,
    calendarForTurn,
    calendarLabel,
    controlledTiles,
    createCountryState,
    createWorld,
    leaderActionGain,
    seasonName,
    setPlayerCountry,
  };
})();

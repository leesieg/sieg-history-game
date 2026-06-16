(() => {
  "use strict";

  function advanceQuarter(world) {
    if (world.gameOver) return world;
    world.turn += 1;
    if (window.HIFI_WARFARE_ENGINE) window.HIFI_WARFARE_ENGINE.processWarfare(world);
    for (const country of Object.values(world.countries)) {
      const abilities = country.leader.abilities;
      for (const type of ["administrative", "diplomatic", "military"]) {
        const gain = window.HIFI_WORLD_ENGINE.leaderActionGain(abilities[type]);
        country.actionPoints[type] = Math.min(10, country.actionPoints[type] + gain);
      }
      country.log.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：进入新季度。`);
      country.log = country.log.slice(0, 14);
    }
    if (window.HIFI_ECONOMY_ENGINE) {
      for (const polity of Object.keys(world.countries)) {
        window.HIFI_ECONOMY_ENGINE.settleCountry(world, polity);
      }
    }
    if (window.HIFI_TRADE_ENGINE) window.HIFI_TRADE_ENGINE.processTrade(world);
    if (window.HIFI_DIPLOMACY_ENGINE) {
      window.HIFI_DIPLOMACY_ENGINE.processDiplomacy(world);
    }
    if (window.HIFI_POLITICS_ENGINE) {
      for (const polity of Object.keys(world.countries)) {
        window.HIFI_POLITICS_ENGINE.processEstates(world, polity);
        if (!world.pendingElection) window.HIFI_POLITICS_ENGINE.processLeadership(world, polity);
      }
    }
    if (window.HIFI_HISTORY_ENGINE) window.HIFI_HISTORY_ENGINE.processHistory(world);
    if (window.HIFI_STRATEGY_ENGINE) window.HIFI_STRATEGY_ENGINE.processAI(world);
    return world;
  }

  window.HIFI_TURN_ENGINE = { advanceQuarter };
})();

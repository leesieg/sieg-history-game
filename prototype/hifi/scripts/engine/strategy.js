(() => {
  "use strict";

  function affordableTechnology(country) {
    return Object.entries(window.HIFI_RULES.technologies)
      .filter(([key, technology]) =>
        !country.technology[key]
        && country.ideas >= technology.cost
        && (country.technologyAwareness?.[key] || 0) >= 25
      )
      .sort((a, b) => {
        const military = (country.pressures?.military || 0) >= 55;
        const score = ([key]) => military && ["artillery", "standingArmy", "bastions"].includes(key) ? 0 : 1;
        return score(a) - score(b) || a[1].cost - b[1].cost;
      })[0];
  }

  function processCountry(world, polity) {
    if (polity === world.playerPolity) return;
    const country = world.countries[polity];
    const technology = affordableTechnology(country);
    if (technology) window.HIFI_ECONOMY_ENGINE.adoptTechnology(world, polity, technology[0]);
    if ((country.pressures?.fiscal || 0) >= 60 && country.tariff !== 25) {
      window.HIFI_TRADE_ENGINE.setTariff(world, polity, 25);
    } else if ((country.pressures?.trade || 0) >= 55 && country.tariff !== 0) {
      window.HIFI_TRADE_ENGINE.setTariff(world, polity, 0);
    }
    if ((country.pressures?.military || 0) >= 45 && country.actionPoints.military > 0) {
      const tile = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity).find(item => item.population >= 2);
      if (tile && Object.values(world.warfare.armies).filter(army => army.owner === polity).length < 3) {
        window.HIFI_WARFARE_ENGINE.mobilizeArmy(world, polity, tile.id, "infantry");
      }
    }
    if (country.government.assembly.unlocked && country.government.assembly.support < 45 && country.actionPoints.administrative > 0) {
      window.HIFI_POLITICS_ENGINE.holdAssembly(world, polity, "tax", "privilege");
    }
  }

  function processAI(world) {
    Object.keys(world.countries).forEach(polity => processCountry(world, polity));
    return world;
  }

  window.HIFI_STRATEGY_ENGINE = { processAI, processCountry };
})();

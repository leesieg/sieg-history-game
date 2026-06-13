(() => {
  "use strict";

  const rules = window.HIFI_RULES;

  function initializeEconomy(world) {
    for (const country of Object.values(world.countries)) {
      country.technology = Object.fromEntries(Object.keys(rules.technologies).map(key => [key, false]));
      country.ideas = 20;
      country.tradePolicy = "normal";
      country.agenda = null;
      country.ageProgress = 0;
      country.edictCooldowns = {};
      country.lastReport = null;
    }
    for (const tile of world.tiles) {
      if (tile.isSea) continue;
      tile.devastation = tile.devastation || 0;
      tile.control = tile.control ?? 60;
    }
    return world;
  }

  function tileOutput(tile, country) {
    if (tile.isSea) return { food: 0, money: 0, military: 0 };
    if (tile.occupier && tile.occupation >= 100) return { food: 0, money: 0, military: 0 };
    const population = Math.max(1, tile.population || 1);
    const control = Math.max(.2, (tile.control || 0) / 100);
    const devastation = Math.max(.15, 1 - (tile.devastation || 0) / 100);
    const occupation = Math.max(0, 1 - (tile.occupation || 0) / 100);
    const base = population * control * devastation * occupation;
    const foodGoods = new Set(["grain", "fish", "dates", "wine"]);
    const militaryGoods = new Set(["iron", "horses", "timber"]);
    let food = foodGoods.has(tile.good) ? base * 1.25 : base * .45;
    let money = base * .55;
    let military = militaryGoods.has(tile.good) ? base * .75 : base * .3;
    if (tile.buildings.includes("farm")) food *= 1.35;
    if (tile.buildings.includes("market")) money *= 1.4;
    if (tile.buildings.includes("port")) money *= 1.25;
    if (tile.buildings.includes("fort")) military *= 1.3;
    if (tile.buildings.includes("workshop")) {
      money *= 1.2;
      military *= 1.2;
    }
    if (country.technology.accounting) money *= 1.1;
    if (country.technology.standingArmy) military *= 1.2;
    return { food: Math.round(food), money: Math.round(money), military: Math.round(military) };
  }

  function settleCountry(world, polity) {
    const country = world.countries[polity];
    const territory = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const report = territory.reduce((total, tile) => {
      const output = tileOutput(tile, country);
      total.food += output.food;
      total.money += output.money;
      total.military += output.military;
      return total;
    }, { food: 0, money: 0, military: 0, tiles: territory.length });
    country.food += report.food;
    country.money += report.money;
    country.military += report.military;
    if (country.tradePolicy === "open") {
      const trade = Math.max(2, Math.round(report.money * .12));
      country.money += trade;
      country.capital += Math.max(1, Math.round(trade * .2));
      report.trade = trade;
    }
    if (country.technology.printing) country.ideas += 3;
    if (country.agenda) {
      const agenda = rules.agendas[country.agenda];
      if (country[agenda.target] >= agenda.threshold) {
        for (const [resource, amount] of Object.entries(agenda.reward)) {
          country[resource] += amount;
        }
        report.completedAgenda = agenda.label;
        country.agenda = null;
      }
    }
    country.lastReport = report;
    country.log.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：粮 +${report.food}，钱 +${report.money}，军需 +${report.military}。`);
    return report;
  }

  function constructBuilding(world, polity, tileId, buildingKey) {
    const country = world.countries[polity];
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    const building = rules.buildings[buildingKey];
    if (!tile || tile.isSea || tile.polity !== polity) throw new Error("只能在己方陆地建设");
    if (!building) throw new Error("未知建筑");
    if (tile.buildings.includes(buildingKey)) throw new Error("地块已有该建筑");
    if (country.money < building.cost || country.actionPoints.administrative < 1) throw new Error("建设资源不足");
    country.money -= building.cost;
    country.actionPoints.administrative -= 1;
    tile.buildings.push(buildingKey);
    return tile;
  }

  function adoptTechnology(world, polity, key) {
    const country = world.countries[polity];
    const technology = rules.technologies[key];
    if (!technology) throw new Error("未知科技");
    if (country.technology[key]) throw new Error("科技已经采纳");
    if (country.ideas < technology.cost) throw new Error("思想点不足");
    country.ideas -= technology.cost;
    country.technology[key] = true;
    country.ageProgress = Math.round(
      Object.values(country.technology).filter(Boolean).length
        / Object.keys(rules.technologies).length
        * 100
    );
    return technology;
  }

  function setTradePolicy(world, polity, policy) {
    if (!["closed", "normal", "open"].includes(policy)) throw new Error("未知贸易政策");
    world.countries[polity].tradePolicy = policy;
    return policy;
  }

  function setAgenda(world, polity, key) {
    if (!rules.agendas[key]) throw new Error("未知国家议程");
    world.countries[polity].agenda = key;
    return rules.agendas[key];
  }

  function enactEdict(world, polity, key) {
    const country = world.countries[polity];
    const edict = rules.edicts[key];
    if (!edict) throw new Error("未知敕令");
    for (const [resource, cost] of Object.entries(edict.cost)) {
      const pool = country.actionPoints.hasOwnProperty(resource) ? country.actionPoints : country;
      if (pool[resource] < cost) throw new Error("敕令资源不足");
    }
    for (const [resource, cost] of Object.entries(edict.cost)) {
      const pool = country.actionPoints.hasOwnProperty(resource) ? country.actionPoints : country;
      pool[resource] -= cost;
    }
    for (const resource of ["food", "money", "military", "legitimacy"]) {
      country[resource] += edict[resource] || 0;
    }
    return edict;
  }

  window.HIFI_ECONOMY_ENGINE = {
    adoptTechnology,
    constructBuilding,
    enactEdict,
    initializeEconomy,
    setAgenda,
    setTradePolicy,
    settleCountry,
    tileOutput,
  };
})();

(() => {
  "use strict";

  const data = window.HIFI_TRADE_DATA;
  const pressureKeys = ["trade", "military", "fiscal", "exploration", "faith", "ideas"];
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

  function initializeTrade(world) {
    world.trade = {
      pools: { ...data.pools },
      routes: Object.fromEntries(Object.entries(data.routes).map(([key, value]) => [
        key,
        { ...value, active: !value.unlock, cost: 0, flow: 0, boost: 0 },
      ])),
      selectedRoute: null,
      lastIncome: {},
    };
    for (const country of Object.values(world.countries)) {
      country.tariff = 10;
      country.pressures = Object.fromEntries(pressureKeys.map(key => [key, country.pressures?.[key] || 0]));
    }
    return world;
  }

  function routeUnlocked(world, route) {
    if (!route.unlock) return true;
    return Object.values(world.countries).some(country => country.technology?.[route.unlock]);
  }

  function nodeTile(world, city) {
    return world.tiles.find(tile => tile.city === city && !tile.isSea);
  }

  function routeCost(world, route) {
    let cost = 5;
    for (const city of route.nodes) {
      const tile = nodeTile(world, city);
      if (!tile) continue;
      cost += (tile.devastation || 0) * .12;
      if (tile.occupation >= 100) cost += 14;
      const owner = world.countries[tile.polity];
      cost += (owner?.tariff || 0) * .08;
    }
    if (route.nodes.includes("君士坦丁堡") && world.flags?.constantinopleFallen) cost += 18;
    return Math.round(cost);
  }

  function computePressures(world, polity) {
    const country = world.countries[polity];
    const wars = world.diplomacy?.wars?.filter(war => war.attackers.includes(polity) || war.defenders.includes(polity)).length || 0;
    const routes = Object.values(world.trade.routes).filter(route =>
      route.nodes.some(city => nodeTile(world, city)?.polity === polity)
    );
    const foreignTrade = routes.reduce((sum, route) => sum + route.flow, 0);
    country.pressures.trade = clamp(foreignTrade / 3 + country.tariff);
    country.pressures.military = clamp(wars * 28 + (country.warfare?.warExhaustion || 0) * 4);
    country.pressures.fiscal = clamp(Math.max(0, 90 - country.money) + country.tariff);
    country.pressures.exploration = clamp((world.flags?.discoveryImpulse ? 28 : 0) + country.pressures.trade * .45);
    country.pressures.faith = window.HIFI_FAITH_ENGINE
      ? window.HIFI_FAITH_ENGINE.pressure(world, polity)
      : clamp(window.HIFI_WORLD_ENGINE.controlledTiles(world, polity).filter(tile => tile.religion !== "天主教").length * 12 + (world.flags?.reformation ? 32 : 0));
    country.pressures.ideas = clamp((country.technology?.printing ? 24 : 0) + (country.ideas || 0) / 2);
    return country.pressures;
  }

  function processTrade(world) {
    world.trade.lastIncome = {};
    for (const [routeKey, route] of Object.entries(world.trade.routes)) {
      route.active = routeUnlocked(world, route);
      route.cost = routeCost(world, route);
      route.flow = route.active ? Math.max(0, Math.round(route.value * (1 + (route.boost || 0)) * (1 - Math.min(.85, route.cost / 120)))) : 0;
      if (routeKey === "newWorld") world.trade.pools.silver += Math.round(route.flow * .08);
      const nodeShare = route.nodes.length ? route.flow / route.nodes.length : 0;
      for (const city of route.nodes) {
        const polity = nodeTile(world, city)?.polity;
        if (!world.countries[polity]) continue;
        const tariff = 1 + world.countries[polity].tariff / 100;
        // 贸易政策调节对外商路分成（封闭 ×0.5 / 常规 ×1 / 开放 ×1.3，与本土产出互为取舍）
        const policy = world.countries[polity].tradePolicy;
        const policyFactor = policy === "closed" ? .5 : policy === "open" ? 1.3 : 1;
        world.trade.lastIncome[polity] = (world.trade.lastIncome[polity] || 0) + nodeShare * tariff * policyFactor;
      }
    }
    // 白银累积推升物价（价格革命：白银流→物价指数）
    const inflation = Math.min(2, 1 + (world.trade.pools.silver || 0) / 4000);
    for (const [polity, country] of Object.entries(world.countries)) {
      const income = Math.round(world.trade.lastIncome[polity] || 0);
      country.money += income;
      country.capital += Math.round(income * .15);
      if (country.lastReport) country.lastReport.trade = income;
      if (inflation > 1) country.priceIndex = Math.max(country.priceIndex || 1, inflation);
      computePressures(world, polity);
    }
    return world.trade.lastIncome;
  }

  function investRoute(world, polity, key) {
    const route = world.trade.routes[key];
    if (!route) throw new Error("未知贸易路线");
    if (!route.active) throw new Error("路线尚未解锁");
    const country = world.countries[polity];
    if (!route.nodes.some(city => nodeTile(world, city)?.polity === polity)) throw new Error("本国没有该商路节点");
    if (country.actionPoints.administrative < 1 || country.money < 15) throw new Error("投资资源不足");
    country.actionPoints.administrative -= 1;
    country.money -= 15;
    route.boost = Math.min(.6, (route.boost || 0) + .15);
    world.trade.selectedRoute = key;
    return route;
  }

  function setTariff(world, polity, value) {
    if (![0, 10, 25].includes(Number(value))) throw new Error("关税只能设为 0、10 或 25");
    world.countries[polity].tariff = Number(value);
    return Number(value);
  }

  function routeView(world, key) {
    const route = world.trade.routes[key];
    if (!route) throw new Error("未知贸易路线");
    return { ...route, key };
  }

  window.HIFI_TRADE_ENGINE = {
    computePressures,
    initializeTrade,
    investRoute,
    processTrade,
    routeCost,
    routeView,
    setTariff,
  };
})();

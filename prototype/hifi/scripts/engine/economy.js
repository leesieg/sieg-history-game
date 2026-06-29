(() => {
  "use strict";

  const rules = window.HIFI_RULES;

  // 维护费系数：让"什么都不做"净增近零，扩军/铺建筑压成负，逼出取舍。
  // 系数在 longrun 测试反推标定，初值如下。
  const MAINTENANCE = {
    food: 0.4,        // 每 1000 兵每季消耗的粮食
    military: { guard: 0, levy: 0.2, professional: 0.6, standing: 0.8, mercenary: 0.5 }, // 每 1000 兵
    building: 3,      // 每栋建筑每季消耗的金钱（行政维护）
  };

  const FISCAL_EFFECTS = {
    demesne: { money: .9 },
    tax_farming: { money: 1.05 },
    direct: { money: 1.2 },
    commercial: { money: 1, portMoney: 1.15, tradeShare: 1.6 },
    nomadic: { money: .2, food: .5 },
  };
  const MARKET_SPLITS = {
    demesne: { local: .5, tax: .25, trade: .25 },
    tax_farming: { local: .4, tax: .38, trade: .22 },
    direct: { local: .35, tax: .45, trade: .2 },
    commercial: { local: .3, tax: .3, trade: .4 },
    nomadic: { local: .75, tax: .1, trade: .15 },
    default: { local: .45, tax: .3, trade: .25 },
  };
  const SUBSISTENCE_FOOD = 0.75;

  function fiscalKey(country) {
    const institutions = country.government?.institutions;
    if (institutions?.fiscal) return institutions.fiscal;
    return null;
  }

  function fiscalEffect(country) {
    const key = fiscalKey(country);
    return key ? FISCAL_EFFECTS[key] || null : null;
  }

  function marketSplit(country) {
    return MARKET_SPLITS[fiscalKey(country)] || MARKET_SPLITS.default;
  }

  function embargoPenalty(world, polity) {
    const embargoes = world.diplomacy?.embargoes || [];
    return Math.min(.6, embargoes.filter(item => item.actor === polity || item.target === polity).length * .2);
  }

  function militaryOutputFactor(country) {
    const key = country.government?.institutions?.military;
    if (key === "standing_army") return 1.12;
    if (key === "nation_in_arms") return 1.05;
    if (key === "mercenary_state") return .92;
    return 1;
  }

  function integrationGain(country) {
    const central = Math.max(0, Math.min(100, country.government?.centralPower ?? 60));
    const fiscal = fiscalKey(country);
    const assembly = country.government?.institutions?.assembly?.type;
    return 16
      + Math.round(central / 20)
      + (country.technology?.bureaucracy ? 2 : 0)
      + (country.technology?.constitutionalism ? 2 : 0)
      + (fiscal === "direct" ? 4 : 0)
      + (assembly === "parliamentary" ? 2 : 0);
  }

  function tradeCapitalRate(country) {
    let rate = .2;
    if (country.technology?.billsOfExchange) rate += .06;
    if (country.technology?.jointStockCompanies) rate += .09;
    return rate;
  }

  function initializeEconomy(world) {
    for (const country of Object.values(world.countries)) {
      country.technology = Object.fromEntries(Object.keys(rules.technologies).map(key => [key, false]));
      country.technologyAwareness = Object.fromEntries(Object.keys(rules.technologies).map(key => [key, 0]));
      ensureResearchState(country);
      country.ideas = 20;
      country.tradePolicy = "normal";
      country.priceIndex ||= 1;
      country.goodsAccess ||= {};
      country.famineSeasons ||= 0;
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
    for (const [polity, country] of Object.entries(world.countries)) {
      country.hasHorseSource = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity).some(tile => tile.good === "horses");
    }
    return world;
  }

  function techDomains() {
    const domains = rules.techDomains && Object.keys(rules.techDomains).length
      ? rules.techDomains
      : { administrative: {}, military: {}, economic: {}, naval: {}, cultural: {} };
    return Object.keys(domains);
  }

  function ensureResearchState(country) {
    const domains = techDomains();
    country.research ||= {};
    domains.forEach(domain => { country.research[domain] ??= 0; });
    if (country.ideas !== undefined) {
      country.research.cultural = Math.max(country.research.cultural || 0, country.ideas || 0);
    }
    country.researchFocus ||= "cultural";
    if (!domains.includes(country.researchFocus)) country.researchFocus = domains[0] || "cultural";
    return country.research;
  }

  function addResearch(country, domain, amount) {
    ensureResearchState(country);
    country.research[domain] = Math.round((country.research[domain] + amount) * 10) / 10;
    if (domain === "cultural") country.ideas = Math.max(country.ideas || 0, Math.round(country.research[domain]));
    return country.research[domain];
  }

  function technologyReady(world, country, key) {
    const technology = rules.technologies[key];
    if (!technology) return { ready: false, reason: "未知科技" };
    if (country.technology[key]) return { ready: false, reason: "科技已经采纳" };
    const year = window.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year;
    if (year < technology.year) return { ready: false, reason: `${technology.label}尚未进入可用年代` };
    const missing = (technology.requires || []).find(required => !country.technology[required]);
    if (missing) return { ready: false, reason: `需要先完成${rules.technologies[missing]?.label || missing}` };
    const gate = technology.awarenessGate ?? 25;
    if ((country.technologyAwareness[key] || 0) < gate) return { ready: false, reason: `${technology.label}传播度不足` };
    ensureResearchState(country);
    const domain = technology.domain || "cultural";
    const cost = effectiveTechnologyCost(country, key);
    if ((country.research[domain] || 0) < cost) return { ready: false, reason: `${rules.techDomains?.[domain]?.label || domain}研究不足` };
    return { ready: true, technology };
  }

  function effectiveTechnologyCost(country, key) {
    const technology = rules.technologies[key];
    if (!technology) throw new Error("未知科技");
    const awareness = Math.max(0, Math.min(100, country.technologyAwareness?.[key] || 0));
    const discount = Math.min(.5, awareness / 200);
    return Math.max(1, Math.round(technology.cost * (1 - discount)));
  }

  function frontierTechnologies(world, country, domain = null) {
    const year = window.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year;
    return Object.entries(rules.technologies)
      .filter(([key, technology]) => !country.technology?.[key])
      .filter(([, technology]) => !domain || (technology.domain || "cultural") === domain)
      .filter(([, technology]) => year >= technology.year)
      .filter(([, technology]) => !(technology.requires || []).some(required => !country.technology?.[required]))
      .map(([key, technology]) => ({ key, technology, ready: technologyReady(world, country, key).ready }))
      .sort((a, b) => (a.technology.year - b.technology.year) || (a.technology.cost - b.technology.cost));
  }

  function autoAdoptReadyTechnologies(world, polity) {
    const country = world.countries[polity];
    ensureResearchState(country);
    const adopted = [];
    for (const domain of Object.keys(rules.techDomains || {})) {
      const ready = frontierTechnologies(world, country, domain).filter(item => item.ready);
      if (ready.length !== 1) continue;
      adopted.push(adoptTechnology(world, polity, ready[0].key).label);
    }
    return adopted;
  }

  function applyTechnologyEffect(world, country, key, technology) {
    if (technology.unlockInstitution) {
      const [axis, value] = technology.unlockInstitution;
      country.unlockedInstitutions ||= {};
      country.unlockedInstitutions[axis] ||= {};
      country.unlockedInstitutions[axis][value] = true;
    }
    const effectNotes = {
      codifiedLaw: "国家整合效率提高",
      threeFieldSystem: "粮食产出提高",
      compassCharts: "港口与航海研究提高",
      universities: "文化研究提高",
      watermills: "工坊与手工业产出提高",
      billsOfExchange: "商业结算能力提高",
      astrolabe: "远航探索能力提高",
      bureaucracy: "国家整合与集权能力提高",
      humanism: "文化研究效率提高",
      steamEngine: "工坊产出提高",
      railways: "陆上市场连接提高",
      jointStockCompanies: "商业资本池增长能力提高",
      scientificMethod: "全领域研究扩散效率提高",
      shipOfLine: "远洋海权能力提高",
      bayonetVolley: "近代步兵战斗力提高",
      enlightenment: "议会主权与共和改革能力解锁",
      constitutionalism: "议会国家与行政法制能力提高",
      artillery: "可动员炮兵",
      oceanGoingShips: "可进入远洋航线",
      triangleTrade: "跨洋商路解锁",
      bastions: "堡垒防御效率提高",
    };
    country.lastTechnologyEffect = effectNotes[key] || technology.effect || "科技能力已解锁";
    return country.lastTechnologyEffect;
  }

  function tileOutput(tile, country) {
    if (tile.isSea) return { food: 0, money: 0, military: 0, market: 0, church: 0, goods: {} };
    if (tile.occupier && tile.occupation >= 100) return { food: 0, money: 0, military: 0 };
    const population = Math.max(1, tile.population || 1);
    const control = Math.max(.2, (tile.control || 0) / 100);
    const devastation = Math.max(.15, 1 - (tile.devastation || 0) / 100);
    const occupation = Math.max(0, 1 - (tile.occupation || 0) / 100);
    const base = population * control * devastation * occupation;
    const goodKey = normalizeGoodKey(tile.good);
    const good = window.HIFI_GOODS?.goods?.[goodKey] || { label: tile.good, cat: "luxury", baseValue: 2, yield: .6 };
    const terrainAffinity = !good.terrain?.length || good.terrain.includes(tile.terrain) ? 1 : .72;
    const climate = good.climate?.[tile.climate] ?? 1;
    const industry = industryBonus(tile, good, goodKey);
    const amount = base * (good.yield || .6) * terrainAffinity * climate * industry.amount;
    const value = amount * (good.baseValue || 1) * (country.priceIndex || 1);
    let food = ["food"].includes(good.cat) ? amount * 1.35 : base * .28;
    let money = value * .42;
    let military = ["military", "strategic"].includes(good.cat) ? amount * .72 : base * .22;
    if (good.cat === "money_metal") {
      money += value;
      if (good.special === "inflation") country.priceIndex = Math.min(2.5, (country.priceIndex || 1) + .002);
    }
    if (["luxury", "manufactured", "raw_textile", "construction"].includes(good.cat)) money += value * .28;
    if (good.chainFrom && country.goodsAccess?.[good.chainFrom]) money *= 1.18;
    if (tile.buildings.includes("farm")) food *= 1.35;
    if (tile.buildings.includes("market")) money *= 1.4;
    if (tile.buildings.includes("port")) money *= 1.25;
    if (tile.buildings.includes("fort")) military *= 1.3;
    if (tile.buildings.includes("workshop")) {
      money *= 1.2;
      military *= 1.2;
      if (country.technology.watermills) money *= 1.12;
    }
    money *= industry.money;
    military *= industry.military;
    if (country.technology.threeFieldSystem && good.cat === "food") food *= 1.08;
    if (country.technology.accounting) money *= 1.1;
    if (country.technology.standingArmy) military *= 1.2;
    if (country.technology.steamEngine && tile.buildings.includes("workshop")) {
      money *= 1.35;
      military *= 1.15;
    }
    if (country.technology.railways) {
      money *= 1.08;
      military *= 1.08;
    }
    // 财政制度调节地块产出流。
    const fiscal = fiscalEffect(country);
    if (fiscal) {
      if (fiscal.food) food *= fiscal.food;
      if (fiscal.money) money *= fiscal.money;
      if (fiscal.portMoney && tile.buildings.includes("port")) money *= fiscal.portMoney;
    }
    military *= militaryOutputFactor(country);
    const churchShare = country.faith?.secularized ? 0 : Math.max(0, Math.min(.35, tile.churchLandShare || 0));
    const church = Math.round(money * churchShare);
    money -= church;
    // 物价指数推升名义金钱产出流（价格革命：白银流入→物价上行）
    return {
      food: Math.round(food),
      money: Math.round(money),
      military: Math.round(military),
      market: Math.round(value),
      church,
      goods: { [goodKey]: Math.round(amount * 10) / 10 },
    };
  }

  function mergeGoods(target, goods) {
    for (const [key, value] of Object.entries(goods || {})) {
      target[key] = Math.round(((target[key] || 0) + value) * 10) / 10;
    }
    return target;
  }

  function normalizeGoodKey(key) {
    return window.HIFI_GOODS?.aliases?.[key] || key;
  }

  function countryProducesGood(world, polity, key) {
    const goodKey = normalizeGoodKey(key);
    const country = world.countries[polity];
    if ((country?.goodsAccess?.[goodKey] || 0) > 0) return true;
    return window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)
      .some(tile => normalizeGoodKey(tile.good) === goodKey);
  }

  function hasGoodAccess(world, polity, key) {
    const country = world.countries[polity];
    if (!country) throw new Error("未知国家");
    const goodKey = normalizeGoodKey(key);
    if (countryProducesGood(world, polity, goodKey)) return true;
    if (country.tradePolicy === "closed") return false;
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    return Object.keys(world.countries).some(other => {
      if (other === polity) return false;
      const partner = world.countries[other];
      if (partner.tradePolicy === "closed") return false;
      if (diplomacy?.embargoBetween?.(world, polity, other)) return false;
      return countryProducesGood(world, other, goodKey);
    });
  }

  function buildingAppliesToGood(building, goodKey) {
    return !building.goods?.length || building.goods.includes(goodKey);
  }

  function industryBonus(tile, good, goodKey) {
    const buildings = tile.buildings || [];
    let amount = 1;
    let money = 1;
    let military = 1;
    if (buildings.includes("mine") && buildingAppliesToGood(rules.buildings.mine, goodKey)) amount *= 1.35;
    if (buildings.includes("stable") && buildingAppliesToGood(rules.buildings.stable, goodKey)) amount *= 1.35;
    if (buildings.includes("lumberyard") && buildingAppliesToGood(rules.buildings.lumberyard, goodKey)) amount *= 1.3;
    if (buildings.includes("saltworks") && buildingAppliesToGood(rules.buildings.saltworks, goodKey)) amount *= 1.3;
    if (buildings.includes("vineyard") && buildingAppliesToGood(rules.buildings.vineyard, goodKey)) amount *= 1.3;
    if (buildings.includes("quarry") && buildingAppliesToGood(rules.buildings.quarry, goodKey)) amount *= 1.3;
    if (buildings.includes("workshop") && ["manufactured", "raw_textile"].includes(good.cat)) {
      amount *= 1.2;
      money *= 1.2;
      military *= 1.1;
    }
    return { amount, money, military };
  }

  function processPopulation(world, polity, report) {
    const country = world.countries[polity];
    const territory = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const need = Math.round(territory.reduce((sum, tile) => sum + (tile.population || 0), 0) * SUBSISTENCE_FOOD);
    const balance = report.food - need - report.maintenance.food;
    report.population = { need, balance, growth: 0, famine: 0 };
    if (balance > 0) {
      const growthPool = Math.min(0.25, balance * 0.006);
      for (const tile of territory) {
        const cap = Math.max(tile.basePopulation || tile.population || 1, tile.population || 1);
        tile.basePopulation = Math.round((cap + growthPool / Math.max(1, territory.length)) * 10) / 10;
        if ((tile.population || 0) < tile.basePopulation) {
          const gain = Math.min(0.08, tile.basePopulation - tile.population);
          tile.population = Math.round((tile.population + gain) * 10) / 10;
          report.population.growth = Math.round((report.population.growth + gain) * 10) / 10;
        }
      }
      country.famineSeasons = 0;
    } else if (balance < 0) {
      country.famineSeasons = (country.famineSeasons || 0) + 1;
      if (country.famineSeasons >= 2) {
        const lossPool = Math.min(0.18, Math.abs(balance) * 0.004);
        for (const tile of territory) {
          const loss = Math.min(tile.population * .02, Math.max(0.1, lossPool / Math.max(1, territory.length)));
          tile.population = Math.max(1, Math.round((tile.population - loss) * 10) / 10);
          report.population.famine = Math.round((report.population.famine + loss) * 10) / 10;
        }
        country.legitimacy = Math.max(0, country.legitimacy - 1);
      }
    } else {
      country.famineSeasons = 0;
    }
    return report.population;
  }

  function armyMaintenance(world, polity) {
    const armies = Object.values(world.warfare?.armies || {}).filter(a => a.owner === polity);
    let food = 0, military = 0;
    for (const army of armies) {
      for (const unit of army.units) {
        const k = unit.soldiers / 1000;
        food += MAINTENANCE.food * k;
        military += (MAINTENANCE.military[unit.serviceType] || 0) * k;
      }
    }
    return { food: Math.round(food), military: Math.round(military) };
  }

  function buildingMaintenance(world, polity) {
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const count = tiles.reduce((sum, tile) => sum + (tile.buildings?.length || 0), 0);
    return Math.round(count * MAINTENANCE.building);
  }

  function settleCountry(world, polity) {
    const country = world.countries[polity];
    const territory = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const report = territory.reduce((total, tile) => {
      const output = tileOutput(tile, country);
      total.food += output.food;
      total.money += output.money;
      total.military += output.military;
      total.market += output.market || 0;
      total.church += output.church || 0;
      mergeGoods(total.goods, output.goods);
      return total;
    }, { food: 0, money: 0, military: 0, market: 0, church: 0, goods: {}, tiles: territory.length });
    country.goodsAccess = { ...report.goods };
    country.hasHorseSource = (country.goodsAccess.horses || 0) > 0;
    report.marketSplit = marketSplit(country);
    report.marketEmbargoPenalty = embargoPenalty(world, polity);
    // 王权决定中央能从产出流里直接汲取多少（核心循环：王权→产出流分配阀）
    const central = .9 + Math.min(100, country.government?.centralPower ?? 60) / 500;
    // 军团/建筑维护费回灌产出流：扩军/铺建筑必须从产出里扣，逼出取舍（核心循环：基底→维护→产出净额）
    const army = armyMaintenance(world, polity);
    const maintenance = {
      food: army.food,
      military: army.military,
      money: buildingMaintenance(world, polity),
    };
    report.maintenance = maintenance;
    processPopulation(world, polity, report);
    if (country.faith && report.church) {
      country.faith.churchWealth = Math.round(((country.faith.churchWealth || 0) + report.church) * 10) / 10;
    }

    country.food += report.food - maintenance.food;
    // 封闭贸易牺牲对外商路、换取本土产出流加成（与下方 open 的对外收益互为取舍）
    const domesticMoney = country.tradePolicy === "closed" ? report.money * 1.05 : report.money;
    const moneyProd = Math.round(domesticMoney * central);
    country.money += moneyProd - maintenance.money;
    country.military += Math.round(report.military * central) - maintenance.military;
    if (country.tradePolicy === "open") {
      const tradeShare = fiscalEffect(country)?.tradeShare || 1;
      const trade = Math.max(2, Math.round((report.market || report.money) * report.marketSplit.trade * .48 * tradeShare * (1 - report.marketEmbargoPenalty)));
      country.money += trade;
      country.capital += Math.max(1, Math.round(trade * tradeCapitalRate(country)));
      report.trade = trade;
    }
    // 探索里程碑解锁的殖民收入流（核心循环：探索流→收入流）
    if (country.exploration?.colonial) {
      country.money += 6;
      country.capital += 2;
      report.colonial = 6;
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
    if (country.food < 0) {
      const armies = Object.values(world.warfare?.armies || {}).filter(a => a.owner === polity);
      armies.forEach(a => { a.supply = Math.max(0, a.supply - 10); });
      report.shortage = { ...(report.shortage || {}), food: -country.food };
      country.food = 0;
    }
    if (country.military < 0) {
      const armies = Object.values(world.warfare?.armies || {}).filter(a => a.owner === polity);
      armies.forEach(a => { a.organization = Math.max(0, a.organization - 8); });
      report.shortage = { ...(report.shortage || {}), military: -country.military };
      country.military = 0;
    }
    if (country.money < 0) {
      country.legitimacy = Math.max(0, country.legitimacy - 3);
      report.shortage = { ...(report.shortage || {}), money: -country.money };
      country.money = 0;
    }
    country.lastReport = report;
    country.log.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：粮 +${report.food}，钱 +${report.money}，军需 +${report.military}。`);
    return report;
  }

  function constructBuilding(world, polity, tileId, buildingKey) {
    const country = world.countries[polity];
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    const building = rules.buildings[buildingKey];
    const check = canConstructBuilding(world, polity, tileId, buildingKey);
    if (!check.ok) throw new Error(check.reason);
    country.money -= building.cost;
    country.actionPoints.administrative -= 1;
    tile.buildings.push(buildingKey);
    return tile;
  }

  function canConstructBuilding(world, polity, tileId, buildingKey) {
    const country = world.countries[polity];
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    const building = rules.buildings[buildingKey];
    if (!tile || tile.isSea || tile.polity !== polity) return { ok: false, reason: "只能在己方陆地建设" };
    if (!building) return { ok: false, reason: "未知建筑" };
    if (tile.buildings.includes(buildingKey)) return { ok: false, reason: "地块已有该建筑" };
    if (!buildingAppliesToGood(building, normalizeGoodKey(tile.good))) return { ok: false, reason: "该建筑不适合当前物产" };
    if (country.money < building.cost || country.actionPoints.administrative < 1) return { ok: false, reason: "建设资源不足" };
    return { ok: true, reason: "" };
  }

  function integrateTile(world, polity, tileId) {
    const country = world.countries[polity];
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    if (!tile || tile.isSea || tile.polity !== polity) throw new Error("只能整合己方陆地");
    if ((tile.control ?? 0) >= 100) throw new Error("该地块已完全整合");
    if (country.money < 20 || country.actionPoints.administrative < 1) throw new Error("整合资源不足");
    country.money -= 20;
    country.actionPoints.administrative -= 1;
    tile.control = Math.min(100, (tile.control ?? 0) + integrationGain(country));
    return tile;
  }

  // 资本池消费出口：把贸易流的蓄水池投入基底改造（核心循环：贸易流→资本→基底→更大产出流）
  function developTile(world, polity, tileId) {
    const country = world.countries[polity];
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    if (!tile || tile.isSea || tile.polity !== polity) throw new Error("只能开发己方陆地");
    if ((country.capital || 0) < 30) throw new Error("资本池不足（需 30）");
    if (country.actionPoints.administrative < 1) throw new Error("行政点不足");
    country.capital -= 30;
    country.actionPoints.administrative -= 1;
    tile.population = Math.round((tile.population + 1) * 10) / 10;
    tile.basePopulation = Math.max(tile.basePopulation || 0, tile.population); // 抬高人口恢复上限
    return tile;
  }

  function adoptTechnology(world, polity, key) {
    const country = world.countries[polity];
    const technology = rules.technologies[key];
    if (!technology) throw new Error("未知科技");
    const ready = technologyReady(world, country, key);
    if (!ready.ready) throw new Error(ready.reason);
    const domain = technology.domain || "cultural";
    country.research[domain] -= effectiveTechnologyCost(country, key);
    if (domain === "cultural") country.ideas = Math.max(0, Math.round(country.research[domain]));
    country.technology[key] = true;
    applyTechnologyEffect(world, country, key, technology);
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
    addResearch,
    autoAdoptReadyTechnologies,
    applyTechnologyEffect,
    armyMaintenance,
    buildingMaintenance,
    canConstructBuilding,
    constructBuilding,
    developTile,
    enactEdict,
    hasGoodAccess,
    initializeEconomy,
    integrateTile,
    ensureResearchState,
    fiscalEffect,
    frontierTechnologies,
    effectiveTechnologyCost,
    tradeCapitalRate,
    marketSplit,
    integrationGain,
    technologyReady,
    MAINTENANCE,
    setAgenda,
    setTradePolicy,
    settleCountry,
    tileOutput,
  };
})();

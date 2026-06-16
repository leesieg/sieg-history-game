(() => {
  "use strict";

  const combatTypes = new Set(["infantry", "cavalry", "artillery"]);
  const serviceTypes = new Set(["guard", "professional", "standing", "levy", "mercenary"]);

  function initializeWarfare(world) {
    world.warfare = {
      nextArmyId: 1,
      nextBattleId: 1,
      nextGeneralId: 1,
      armies: {},
      generals: {},
      battles: [],
      selectedArmy: null,
      planningArmy: null,
    };
    for (const country of Object.values(world.countries)) {
      country.warfare = { warExhaustion: 0 };
    }
    for (const tile of world.tiles) {
      tile.occupier = null;
      tile.occupation = 0;
      tile.devastation ||= 0;
    }
    for (const polity of ["法兰西王国", "英格兰王国", "奥斯曼贝伊国", "拜占庭帝国"]) {
      if (!world.countries[polity]) continue;
      const tile = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity).find(candidate => candidate.city)
        || window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)[0];
      createArmy(world, {
        owner: polity,
        tileId: tile.id,
        name: `${polity}主力军`,
        units: [
          { combatType: "infantry", serviceType: "levy", soldiers: 2400 },
          { combatType: "cavalry", serviceType: "guard", soldiers: 600 },
        ],
      });
    }
    const historicalWars = [
      ["英格兰王国", "法兰西王国", "百年战争"],
      ["奥斯曼贝伊国", "拜占庭帝国", "尼科米底亚围城"],
    ];
    for (const [attacker, defender, name] of historicalWars) {
      if (!world.countries[attacker] || !world.countries[defender]) continue;
      const target = window.HIFI_WORLD_ENGINE.controlledTiles(world, defender).find(tile => tile.city)
        || window.HIFI_WORLD_ENGINE.controlledTiles(world, defender)[0];
      declareWar(world, attacker, defender, target.id, name);
    }
    return world;
  }

  function armyTotalSoldiers(army) {
    return army.units.reduce((sum, unit) => sum + unit.soldiers, 0);
  }

  function createArmy(world, config) {
    if (!world.countries[config.owner]) throw new Error("军团所属国家不存在");
    if (!world.tiles.find(tile => tile.id === config.tileId && !tile.isSea)) throw new Error("军团必须位于陆地");
    if (!config.units?.length || config.units.some(unit => !combatTypes.has(unit.combatType) || !serviceTypes.has(unit.serviceType))) {
      throw new Error("军团编制无效");
    }
    const army = {
      id: `army-${world.warfare.nextArmyId++}`,
      owner: config.owner,
      tileId: config.tileId,
      name: config.name,
      units: config.units.map(unit => ({ experience: 0, maxSoldiers: unit.soldiers, sourceTileId: config.tileId, ...unit })),
      morale: 100,
      organization: 100,
      supply: 100,
      status: "ready",
      plannedPath: [],
      order: "hold",
      generalId: config.generalId || null,
      mercenaryLoyalty: config.mercenaryLoyalty,
      mercenaryWage: config.mercenaryWage,
      contractEndsTurn: config.contractEndsTurn,
    };
    world.warfare.armies[army.id] = army;
    return army;
  }

  function splitArmy(world, armyId) {
    const army = world.warfare.armies[armyId];
    if (!army || army.units.every(unit => unit.soldiers < 2)) throw new Error("军团规模不足，无法拆分");
    const units = army.units.map(unit => {
      const soldiers = Math.floor(unit.soldiers / 2);
      const splitMaximum = Math.floor((unit.maxSoldiers || unit.soldiers) / 2);
      unit.soldiers -= soldiers;
      unit.maxSoldiers = Math.max(unit.soldiers, splitMaximum);
      return { ...unit, soldiers, maxSoldiers: Math.max(soldiers, splitMaximum) };
    }).filter(unit => unit.soldiers > 0);
    const split = createArmy(world, {
      owner: army.owner,
      tileId: army.tileId,
      name: `${army.name}分遣队`,
      units,
      mercenaryLoyalty: army.mercenaryLoyalty,
      mercenaryWage: army.mercenaryWage === undefined ? undefined : army.mercenaryWage / 2,
      contractEndsTurn: army.contractEndsTurn,
    });
    if (army.mercenaryWage !== undefined) army.mercenaryWage /= 2;
    return split;
  }

  function mergeArmies(world, targetArmyId, sourceArmyId) {
    const target = world.warfare.armies[targetArmyId];
    const source = world.warfare.armies[sourceArmyId];
    if (!target || !source || target.id === source.id) throw new Error("军团不存在");
    if (target.owner !== source.owner || target.tileId !== source.tileId) throw new Error("只能合并同国同地军团");
    const targetMercenary = target.mercenaryLoyalty !== undefined;
    if (targetMercenary !== (source.mercenaryLoyalty !== undefined)) throw new Error("佣兵不能与国家军团合并");
    if (target.generalId && source.generalId && target.generalId !== source.generalId) throw new Error("两支军团均有将领，需先撤下一人");
    target.units.push(...source.units);
    target.generalId ||= source.generalId;
    if (targetMercenary) {
      target.mercenaryLoyalty = Math.min(target.mercenaryLoyalty, source.mercenaryLoyalty);
      target.mercenaryWage += source.mercenaryWage;
    }
    delete world.warfare.armies[sourceArmyId];
    return target;
  }

  function reinforceArmy(world, armyId) {
    const army = world.warfare.armies[armyId];
    if (!army) throw new Error("军团不存在");
    if (army.mercenaryLoyalty !== undefined) throw new Error("佣兵团不能使用国家补员");
    const country = world.countries[army.owner];
    let need = army.units.reduce((sum, unit) => sum + Math.max(0, (unit.maxSoldiers || unit.soldiers) - unit.soldiers), 0);
    if (!need) return 0;
    const reinforced = Math.min(need, Math.floor(country.military * 20));
    if (!reinforced) throw new Error("军需不足");
    country.military -= Math.ceil(reinforced / 20);
    let remaining = reinforced;
    for (const unit of army.units) {
      const add = Math.min(remaining, (unit.maxSoldiers || unit.soldiers) - unit.soldiers);
      unit.soldiers += add;
      remaining -= add;
    }
    return reinforced;
  }

  function trainArmy(world, armyId) {
    const army = world.warfare.armies[armyId];
    const country = world.countries[army?.owner];
    if (!army || !country) throw new Error("军团不存在");
    if (country.actionPoints.military < 1 || country.military < 10) throw new Error("训练资源不足");
    country.actionPoints.military -= 1;
    country.military -= 10;
    army.units.forEach(unit => { unit.experience = Math.min(5, (unit.experience || 0) + 1); });
    army.organization = Math.min(100, army.organization + 15);
    return army;
  }

  function demobilizeLevies(world, armyId) {
    const army = world.warfare.armies[armyId];
    if (!army) throw new Error("军团不存在");
    let returned = 0;
    army.units = army.units.filter(unit => {
      if (unit.serviceType !== "levy") return true;
      returned += unit.soldiers;
      const tile = world.tiles.find(item => item.id === unit.sourceTileId);
      if (tile) tile.population += unit.soldiers / 1000;
      return false;
    });
    if (!army.units.length) delete world.warfare.armies[armyId];
    return returned;
  }

  function rulerGeneral(world, polity) {
    const country = world.countries[polity];
    const id = `ruler-general:${polity}`;
    return world.warfare.generals[id] ||= {
      id,
      owner: polity,
      name: country.leader.name,
      command: country.leader.abilities.military,
      siege: Math.floor(country.leader.abilities.administrative / 2),
      ruler: true,
    };
  }

  function assignGeneral(world, armyId, generalId) {
    const army = world.warfare.armies[armyId];
    const general = world.warfare.generals[generalId];
    if (!army || !general || general.owner !== army.owner) throw new Error("将领不属于该国");
    if (army.mercenaryLoyalty !== undefined) throw new Error("佣兵团自带首领");
    Object.values(world.warfare.armies).forEach(candidate => {
      if (candidate.generalId === generalId) candidate.generalId = null;
    });
    army.generalId = generalId;
    return general;
  }

  function dismissGeneral(world, armyId) {
    const army = world.warfare.armies[armyId];
    if (!army) throw new Error("军团不存在");
    army.generalId = null;
  }

  function mobilizeArmy(world, polity, tileId, combatType = "infantry") {
    if (!["infantry", "cavalry", "artillery"].includes(combatType)) throw new Error("只能动员步兵、骑兵或炮兵");
    const tile = world.tiles.find(item => item.id === tileId);
    const country = world.countries[polity];
    if (!tile || tile.polity !== polity || tile.isSea) throw new Error("只能在己方陆地动员");
    if (country.actionPoints.military < 1) throw new Error("军事点不足");
    if (combatType === "artillery") {
      if (!canRecruitCombatType(world, polity, "artillery")) throw new Error("尚未掌握火炮技术");
      if (country.military < 30) throw new Error("铸炮需要军需 30");
      country.actionPoints.military -= 1;
      country.military -= 30;
      return createArmy(world, {
        owner: polity,
        tileId,
        name: `${tile.city || tile.region}炮队`,
        units: [{ combatType: "artillery", serviceType: "professional", soldiers: 300, sourceTileId: tileId }],
      });
    }
    if (tile.population < 2) throw new Error("地块人口不足以征召");
    const soldiers = combatType === "cavalry" ? 500 : 1200;
    country.actionPoints.military -= 1;
    // 动员法律调节征召的人口流成本（核心循环：法律→人口流→军队）
    const mobLaw = country.government?.laws?.mobilization;
    const levyCostFactor = window.HIFI_POLITICS_ENGINE?.lawEffects?.mobilization?.[mobLaw]?.levyCostFactor ?? 1;
    tile.population = Math.max(1, tile.population - soldiers / 1000 * levyCostFactor);
    return createArmy(world, {
      owner: polity,
      tileId,
      name: `${tile.city || tile.region}征召军`,
      units: [{ combatType, serviceType: "levy", soldiers, sourceTileId: tileId }],
    });
  }

  function hireMercenary(world, polity, tileId) {
    const country = world.countries[polity];
    const tile = world.tiles.find(item => item.id === tileId);
    if (!tile || tile.isSea || tile.polity !== polity) throw new Error("只能在己方陆地雇佣兵团");
    if (country.money < 40) throw new Error("雇佣兵需要 40 金钱");
    country.money -= 40;
    return createArmy(world, {
      owner: polity,
      tileId,
      name: "自由佣兵团",
      mercenaryLoyalty: 70,
      mercenaryWage: 20,
      contractEndsTurn: world.turn + 8,
      units: [
        { combatType: "infantry", serviceType: "mercenary", soldiers: 1500 },
        { combatType: "cavalry", serviceType: "mercenary", soldiers: 500 },
      ],
    });
  }

  function renewMercenary(world, armyId) {
    const army = world.warfare.armies[armyId];
    const country = world.countries[army?.owner];
    if (!army || army.mercenaryWage === undefined) throw new Error("该军团不是佣兵团");
    if (country.money < army.mercenaryWage) throw new Error("续约资金不足");
    country.money -= army.mercenaryWage;
    army.contractEndsTurn = world.turn + 8;
    army.mercenaryLoyalty = Math.min(100, army.mercenaryLoyalty + 5);
    return army;
  }

  function releaseMercenary(world, armyId) {
    if (world.warfare.armies[armyId]?.mercenaryWage === undefined) throw new Error("该军团不是佣兵团");
    delete world.warfare.armies[armyId];
  }

  function processMercenaryContracts(world) {
    for (const army of Object.values(world.warfare.armies)) {
      if (army.mercenaryWage === undefined) continue;
      const country = world.countries[army.owner];
      if (world.turn >= army.contractEndsTurn || army.mercenaryLoyalty <= 0) {
        delete world.warfare.armies[army.id];
      } else if (country.money >= army.mercenaryWage) {
        country.money -= army.mercenaryWage;
      } else {
        army.mercenaryLoyalty = Math.max(0, army.mercenaryLoyalty - 15);
      }
    }
  }

  function canRecruitCombatType(world, polity, type) {
    return type !== "artillery" || !!world.countries[polity].technology?.artillery;
  }

  function terrainMoveCost(tile) {
    if (tile.isSea || tile.terrain === "mountains") return Infinity;
    return { plains: 1, coast: 1, steppe: 1, forest: 2, hills: 2, wetland: 3, desert: 2 }[tile.terrain] || 1;
  }

  function neighbors(world, tileId) {
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    const distances = world.tiles
      .filter(candidate => candidate.id !== tileId && !candidate.isSea)
      .map(candidate => ({ id: candidate.id, distance: Math.hypot(candidate.x - tile.x, candidate.y - tile.y) }))
      .sort((a, b) => a.distance - b.distance);
    const nearest = distances[0]?.distance || 0;
    return distances.filter(item => item.distance <= nearest * 1.2).map(item => item.id);
  }

  function planArmyRoute(world, armyId, targetId) {
    const army = world.warfare.armies[armyId];
    if (!army) throw new Error("军团不存在");
    const queue = [[army.tileId, []]];
    const visited = new Set([army.tileId]);
    while (queue.length) {
      const [current, path] = queue.shift();
      for (const next of neighbors(world, current)) {
        if (visited.has(next) || terrainMoveCost(world.tiles.find(tile => tile.id === next)) === Infinity) continue;
        const nextPath = [...path, next];
        if (next === targetId) {
          army.plannedPath = nextPath;
          army.order = "march";
          return nextPath;
        }
        visited.add(next);
        queue.push([next, nextPath]);
      }
    }
    throw new Error("目标不可达");
  }

  function underTruce(world, a, b) {
    return world.diplomacy.truces.some(truce =>
      world.turn < truce.endsTurn
      && truce.parties.includes(a)
      && truce.parties.includes(b)
    );
  }

  function declareWarOn(world, attacker, defender, name) {
    if (!world.countries[defender]) throw new Error("目标国家不存在");
    if (attacker === defender) throw new Error("不能对本国宣战");
    const target = window.HIFI_WORLD_ENGINE.controlledTiles(world, defender).find(tile => tile.city)
      || window.HIFI_WORLD_ENGINE.controlledTiles(world, defender)[0];
    if (!target) throw new Error("目标国家没有可争夺的领土");
    return declareWar(world, attacker, defender, target.id, name || `${attacker}对${defender}的战争`);
  }

  function declareWar(world, attacker, defender, targetTileId, name = "边境战争") {
    if (areAtWar(world, attacker, defender)) throw new Error("双方已经交战");
    if (underTruce(world, attacker, defender)) throw new Error("停战协定期内不能宣战");
    const war = {
      id: `war-${world.diplomacy.nextId++}`,
      name,
      attackers: [attacker],
      defenders: [defender],
      primaryGoal: { tileId: targetTileId, claimant: attacker },
      score: 0,
      startedTurn: world.turn,
      participants: {
        [attacker]: { side: "attacker", warWill: 85, contribution: 0 },
        [defender]: { side: "defender", warWill: 85, contribution: 0 },
      },
    };
    world.diplomacy.wars.push(war);
    return war;
  }

  function areAtWar(world, a, b) {
    return world.diplomacy.wars.some(war =>
      war.attackers.includes(a) && war.defenders.includes(b)
      || war.attackers.includes(b) && war.defenders.includes(a)
    );
  }

  function executeMovementPhase(world) {
    const moved = [];
    for (const army of Object.values(world.warfare.armies)) {
      if (army.status !== "ready" || army.order !== "march" || !army.plannedPath.length) continue;
      const destination = army.plannedPath.shift();
      army.tileId = destination;
      army.organization = Math.max(20, army.organization - terrainMoveCost(world.tiles.find(tile => tile.id === destination)) * 4);
      if (!army.plannedPath.length) army.order = "hold";
      moved.push({ armyId: army.id, to: destination });
    }
    return moved;
  }

  function sidePower(world, armyIds, tile) {
    return armyIds.reduce((sum, id) => {
      const army = world.warfare.armies[id];
      const cavalryPenalty = ["forest", "hills", "wetland", "mountains"].includes(tile.terrain) ? .75 : 1.15;
      const composition = army.units.reduce((power, unit) => {
        const type = unit.combatType === "cavalry" ? 1.3 * cavalryPenalty : unit.combatType === "artillery" ? 1.5 : 1;
        return power + unit.soldiers * type * (1 + (unit.experience || 0) * .04);
      }, 0);
      const general = army.generalId ? world.warfare.generals[army.generalId] : null;
      const command = 1 + (general?.command || 0) * .02;
      return sum + composition * command * army.morale / 100 * army.organization / 100 * army.supply / 100;
    }, 0);
  }

  function applyCasualties(world, armyIds, amount) {
    const total = armyIds.reduce((sum, id) => sum + armyTotalSoldiers(world.warfare.armies[id]), 0);
    for (const id of armyIds) {
      const army = world.warfare.armies[id];
      const share = total ? armyTotalSoldiers(army) / total : 0;
      let remaining = Math.round(amount * share);
      for (const unit of army.units) {
        const loss = Math.min(unit.soldiers, Math.round(remaining * unit.soldiers / Math.max(1, armyTotalSoldiers(army))));
        unit.soldiers -= loss;
      }
      army.morale = Math.max(0, army.morale - 20);
      army.organization = Math.max(0, army.organization - 25);
      if (army.mercenaryLoyalty !== undefined && amount > 0) {
        army.mercenaryLoyalty = Math.max(0, army.mercenaryLoyalty - Math.ceil(amount / Math.max(1, total) * 20));
      }
    }
  }

  function resolveBattle(world, tileId, attackers, defenders) {
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    const attackPower = sidePower(world, attackers, tile);
    const defensePower = sidePower(world, defenders, tile) * 1.08;
    const attackerSoldiers = attackers.reduce((sum, id) => sum + armyTotalSoldiers(world.warfare.armies[id]), 0);
    const defenderSoldiers = defenders.reduce((sum, id) => sum + armyTotalSoldiers(world.warfare.armies[id]), 0);
    const attackerLoss = Math.max(1, Math.round(attackerSoldiers * (attackPower >= defensePower ? .08 : .18)));
    const defenderLoss = Math.max(1, Math.round(defenderSoldiers * (attackPower >= defensePower ? .2 : .09)));
    applyCasualties(world, attackers, attackerLoss);
    applyCasualties(world, defenders, defenderLoss);
    const winner = attackPower >= defensePower ? "attackers" : "defenders";
    const losingIds = winner === "attackers" ? defenders : attackers;
    losingIds.forEach(id => { world.warfare.armies[id].status = "routed"; });
    const totalLoss = attackerLoss + defenderLoss;
    tile.devastation = Math.min(100, tile.devastation + Math.max(5, Math.round(totalLoss / 300)));
    tile.population = Math.max(1, tile.population - Math.max(1, Math.round(totalLoss / 1000)));
    const battle = {
      id: `battle-${world.warfare.nextBattleId++}`,
      tileId,
      winner,
      casualties: { attackers: attackerLoss, defenders: defenderLoss },
    };
    world.warfare.battles.unshift(battle);
    return battle;
  }

  function advanceOccupation(world, armyId) {
    const army = world.warfare.armies[armyId];
    const tile = world.tiles.find(candidate => candidate.id === army.tileId);
    if (tile.polity === army.owner) return tile;
    if (!world.countries[tile.polity] || !areAtWar(world, army.owner, tile.polity)) return tile;
    const alreadyComplete = tile.occupier === army.owner && tile.occupation >= 100;
    tile.occupier = army.owner;
    tile.occupation = Math.min(100, tile.occupation + (tile.buildings.includes("fort") ? 50 : 100));
    tile.devastation = Math.min(100, tile.devastation + 3);
    if (!alreadyComplete && tile.occupation >= 100) {
      const defender = world.countries[tile.polity];
      defender.warfare.warExhaustion += Math.max(1, Math.round(tile.population / 4));
      const war = world.diplomacy.wars.find(item => item.primaryGoal.tileId === tile.id);
      if (war) war.score = Math.min(100, war.score + 25);
    }
    return tile;
  }

  function concludePeace(world, warId, actor, terms) {
    const war = world.diplomacy.wars.find(item => item.id === warId);
    if (!war) throw new Error("战争不存在");
    for (const term of terms) {
      if (term.type === "target_territory") {
        if (actor !== war.primaryGoal.claimant) throw new Error("只有战争目标提出方可以索取目标领土");
        if (war.score < 25) throw new Error("战争分数不足");
        const tile = world.tiles.find(candidate => candidate.id === war.primaryGoal.tileId);
        tile.polity = war.primaryGoal.claimant;
        if (
          tile.city === "君士坦丁堡"
          && war.primaryGoal.claimant === "奥斯曼贝伊国"
          && window.HIFI_HISTORY_ENGINE
          && !world.flags?.constantinopleFallen
        ) {
          window.HIFI_HISTORY_ENGINE.applyCausalChain(world, "constantinople_falls");
        }
      }
    }
    for (const tile of world.tiles) {
      tile.occupier = null;
      tile.occupation = 0;
    }
    world.diplomacy.wars = world.diplomacy.wars.filter(item => item.id !== warId);
    world.diplomacy.truces.push({ parties: [...war.attackers, ...war.defenders], endsTurn: world.turn + 20 });
  }

  function processWarfare(world) {
    processMercenaryContracts(world);
    executeMovementPhase(world);
    for (const army of Object.values(world.warfare.armies)) {
      if (army.status !== "ready") continue;
      const tile = world.tiles.find(candidate => candidate.id === army.tileId);
      const supplied = tile.polity === army.owner;
      army.supply = Math.max(0, Math.min(100, army.supply + (supplied ? 10 : -8)));
      if (army.supply < 25) army.morale = Math.max(0, army.morale - 8);
    }
    const armiesByTile = {};
    for (const army of Object.values(world.warfare.armies)) {
      if (army.status !== "ready") continue;
      (armiesByTile[army.tileId] ||= []).push(army);
    }
    for (const [tileId, armies] of Object.entries(armiesByTile)) {
      const war = world.diplomacy.wars.find(item =>
        armies.some(army => item.attackers.includes(army.owner))
        && armies.some(army => item.defenders.includes(army.owner))
      );
      if (!war) continue;
      const attackers = armies.filter(army => war.attackers.includes(army.owner)).map(army => army.id);
      const defenders = armies.filter(army => war.defenders.includes(army.owner)).map(army => army.id);
      if (attackers.length && defenders.length) resolveBattle(world, Number(tileId), attackers, defenders);
    }
    for (const army of Object.values(world.warfare.armies)) {
      if (army.status === "ready") advanceOccupation(world, army.id);
    }
  }

  window.HIFI_WARFARE_ENGINE = {
    advanceOccupation,
    assignGeneral,
    areAtWar,
    armyTotalSoldiers,
    canRecruitCombatType,
    concludePeace,
    createArmy,
    demobilizeLevies,
    declareWar,
    declareWarOn,
    underTruce,
    executeMovementPhase,
    dismissGeneral,
    hireMercenary,
    initializeWarfare,
    mergeArmies,
    mobilizeArmy,
    planArmyRoute,
    processWarfare,
    reinforceArmy,
    releaseMercenary,
    renewMercenary,
    resolveBattle,
    rulerGeneral,
    splitArmy,
    terrainMoveCost,
    trainArmy,
  };
})();

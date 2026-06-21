(() => {
  "use strict";

  // 每季全局 AI 新开战争上限，防止"全图同时开战"。优先离玩家近/强国之间的冲突先占额度。
  const AI_WAR_BUDGET = 2;

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
    pursueDiplomacy(world, polity);
    pursueWar(world, polity);
  }

  // AI 主动外交：与友好国缔结贸易协定，或向戒备的强邻派使节缓和（每季至多一项，防御式）
  function pursueDiplomacy(world, polity) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    if (!diplomacy || !world.diplomacy) return;
    const country = world.countries[polity];
    const targets = Object.keys(world.countries).filter(name => name !== polity);
    if (country.actionPoints.diplomatic > 0) {
      for (const target of targets) {
        const attitude = diplomacy.diplomaticAttitude(world, polity, target);
        if (!["close", "cooperative"].includes(attitude)) continue;
        if (diplomacy.treatyBetween(world, polity, target, "trade")) continue;
        const evaluation = diplomacy.evaluateProposal(world, polity, target, "trade");
        if (!evaluation.available || !evaluation.accepted) continue;
        try { diplomacy.proposeTreaty(world, polity, target, "trade"); return; } catch (error) { /* 容量/资源不足则跳过 */ }
      }
    }
    if (diplomacy.freeEnvoys(world, polity) > 0 && country.actionPoints.diplomatic > 0) {
      const tense = targets.find(target => ["wary", "rival", "hostile"].includes(diplomacy.diplomaticAttitude(world, polity, target)));
      if (tense) {
        try { diplomacy.startMission(world, polity, tense, "improve"); } catch (error) { /* 已有任务则跳过 */ }
      }
    }
  }

  // ===== AI 主动性（Phase A）：宣战 / 议和 / 索附属 =====
  // 全部走 warfare/diplomacy 现有引擎 API（自带停战期/容量/分数/阈值校验），AI 不直接改 state。

  // 国家综合实力（本地实现，不依赖 diplomacy 内部 countryStrength）：人口 + 领土 + 已编制军力折算。
  function powerScore(world, polity) {
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const population = tiles.reduce((sum, tile) => sum + (tile.population || 0), 0);
    return population + tiles.length * 3 + armyStrength(world, polity) / 200;
  }

  // 已编制军团总兵力
  function armyStrength(world, polity) {
    const warfare = window.HIFI_WARFARE_ENGINE;
    return Object.values(world.warfare?.armies || {})
      .filter(army => army.owner === polity)
      .reduce((sum, army) => sum + (warfare?.armyTotalSoldiers?.(army) || 0), 0);
  }

  // 是否接壤：a 的任一陆地地块的邻格属于 b。复用 warfare.neighbors（几何邻接）。
  function sharesBorder(world, a, b) {
    const warfare = window.HIFI_WARFARE_ENGINE;
    const worldEngine = window.HIFI_WORLD_ENGINE;
    if (!warfare?.neighbors || !worldEngine) return false;
    const bIds = new Set(worldEngine.controlledTiles(world, b).filter(tile => !tile.isSea).map(tile => tile.id));
    if (!bIds.size) return false;
    return worldEngine.controlledTiles(world, a)
      .filter(tile => !tile.isSea)
      .some(tile => warfare.neighbors(world, tile.id).some(id => bIds.has(id)));
  }

  // 盟约 / 互不侵犯 / 从属关系都禁止开战
  function isBound(world, a, b) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    return !!(diplomacy.treatyBetween(world, a, b, "alliance")
      || diplomacy.treatyBetween(world, a, b, "nonaggression")
      || diplomacy.subjectBetween(world, a, b));
  }

  function inAnyWar(world, polity) {
    return (world.diplomacy?.wars || []).some(war => war.participants?.[polity]);
  }

  // 选最该宣战的接壤邻国：军力占优、态度不友好、无停战/盟约、自身未被压着打。
  function warTarget(world, polity) {
    const warfare = window.HIFI_WARFARE_ENGINE;
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    const country = world.countries[polity];
    if (!warfare || !diplomacy || !world.diplomacy) return null;
    if ((country.pressures?.military || 0) >= 50) return null; // 自身军事压力高，不另开战
    if (inAnyWar(world, polity)) return null;                  // 已参战则不另开战
    const ownArmy = armyStrength(world, polity);
    if (ownArmy <= 0) return null;                             // 没有军队不主动宣战
    const candidates = Object.keys(world.countries).filter(name => {
      if (name === polity) return false;
      if (warfare.areAtWar(world, polity, name)) return false;
      if (warfare.underTruce(world, polity, name)) return false;
      if (isBound(world, polity, name)) return false;
      if (!sharesBorder(world, polity, name)) return false;
      if (["close", "cooperative"].includes(diplomacy.diplomaticAttitude(world, polity, name))) return false;
      return ownArmy >= armyStrength(world, name) * 1.2 + 1; // 军力须明显占优
    });
    if (!candidates.length) return null;
    const score = target => {
      const relation = diplomacy.relationView(world, polity, target);
      return (powerScore(world, polity) - powerScore(world, target)) * .5
        + (relation.territorialConflict || 0) * 2
        + (relation.threat || 0);
    };
    return candidates.sort((a, b) => score(b) - score(a))[0];
  }

  // 是否该求和：防守方被逼近战争目标/疲惫，或进攻方久攻不下/疲惫。
  function shouldSeekPeace(world, polity, war) {
    const part = war.participants?.[polity];
    if (!part) return false;
    const exhaustion = world.countries[polity].warfare?.warExhaustion || 0;
    const duration = world.turn - (war.startedTurn || world.turn);
    if (part.side === "defender") {
      return war.score >= 50 || (exhaustion >= 25 && war.score >= 25);
    }
    return (duration >= 12 && war.score < 25) || exhaustion >= 35;
  }

  // 选可索取附属的接壤弱邻（靠 evaluateProposal 阈值天然限流，平衡约束见 Phase E）。
  function subjectTarget(world, polity) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    if (!diplomacy) return null;
    const candidate = Object.keys(world.countries).find(name => {
      if (name === polity) return false;
      if (!sharesBorder(world, polity, name)) return false;
      if (diplomacy.subjectBetween(world, polity, name)) return false;
      const evaluation = diplomacy.evaluateProposal(world, polity, name, "tributary");
      return evaluation.available && evaluation.accepted;
    });
    return candidate || null;
  }

  function announceWar(world, polity, defender, kind) {
    const history = window.HIFI_HISTORY_ENGINE;
    if (!history?.pushWorldEvent) return;
    const text = kind === "declare" ? `${polity}向${defender}宣战`
      : kind === "annex" ? `${polity}击败${defender}并索取领土`
      : `${polity}与${defender}停战`;
    history.pushWorldEvent(world, text, "diplomacy");
  }

  // AI 战争行为：先结算已有战争（胜则索地、劣势则求和），再考虑新开战 / 索附属。
  function pursueWar(world, polity) {
    const warfare = window.HIFI_WARFARE_ENGINE;
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    const country = world.countries[polity];
    if (!warfare || !diplomacy || !world.diplomacy) return;

    for (const war of [...world.diplomacy.wars]) {
      const part = war.participants?.[polity];
      if (!part) continue;
      // 进攻方且已取胜 → 索取战争目标领土，结束战争
      if (part.side === "attacker" && polity === war.primaryGoal.claimant && war.score >= 50) {
        const defender = war.defenders?.[0];
        try { warfare.concludePeace(world, war.id, polity, [{ type: "target_territory" }]); announceWar(world, polity, defender, "annex"); continue; } catch (error) { /* 分数不足等 */ }
      }
      if (shouldSeekPeace(world, polity, war)) {
        const foe = (part.side === "attacker" ? war.defenders : war.attackers)?.[0];
        try { warfare.concludePeace(world, war.id, polity, [{ type: "truce" }]); announceWar(world, polity, foe, "peace"); } catch (error) { /* 战争已不存在等 */ }
      }
    }

    if (inAnyWar(world, polity)) return; // 仍在战争中则本季不另开新动作

    if (country.actionPoints.military > 0 && (world.__aiWarsThisQuarter || 0) < AI_WAR_BUDGET) {
      const target = warTarget(world, polity);
      if (target) {
        try {
          warfare.declareWarOn(world, polity, target);
          country.actionPoints.military -= 1;
          world.__aiWarsThisQuarter = (world.__aiWarsThisQuarter || 0) + 1;
          announceWar(world, polity, target, "declare");
          return;
        } catch (error) { /* 停战期/已交战等被引擎拒绝 */ }
      }
    }

    if (country.actionPoints.diplomatic > 0) {
      const subject = subjectTarget(world, polity);
      if (subject) {
        try { diplomacy.proposeSubject(world, polity, subject, "tributary"); } catch (error) { /* 容量/分数不足则跳过 */ }
      }
    }
  }

  function processAI(world) {
    world.__aiWarsThisQuarter = 0; // 每季重置全局开战预算
    Object.keys(world.countries).forEach(polity => processCountry(world, polity));
    return world;
  }

  window.HIFI_STRATEGY_ENGINE = {
    processAI,
    processCountry,
    warTarget,
    shouldSeekPeace,
    subjectTarget,
    powerScore,
    armyStrength,
    sharesBorder,
  };
})();

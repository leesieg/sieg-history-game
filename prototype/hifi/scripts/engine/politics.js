(() => {
  "use strict";

  const data = window.HIFI_COUNTRY_DATA;
  const institutions = window.HIFI_INSTITUTIONS;

  function turnForYear(year) {
    return (year - 1337) * 4 + 1;
  }

  function createGovernment(type) {
    const config = data.governments[type];
    if (!config) throw new Error(`未知政体：${type}`);
    const government = {
      type,
      typeLabel: config.label,
      powerName: config.powerName,
      centralPower: type === "monarchy" ? 62 : 55,
      reforms: { administrative: 1, fiscal: 1, military: 1, religious: 1, political: 1, maritime: 0 },
      assembly: { unlocked: config.assemblyUnlocked, type: config.assemblyType, support: config.assemblyUnlocked ? 46 : 0, agenda: "tax" },
      laws: {
        taxation: "customary",
        mobilization: "limited",
        religion: "toleration",
        authority: type === "republic" || type === "merchant_republic" ? "civic" : "dynastic",
      },
    };
    return syncGovernmentDerived(government);
  }

  function syncGovernmentDerived(government) {
    if (!institutions) return government;
    const derived = institutions.deriveGovernment(government.type, government);
    government.institutions = derived.institutions;
    government.archetype = derived.archetype;
    government.archetypeLabel = derived.archetypeLabel;
    government.typeLabel = derived.typeLabel;
    government.powerName = derived.powerName;
    government.title = derived.title;
    government.suffix = derived.suffix;
    government.estateKeys = derived.estateKeys;
    government.institutionLabels = derived.institutionLabels;
    return government;
  }

  function syncCountryDisplayName(country, rename = false) {
    syncGovernmentDerived(country.government);
    if (!country.displayName) country.displayName = country.name;
    if (rename && institutions) {
      country.displayName = institutions.displayNameFor(country.name, country.government.suffix || country.government.typeLabel);
    }
    return country.displayName;
  }

  function createEstates(type) {
    return Object.fromEntries(data.governments[type].estates.map(key => {
      const [label, power, satisfaction, privileges] = data.estates[key];
      return [key, { label, power, satisfaction, privileges: [...privileges] }];
    }));
  }

  function leaderFromRecord(polity, record, historyIndex = 0) {
    const config = data.leaders[polity];
    return {
      ...record,
      abilities: { ...record.abilities },
      historyIndex,
      succession: config.succession,
      termYears: config.termYears || null,
      termEndsAtTurn: config.termYears ? 1 + config.termYears * 4 : null,
      historicalEndAtTurn: turnForYear(record.endYear),
    };
  }

  function initializePolitics(world) {
    world.pendingElection = null;
    for (const [polity, country] of Object.entries(world.countries)) {
      const config = data.leaders[polity];
      const governmentType = config?.government || country.government?.type || "monarchy";
      if (config) {
        country.leader = leaderFromRecord(polity, config.history[0]);
      } else {
        country.leader = {
          ...country.leader,
          title: data.governments[governmentType]?.title || country.leader?.title || "统治者",
          succession: "hereditary",
          termYears: null,
          termEndsAtTurn: null,
          historicalEndAtTurn: null,
          historyIndex: -1,
        };
      }
      country.government = createGovernment(governmentType);
      country.estates = createEstates(governmentType);
      syncCountryDisplayName(country, false);
      country.decisionLedger = country.decisionLedger || [];
      country.introduction = data.introductions[polity] || `${polity}正处在 1337 年欧洲秩序重组的十字路口。`;
    }
    return world;
  }

  const lawOptions = {
    taxation: ["customary", "estate_exemptions", "uniform"],
    mobilization: ["limited", "levy", "standing"],
    religion: ["toleration", "orthodoxy", "reformed"],
    authority: ["dynastic", "civic", "constitutional", "absolute"],
  };

  // 法律对「流」与阶层满意的真实效果（核心循环：法律 = 挂在产出流/人口流上的调节阀）。
  // moneyMultiplier 被 economy.tileOutput 读取；levyCostFactor 被 warfare.mobilizeArmy 读取；
  // estate 增减在 setLaw 即时结算（喂议会支持，并为后续阶层惩罚铺垫）；requires 为颁布前置。
  // 阶层 key 因政体而异，只对存在的阶层生效（其余忽略）。
  const lawEffects = {
    taxation: {
      customary: { moneyMultiplier: 1, estate: {} },
      estate_exemptions: { moneyMultiplier: 0.85, estate: { nobles: 8, church: 8, patricians: 6, clergy: 6, port_nobles: 6 } },
      uniform: {
        moneyMultiplier: 1.15,
        requires: country => country.government.centralPower >= 50,
        why: "需要王权 ≥ 50 才能推行统一税制",
        estate: { nobles: -10, patricians: -8, peasants: 4, commons: 4, faithful: 4, sailors: 4, herders: 4 },
      },
    },
    mobilization: {
      limited: { levyCostFactor: 1, estate: {} },
      levy: { levyCostFactor: 0.7, estate: { peasants: -6, commons: -6, faithful: -6, sailors: -6, herders: -6 } },
      standing: {
        levyCostFactor: 1,
        requires: country => (country.government.reforms.fiscal || 0) >= 2,
        why: "需要财政改革 ≥ 2 才能维持常备军制",
        estate: {},
      },
    },
    religion: {
      toleration: { estate: { church: -6, clergy: -6, imperial_church: -6 } },
      orthodoxy: { estate: { church: 8, clergy: 8, imperial_church: 8 } },
      reformed: {
        requires: (country, world) => !!world.flags?.reformation,
        why: "需要宗教改革浪潮出现",
        estate: {},
      },
    },
    authority: {
      dynastic: { estate: {} },
      civic: { estate: { merchants: 8, citizens: 8, companies: 6, guilds: 4 }, powerCap: 70 },
      constitutional: { estate: {}, legitimacy: 4, powerCap: 60 },
      absolute: {
        requires: (country, world) => (country.government.reforms.fiscal || 0) >= 3 && eraReached(world, "absolutism"),
        why: "需要绝对主义纪元与财政改革 ≥ 3 才能集中绝对权力",
        estate: { nobles: -8, patricians: -8 },
        power: 8,
      },
    },
  };

  // 纪元改规则：部分决议/法律只在对应纪元开放（核心循环：转折层→可用机制）
  function eraReached(world, key) {
    const eras = window.HIFI_HISTORY_ENGINE?.eras;
    if (!eras) return true; // 历史引擎未加载时不施加纪元限制
    const index = eras.findIndex(era => era.key === key);
    return index < 0 || (world.eraIndex || 0) >= index;
  }

  const decisions = {
    estates_general: {
      label: "召开等级会议",
      can: country => country.government.type === "monarchy" && country.government.reforms.political >= 2,
      why: "需要君主制与政治改革 2",
      apply: country => {
        country.government.assembly.unlocked = true;
        country.government.assembly.type = "等级会议";
        country.government.assembly.support = 42;
        syncCountryDisplayName(country, true);
      },
    },
    fiscal_parliament: {
      label: "议会财政路线",
      can: country => country.government.assembly.unlocked && country.government.reforms.fiscal >= 2,
      why: "需要议会与财政改革 2",
      apply: country => {
        country.government.laws.taxation = "uniform";
        country.government.laws.authority = "constitutional";
        country.government.centralPower = Math.max(25, country.government.centralPower - 8);
        syncCountryDisplayName(country, true);
      },
    },
    fiscal_absolutism: {
      label: "绝对主义财政路线",
      can: (country, world) => country.government.reforms.fiscal >= 3 && country.government.centralPower >= 60 && eraReached(world, "absolutism"),
      why: "需要绝对主义纪元、财政改革 3 与权力 60",
      apply: country => {
        country.government.laws.taxation = "uniform";
        country.government.laws.authority = "absolute";
        country.government.centralPower = Math.min(100, country.government.centralPower + 10);
        syncCountryDisplayName(country, true);
      },
    },
    convert_reformed: {
      label: "接纳宗教改革",
      can: (country, world) => world.flags?.reformation && country.government.reforms.religious >= 2,
      why: "需要宗教改革出现与宗教改革槽 2",
      apply: (country, world) => {
        country.government.laws.religion = "reformed";
        window.HIFI_WORLD_ENGINE.controlledTiles(world, country.name).forEach(tile => { tile.religion = "新教"; });
      },
    },
    constitutional_monarchy: {
      label: "建立君主立宪",
      can: country => country.government.type === "monarchy"
        && country.government.assembly.unlocked
        && country.government.reforms.political >= 4,
      why: "需要议会与政治改革 4",
      apply: country => {
        country.government.laws.authority = "constitutional";
        country.government.centralPower = 45;
        syncCountryDisplayName(country, true);
      },
    },
    civic_republic: {
      label: "建立公民共和国",
      can: (country, world) => ["monarchy", "merchant_republic"].includes(country.government.type)
        && country.government.assembly.unlocked
        && country.government.reforms.political >= 5
        && eraReached(world, "revolution"),
      why: "需要革命纪元、议会与政治改革 5",
      government: "republic",
    },
  };

  function recordDecision(world, polity, key, label) {
    const entry = { turn: world.turn, key, label };
    world.countries[polity].decisionLedger.unshift(entry);
    return entry;
  }

  const clampSatisfaction = value => Math.max(-100, Math.min(100, value));

  function setLaw(world, polity, category, value) {
    const country = world.countries[polity];
    if (!lawOptions[category]?.includes(value)) throw new Error("未知法律");
    if (country.government.laws[category] === value) throw new Error("已是当前法律");
    if (country.actionPoints.administrative < 1) throw new Error("行政点不足");
    const effect = lawEffects[category]?.[value];
    if (effect?.requires && !effect.requires(country, world)) throw new Error(effect.why || "尚不满足颁布条件");
    country.actionPoints.administrative -= 1;
    country.government.laws[category] = value;
    if (effect) {
      for (const [estateKey, delta] of Object.entries(effect.estate || {})) {
        if (country.estates[estateKey]) {
          country.estates[estateKey].satisfaction = clampSatisfaction(country.estates[estateKey].satisfaction + delta);
        }
      }
      if (effect.legitimacy) country.legitimacy = Math.min(100, country.legitimacy + effect.legitimacy);
      if (effect.power) country.government.centralPower = Math.min(100, country.government.centralPower + effect.power);
      if (effect.powerCap) country.government.centralPower = Math.min(country.government.centralPower, effect.powerCap);
    }
    syncCountryDisplayName(country, true);
    recordDecision(world, polity, `law:${category}:${value}`, `颁布${category}法律：${value}`);
    return value;
  }

  function holdAssembly(world, polity, agenda = "tax", concession = "privilege") {
    const country = world.countries[polity];
    const assembly = country.government.assembly;
    if (!assembly.unlocked) throw new Error("当前政体没有议会");
    if (country.actionPoints.administrative < 1) throw new Error("行政点不足");
    if (concession === "money" && country.money < 12) throw new Error("国库不足以收买议会支持");
    country.actionPoints.administrative -= 1;
    const averageSatisfaction = Object.values(country.estates)
      .reduce((sum, estate) => sum + estate.satisfaction, 0) / Math.max(1, Object.keys(country.estates).length);
    const reform = country.government.reforms.political * 5;
    const concessionBonus = concession === "privilege" ? 15 : concession === "money" ? 10 : 0;
    const support = Math.round(averageSatisfaction * .55 + reform + concessionBonus);
    assembly.agenda = agenda;
    assembly.support = Math.min(100, support);
    if (concession === "money") country.money -= 12;
    if (concession === "privilege") {
      Object.values(country.estates).forEach(estate => { estate.power = Math.min(100, estate.power + 2); });
    }
    const passed = support >= 50;
    if (passed) country.legitimacy = Math.min(100, country.legitimacy + 3);
    syncCountryDisplayName(country, true);
    recordDecision(world, polity, `assembly:${agenda}`, `${assembly.type}表决${agenda}：${passed ? "通过" : "否决"}`);
    return { passed, support };
  }

  function enactDecision(world, polity, key) {
    const country = world.countries[polity];
    const decision = decisions[key];
    if (!decision) throw new Error("未知国家决议");
    if (!decision.can(country, world)) throw new Error(decision.why);
    if (decision.government) changeGovernment(world, polity, decision.government);
    else decision.apply(country, world);
    recordDecision(world, polity, key, decision.label);
    return decision;
  }

  function advanceReform(world, polity, key) {
    const country = world.countries[polity];
    if (!country.government.reforms.hasOwnProperty(key)) throw new Error(`未知改革槽：${key}`);
    if (country.government.reforms[key] >= 5) throw new Error("改革已满级");
    const costs = { administrative: ["money", 10], military: ["military", 10], political: ["legitimacy", 4], maritime: ["money", 10] };
    const cost = costs[key];
    if (cost) {
      if (country[cost[0]] < cost[1]) throw new Error("资源不足");
      country[cost[0]] -= cost[1];
    }
    country.government.reforms[key] = Math.min(5, country.government.reforms[key] + 1);
    syncGovernmentDerived(country.government);
    return country.government.reforms[key];
  }

  function changeGovernment(world, polity, type) {
    const country = world.countries[polity];
    country.government = createGovernment(type);
    country.estates = createEstates(type);
    const config = data.governments[type];
    syncCountryDisplayName(country, true);
    country.leader.title = country.government.title || config.title;
    country.leader.succession = config.succession;
    country.leader.termYears = config.termYears || null;
    country.leader.termEndsAtTurn = config.termYears ? world.turn + config.termYears * 4 : null;
    return country.government;
  }

  function generatedCandidate(world, polity, index, preserveDynasty = false) {
    const country = world.countries[polity];
    const names = ["安德烈亚", "洛伦佐", "弗朗切斯科"];
    const dynasties = ["孔塔里尼家族", "科尔纳罗家族", "莫罗西尼家族"];
    return {
      name: names[index],
      dynasty: preserveDynasty ? country.leader.dynasty : dynasties[index],
      title: country.leader.title,
      abilities: { administrative: 3 + index, diplomatic: 5 - index, military: 2 + index },
      succession: country.leader.succession,
      termYears: country.leader.termYears,
      termEndsAtTurn: country.leader.termYears ? world.turn + country.leader.termYears * 4 : null,
      historicalEndAtTurn: country.leader.termYears ? null : world.turn + 40,
      historyIndex: -1,
    };
  }

  function processLeadership(world, polity) {
    const country = world.countries[polity];
    if (!country?.leader) return null;
    const historicalDue = country.leader.historicalEndAtTurn !== null
      && world.turn >= country.leader.historicalEndAtTurn;
    const termDue = country.leader.termEndsAtTurn !== null
      && world.turn >= country.leader.termEndsAtTurn;
    if (!historicalDue && !termDue) return null;

    const config = data.leaders[polity];
    const nextHistoryIndex = country.leader.historyIndex + 1;
    const historicalSuccessor = country.leader.historyIndex >= 0
      ? config?.history[nextHistoryIndex]
      : null;
    if (historicalDue && historicalSuccessor) {
      country.leader = leaderFromRecord(polity, historicalSuccessor, nextHistoryIndex);
      return { type: "succession", polity, leader: country.leader };
    }

    if (country.leader.succession === "hereditary") {
      country.leader = generatedCandidate(world, polity, 0, true);
      return { type: "succession", polity, leader: country.leader };
    }

    if (polity !== world.playerPolity) {
      country.leader = generatedCandidate(world, polity, 0);
      return { type: "auto_election", polity, leader: country.leader };
    }

    world.pendingElection = {
      polity,
      reason: historicalDue ? "领导人去世选举" : "任期届满选举",
      candidates: [0, 1, 2].map(index => generatedCandidate(world, polity, index)),
    };
    return world.pendingElection;
  }

  // 阶层关联的资源流：不满阶层每季惩罚对应流（核心循环：满意度→流）
  const estateResource = {
    nobles: "military", patricians: "military", port_nobles: "military", princes: "military", court: "military", warriors: "military", orders: "military",
    merchants: "money", companies: "money", citizens: "money", guilds: "money", oligarchs: "money", cities: "money", governors: "money", bureaucrats: "money",
    church: "legitimacy", clergy: "legitimacy", imperial_church: "legitimacy", shamans: "legitimacy", legate: "legitimacy", kin: "legitimacy", speaker: "legitimacy",
    peasants: "food", commons: "food", faithful: "food", sailors: "food", herders: "food", clans: "food",
  };

  function processEstates(world, polity) {
    const country = world.countries[polity];
    if (!country.estates) return 0;
    syncGovernmentDerived(country.government);
    // 王权 ↔ 阶层权力此消彼长：高王权压低阶层权力，低王权放任坐大（核心循环：王权守恒）
    const power = country.government?.centralPower ?? 60;
    const powerDrift = power >= 60 ? -.5 : power <= 30 ? .5 : 0;
    const crownCost = power > 70;                       // 集权代价：高王权每季压低满意
    const inflationPain = (country.priceIndex || 1) > 1.2; // 通胀代价：高物价压低平民满意
    let unrest = 0;
    for (const [key, estate] of Object.entries(country.estates)) {
      const satisfaction = estate.satisfaction;
      if (satisfaction < -40) {
        const resource = estateResource[key] || "money";
        const deficit = -40 - satisfaction;             // 0..60，越不满惩罚越重
        const weight = 1 + (estate.power || 0) / 100;    // 越有权力的阶层闹得越凶
        const penalty = Math.round(deficit / 20 * weight);
        country[resource] = Math.max(0, (country[resource] || 0) - penalty);
        unrest += penalty;
      }
      // 满意度向 0 缓慢回归：一次性政策冲击会淡化，长期制度成本（流乘数）才持久
      if (satisfaction > 0) estate.satisfaction = Math.max(0, satisfaction - 1);
      else if (satisfaction < 0) estate.satisfaction = Math.min(0, satisfaction + 1);
      if (crownCost) estate.satisfaction = Math.max(-100, estate.satisfaction - 1);
      if (inflationPain && estateResource[key] === "food") estate.satisfaction = Math.max(-100, estate.satisfaction - 1);
      if (powerDrift) estate.power = Math.max(0, Math.min(100, (estate.power || 0) + powerDrift));
    }
    country.unrest = Math.max(0, Math.round((country.unrest || 0) * .85 + unrest));
    return country.unrest;
  }

  function completeElection(world, index) {
    if (!world.pendingElection) throw new Error("当前没有待处理选举");
    const candidate = world.pendingElection.candidates[index];
    if (!candidate) throw new Error("无效候选人");
    world.countries[world.pendingElection.polity].leader = candidate;
    world.pendingElection = null;
    return candidate;
  }

  window.HIFI_POLITICS_ENGINE = {
    advanceReform,
    changeGovernment,
    completeElection,
    createEstates,
    createGovernment,
    initializePolitics,
    processEstates,
    processLeadership,
    decisions,
    enactDecision,
    holdAssembly,
    lawEffects,
    lawOptions,
    setLaw,
  };
})();

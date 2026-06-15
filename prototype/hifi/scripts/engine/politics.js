(() => {
  "use strict";

  const data = window.HIFI_COUNTRY_DATA;

  function turnForYear(year) {
    return (year - 1337) * 4 + 1;
  }

  function createGovernment(type) {
    const config = data.governments[type];
    if (!config) throw new Error(`未知政体：${type}`);
    return {
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
      if (!config) continue;
      country.leader = leaderFromRecord(polity, config.history[0]);
      country.government = createGovernment(config.government);
      country.estates = createEstates(config.government);
      country.decisionLedger = [];
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

  const decisions = {
    estates_general: {
      label: "召开等级会议",
      can: country => country.government.type === "monarchy" && country.government.reforms.political >= 2,
      why: "需要君主制与政治改革 2",
      apply: country => {
        country.government.assembly.unlocked = true;
        country.government.assembly.type = "等级会议";
        country.government.assembly.support = 42;
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
      },
    },
    fiscal_absolutism: {
      label: "绝对主义财政路线",
      can: country => country.government.reforms.fiscal >= 3 && country.government.centralPower >= 60,
      why: "需要财政改革 3 与权力 60",
      apply: country => {
        country.government.laws.taxation = "uniform";
        country.government.laws.authority = "absolute";
        country.government.centralPower = Math.min(100, country.government.centralPower + 10);
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
      },
    },
    civic_republic: {
      label: "建立公民共和国",
      can: country => ["monarchy", "merchant_republic"].includes(country.government.type)
        && country.government.assembly.unlocked
        && country.government.reforms.political >= 5,
      why: "需要议会与政治改革 5",
      government: "republic",
    },
  };

  function recordDecision(world, polity, key, label) {
    const entry = { turn: world.turn, key, label };
    world.countries[polity].decisionLedger.unshift(entry);
    return entry;
  }

  function setLaw(world, polity, category, value) {
    const country = world.countries[polity];
    if (!lawOptions[category]?.includes(value)) throw new Error("未知法律");
    if (country.actionPoints.administrative < 1) throw new Error("行政点不足");
    country.actionPoints.administrative -= 1;
    country.government.laws[category] = value;
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
    return country.government.reforms[key];
  }

  function changeGovernment(world, polity, type) {
    const country = world.countries[polity];
    country.government = createGovernment(type);
    country.estates = createEstates(type);
    const config = data.governments[type];
    country.leader.title = config.title;
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
    processLeadership,
    decisions,
    enactDecision,
    holdAssembly,
    lawOptions,
    setLaw,
  };
})();

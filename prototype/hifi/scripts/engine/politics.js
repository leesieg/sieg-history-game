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
      legitimacy: 70,
      reforms: { administrative: 1, fiscal: 1, military: 1, religious: 1, political: 1, maritime: 0 },
      assembly: { unlocked: config.assemblyUnlocked, type: config.assemblyType, support: config.assemblyUnlocked ? 46 : 0, agenda: "tax" },
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
      country.introduction = data.introductions[polity] || `${polity}正处在 1337 年欧洲秩序重组的十字路口。`;
    }
    return world;
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
  };
})();

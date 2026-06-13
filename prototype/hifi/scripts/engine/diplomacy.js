(() => {
  "use strict";

  const treatyTypes = {
    trade: { label: "贸易协定", actionCost: 1, capacity: .5, duration: 16, base: 52, threshold: 50 },
    access: { label: "军事通行", actionCost: 1, capacity: .5, duration: 12, base: 48, threshold: 50 },
    marriage: { label: "王室联姻", actionCost: 1, capacity: 1, duration: 40, base: 45, threshold: 55 },
    nonaggression: { label: "互不侵犯", actionCost: 1, capacity: 1, duration: 20, base: 50, threshold: 55 },
    alliance: { label: "防御同盟", actionCost: 2, capacity: 2, duration: 24, base: 38, threshold: 60 },
  };

  const subjectTypes = {
    tributary: { label: "朝贡国", actionCost: 2, capacity: 1, base: 34, threshold: 58, autonomy: 78, loyalty: 62, tribute: 10 },
    vassal: { label: "附庸国", actionCost: 2, capacity: 1.5, base: 18, threshold: 62, autonomy: 48, loyalty: 55, tribute: 10 },
    puppet: { label: "傀儡国", actionCost: 3, capacity: 2, base: -4, threshold: 65, autonomy: 18, loyalty: 38, tribute: 20 },
  };

  const clamp = value => Math.max(0, Math.min(100, value));

  function pairKey(a, b) {
    if (!a || !b || a === b) throw new Error("双边关系需要两个不同国家");
    return [a, b].sort((left, right) => left.localeCompare(right, "zh-Hans-CN")).join("::");
  }

  function countryStrength(world, polity) {
    const country = world.countries[polity];
    const territory = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const population = territory.reduce((sum, tile) => sum + (tile.population || 0), 0);
    return population + territory.length * 3 + country.military / 10;
  }

  function initialSide(world, viewer, target) {
    const own = Math.max(1, countryStrength(world, viewer));
    const other = countryStrength(world, target);
    return {
      trust: 45,
      threat: clamp(4 + Math.round(Math.max(0, other / own - .75) * 18)),
      favor: 0,
      territorialConflict: 0,
      institutionalConflict: world.countries[viewer].government.type === world.countries[target].government.type ? 0 : 5,
      strategicInterest: 3,
      recentRefusalUntil: 0,
    };
  }

  function emptyLeaderRelation() {
    return { friendship: 0, respect: 0, fear: 0, grudge: 0, kinship: false, promise: null };
  }

  function initializeDiplomacy(world) {
    world.diplomacy = {
      nextId: 1,
      relations: {},
      treaties: [],
      missions: [],
      subjects: [],
      wars: [],
      truces: [],
      selectedTarget: Object.keys(world.countries).find(name => name !== world.playerPolity) || null,
      organizations: [{
        id: "hre",
        name: "神圣罗马帝国",
        leader: "神圣罗马帝国",
        members: { "神圣罗马帝国": "皇帝" },
      }],
    };
    for (const country of Object.values(world.countries)) {
      country.diplomacy = { envoys: 2 };
    }
    return world;
  }

  function relationFor(world, a, b) {
    const key = pairKey(a, b);
    if (!world.diplomacy.relations[key]) {
      world.diplomacy.relations[key] = {
        key,
        countries: [a, b],
        sides: {
          [a]: initialSide(world, a, b),
          [b]: initialSide(world, b, a),
        },
        leaders: {
          [a]: emptyLeaderRelation(),
          [b]: emptyLeaderRelation(),
        },
      };
    }
    return world.diplomacy.relations[key];
  }

  function relationView(world, viewer, target) {
    return relationFor(world, viewer, target).sides[viewer];
  }

  function leaderRelationView(world, viewer, target) {
    return relationFor(world, viewer, target).leaders[viewer];
  }

  function diplomaticAttitude(world, viewer, target) {
    const relation = relationView(world, viewer, target);
    const score = Math.round(
      relation.trust - 50
      + relation.strategicInterest * .7
      + relation.favor * .25
      - relation.threat * .65
      - relation.territorialConflict * .75
      - relation.institutionalConflict * .35
    );
    if (score >= 28) return "close";
    if (score >= 10) return "cooperative";
    if (score >= -12) return "neutral";
    if (score >= -30) return "wary";
    if (score >= -52) return "rival";
    return "hostile";
  }

  function capacity(world, polity) {
    const country = world.countries[polity];
    return 3
      + Math.floor(country.leader.abilities.diplomatic / 2)
      + Math.floor((country.government.reforms?.political || 0) / 2);
  }

  function treatyBetween(world, a, b, type = null) {
    return world.diplomacy.treaties.find(treaty =>
      treaty.parties.includes(a)
      && treaty.parties.includes(b)
      && (!type || treaty.type === type)
    );
  }

  function subjectBetween(world, a, b) {
    return world.diplomacy.subjects.find(subject =>
      subject.overlord === a && subject.subject === b
      || subject.overlord === b && subject.subject === a
    );
  }

  function capacityUsed(world, polity) {
    const treatyCost = world.diplomacy.treaties
      .filter(treaty => treaty.parties.includes(polity))
      .reduce((sum, treaty) => sum + treatyTypes[treaty.type].capacity, 0);
    const subjectCost = world.diplomacy.subjects
      .filter(subject => subject.overlord === polity)
      .reduce((sum, subject) => sum + subjectTypes[subject.type].capacity, 0);
    return treatyCost + subjectCost;
  }

  function freeEnvoys(world, polity) {
    const active = world.diplomacy.missions.filter(mission => mission.actor === polity).length;
    return Math.max(0, world.countries[polity].diplomacy.envoys - active);
  }

  function spendDiplomaticPoints(world, polity, cost) {
    const points = world.countries[polity].actionPoints;
    if (points.diplomatic < cost) throw new Error(`需要外交点 ${cost}`);
    points.diplomatic -= cost;
  }

  function startMission(world, actor, target, type = "improve") {
    if (actor === target) throw new Error("不能向本国派遣使节");
    if (freeEnvoys(world, actor) <= 0) throw new Error("没有空闲使节");
    if (world.diplomacy.missions.some(mission => mission.actor === actor && mission.target === target && mission.type === type)) {
      throw new Error("该使节任务已经在执行");
    }
    if (type === "calm_subject" && !world.diplomacy.subjects.some(subject => subject.overlord === actor && subject.subject === target)) {
      throw new Error("目标不是本国附属国");
    }
    spendDiplomaticPoints(world, actor, 1);
    const mission = { id: `mission-${world.diplomacy.nextId++}`, actor, target, type, startedTurn: world.turn };
    world.diplomacy.missions.push(mission);
    return mission;
  }

  function withdrawMission(world, actor, id) {
    const mission = world.diplomacy.missions.find(item => item.id === id);
    if (!mission || mission.actor !== actor) throw new Error("无法撤回该使节");
    world.diplomacy.missions = world.diplomacy.missions.filter(item => item.id !== id);
  }

  function performLeaderAction(world, actor, target, action) {
    const country = world.countries[actor];
    const targetView = relationView(world, target, actor);
    const targetLeader = leaderRelationView(world, target, actor);
    if (action === "gift" && country.money < 20) throw new Error("赠礼需要金钱 20");
    spendDiplomaticPoints(world, actor, 1);
    if (action === "gift") {
      country.money -= 20;
      targetView.trust = clamp(targetView.trust + 8);
      targetLeader.friendship = clamp(targetLeader.friendship + 5);
    } else if (action === "meeting") {
      targetLeader.friendship = clamp(targetLeader.friendship + 7);
      targetLeader.respect = clamp(targetLeader.respect + 6);
    } else if (action === "threaten") {
      targetView.threat = clamp(targetView.threat + 9);
      targetView.trust = clamp(targetView.trust - 5);
      targetLeader.fear = clamp(targetLeader.fear + 10);
      targetLeader.grudge = clamp(targetLeader.grudge + 7);
    } else {
      throw new Error("未知领导人外交行动");
    }
  }

  function evaluateProposal(world, actor, target, type) {
    const definition = treatyTypes[type] || subjectTypes[type];
    if (!definition) throw new Error("未知外交提案");
    if (actor === target) return { available: false, accepted: false, reason: "不能对本国提案", score: 0, threshold: 999 };
    if (treatyTypes[type] && treatyBetween(world, actor, target, type)) {
      return { available: false, accepted: false, reason: "契约已经存在", score: 0, threshold: 999 };
    }
    if (subjectTypes[type] && subjectBetween(world, actor, target)) {
      return { available: false, accepted: false, reason: "从属关系已经存在", score: 0, threshold: 999 };
    }
    const relation = relationView(world, target, actor);
    const leader = leaderRelationView(world, target, actor);
    const parts = [
      ["提案本身", definition.base],
      ["国家信任", Math.round((relation.trust - 50) * .7)],
      ["战略利益", Math.round(relation.strategicInterest * .55)],
      ["领导人关系", Math.round(leader.friendship * .35 + leader.respect * .25 - leader.grudge * .4)],
      ["国家威胁", -Math.round(relation.threat * .38)],
      ["领土矛盾", -Math.round(relation.territorialConflict * .42)],
      ["制度冲突", -Math.round(relation.institutionalConflict * .25)],
    ];
    if (subjectTypes[type]) {
      parts.push(["实力差距", Math.round((countryStrength(world, actor) - countryStrength(world, target)) / 2)]);
      parts.push(["主权损失", type === "tributary" ? -10 : type === "vassal" ? -24 : -42]);
    }
    const score = parts.reduce((sum, [, value]) => sum + value, 0);
    return { available: true, accepted: score >= definition.threshold, reason: "", score, threshold: definition.threshold, parts };
  }

  function proposeTreaty(world, actor, target, type) {
    const definition = treatyTypes[type];
    const evaluation = evaluateProposal(world, actor, target, type);
    if (!evaluation.available) throw new Error(evaluation.reason);
    spendDiplomaticPoints(world, actor, definition.actionCost);
    if (!evaluation.accepted) throw new Error(`对方拒绝：${evaluation.score} / ${evaluation.threshold}`);
    const treaty = {
      id: `treaty-${world.diplomacy.nextId++}`,
      type,
      parties: [actor, target],
      startedTurn: world.turn,
      minimumUntilTurn: world.turn + 4,
      endsTurn: world.turn + definition.duration,
    };
    world.diplomacy.treaties.push(treaty);
    relationView(world, actor, target).trust = clamp(relationView(world, actor, target).trust + 5);
    relationView(world, target, actor).trust = clamp(relationView(world, target, actor).trust + 5);
    return treaty;
  }

  function subjectTerms(autonomy) {
    if (autonomy >= 70) return { diplomacy: "完全独立", war: "自由宣战", military: "不强制参战", finance: "固定贡赋" };
    if (autonomy >= 40) return { diplomacy: "需宗主批准", war: "需宗主批准", military: "应召参战", finance: "固定贡赋" };
    return { diplomacy: "禁止独立外交", war: "仅可防御", military: "强制参战", finance: "收入比例" };
  }

  function proposeSubject(world, actor, target, type) {
    const definition = subjectTypes[type];
    const evaluation = evaluateProposal(world, actor, target, type);
    if (!evaluation.available) throw new Error(evaluation.reason);
    spendDiplomaticPoints(world, actor, definition.actionCost);
    if (!evaluation.accepted) throw new Error(`对方拒绝：${evaluation.score} / ${evaluation.threshold}`);
    const subject = {
      id: `subject-${world.diplomacy.nextId++}`,
      type,
      overlord: actor,
      subject: target,
      autonomy: definition.autonomy,
      loyalty: definition.loyalty,
      tribute: definition.tribute,
      terms: subjectTerms(definition.autonomy),
      startedTurn: world.turn,
    };
    world.diplomacy.subjects.push(subject);
    return subject;
  }

  function adjustSubjectControl(world, actor, id, direction) {
    const subject = world.diplomacy.subjects.find(item => item.id === id && item.overlord === actor);
    if (!subject) throw new Error("从属关系不存在");
    spendDiplomaticPoints(world, actor, 1);
    if (direction === "tighten") {
      subject.autonomy = clamp(subject.autonomy - 10);
      subject.loyalty = clamp(subject.loyalty - 12);
      subject.tribute += 1;
    } else if (direction === "loosen") {
      subject.autonomy = clamp(subject.autonomy + 10);
      subject.loyalty = clamp(subject.loyalty + 12);
      subject.tribute = Math.max(0, subject.tribute - 1);
    } else {
      throw new Error("未知从属控制方向");
    }
    subject.terms = subjectTerms(subject.autonomy);
    return subject;
  }

  function processDiplomacy(world) {
    for (const mission of world.diplomacy.missions) {
      if (mission.type === "improve") {
        const relation = relationView(world, mission.target, mission.actor);
        relation.trust = clamp(relation.trust + 4);
        relation.threat = clamp(relation.threat - 2);
      } else if (mission.type === "calm_subject") {
        const subject = world.diplomacy.subjects.find(item => item.overlord === mission.actor && item.subject === mission.target);
        if (subject) subject.loyalty = clamp(subject.loyalty + 4);
      }
    }
    world.diplomacy.treaties = world.diplomacy.treaties.filter(treaty => {
      if (world.turn >= treaty.endsTurn) return false;
      if (treaty.type === "trade") treaty.parties.forEach(party => { world.countries[party].money += 10; });
      return true;
    });
    for (const subject of world.diplomacy.subjects) {
      const subjectCountry = world.countries[subject.subject];
      const overlord = world.countries[subject.overlord];
      if (subject.loyalty < 25) {
        subject.autonomy = clamp(subject.autonomy + 3);
        continue;
      }
      const paid = Math.min(subject.tribute, subjectCountry.money);
      subjectCountry.money -= paid;
      overlord.money += paid;
    }
    for (const polity of Object.keys(world.countries)) {
      if (capacityUsed(world, polity) <= capacity(world, polity)) continue;
      world.countries[polity].actionPoints.diplomatic = Math.max(0, world.countries[polity].actionPoints.diplomatic - 1);
    }
    return world;
  }

  window.HIFI_DIPLOMACY_ENGINE = {
    adjustSubjectControl,
    capacity,
    capacityUsed,
    diplomaticAttitude,
    evaluateProposal,
    freeEnvoys,
    initializeDiplomacy,
    leaderRelationView,
    performLeaderAction,
    processDiplomacy,
    proposeSubject,
    proposeTreaty,
    relationView,
    startMission,
    subjectBetween,
    treatyBetween,
    treatyTypes,
    subjectTypes,
    withdrawMission,
  };
})();

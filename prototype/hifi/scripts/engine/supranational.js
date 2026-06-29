(() => {
  "use strict";

  const data = () => window.HIFI_SUPRANATIONAL_DATA.structures;
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

  function dynamicMembers(world, definition) {
    const members = Object.fromEntries(Object.entries(definition.members || {})
      .filter(([polity]) => world.countries[polity])
      .map(([polity, member]) => [polity, { ...member }]));
    if (!definition.confessions?.length) return members;
    for (const [polity, country] of Object.entries(world.countries)) {
      if (!definition.confessions.includes(country.stateConfession)) continue;
      members[polity] ||= { role: definition.memberRole || "成员", voteWeight: 1 };
    }
    return members;
  }

  function initialAuthority(world, id, definition) {
    return world.faith?.[id]?.authority ?? definition.authority;
  }

  function initialHead(world, id, definition) {
    return world.faith?.[id]?.head || definition.head || definition.emperor;
  }

  function initializeSupranational(world) {
    world.supranational ||= { structures: {} };
    for (const [id, definition] of Object.entries(data())) {
      const members = dynamicMembers(world, definition);
      if (!Object.keys(members).length) continue;
      const electors = (definition.electors || []).filter(polity => world.countries[polity] && members[polity]);
      world.supranational.structures[id] ||= {
        id,
        type: definition.type,
        name: definition.name,
        label: definition.label,
        authorityLabel: definition.authorityLabel,
        authority: initialAuthority(world, id, definition),
        head: initialHead(world, id, definition),
        emperor: world.countries[definition.emperor] ? definition.emperor : electors[0],
        electors,
        confessions: definition.confessions ? [...definition.confessions] : undefined,
        members,
        lastDrift: null,
      };
    }
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
    syncFaithAuthorities(world);
    return world;
  }

  function syncDiplomacyOrganizations(world) {
    if (!world.diplomacy) return;
    const currentIds = new Set(Object.keys(world.supranational?.structures || {}));
    const managedIds = new Set([...Object.keys(data()), ...(world.diplomacy.organizations || [])
      .filter(item => item.id?.startsWith("union:"))
      .map(item => item.id)]);
    const existing = new Map((world.diplomacy.organizations || [])
      .filter(item => !managedIds.has(item.id) || currentIds.has(item.id))
      .map(item => [item.id, item]));
    for (const structure of Object.values(world.supranational?.structures || {})) {
      existing.set(structure.id, {
        id: structure.id,
        name: structure.name,
        leader: structure.emperor || structure.head,
        members: Object.fromEntries(Object.entries(structure.members).map(([polity, member]) => [polity, member.role])),
      });
    }
    world.diplomacy.organizations = [...existing.values()];
  }

  function syncCountryMemberships(world) {
    for (const country of Object.values(world.countries)) country.supranational = {};
    for (const structure of Object.values(world.supranational?.structures || {})) {
      for (const [polity, member] of Object.entries(structure.members)) {
        world.countries[polity].supranational[structure.id] = {
          role: member.role,
          elector: (structure.electors || []).includes(polity),
          emperor: structure.emperor === polity,
          authority: structure.authority ?? structure.cohesion,
        };
      }
      if (structure.type === "dynastic" && world.countries[structure.head]) {
        world.countries[structure.head].supranational[structure.id] = {
          role: "主邦",
          elector: false,
          emperor: true,
          authority: structure.cohesion,
        };
      }
    }
  }

  function syncFaithAuthorities(world) {
    if (!world.faith) return;
    for (const id of ["papacy", "caliphate"]) {
      const item = structure(world, id);
      if (!item) continue;
      world.faith[id] ||= {};
      world.faith[id].head = item.head;
      world.faith[id].authority = item.authority;
    }
  }

  function structure(world, id = "hre") {
    return world.supranational?.structures?.[id] || null;
  }

  function isMember(world, polity, id = "hre") {
    return Boolean(structure(world, id)?.members?.[polity]);
  }

  function imperialPeaceActive(world, id = "hre") {
    const item = structure(world, id);
    return Boolean(item && item.type === "imperial" && item.authority >= 70);
  }

  function isImperialOutlaw(world, polity, id = "hre") {
    return Boolean(structure(world, id)?.members?.[polity]?.outlaw);
  }

  function imperialWarPermission(world, attacker, defender, id = "hre") {
    const item = structure(world, id);
    if (!item || item.type !== "imperial" || !item.members[attacker] || !item.members[defender]) {
      return { ok: true };
    }
    if (isImperialOutlaw(world, defender, id)) return { ok: true, reason: "帝国除籍" };
    if (item.emperor === attacker) return { ok: true };
    if (imperialPeaceActive(world, id)) {
      return { ok: false, reason: "帝国权威已强制帝国和平，成员不得私战" };
    }
    return { ok: true };
  }

  function imperialDefenderForWar(world, attacker, defender, id = "hre") {
    const item = structure(world, id);
    if (!item || item.type !== "imperial") return null;
    if (!item.members[defender] || item.members[attacker]) return null;
    if (item.authority < 35) return null;
    const emperor = item.emperor;
    if (!emperor || emperor === attacker || emperor === defender || !world.countries[emperor]) return null;
    return emperor;
  }

  function unionId(senior) {
    return `union:${senior}`;
  }

  function unionFor(world, polity) {
    return Object.values(world.supranational?.structures || {})
      .find(item => item.type === "dynastic" && (item.head === polity || item.members[polity]));
  }

  function unionsFor(world, polity) {
    return Object.values(world.supranational?.structures || {})
      .filter(item => item.type === "dynastic" && (item.head === polity || item.members[polity]));
  }

  function internalWars(world, item) {
    return (world.diplomacy?.wars || []).filter(war => {
      const attackers = war.attackers.filter(polity => item.members[polity]);
      const defenders = war.defenders.filter(polity => item.members[polity]);
      return attackers.length && defenders.length;
    });
  }

  function relationTrust(world, viewer, target) {
    if (!window.HIFI_DIPLOMACY_ENGINE?.relationView || viewer === target) return 50;
    return window.HIFI_DIPLOMACY_ENGINE.relationView(world, viewer, target).trust;
  }

  function canInherit(country) {
    const succession = country.government?.institutions?.succession || country.government?.succession;
    const type = country.government?.type;
    return ["hereditary", "elective_monarch", "imperial_elective", "court"].includes(succession)
      || ["monarchy", "empire"].includes(type);
  }

  function successionCrisisActive(world, polity) {
    const country = world.countries[polity];
    if (!country?.leader || !canInherit(country)) return false;
    if (unionFor(world, polity)) return false;
    if (country.absorbedBy) return false;
    const historicalDue = country.leader.historicalEndAtTurn !== null
      && world.turn >= country.leader.historicalEndAtTurn;
    const termDue = country.leader.termEndsAtTurn !== null
      && world.turn >= country.leader.termEndsAtTurn
      && canInherit(country);
    return Boolean(country.successionCrisis || historicalDue || termDue);
  }

  function dynasticClaimants(world, junior) {
    if (!window.HIFI_DIPLOMACY_ENGINE) return [];
    return Object.keys(world.countries)
      .filter(polity => polity !== junior && canInherit(world.countries[polity]))
      .filter(polity => !world.countries[polity].union?.junior)
      .map(polity => {
        const claims = window.HIFI_DIPLOMACY_ENGINE.claimsAgainst(world, polity, junior);
        const kinship = window.HIFI_DIPLOMACY_ENGINE.leaderRelationView(world, polity, junior)?.kinship
          || window.HIFI_DIPLOMACY_ENGINE.leaderRelationView(world, junior, polity)?.kinship;
        if (!claims.some(claim => claim.type === "dynastic") || !kinship) return null;
        const relation = window.HIFI_DIPLOMACY_ENGINE.relationView(world, junior, polity);
        const leader = world.countries[polity].leader?.abilities || {};
        const score = Math.round((relation.trust || 45)
          + (world.countries[polity].legitimacy || 50) * .35
          + (leader.diplomatic || 3) * 6
          + (leader.administrative || 3) * 2
          - (relation.threat || 0) * .2);
        return { polity, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.polity.localeCompare(b.polity, "zh-Hans-CN"));
  }

  function successionWarExists(world, junior) {
    return (world.diplomacy?.wars || []).some(war => war.goal?.type === "succession" && war.goal.target === junior);
  }

  function startSuccessionWar(world, claimant, rival, junior) {
    if (!window.HIFI_WARFARE_ENGINE || successionWarExists(world, junior)) return null;
    if (window.HIFI_WARFARE_ENGINE.areAtWar(world, claimant, rival)) return null;
    world.countries[claimant].warfare ||= { warExhaustion: 0 };
    world.countries[rival].warfare ||= { warExhaustion: 0 };
    world.countries[junior].warfare ||= { warExhaustion: 0 };
    const target = window.HIFI_WORLD_ENGINE.controlledTiles(world, junior).find(tile => tile.city)
      || window.HIFI_WORLD_ENGINE.controlledTiles(world, junior)[0];
    if (!target) return null;
    const war = window.HIFI_WARFARE_ENGINE.declareWar(
      world,
      claimant,
      rival,
      target.id,
      `${junior}继承战争`,
      { type: "succession", target: junior, tileId: target.id }
    );
    war.primaryGoal.successionTarget = junior;
    war.participants[junior] = { side: "defender", warWill: 45, contribution: 0 };
    world.countries[junior].successionCrisis = true;
    world.countries[junior].log?.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：继承危机引发 ${claimant} 与 ${rival} 的王位战争。`);
    return war;
  }

  function processDynasticSuccession(world) {
    for (const polity of Object.keys(world.countries)) {
      if (!successionCrisisActive(world, polity)) continue;
      const claimants = dynasticClaimants(world, polity);
      if (!claimants.length) continue;
      const [first, second] = claimants;
      if (!second || first.score >= second.score + 15) {
        const item = createPersonalUnion(world, first.polity, polity, "继承危机");
        world.countries[polity].successionCrisis = false;
        world.countries[polity].log?.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：${first.polity}继承王冠，${polity}进入共主邦联。`);
        continue;
      }
      startSuccessionWar(world, first.polity, second.polity, polity);
    }
  }

  function minTileDistance(world, a, b) {
    const left = window.HIFI_WORLD_ENGINE.controlledTiles(world, a);
    const right = window.HIFI_WORLD_ENGINE.controlledTiles(world, b);
    let best = Infinity;
    for (const l of left) {
      for (const r of right) {
        best = Math.min(best, Math.hypot((l.x || 0) - (r.x || 0), (l.y || 0) - (r.y || 0)));
      }
    }
    return best;
  }

  function commonWar(world, a, b) {
    return (world.diplomacy?.wars || []).some(war =>
      (war.attackers.includes(a) && war.attackers.includes(b))
      || (war.defenders.includes(a) && war.defenders.includes(b))
    );
  }

  function countryPopulation(world, polity) {
    return window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)
      .reduce((sum, tile) => sum + (tile.population || 0), 0);
  }

  function authorityDrift(world, id = "hre") {
    const item = structure(world, id);
    if (!item) return { delta: 0, parts: [] };
    const emperor = world.countries[item.emperor];
    const parts = [];
    if (emperor) parts.push(["皇帝合法性", emperor.legitimacy >= 55 ? 1 : -1]);
    const electorTrust = item.electors
      .filter(polity => polity !== item.emperor)
      .map(polity => relationTrust(world, polity, item.emperor));
    if (electorTrust.length) {
      const average = electorTrust.reduce((sum, value) => sum + value, 0) / electorTrust.length;
      parts.push(["选侯信任", average >= 55 ? 1 : average < 40 ? -1 : 0]);
    }
    const wars = internalWars(world, item).length;
    if (wars) parts.push(["帝国内战", -wars * 2]);
    const nonStateFaith = Object.keys(item.members)
      .filter(polity => world.countries[polity]?.stateConfession && world.countries[polity].stateConfession !== "catholic").length;
    if (nonStateFaith) parts.push(["信仰分裂", -nonStateFaith]);
    const delta = Math.max(-4, Math.min(3, parts.reduce((sum, [, value]) => sum + value, 0)));
    return { delta, parts };
  }

  function religiousAuthorityDrift(world, item) {
    const parts = [];
    const headExists = !item.head || world.countries[item.head];
    parts.push(["权威中心", headExists ? 1 : -2]);
    const members = Object.keys(item.members || {});
    parts.push(["信徒国规模", members.length >= 3 ? 1 : members.length ? 0 : -2]);
    const averagePiety = members
      .map(polity => world.countries[polity]?.faith?.piety)
      .filter(value => Number.isFinite(value));
    if (averagePiety.length) {
      const average = averagePiety.reduce((sum, value) => sum + value, 0) / averagePiety.length;
      parts.push(["信仰虔诚", average >= 60 ? 1 : average < 40 ? -1 : 0]);
    }
    const wars = internalWars(world, item).length;
    if (wars) parts.push(["信徒内战", -wars]);
    if (item.id === "papacy" && world.flags?.reformation) parts.push(["宗教改革冲击", -2]);
    const delta = Math.max(-4, Math.min(3, parts.reduce((sum, [, value]) => sum + value, 0)));
    return { delta, parts };
  }

  function electionScores(world, id = "hre") {
    const item = structure(world, id);
    if (!item) return [];
    return Object.keys(item.members).map(candidate => {
      const country = world.countries[candidate];
      const leader = country.leader?.abilities || {};
      const votes = item.electors.reduce((sum, elector) => {
        const member = item.members[elector];
        const trust = relationTrust(world, elector, candidate);
        const sameDynasty = world.countries[elector]?.leader?.dynasty === country.leader?.dynasty ? 8 : 0;
        return sum + (member.voteWeight || 1) * (trust + sameDynasty);
      }, 0);
      const score = Math.round(votes / Math.max(1, item.electors.length)
        + (country.legitimacy || 50) * .35
        + (leader.diplomatic || 3) * 6
        + (leader.military || 3) * 2
        + (candidate === item.emperor ? item.authority * .2 : 0));
      return { polity: candidate, score };
    }).sort((a, b) => b.score - a.score || a.polity.localeCompare(b.polity, "zh-Hans-CN"));
  }

  function summary(world, polity, id = "hre") {
    const item = structure(world, id);
    if (!item) return null;
    return {
      id,
      name: item.name,
      authority: item.authority,
      authorityLabel: item.authorityLabel,
      emperor: item.emperor,
      member: item.members[polity] || null,
      electors: item.electors,
      internalWars: internalWars(world, item).length,
      lastDrift: item.lastDrift,
      election: electionScores(world, id),
    };
  }

  function createPersonalUnion(world, senior, junior, reason = "继承") {
    if (!world.countries[senior] || !world.countries[junior] || senior === junior) throw new Error("共主邦联国家不存在");
    if (!canInherit(world.countries[senior]) || !canInherit(world.countries[junior])) throw new Error("只有君主制或选举君主制国家可以形成共主邦联");
    if (unionFor(world, junior)) throw new Error("目标已经处于共主邦联");
    world.supranational ||= { structures: {} };
    const id = unionId(senior);
    const existing = world.supranational.structures[id];
    const item = existing || {
      id,
      type: "dynastic",
      name: `${senior}共主邦联`,
      label: "共主邦联",
      authorityLabel: "向心力",
      head: senior,
      cohesion: 60,
      sharedRulerOf: [senior],
      members: {},
      lastDrift: null,
      integration: {},
    };
    item.members[junior] = { role: "从邦", joinedTurn: world.turn, reason };
    item.sharedRulerOf = [...new Set([senior, ...Object.keys(item.members)])];
    item.cohesion = clamp(Math.min(item.cohesion, 62));
    world.supranational.structures[id] = item;
    const seniorLeader = world.countries[senior].leader;
    world.countries[junior].union = { senior, junior: true, id };
    world.countries[junior].leader = {
      ...seniorLeader,
      title: world.countries[junior].leader?.title || seniorLeader.title,
      unionRuler: true,
      unionSenior: senior,
    };
    if (window.HIFI_DIPLOMACY_ENGINE) {
      const relation = window.HIFI_DIPLOMACY_ENGINE.relationView(world, junior, senior);
      relation.trust = clamp(Math.max(relation.trust, 55));
    }
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
    return item;
  }

  function claimPersonalUnion(world, senior, junior) {
    const seniorCountry = world.countries[senior];
    if (!seniorCountry || !world.countries[junior]) throw new Error("共主邦联国家不存在");
    if (seniorCountry.actionPoints.diplomatic < 2) throw new Error("宣告继承需要 2 外交点");
    const claims = window.HIFI_DIPLOMACY_ENGINE?.claimsAgainst(world, senior, junior) || [];
    const kinship = window.HIFI_DIPLOMACY_ENGINE?.leaderRelationView(world, senior, junior)?.kinship
      || window.HIFI_DIPLOMACY_ENGINE?.leaderRelationView(world, junior, senior)?.kinship;
    if (!claims.some(claim => claim.type === "dynastic") || !kinship) throw new Error("需要王朝纽带与王朝宣称");
    seniorCountry.actionPoints.diplomatic -= 2;
    return createPersonalUnion(world, senior, junior, "王朝继承");
  }

  function cohesionDrift(world, item) {
    const parts = [];
    const senior = world.countries[item.head];
    if (!senior) return { delta: -5, parts: [["主邦不存在", -5]] };
    const seniorFaith = senior.stateConfession || "catholic";
    const seniorInstitutions = senior.government?.institutions || {};
    const seniorPop = Math.max(1, countryPopulation(world, item.head));
    const leader = senior.leader?.abilities || {};
    parts.push(["共君外交", (leader.diplomatic || 3) >= 4 ? 1 : -1]);
    for (const junior of Object.keys(item.members)) {
      const country = world.countries[junior];
      if (!country) {
        parts.push([`${junior}已不存在`, -5]);
        continue;
      }
      if ((country.stateConfession || seniorFaith) !== seniorFaith) parts.push([`${junior}信仰差异`, -2]);
      const institutions = country.government?.institutions || {};
      if ((institutions.succession || country.government?.type) !== (seniorInstitutions.succession || senior.government?.type)) {
        parts.push([`${junior}制度差异`, -1]);
      }
      if (minTileDistance(world, item.head, junior) > 5) parts.push([`${junior}地理分离`, -1]);
      if (countryPopulation(world, junior) > seniorPop * .7) parts.push([`${junior}强从邦`, -2]);
      if (commonWar(world, item.head, junior)) parts.push([`${junior}共同战争`, 1]);
      const trust = relationTrust(world, junior, item.head);
      if (trust >= 65) parts.push([`${junior}信任`, 1]);
      if (trust < 35) parts.push([`${junior}不信任`, -1]);
    }
    const delta = Math.max(-6, Math.min(4, parts.reduce((sum, [, value]) => sum + value, 0)));
    return { delta, parts };
  }

  function dissolveUnion(world, id, reason = "向心力崩溃") {
    const item = structure(world, id);
    if (!item || item.type !== "dynastic") throw new Error("共主邦联不存在");
    for (const junior of Object.keys(item.members)) {
      const country = world.countries[junior];
      if (!country) continue;
      delete country.union;
      country.legitimacy = clamp((country.legitimacy || 50) - 6);
      country.log?.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：${reason}，${item.name}解体。`);
    }
    delete world.supranational.structures[id];
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
  }

  function integrateUnionMember(world, senior, junior) {
    const item = unionFor(world, junior);
    if (!item || item.head !== senior || !item.members[junior]) throw new Error("目标不是本国共主从邦");
    if (item.cohesion < 70) throw new Error("向心力不足，无法推进整合");
    const country = world.countries[senior];
    if (country.actionPoints.administrative < 2 || country.money < 30) throw new Error("整合需要 2 行政点与 30 金钱");
    country.actionPoints.administrative -= 2;
    country.money -= 30;
    item.integration[junior] = Math.min(100, (item.integration[junior] || 0) + 34);
    item.cohesion = clamp(item.cohesion - 4);
    if (item.integration[junior] >= 100) {
      for (const tile of window.HIFI_WORLD_ENGINE.controlledTiles(world, junior)) {
        tile.polity = senior;
        tile.control = Math.max(45, Math.min(tile.control || 70, 80));
      }
      delete item.members[junior];
      delete world.countries[junior].union;
      world.countries[junior].absorbedBy = senior;
      item.sharedRulerOf = [senior, ...Object.keys(item.members)];
      if (!Object.keys(item.members).length) delete world.supranational.structures[item.id];
    }
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
    return item;
  }

  function callImperialDiet(world, polity, id = "hre") {
    const item = structure(world, id);
    if (!item || item.emperor !== polity) throw new Error("只有皇帝可以召开帝国会议");
    const country = world.countries[polity];
    if (country.actionPoints.diplomatic < 1) throw new Error("召开帝国会议需要 1 外交点");
    if (item.authority < 12) throw new Error("帝国权威不足");
    country.actionPoints.diplomatic -= 1;
    item.authority = clamp(item.authority - 12);
    country.legitimacy = clamp(country.legitimacy + 4);
    for (const member of Object.keys(item.members)) {
      if (member === polity || !window.HIFI_DIPLOMACY_ENGINE) continue;
      window.HIFI_DIPLOMACY_ENGINE.relationView(world, member, polity).trust = clamp(relationTrust(world, member, polity) + 3);
    }
    syncCountryMemberships(world);
    return item;
  }

  function requestImperialMediation(world, polity, id = "hre") {
    const item = structure(world, id);
    if (!item || !item.members[polity]) throw new Error("只有帝国成员可以请求调停");
    if (item.emperor === polity) throw new Error("皇帝不需要请求自己调停");
    const country = world.countries[polity];
    if (country.actionPoints.diplomatic < 1) throw new Error("请求调停需要 1 外交点");
    if (item.authority < 6) throw new Error("帝国权威不足");
    country.actionPoints.diplomatic -= 1;
    item.authority = clamp(item.authority - 6);
    if (window.HIFI_DIPLOMACY_ENGINE) {
      window.HIFI_DIPLOMACY_ENGINE.relationView(world, polity, item.emperor).trust = clamp(relationTrust(world, polity, item.emperor) + 6);
    }
    country.legitimacy = clamp(country.legitimacy + 2);
    syncCountryMemberships(world);
    return item;
  }

  function raiseImperialArmy(world, emperor, id = "hre") {
    const item = structure(world, id);
    if (!item || item.type !== "imperial" || item.emperor !== emperor) throw new Error("只有皇帝可以征帝国军");
    if (item.authority < 70) throw new Error("帝国权威不足");
    if (!window.HIFI_WARFARE_ENGINE?.createArmy || !world.warfare) throw new Error("战争系统未初始化");
    const country = world.countries[emperor];
    if (country.actionPoints.military < 1) throw new Error("征帝国军需要 1 军事点");
    const musterTile = window.HIFI_WORLD_ENGINE.controlledTiles(world, emperor)
      .find(tile => tile.city && !tile.isSea)
      || window.HIFI_WORLD_ENGINE.controlledTiles(world, emperor).find(tile => !tile.isSea);
    if (!musterTile) throw new Error("皇帝没有可集结地块");
    const contributors = Object.keys(item.members)
      .filter(member => member !== emperor && world.countries[member]);
    if (!contributors.length) throw new Error("没有可集结的帝国成员");
    const soldiers = contributors.reduce((sum, member) => {
      const population = countryPopulation(world, member);
      return sum + Math.max(120, Math.round(population * 45));
    }, 0);
    country.actionPoints.military -= 1;
    item.authority = clamp(item.authority - 15);
    const army = window.HIFI_WARFARE_ENGINE.createArmy(world, {
      owner: emperor,
      tileId: musterTile.id,
      name: "帝国军",
      units: [{
        name: "帝国征召步兵",
        combatType: "infantry",
        serviceType: "levy",
        soldiers: Math.max(800, Math.min(5000, soldiers)),
        morale: 58,
        discipline: 48,
        equipment: 52,
      }],
    });
    army.imperial = true;
    army.contributors = contributors;
    syncCountryMemberships(world);
    return { army, contributors, authority: item.authority };
  }

  function declareImperialBan(world, emperor, target, id = "hre") {
    const item = structure(world, id);
    if (!item || item.type !== "imperial" || item.emperor !== emperor) throw new Error("只有皇帝可以帝国除籍");
    if (!item.members[target] || target === emperor) throw new Error("只能除籍其他帝国成员");
    const country = world.countries[emperor];
    if (country.actionPoints.diplomatic < 1) throw new Error("帝国除籍需要 1 外交点");
    if (item.authority < 25) throw new Error("帝国权威不足");
    country.actionPoints.diplomatic -= 1;
    item.authority = clamp(item.authority - 18);
    item.members[target].outlaw = true;
    item.members[target].role = item.members[target].role.includes("除籍")
      ? item.members[target].role
      : `${item.members[target].role}·帝国除籍`;
    if (window.HIFI_DIPLOMACY_ENGINE?.addClaim) {
      for (const member of Object.keys(item.members)) {
        if (member !== target) window.HIFI_DIPLOMACY_ENGINE.addClaim(world, member, target, "imperial_ban");
      }
    }
    if (window.HIFI_DIPLOMACY_ENGINE) {
      window.HIFI_DIPLOMACY_ENGINE.relationView(world, target, emperor).trust = Math.max(0, relationTrust(world, target, emperor) - 12);
    }
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
    return item;
  }

  function processSupranational(world) {
    if (!world.supranational?.structures) return world;
    processDynasticSuccession(world);
    for (const item of Object.values(world.supranational.structures)) {
      if (item.type === "dynastic") {
        const drift = cohesionDrift(world, item);
        item.cohesion = clamp(item.cohesion + drift.delta);
        item.lastDrift = drift;
        for (const junior of Object.keys(item.members)) {
          const country = world.countries[junior];
          if (!country) continue;
          country.union = { senior: item.head, junior: true, id: item.id };
          if (item.cohesion < 25) country.unrest = clamp((country.unrest || 0) + 2);
        }
        if (item.cohesion <= 0) dissolveUnion(world, item.id);
        continue;
      }
      if (item.type === "religious") {
        item.members = dynamicMembers(world, data()[item.id]);
        const drift = religiousAuthorityDrift(world, item);
        item.authority = clamp(item.authority + drift.delta);
        item.lastDrift = drift;
        continue;
      }
      const drift = authorityDrift(world, item.id);
      item.authority = clamp(item.authority + drift.delta);
      item.lastDrift = drift;
      const election = electionScores(world, item.id)[0];
      if (election && election.polity !== item.emperor && election.score >= (electionScores(world, item.id)[1]?.score || 0) + 18) {
        item.heir = election.polity;
      } else {
        item.heir = null;
      }
    }
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
    syncFaithAuthorities(world);
    return world;
  }

  window.HIFI_SUPRANATIONAL_ENGINE = {
    callImperialDiet,
    claimPersonalUnion,
    createPersonalUnion,
    declareImperialBan,
    dissolveUnion,
    electionScores,
    integrateUnionMember,
    initializeSupranational,
    imperialPeaceActive,
    imperialDefenderForWar,
    imperialWarPermission,
    isImperialOutlaw,
    isMember,
    processSupranational,
    processDynasticSuccession,
    requestImperialMediation,
    raiseImperialArmy,
    structure,
    summary,
    unionFor,
    unionsFor,
  };
})();

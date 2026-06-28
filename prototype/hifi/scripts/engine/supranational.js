(() => {
  "use strict";

  const data = () => window.HIFI_SUPRANATIONAL_DATA.structures;
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

  function initializeSupranational(world) {
    world.supranational ||= { structures: {} };
    for (const [id, definition] of Object.entries(data())) {
      const members = Object.fromEntries(Object.entries(definition.members)
        .filter(([polity]) => world.countries[polity])
        .map(([polity, member]) => [polity, { ...member }]));
      if (!Object.keys(members).length) continue;
      const electors = definition.electors.filter(polity => world.countries[polity] && members[polity]);
      world.supranational.structures[id] ||= {
        id,
        type: definition.type,
        name: definition.name,
        label: definition.label,
        authorityLabel: definition.authorityLabel,
        authority: definition.authority,
        emperor: world.countries[definition.emperor] ? definition.emperor : electors[0],
        electors,
        members,
        lastDrift: null,
      };
    }
    syncDiplomacyOrganizations(world);
    syncCountryMemberships(world);
    return world;
  }

  function syncDiplomacyOrganizations(world) {
    if (!world.diplomacy) return;
    const existing = new Map((world.diplomacy.organizations || []).map(item => [item.id, item]));
    for (const structure of Object.values(world.supranational?.structures || {})) {
      existing.set(structure.id, {
        id: structure.id,
        name: structure.name,
        leader: structure.emperor,
        members: Object.fromEntries(Object.entries(structure.members).map(([polity, member]) => [polity, member.role])),
      });
    }
    world.diplomacy.organizations = [...existing.values()];
  }

  function syncCountryMemberships(world) {
    for (const country of Object.values(world.countries)) country.supranational ||= {};
    for (const structure of Object.values(world.supranational?.structures || {})) {
      for (const [polity, member] of Object.entries(structure.members)) {
        world.countries[polity].supranational[structure.id] = {
          role: member.role,
          elector: structure.electors.includes(polity),
          emperor: structure.emperor === polity,
          authority: structure.authority,
        };
      }
    }
  }

  function structure(world, id = "hre") {
    return world.supranational?.structures?.[id] || null;
  }

  function isMember(world, polity, id = "hre") {
    return Boolean(structure(world, id)?.members?.[polity]);
  }

  function internalWars(world, item) {
    return (world.diplomacy?.wars || []).filter(war => {
      const attackers = war.attackers.filter(polity => item.members[polity]);
      const defenders = war.defenders.filter(polity => item.members[polity]);
      return attackers.length && defenders.length;
    });
  }

  function relationTrust(world, viewer, target) {
    if (!window.HIFI_DIPLOMACY_ENGINE || viewer === target) return 50;
    return window.HIFI_DIPLOMACY_ENGINE.relationView(world, viewer, target).trust;
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

  function processSupranational(world) {
    if (!world.supranational?.structures) return world;
    for (const item of Object.values(world.supranational.structures)) {
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
    return world;
  }

  window.HIFI_SUPRANATIONAL_ENGINE = {
    callImperialDiet,
    electionScores,
    initializeSupranational,
    isMember,
    processSupranational,
    requestImperialMediation,
    structure,
    summary,
  };
})();

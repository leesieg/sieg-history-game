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
      assembly: { unlocked: config.assemblyUnlocked, type: config.assemblyType, support: config.assemblyUnlocked ? 46 : 0, agenda: "tax" },
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

  function estateFromKey(key, scale = 1) {
    const [label, power, satisfaction, privileges] = data.estates[key];
    return { label, power: Math.max(8, Math.round(power * scale)), satisfaction, privileges: [...privileges] };
  }

  const estateFamilies = {
    nobles: "coercion",
    patricians: "coercion",
    port_nobles: "coercion",
    court: "coercion",
    princes: "coercion",
    clans: "coercion",
    warriors: "coercion",
    church: "faith",
    clergy: "faith",
    orders: "faith",
    faithful: "faith",
    legate: "faith",
    shamans: "faith",
    imperial_church: "faith",
    merchants: "capital",
    companies: "capital",
    guilds: "capital",
    oligarchs: "capital",
    cities: "capital",
    governors: "state",
    bureaucrats: "state",
    speaker: "state",
    peasants: "common",
    commons: "common",
    citizens: "common",
    herders: "common",
    kin: "common",
    sailors: "common",
  };

  function estateFamily(key) {
    return estateFamilies[key] || key;
  }

  function estateTotal(estates) {
    return Object.values(estates || {}).reduce((sum, estate) => sum + (estate.power || 0), 0);
  }

  function estateKeysFor(country) {
    const required = new Set(data.governments[country.government.type]?.estates || []);
    for (const key of country.government.estateKeys || []) required.add(key);
    return [...required];
  }

  function deriveEstates(country) {
    syncGovernmentDerived(country.government);
    return Object.fromEntries(estateKeysFor(country).map(key => [key, seededEstate(country, key)]));
  }

  function seededEstate(country, key, scale = 1) {
    const estate = estateFromKey(key, scale);
    const seed = country.estateSeed?.[key] || {};
    return {
      ...estate,
      power: seed.power ?? estate.power,
      satisfaction: seed.satisfaction ?? estate.satisfaction,
    };
  }

  function normalizeEstatePower(estates, targetTotal) {
    const keys = Object.keys(estates);
    if (!keys.length || targetTotal <= 0) return;
    const currentTotal = estateTotal(estates);
    if (currentTotal <= 0) return;
    let allocated = 0;
    keys.forEach((key, index) => {
      const next = index === keys.length - 1
        ? Math.max(0, Math.round(targetTotal - allocated))
        : Math.max(0, Math.round(estates[key].power * targetTotal / currentTotal));
      estates[key].power = next;
      allocated += next;
    });
  }

  function reconcileEstates(country) {
    if (!country.estates) return country.estates;
    syncGovernmentDerived(country.government);
    const required = estateKeysFor(country);
    const previousTotal = estateTotal(country.estates);
    const removed = Object.entries(country.estates).filter(([key]) => !required.includes(key));
    for (const key of required) {
      if (!country.estates[key]) country.estates[key] = seededEstate(country, key, .55);
    }
    for (const [removedKey, removedEstate] of removed) {
      const sameFamily = required.filter(key => key !== removedKey && estateFamily(key) === estateFamily(removedKey));
      const recipients = sameFamily.length ? sameFamily : required;
      const share = recipients.length ? (removedEstate.power || 0) / recipients.length : 0;
      for (const key of recipients) country.estates[key].power += share;
      delete country.estates[removedKey];
    }
    normalizeEstatePower(country.estates, previousTotal || estateTotal(country.estates));
    country.lastEstateReconciliation = required.filter(key => country.estates[key]);
    return country.estates;
  }

  function setInstitution(country, axis, value) {
    country.government.institutions ||= {};
    if (axis === "fiscal") {
      country.government.institutions.fiscal = value;
    } else if (axis === "military") {
      country.government.institutions.military = value;
    } else if (axis === "assembly") {
      const current = country.government.institutions.assembly || {};
      country.government.institutions.assembly = { ...current, type: value };
      country.government.assembly.unlocked = value !== "none";
      country.government.assembly.type = value === "parliamentary" ? "议会" : value === "estates_general" ? "等级会议" : "无议会";
    }
    syncCountryDisplayName(country, true);
    reconcileEstates(country);
  }

  function createEstates(type) {
    return Object.fromEntries(data.governments[type].estates.map(key => [key, estateFromKey(key)]));
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
      country.estates = deriveEstates(country);
      syncCountryDisplayName(country, false);
      reconcileEstates(country);
      country.decisionLedger = country.decisionLedger || [];
      country.introduction = data.introductions[polity] || `${polity}正处在 1337 年欧洲秩序重组的十字路口。`;
    }
    return world;
  }

  // 纪元改规则：部分决议与制度抉择只在对应纪元开放（核心循环：转折层→可用机制）
  function eraReached(world, key) {
    const eras = window.HIFI_HISTORY_ENGINE?.eras;
    if (!eras) return true; // 历史引擎未加载时不施加纪元限制
    const index = eras.findIndex(era => era.key === key);
    return index < 0 || (world.eraIndex || 0) >= index;
  }

  function institutionUnlocked(country, axis, value) {
    if (!axis || !value) return true;
    return Object.entries(window.HIFI_RULES?.technologies || {}).some(([key, technology]) =>
      country.technology?.[key]
      && technology.unlockInstitution?.[0] === axis
      && technology.unlockInstitution?.[1] === value
    );
  }

  function sovereignTransitionUnlocked(world, country) {
    return Boolean(world.flags?.westphalia || world.flags?.intraChristianReligiousWarsDisabled)
      && institutionUnlocked(country, "assembly", "parliamentary");
  }

  const decisions = {
    estates_general: {
      label: "召开等级会议",
      can: country => country.government.type === "monarchy" && country.government.institutions?.assembly?.type === "none",
      why: "需要君主制且尚未建立议会制度",
      apply: country => {
        country.government.assembly.unlocked = true;
        country.government.assembly.type = "等级会议";
        country.government.assembly.support = 42;
        country.government.institutions ||= {};
        country.government.institutions.assembly = { type: "estates_general", cadence: 8 };
        syncCountryDisplayName(country, true);
        reconcileEstates(country);
      },
    },
    fiscal_parliament: {
      label: "议会财政路线",
      can: country => country.government.assembly.unlocked
        && country.government.institutions?.assembly?.type !== "none"
        && institutionUnlocked(country, "fiscal", "direct"),
      why: "需要已建立议会制度，并掌握可支撑直接征税的财政科技",
      apply: country => {
        country.government.institutions ||= {};
        country.government.institutions.fiscal = "direct";
        country.government.centralPower = Math.max(25, country.government.centralPower - 8);
        syncCountryDisplayName(country, true);
        reconcileEstates(country);
      },
    },
    fiscal_absolutism: {
      label: "绝对主义财政路线",
      can: (country, world) => country.government.centralPower >= 70
        && eraReached(world, "absolutism")
        && institutionUnlocked(country, "fiscal", "direct"),
      why: "需要绝对主义纪元、王权 70，并掌握可支撑直接征税的财政科技",
      apply: country => {
        country.government.institutions ||= {};
        country.government.institutions.fiscal = "direct";
        country.government.centralPower = Math.min(100, country.government.centralPower + 10);
        syncCountryDisplayName(country, true);
        reconcileEstates(country);
      },
    },
    convert_reformed: {
      label: "接纳宗教改革",
      can: (country, world) => !!world.flags?.reformation,
      why: "需要宗教改革浪潮出现",
      apply: (country, world) => {
        country.stateConfession = "lutheran";
        country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false };
        if (!window.HIFI_FAITH_ENGINE?.secularizeChurchLands?.(world, country.name, "接纳宗教改革并世俗化教产")) {
          country.faith.secularized = true;
        }
        window.HIFI_WORLD_ENGINE.controlledTiles(world, country.name).forEach(tile => {
          tile.confession = "lutheran";
          tile.religion = window.HIFI_FAITH_ENGINE?.confessionLabel?.("lutheran") || "路德宗";
          tile.faithStrength = 45;
        });
        const hre = window.HIFI_SUPRANATIONAL_ENGINE?.structure?.(world, "hre");
        if (hre?.members?.[country.name]) hre.authority = Math.max(0, hre.authority - 6);
        const papacy = window.HIFI_SUPRANATIONAL_ENGINE?.structure?.(world, "papacy");
        if (papacy) papacy.authority = Math.max(0, papacy.authority - 3);
        window.HIFI_SUPRANATIONAL_ENGINE?.processSupranational?.(world);
      },
    },
    constitutional_monarchy: {
      label: "建立君主立宪",
      can: (country, world) => sovereignTransitionUnlocked(world, country)
        && country.government.type === "monarchy"
        && country.government.assembly.unlocked
        && country.government.institutions?.assembly?.type === "estates_general",
      why: "需要君主制、等级会议制度、威斯特法利亚主权条件与议会科技",
      apply: country => {
        country.government.institutions ||= {};
        country.government.institutions.assembly = { type: "parliamentary", cadence: 4 };
        country.government.centralPower = 45;
        syncCountryDisplayName(country, true);
        reconcileEstates(country);
      },
    },
    civic_republic: {
      label: "建立公民共和国",
      can: (country, world) => sovereignTransitionUnlocked(world, country)
        && ["monarchy", "merchant_republic"].includes(country.government.type)
        && country.government.assembly.unlocked
        && country.government.institutions?.assembly?.type === "parliamentary"
        && eraReached(world, "revolution"),
      why: "需要革命纪元、议会主权制度、威斯特法利亚主权条件与议会科技",
      government: "republic",
    },
  };

  function recordDecision(world, polity, key, label) {
    const entry = { turn: world.turn, key, label };
    world.countries[polity].decisionLedger.unshift(entry);
    return entry;
  }

  function ensureEventQueue(world) {
    world.playerEvents ||= [];
    world.historyNextId ||= 1;
  }

  const clampSatisfaction = value => Math.max(-100, Math.min(100, value));
  const clampPercent = value => Math.max(0, Math.min(100, value));

  const coerciveEstates = ["nobles", "peasants", "warriors", "clans", "princes", "court", "orders", "port_nobles"];
  const capitalEstates = ["merchants", "companies", "citizens", "oligarchs", "guilds", "cities", "governors", "bureaucrats"];

  function estatePowerShare(country, keys) {
    const total = Object.values(country.estates || {}).reduce((sum, estate) => sum + (estate.power || 0), 0);
    if (!total) return 0;
    const selected = keys.reduce((sum, key) => sum + (country.estates[key]?.power || 0), 0);
    return selected / total;
  }

  function lowSatisfactionCount(country) {
    return Object.values(country.estates || {}).filter(estate => (estate.satisfaction || 0) < -20).length;
  }

  function activeWarPressure(world, polity) {
    const wars = world.diplomacy?.wars || [];
    return wars.filter(war =>
      (war.attackers || []).includes(polity)
      || (war.defenders || []).includes(polity)
      || war.attacker === polity
      || war.defender === polity
    ).length * 25;
  }

  function neighborThreatIndex(world, polity) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    if (!diplomacy?.relationView) return 0;
    return Object.keys(world.countries)
      .filter(name => name !== polity)
      .reduce((max, target) => Math.max(max, diplomacy.relationView(world, polity, target).threat || 0), 0);
  }

  function assemblyPowerCap(government) {
    const type = government.institutions?.assembly?.type || "none";
    return institutions?.assembly?.[type]?.powerCap || 100;
  }

  function driftCentralization(world, polity) {
    const country = world.countries[polity];
    if (!country?.government || !country.estates) return 0;
    syncGovernmentDerived(country.government);
    const current = clampPercent(country.government.centralPower ?? country.government.institutions?.centralization ?? 60);
    const internal = clampPercent(
      (country.unrest || 0)
      + lowSatisfactionCount(country) * 8
      + Math.max(0, 40 - (country.legitimacy ?? 50))
    );
    const external = clampPercent(activeWarPressure(world, polity) + neighborThreatIndex(world, polity));
    const coercion = estatePowerShare(country, coerciveEstates);
    const capital = estatePowerShare(country, capitalEstates);
    const internalDelta = internal >= 12 ? Math.min(1.4, internal * 0.035) : 0;
    const externalDelta = external >= 18 ? Math.min(1.2, external * 0.03) * (coercion >= capital ? 1 : -1) : 0;
    const cap = assemblyPowerCap(country.government);
    const next = clampPercent(Math.min(cap, current + internalDelta + externalDelta));
    const delta = Math.round((next - current) * 10) / 10;
    if (delta) {
      country.government.centralPower = Math.round(next * 10) / 10;
      syncGovernmentDerived(country.government);
    }
    country.government.lastCentralizationDrift = {
      internal: Math.round(internal),
      external: Math.round(external),
      coercion: Math.round(coercion * 100),
      capital: Math.round(capital * 100),
      delta,
    };
    return delta;
  }

  function hasInstitutionFork(world, key) {
    return (world.playerEvents || []).some(event => event.institutionFork === key);
  }

  function pushInstitutionFork(world, country, fork) {
    ensureEventQueue(world);
    if (hasInstitutionFork(world, fork.key)) return null;
    const event = {
      id: `event-${world.historyNextId++}`,
      title: fork.title,
      crisis: true,
      institutionFork: fork.key,
      choices: fork.choices.map(choice => ({
        id: choice.id,
        label: choice.label,
        effect: choice.effect || {},
        apply: choice.apply,
      })),
    };
    world.playerEvents.push(event);
    country.decisionLedger ||= [];
    recordDecision(world, country.name, `fork:${fork.key}`, `出现制度抉择：${fork.title}`);
    return event;
  }

  function processInstitutionForks(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    if (!country?.government) return null;
    ensureEventQueue(world);
    if (world.playerEvents.length) return null;
    syncGovernmentDerived(country.government);
    const fiscal = country.government.institutions?.fiscal;
    const military = country.government.institutions?.military;
    const assembly = country.government.institutions?.assembly?.type || "none";
    const central = country.government.centralPower ?? 60;
    const fiscalPressure = country.pressures?.fiscal || 0;
    const internalPressure = clampPercent((country.unrest || 0) + Math.max(0, 40 - (country.legitimacy ?? 50)));
    const externalPressure = activeWarPressure(world, polity) + neighborThreatIndex(world, polity);
    const coercion = estatePowerShare(country, coerciveEstates);
    const capital = estatePowerShare(country, capitalEstates);
    if (assembly !== "parliamentary" && central >= 70 && internalPressure >= 20 && coercion >= capital) {
      return pushInstitutionFork(world, country, {
        key: "absolutism",
        title: "立法制度抉择：绝对主义",
        choices: [
          {
            id: "adopt",
            label: "集中绝对王权",
            effect: { legitimacy: -4 },
            apply: (w, c) => {
              setInstitution(c, "assembly", "none");
              c.government.centralPower = Math.max(c.government.centralPower, 85);
              for (const key of ["nobles", "patricians", "port_nobles"]) {
                if (c.estates?.[key]) c.estates[key].satisfaction = clampSatisfaction(c.estates[key].satisfaction - 8);
              }
              syncCountryDisplayName(c, true);
            },
          },
          { id: "delay", label: "维持权力平衡", effect: { legitimacy: 3 } },
        ],
      });
    }
    if (assembly === "none" && country.government.institutions?.succession === "hereditary" && (country.legitimacy <= 50 || country.unrest >= 10)) {
      return pushInstitutionFork(world, country, {
        key: "estates_general",
        title: "立法制度抉择：召开等级会议",
        choices: [
          {
            id: "adopt",
            label: "召集等级会议",
            effect: { legitimacy: 5 },
            apply: (w, c) => {
              setInstitution(c, "assembly", "estates_general");
              c.government.assembly.support = Math.max(c.government.assembly.support || 0, 42);
            },
          },
          { id: "delay", label: "继续王室独断", effect: { legitimacy: -2 } },
        ],
      });
    }
    if (assembly === "estates_general" && sovereignTransitionUnlocked(world, country) && capital > coercion && (externalPressure >= 20 || fiscalPressure >= 30)) {
      return pushInstitutionFork(world, country, {
        key: "parliamentary_sovereignty",
        title: "立法制度抉择：议会主权",
        choices: [
          {
            id: "adopt",
            label: "承认议会主权",
            effect: { legitimacy: 4 },
            apply: (w, c) => {
              setInstitution(c, "assembly", "parliamentary");
              c.government.centralPower = Math.min(c.government.centralPower, 55);
              syncCountryDisplayName(c, true);
            },
          },
          { id: "delay", label: "维持等级会议", effect: { legitimacy: -2 } },
        ],
      });
    }
    if (fiscal !== "direct" && central >= 50 && institutionUnlocked(country, "fiscal", "direct") && (fiscalPressure >= 35 || country.money < 40)) {
      return pushInstitutionFork(world, country, {
        key: "direct_taxation",
        title: "财政制度抉择：直接征税",
        choices: [
          {
            id: "adopt",
            label: "建立直接征税",
            effect: { legitimacy: -3 },
            apply: (w, c) => {
              setInstitution(c, "fiscal", "direct");
              for (const key of ["nobles", "patricians", "port_nobles"]) {
                if (c.estates?.[key]) c.estates[key].satisfaction = clampSatisfaction(c.estates[key].satisfaction - 8);
              }
            },
          },
          { id: "delay", label: "维持旧有税制", effect: { legitimacy: 2 } },
        ],
      });
    }
    if (military !== "standing_army" && country.technology?.standingArmy && externalPressure >= 25) {
      return pushInstitutionFork(world, country, {
        key: "standing_army",
        title: "军事制度抉择：常备军",
        choices: [
          {
            id: "adopt",
            label: "建立常备军制度",
            effect: { money: -20 },
            apply: (w, c) => {
              setInstitution(c, "military", "standing_army");
              c.military = Math.max(0, c.military - 10);
            },
          },
          { id: "delay", label: "继续依赖征召军", effect: { legitimacy: 2 } },
        ],
      });
    }
    return null;
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
    const assemblyType = country.government.institutions?.assembly?.type;
    const institutionalSupport = assemblyType === "parliamentary" ? 15 : assemblyType === "estates_general" ? 5 : 0;
    const concessionBonus = concession === "privilege" ? 15 : concession === "money" ? 10 : 0;
    const support = Math.round(averageSatisfaction * .55 + institutionalSupport + concessionBonus);
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

  function changeGovernment(world, polity, type) {
    const country = world.countries[polity];
    country.estates ||= {};
    country.government = createGovernment(type);
    const config = data.governments[type];
    syncCountryDisplayName(country, true);
    reconcileEstates(country);
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
    if (country.union?.junior) return null;
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
    reconcileEstates(country);
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
    driftCentralization(world, polity);
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
    changeGovernment,
    completeElection,
    createEstates,
    deriveEstates,
    createGovernment,
    reconcileEstates,
    initializePolitics,
    processEstates,
    processLeadership,
    decisions,
    enactDecision,
    holdAssembly,
    driftCentralization,
    processInstitutionForks,
    setInstitution,
  };
})();

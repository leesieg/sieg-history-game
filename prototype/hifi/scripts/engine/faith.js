(() => {
  "use strict";

  const data = window.HIFI_FAITHS;
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

  function confessionKey(value) {
    if (!value || value === "无") return null;
    if (data.confessions[value]) return value;
    return data.aliases[value] || "catholic";
  }

  function confessionLabel(key) {
    return data.confessions[key]?.label || key || "无";
  }

  function groupOf(key) {
    return data.confessions[key]?.group || null;
  }

  function controlledFaithTiles(world, polity) {
    return window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)
      .filter(tile => !tile.isSea && tile.confession);
  }

  function majorityConfession(world, polity) {
    const counts = {};
    for (const tile of controlledFaithTiles(world, polity)) {
      counts[tile.confession] = (counts[tile.confession] || 0) + (tile.population || 1);
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "catholic";
  }

  function initializeFaith(world) {
    world.faith ||= {
      papacy: { head: "教皇国", controller: "法兰西王国", authority: 65, crusadeTarget: null },
      caliphate: { head: "马穆鲁克苏丹国", authority: 55, crusadeTarget: null },
      patriarchate: { protector: "拜占庭帝国", authority: 45 },
    };
    for (const tile of world.tiles) {
      if (tile.isSea) continue;
      tile.confession = confessionKey(tile.confession || tile.religion);
      tile.religion = confessionLabel(tile.confession);
      tile.faithStrength ??= 80;
      if (tile.churchLandShare === undefined && groupOf(tile.confession) === "christian") {
        tile.churchLandShare = tile.city ? 0.14 : 0.1;
      }
    }
    for (const [polity, country] of Object.entries(world.countries)) {
      country.stateConfession ||= majorityConfession(world, polity);
      country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false, churchWealth: 0 };
      country.faith.churchWealth ??= 0;
    }
    return world;
  }

  function papalAuthority(world) {
    if (!world.faith?.papacy) throw new Error("教廷尚未初始化");
    return world.faith.papacy;
  }

  function ensurePapalController(world, polity) {
    const papacy = papalAuthority(world);
    if (polity !== papacy.head && polity !== papacy.controller) throw new Error("只有教廷或教廷控制者可以执行该行动");
    return papacy;
  }

  function ensureCountry(world, polity) {
    const country = world.countries[polity];
    if (!country) throw new Error("国家不存在");
    return country;
  }

  function grantReligiousClaim(world, polity, target, type) {
    if (!window.HIFI_DIPLOMACY_ENGINE?.addClaim) throw new Error("外交系统尚未初始化");
    return window.HIFI_DIPLOMACY_ENGINE.addClaim(world, polity, target, type);
  }

  function catholicPolities(world) {
    return Object.entries(world.countries)
      .filter(([, country]) => country.stateConfession === "catholic")
      .map(([polity]) => polity);
  }

  function excommunicate(world, controller, target) {
    const papacy = ensurePapalController(world, controller);
    const country = ensureCountry(world, target);
    if (country.stateConfession !== "catholic") throw new Error("只能绝罚天主教国家");
    country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false, churchWealth: 0 };
    country.faith.excommunicated = true;
    country.faith.papalFavor = clamp((country.faith.papalFavor ?? 50) - 35);
    country.legitimacy = Math.max(0, (country.legitimacy ?? 60) - 15);
    papacy.authority = clamp((papacy.authority ?? 65) - 5);

    const claims = catholicPolities(world)
      .filter(polity => polity !== target)
      .map(polity => grantReligiousClaim(world, polity, target, "excommunication"));
    return { target, claims, authority: papacy.authority, legitimacy: country.legitimacy };
  }

  function callCrusade(world, caller, target) {
    const papacy = ensurePapalController(world, caller);
    const country = ensureCountry(world, target);
    const confession = country.stateConfession || majorityConfession(world, target);
    if (groupOf(confession) === "christian" && !country.faith?.excommunicated) {
      throw new Error("十字军目标必须是异教国家或已被绝罚的国家");
    }
    papacy.crusadeTarget = target;
    papacy.authority = clamp((papacy.authority ?? 65) - 8);
    const claims = catholicPolities(world)
      .filter(polity => polity !== target)
      .map(polity => grantReligiousClaim(world, polity, target, "crusade"));
    return { target, claims, authority: papacy.authority };
  }

  function appointDefenderOfFaith(world, controller, polity) {
    const papacy = ensurePapalController(world, controller);
    const country = ensureCountry(world, polity);
    if (country.stateConfession !== "catholic") throw new Error("信仰捍卫者必须信奉天主教");
    country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false, churchWealth: 0 };
    papacy.defender = polity;
    papacy.authority = clamp((papacy.authority ?? 65) + 3);
    country.faith.piety = clamp((country.faith.piety ?? 60) + 10);
    country.faith.papalFavor = clamp((country.faith.papalFavor ?? 50) + 10);
    country.legitimacy = clamp((country.legitimacy ?? 60) + 5);
    return { defender: polity, authority: papacy.authority };
  }

  function defenderOfFaithForWar(world, attacker, defender) {
    const papacy = world.faith?.papacy;
    const polity = papacy?.defender;
    if (!polity || polity === attacker || polity === defender || !world.countries[polity]) return null;
    const attackerFaith = world.countries[attacker]?.stateConfession;
    const defenderFaith = world.countries[defender]?.stateConfession;
    if (defenderFaith !== "catholic" || attackerFaith === "catholic") return null;
    return polity;
  }

  function unity(world, polity) {
    const country = world.countries[polity];
    const tiles = controlledFaithTiles(world, polity);
    if (!tiles.length) return 100;
    const total = tiles.reduce((sum, tile) => sum + (tile.population || 1), 0);
    const same = tiles
      .filter(tile => tile.confession === country.stateConfession)
      .reduce((sum, tile) => sum + (tile.population || 1), 0);
    return clamp(same / Math.max(1, total) * 100);
  }

  function pressure(world, polity) {
    const country = world.countries[polity];
    const state = country.stateConfession || "catholic";
    const stateGroup = groupOf(state);
    let value = 0;
    for (const tile of controlledFaithTiles(world, polity)) {
      if (tile.confession === state) continue;
      const weight = groupOf(tile.confession) === stateGroup ? 8 : 16;
      value += weight * Math.max(1, tile.population || 1) / 10;
    }
    if (world.flags?.reformation && stateGroup === "christian") value += 32;
    return clamp(value);
  }

  function applyPolicyToEstates(country, previous, next) {
    const deltas = {
      tolerance: { church: -4, clergy: -4, imperial_church: -4, faithful: 3 },
      orthodoxy: { church: 4, clergy: 4, imperial_church: 4, faithful: -2 },
      conversion: { church: 6, clergy: 6, imperial_church: 6, faithful: -6 },
    };
    const reverse = deltas[previous] || {};
    for (const [key, amount] of Object.entries(reverse)) {
      if (country.estates?.[key]) country.estates[key].satisfaction = Math.max(-100, country.estates[key].satisfaction - amount);
    }
    for (const [key, amount] of Object.entries(deltas[next] || {})) {
      if (country.estates?.[key]) country.estates[key].satisfaction = Math.max(-100, Math.min(100, country.estates[key].satisfaction + amount));
    }
  }

  function setPolicy(world, polity, policy) {
    if (!["tolerance", "orthodoxy", "conversion"].includes(policy)) throw new Error("未知信仰政策");
    const country = world.countries[polity];
    const previous = country.faith?.policy || "orthodoxy";
    country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false };
    if (previous === policy) throw new Error("已经是当前信仰政策");
    country.faith.policy = policy;
    applyPolicyToEstates(country, previous, policy);
    return policy;
  }

  function missionaryPressure(policy) {
    if (policy === "conversion") return 14;
    if (policy === "orthodoxy") return 7;
    return 2;
  }

  function spreadFaith(world) {
    for (const [polity, country] of Object.entries(world.countries)) {
      const state = country.stateConfession || majorityConfession(world, polity);
      const policy = country.faith?.policy || "orthodoxy";
      for (const tile of controlledFaithTiles(world, polity)) {
        if (tile.confession === state) {
          tile.faithStrength = clamp((tile.faithStrength || 80) + 1);
          continue;
        }
        tile.faithStrength = clamp((tile.faithStrength || 80) - missionaryPressure(policy));
        if (tile.faithStrength <= 0) {
          tile.confession = state;
          tile.religion = confessionLabel(state);
          tile.faithStrength = 35;
        }
      }
      country.pressures ||= {};
      country.pressures.faith = pressure(world, polity);
      if (country.faith) country.faith.unity = unity(world, polity);
    }
  }

  function sendMissionary(world, polity, tileId) {
    const country = world.countries[polity];
    const tile = world.tiles.find(candidate => candidate.id === tileId);
    if (!tile || tile.isSea || tile.polity !== polity) throw new Error("只能在己方陆地传教");
    if (tile.confession === country.stateConfession) throw new Error("该地块已信奉国教");
    if (country.actionPoints.diplomatic < 1 || country.money < 10) throw new Error("传教需要 1 外交点与 10 金钱");
    country.actionPoints.diplomatic -= 1;
    country.money -= 10;
    tile.faithStrength = clamp((tile.faithStrength || 80) - 25);
    if (tile.faithStrength <= 0) {
      tile.confession = country.stateConfession;
      tile.religion = confessionLabel(tile.confession);
      tile.faithStrength = 35;
    }
    return tile;
  }

  function secularizeChurchLands(world, polity, reason = "世俗化教产") {
    const country = world.countries[polity];
    if (!country) throw new Error("国家不存在");
    country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false, churchWealth: 0 };
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)
      .filter(tile => !tile.isSea && (tile.churchLandShare || 0) > 0);
    if (!tiles.length) {
      country.faith.secularized = true;
      return { money: 0, tiles: 0 };
    }
    const money = tiles.reduce((sum, tile) => {
      const share = tile.churchLandShare || 0;
      const base = Math.max(1, tile.population || 1) * Math.max(.2, (tile.control || 0) / 100);
      tile.churchLandShare = 0;
      return sum + Math.round(base * share * 12);
    }, 0);
    country.money += money;
    country.faith.secularized = true;
    country.faith.churchWealth = 0;
    for (const key of ["church", "clergy", "imperial_church"]) {
      if (country.estates?.[key]) {
        country.estates[key].power = Math.max(5, Math.round((country.estates[key].power || 0) * .75));
        country.estates[key].satisfaction = Math.max(-100, (country.estates[key].satisfaction || 0) - 18);
      }
    }
    country.log?.unshift(`${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}：${reason}，国库接收教产 ${money}。`);
    return { money, tiles: tiles.length };
  }

  window.HIFI_FAITH_ENGINE = {
    appointDefenderOfFaith,
    callCrusade,
    confessionKey,
    confessionLabel,
    defenderOfFaithForWar,
    excommunicate,
    groupOf,
    initializeFaith,
    majorityConfession,
    pressure,
    sendMissionary,
    secularizeChurchLands,
    setPolicy,
    spreadFaith,
    unity,
  };
})();

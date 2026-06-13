(() => {
  "use strict";

  const eras = [
    { key: "feudal", label: "封建纪元", year: 1337 },
    { key: "discovery", label: "发现纪元", year: 1453 },
    { key: "confessional", label: "信仰分裂", year: 1517 },
    { key: "absolutism", label: "绝对主义", year: 1648 },
    { key: "revolution", label: "革命纪元", year: 1789 },
  ];

  function initializeHistory(world) {
    world.eraIndex = 0;
    world.flags = { constantinopleFallen: false, discoveryImpulse: false };
    world.situations = [];
    world.playerEvents = [];
    world.pendingCouncil = null;
    world.pendingTransition = null;
    world.regency = { active: false, startedTurn: null };
    world.historyNextId = 1;
    for (const country of Object.values(world.countries)) {
      country.chronicle = [];
      country.report = null;
      country.pressures = { trade: 0, military: 0, fiscal: 0, exploration: 0 };
      country.priceIndex = 1;
    }
    return world;
  }

  function pushWorldEvent(world, text, kind = "event", chain = null) {
    const event = { id: `history-${world.historyNextId++}`, turn: world.turn, kind, text, chain };
    world.worldEvents.unshift(event);
    world.worldEvents = world.worldEvents.slice(0, 80);
    return event;
  }

  function pushChronicle(world, polity, kind, text) {
    const country = world.countries[polity];
    if (!country) return null;
    const entry = { turn: world.turn, kind, text };
    country.chronicle.unshift(entry);
    country.chronicle = country.chronicle.slice(0, 120);
    return entry;
  }

  function startSituation(world, key, label) {
    if (world.situations.some(item => item.key === key)) return null;
    const situation = { key, label, phase: "预兆", sinceTurn: world.turn, progress: 0, lastEffectTurn: null, eventGenerated: false };
    world.situations.push(situation);
    pushWorldEvent(world, `${label}开始影响欧洲`, "situation");
    return situation;
  }

  function processSituations(world) {
    if (world.turn >= 12) startSituation(world, "black_death", "黑死病");
    if (world.turn >= 48) startSituation(world, "little_ice_age", "小冰期");
    for (const situation of world.situations) {
      situation.progress = Math.min(100, situation.progress + 5);
      situation.phase = situation.progress >= 100 ? "消退" : situation.progress >= 60 ? "爆发" : "预兆";
      if (situation.key === "black_death" && situation.phase === "爆发" && !situation.eventGenerated) {
        situation.eventGenerated = true;
        world.playerEvents.push({
          id: `event-${world.historyNextId++}`,
          title: "疫病逼近首都",
          choices: [
            { id: "quarantine", label: "封锁城门", effect: { legitimacy: -2, food: -10 } },
            { id: "markets", label: "维持市场开放", effect: { money: 12, legitimacy: -4 } },
          ],
        });
      }
      if (
        situation.key === "black_death"
        && situation.phase === "爆发"
        && (situation.lastEffectTurn === null || world.turn - situation.lastEffectTurn >= 4)
      ) {
        for (const tile of world.tiles.filter(item => !item.isSea)) {
          tile.population = Math.max(1, tile.population - 1);
        }
        situation.lastEffectTurn = world.turn;
      }
    }
  }

  function applyCausalChain(world, key) {
    if (key !== "constantinople_falls") throw new Error("未知历史因果链");
    const chain = [
      "君士坦丁堡陷落",
      "东方商路受到冲击",
      "传统航路成本上升",
      "西欧探索压力增加",
      "远洋技术投资加速",
      "新航线逐步形成",
      "贸易流入推动物价变化",
    ];
    world.flags.constantinopleFallen = true;
    world.flags.discoveryImpulse = true;
    for (const country of Object.values(world.countries)) {
      country.pressures.exploration += 12;
      country.priceIndex = Math.round((country.priceIndex + .04) * 100) / 100;
    }
    world.pendingTransition = { title: "旧都易主", sub: "地中海秩序开始转向", chain };
    pushWorldEvent(world, chain[0], "causality", chain);
    return chain;
  }

  function checkEra(world) {
    const year = window.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year;
    let nextIndex = world.eraIndex;
    eras.forEach((era, index) => { if (year >= era.year) nextIndex = index; });
    if (nextIndex <= world.eraIndex) return false;
    world.eraIndex = nextIndex;
    const era = eras[nextIndex];
    world.pendingTransition = {
      title: era.label,
      sub: `${era.year} 年后，旧规则开始松动`,
      chain: [`进入${era.label}`, "国家目标与可用机制发生变化"],
    };
    pushWorldEvent(world, `世界进入${era.label}`, "era", world.pendingTransition.chain);
    return true;
  }

  function resolvePlayerEvent(world, eventId, choiceId) {
    const event = world.playerEvents.find(item => item.id === eventId);
    if (!event) throw new Error("事件不存在");
    const choice = event.choices.find(item => item.id === choiceId);
    if (!choice) throw new Error("事件选项不存在");
    const country = window.HIFI_WORLD_ENGINE.activeCountry(world);
    for (const [resource, amount] of Object.entries(choice.effect || {})) {
      country[resource] += amount;
    }
    pushChronicle(world, world.playerPolity, "decision", `${event.title}：${choice.label}`);
    world.playerEvents = world.playerEvents.filter(item => item.id !== eventId);
  }

  function councilSummary(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    const warnings = [];
    if (country.money < 50) warnings.push("国库接近枯竭");
    if (country.food < 80) warnings.push("粮食储备偏低");
    if (country.legitimacy < 55) warnings.push("统治合法性承压");
    if (country.warfare?.warExhaustion > 5) warnings.push("战争疲惫正在累积");
    if (!warnings.length) warnings.push("国家目前没有迫近的结构性危机");
    const advisors = [
      `行政顾问：优先处理${country.money < 50 ? "财政" : "控制力与建设"}`,
      `外交顾问：目前占用外交容量 ${world.diplomacy ? window.HIFI_DIPLOMACY_ENGINE.capacityUsed(world, polity) : 0}`,
      `军事顾问：${country.warfare?.warExhaustion > 5 ? "寻求有利和平" : "保持主力军团补给"}`,
    ];
    return { warnings, advisors, era: eras[world.eraIndex].label, situations: world.situations.map(item => `${item.label} · ${item.phase}`) };
  }

  function issues(world) {
    const result = [];
    if (world.pendingElection) result.push({ id: "election", label: "选立新领导人", detail: world.pendingElection.polity, blocking: true, kind: "election" });
    for (const event of world.playerEvents) result.push({ id: event.id, label: event.title, detail: "需要裁断", blocking: true, kind: "event" });
    if (world.pendingTransition) result.push({ id: "transition", label: world.pendingTransition.title, detail: "时代转折", blocking: false, kind: "transition" });
    const council = councilSummary(world);
    council.warnings
      .filter(warning => !warning.startsWith("国家目前没有"))
      .forEach((warning, index) => result.push({ id: `warning-${index}`, label: warning, detail: "顾问预警", blocking: false, kind: "council" }));
    world.situations.forEach(item => result.push({ id: `situation-${item.key}`, label: item.label, detail: item.phase, blocking: false, kind: "council" }));
    return result;
  }

  function blockingIssues(world) {
    return issues(world).filter(issue => issue.blocking);
  }

  function startRegency(world) {
    world.regency = { active: true, startedTurn: world.turn };
  }

  function shouldInterruptRegency(world) {
    return !!world.pendingElection
      || world.playerEvents.length > 0
      || !!world.pendingTransition
      || world.diplomacy?.wars.some(war => war.startedTurn > world.regency.startedTurn);
  }

  function runRegency(world, advanceQuarter, maximumQuarters = 8) {
    startRegency(world);
    let advanced = 0;
    while (advanced < maximumQuarters && !shouldInterruptRegency(world)) {
      advanceQuarter(world);
      advanced += 1;
    }
    world.regency.active = false;
    return advanced;
  }

  function acknowledgeTransition(world) {
    world.pendingTransition = null;
  }

  function processHistory(world) {
    processSituations(world);
    checkEra(world);
    const country = window.HIFI_WORLD_ENGINE.activeCountry(world);
    country.report = {
      turn: world.turn,
      era: eras[world.eraIndex].label,
      warnings: councilSummary(world).warnings,
    };
    return world;
  }

  function epic(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    return {
      title: `${country.name}编年史`,
      entries: country.chronicle,
      worldEvents: world.worldEvents.slice(0, 12),
    };
  }

  window.HIFI_HISTORY_ENGINE = {
    applyCausalChain,
    acknowledgeTransition,
    blockingIssues,
    checkEra,
    councilSummary,
    epic,
    eras,
    initializeHistory,
    issues,
    processHistory,
    processSituations,
    pushChronicle,
    pushWorldEvent,
    resolvePlayerEvent,
    runRegency,
    shouldInterruptRegency,
    startRegency,
  };
})();

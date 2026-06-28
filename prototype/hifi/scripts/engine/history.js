(() => {
  "use strict";

  const eras = [
    { key: "feudal", label: "封建纪元", year: 1337 },
    { key: "discovery", label: "发现纪元", year: 1453 },
    { key: "faith", label: "信仰分裂", year: 1517 },
    { key: "absolutism", label: "绝对主义", year: 1648 },
    { key: "revolution", label: "革命纪元", year: 1789 },
    { key: "industrial", label: "工业纪元", year: 1815 },
  ];

  // Phase C：历史因果链数据化。每条链 = 文案步骤 + 置位 flags + 机制后果 effect（回灌核心循环的压力/物价/组织/产出流）。
  // 既有 constantinople_falls 平移入表，行为不变；新增链由纪元跨越或资源流阈值触发。
  const CAUSAL_CHAINS = {
    constantinople_falls: {
      steps: ["君士坦丁堡陷落", "东方商路受到冲击", "传统航路成本上升", "西欧探索压力增加", "远洋技术投资加速", "新航线逐步形成", "贸易流入推动物价变化"],
      flags: { constantinopleFallen: true, discoveryImpulse: true },
      transition: { title: "旧都易主", sub: "地中海秩序开始转向" },
      effect(world) {
        for (const country of Object.values(world.countries)) {
          country.pressures.exploration += 12;
          country.priceIndex = Math.round((country.priceIndex + .04) * 100) / 100;
        }
      },
    },
    reformation_split: {
      steps: ["宗教改革撕裂信仰统一", "新旧两派各执经文", "正统阶层与改革派对立", "信仰压力席卷宫廷"],
      flags: { reformationSplit: true, reformation: true },
      transition: { title: "信仰分裂", sub: "一个基督教世界开始裂成两半" },
      effect(world) {
        for (const country of Object.values(world.countries)) {
          country.pressures.faith = (country.pressures.faith || 0) + 14;        // 信仰压力上行 → applyPressureEffects 喂正统阶层张力
          for (const key of ["church", "clergy", "imperial_church"]) {
            if (country.estates?.[key]) country.estates[key].satisfaction = Math.max(-100, country.estates[key].satisfaction - 8);
          }
        }
        seedReformationInEmpire(world);
      },
    },
    price_revolution: {
      steps: ["新大陆白银涌入", "货币贬值物价飞涨", "固定税收实际缩水", "财政承压寻求新财源"],
      flags: { priceRevolution: true },
      transition: { title: "价格革命", sub: "白银洪流冲垮了旧的物价秩序" },
      effect(world) {
        for (const country of Object.values(world.countries)) {
          country.priceIndex = Math.round((country.priceIndex + .05) * 100) / 100; // 物价上行 → economy.tileOutput 名义金钱产出抬升
          country.pressures.fiscal = (country.pressures.fiscal || 0) + 10;
        }
      },
    },
    gunpowder_revolution: {
      steps: ["火炮与棱堡重塑战场", "旧式征召军难以为继", "常备职业军成为主流", "封建动员的时代落幕"],
      flags: { gunpowderRevolution: true },
      transition: { title: "火药革命", sub: "城墙与封建骑士的时代正在落幕" },
      effect(world) {
        for (const army of Object.values(world.warfare?.armies || {})) {          // 旧式征召/卫队军团组织度下挫 → 逼出常备军转型
          if (army.units?.some(unit => ["levy", "guard"].includes(unit.serviceType))) {
            army.organization = Math.max(0, army.organization - 20);
          }
        }
      },
    },
    industrial_takeoff: {
      steps: ["蒸汽机轰鸣作响", "工厂与铁路改写生产", "产出与思想加速积累", "旧的农业秩序被重塑"],
      flags: { industrialTakeoff: true, industrialization: true },
      transition: { title: "工业起飞", sub: "机器的轰鸣盖过了田野的钟声" },
      effect(world) {
        for (const country of Object.values(world.countries)) {
          country.ideas = (country.ideas || 0) + 15;                              // 产出/思想流加速
          country.money += 30;
        }
      },
    },
  };
  // 纪元跨越时绑定触发的因果链（封建/发现/革命纪元无绑定链，保留通用转折）。
  const CHAIN_BY_ERA = { faith: "reformation_split", absolutism: "gunpowder_revolution", industrial: "industrial_takeoff" };

  function seedReformationInEmpire(world) {
    const supranational = window.HIFI_SUPRANATIONAL_ENGINE;
    const hre = supranational?.structure?.(world, "hre");
    if (!hre) return;
    const reformers = ["萨克森选侯国", "波西米亚王国", "瑞士邦联", "弗兰德斯伯国"]
      .filter(polity => hre.members?.[polity] && world.countries[polity]);
    if (!reformers.length) return;
    for (const polity of reformers) {
      const country = world.countries[polity];
      country.stateConfession = "lutheran";
      country.faith ||= { piety: 60, papalFavor: 50, policy: "orthodoxy", secularized: false };
      const secularized = window.HIFI_FAITH_ENGINE?.secularizeChurchLands?.(world, polity, "接纳宗教改革并世俗化教产");
      if (!secularized) {
        country.faith.secularized = true;
        country.money += 20;
      }
      for (const key of ["church", "clergy", "imperial_church"]) {
        if (country.estates?.[key]) country.estates[key].satisfaction = Math.max(-100, country.estates[key].satisfaction - 18);
      }
      for (const tile of window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)) {
        if (!tile.city && tile.confession !== "catholic") continue;
        tile.confession = "lutheran";
        tile.religion = window.HIFI_FAITH_ENGINE?.confessionLabel?.("lutheran") || "路德宗";
        tile.faithStrength = 45;
      }
      pushChronicle(world, polity, "religion", "宗教改革在本国扎根，教产被世俗化，帝国权威受到冲击");
    }
    hre.authority = Math.max(0, (hre.authority || 0) - reformers.length * 4);
    const papacy = supranational.structure?.(world, "papacy");
    if (papacy) papacy.authority = Math.max(0, (papacy.authority || 0) - 8);
    supranational.processSupranational?.(world);
  }

  const missionDefinitions = [
    { key: "secure_capital", label: "稳固首都", check: (world, country) => window.HIFI_WORLD_ENGINE.controlledTiles(world, country.name).some(tile => tile.city && tile.control >= 80), reward: { legitimacy: 3 } },
    { key: "open_market", label: "接入洲际市场", check: (world, country) => (world.trade?.lastIncome?.[country.name] || 0) >= 10, reward: { money: 20 } },
    { key: "modern_army", label: "建立近代军队", check: (world, country) => country.technology.standingArmy && Object.values(world.warfare.armies).some(army => army.owner === country.name), reward: { military: 25 } },
    { key: "industrial_takeoff", label: "工业起飞", check: (world, country) => country.technology.steamEngine && country.technology.railways, reward: { money: 60 } },
  ];
  const tutorialTasks = [
    { key: "select_tile", label: "选择一个地块", pane: "map" },
    { key: "open_country", label: "查看国家状态", pane: "国家" },
    { key: "set_trade", label: "调整贸易与关税", pane: "经济" },
    { key: "manage_army", label: "查看并整编军团", pane: "军事" },
    { key: "advance_turn", label: "结束一个季度", pane: "turn" },
  ];

  function initializeHistory(world) {
    world.eraIndex = 0;
    world.flags = { constantinopleFallen: false, discoveryImpulse: false, reformation: false, industrialization: false };
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
      country.technologyAwareness = Object.fromEntries(Object.keys(window.HIFI_RULES.technologies).map(key => [key, 0]));
      window.HIFI_ECONOMY_ENGINE?.ensureResearchState?.(country);
      country.exploration = { points: 0, milestones: [] };
      country.missionsDone = [];
    }
    world.tutorial = { step: 0, flags: {} };
    return world;
  }

  function domainResearchIncome(world, country, domain) {
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, country.name);
    const cities = tiles.filter(tile => tile.city).length;
    const markets = tiles.filter(tile => tile.buildings?.includes("market")).length;
    const ports = tiles.filter(tile => tile.buildings?.includes("port")).length;
    const forts = tiles.filter(tile => tile.buildings?.includes("fort")).length;
    const workshops = tiles.filter(tile => tile.buildings?.includes("workshop")).length;
    const atWar = world.diplomacy?.wars?.some(war => war.attackers.includes(country.name) || war.defenders.includes(country.name));
    const central = Math.max(0, Math.min(100, country.government?.institutions?.centralization ?? country.government?.centralPower ?? 60));
    const sources = {
      administrative: 1 + central / 80 + cities * .25 + (country.technology?.codifiedLaw ? .35 : 0),
      military: 1 + forts * .45 + (atWar ? 1.25 : 0) + ((country.government?.institutions?.military === "standing_army") ? .6 : 0),
      economic: 1 + markets * .45 + workshops * .35 + (country.technology?.threeFieldSystem ? .25 : 0) + (world.trade?.lastIncome?.[country.name] || 0) / 35,
      naval: 1 + ports * .65 + (country.technology?.compassCharts ? .25 : 0) + (country.pressures?.exploration || 0) / 45,
      cultural: 1 + (country.technology?.universities ? .6 : 0) + (country.technology?.printing ? 1 : 0) + Math.max(0, country.legitimacy || 0) / 100,
    };
    return Math.max(.5, sources[domain] || 1);
  }

  function spreadTechnology(world) {
    const year = window.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year;
    for (const country of Object.values(world.countries)) {
      window.HIFI_ECONOMY_ENGINE?.ensureResearchState?.(country);
      for (const domain of Object.keys(window.HIFI_RULES.techDomains || {})) {
        const focus = country.researchFocus === domain ? 1.5 : .85;
        window.HIFI_ECONOMY_ENGINE?.addResearch?.(country, domain, domainResearchIncome(world, country, domain) * focus);
      }
      country.ideas = Math.round(country.research?.cultural || country.ideas || 0);
      for (const [key, technology] of Object.entries(window.HIFI_RULES.technologies)) {
        if (year < technology.year) continue;
        const neighborsKnown = Object.values(world.countries).filter(other => other.technology?.[key]).length;
        const printing = country.technology.printing ? 2 : 0;
        const ideasBoost = Math.floor((country.pressures?.ideas || 0) / 40); // 思想压力加速科技扩散流
        const laggardBoost = country.technology?.[key] ? 0 : Math.min(3, neighborsKnown);
        country.technologyAwareness[key] = Math.min(100, country.technologyAwareness[key] + 1 + neighborsKnown + laggardBoost + printing + ideasBoost);
      }
      if ((country.pressures?.exploration || 0) >= 35) country.exploration.points += 1;
      if (country.exploration.points >= 20 && !country.exploration.milestones.includes("atlantic")) {
        country.exploration.milestones.push("atlantic");
        country.exploration.colonial = true;   // 解锁殖民收入流（economy.settleCountry 每季注入）
        country.ideas += 10;
        country.money += 20;
        pushChronicle(world, country.name, "milestone", "开辟大西洋航路，殖民收入开始流入");
      }
    }
  }

  function autoAdoptTechnology(world) {
    const engine = window.HIFI_ECONOMY_ENGINE;
    if (!engine?.autoAdoptReadyTechnologies) return;
    for (const country of Object.values(world.countries)) {
      const adopted = engine.autoAdoptReadyTechnologies(world, country.name);
      for (const label of adopted) {
        pushChronicle(world, country.name, "technology", `采纳科技「${label}」`);
      }
    }
  }

  // 压力层驱动转折：把 pressures 从仪表盘变成真实输入（核心循环：压力→内政/军事/信仰）
  function applyPressureEffects(world) {
    for (const country of Object.values(world.countries)) {
      const pressure = country.pressures || {};
      if ((pressure.military || 0) > 60 && country.warfare) {
        country.warfare.warExhaustion = (country.warfare.warExhaustion || 0) + 1; // 军事压力→战争疲惫加速
      }
      if ((pressure.fiscal || 0) > 60) {
        country.legitimacy = Math.max(0, country.legitimacy - 1);                 // 财政压力→合法性承压
      }
      if ((pressure.faith || 0) > 50 && country.estates) {                        // 信仰压力→正统阶层张力
        for (const key of ["church", "clergy", "imperial_church"]) {
          if (country.estates[key]) country.estates[key].satisfaction = Math.max(-100, country.estates[key].satisfaction - 1);
        }
      }
    }
  }

  function processMilestones(world) {
    const year = window.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year;
    if (year >= 1517 && !world.flags.reformation) {
      world.flags.reformation = true;
      pushWorldEvent(world, "宗教改革开始撼动西欧信仰秩序", "religion");
    }
    if (year >= 1750 && Object.values(world.countries).some(country => country.technology.steamEngine)) {
      world.flags.industrialization = true;
    }
  }

  function applyMissions(world) {
    for (const country of Object.values(world.countries)) {
      for (const mission of missionDefinitions) {
        if (country.missionsDone.includes(mission.key) || !mission.check(world, country)) continue;
        country.missionsDone.push(mission.key);
        Object.entries(mission.reward).forEach(([resource, amount]) => { country[resource] += amount; });
        pushChronicle(world, country.name, "mission", `达成时代使命「${mission.label}」`);
      }
    }
  }

  function missions(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    return missionDefinitions.map(mission => ({
      key: mission.key,
      label: mission.label,
      done: country.missionsDone.includes(mission.key),
      reward: mission.reward,
    }));
  }

  function tutorialTask(world) {
    return tutorialTasks[world.tutorial?.step || 0] || null;
  }

  function completeTutorial(world, key) {
    const task = tutorialTask(world);
    if (task?.key !== key) return false;
    world.tutorial.flags[key] = true;
    world.tutorial.step += 1;
    return true;
  }

  function forecast(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    const report = country.lastReport || {};
    const trade = world.trade?.lastIncome?.[polity] || 0;
    return {
      food: report.food || 0,
      money: (report.money || 0) + trade,
      military: report.military || 0,
      trade,
      risks: councilSummary(world, polity).warnings,
      echoes: (country.decisionLedger || []).slice(0, 3),
    };
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
      // 爆发期效果节流闸：人口损耗（黑死病专属）与救济成本（所有情势通用）
      // 是同一次"爆发脉冲"的两面，共用同一个 lastEffectTurn 字段、同一次判定。
      // 节奏标定（平衡性决策，非 bug 修复）：救济成本原为爆发期逐季结算，
      // 改为与人口损耗同步、每 4 季才结算一次——逐季全量会与人口损耗叠加，
      // 对爆发期惩罚过重，详见 Task A7 节奏标定。
      const eruptionPulseDue = situation.phase === "爆发"
        && (situation.lastEffectTurn === null || world.turn - situation.lastEffectTurn >= 4);
      if (situation.key === "black_death" && eruptionPulseDue) {
        for (const tile of world.tiles.filter(item => !item.isSea)) {
          tile.population = Math.max(1, tile.population - 1);
        }
      }
      if (eruptionPulseDue) {
        // 救济成本：爆发期消耗粮/钱（事件脉冲，写进季报事件段）
        for (const key of Object.keys(world.countries)) {
          const country = world.countries[key];
          country.lastReport = country.lastReport || {};
          const ev = country.lastReport.event || { food: 0, money: 0 };
          const foodCost = Math.min(country.food, 12);
          const moneyCost = Math.min(country.money, 8);
          country.food -= foodCost; country.money -= moneyCost;
          country.lastReport.event = { food: ev.food + foodCost, money: ev.money + moneyCost };
        }
        situation.lastEffectTurn = world.turn;
      }
    }
  }

  // 玩家裁断危机（34 号 P1-2）：把"压力层"变成真正必须二选一的阻塞决策，让御前会议出现真实决策压力
  // （此前阻塞裁断长期为 0）。节流：两次危机至少间隔 CRISIS_COOLDOWN 季、且同一时刻至多一个危机挂起，
  // 配合黑死病等既有 playerEvent，目标阻塞中位数 1、峰值 ≤2，不打断节奏。仅作用于玩家国。
  const CRISIS_COOLDOWN = 8;
  function processPlayerCrises(world) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(world);
    if (!country) return;
    if (world.playerEvents.some(event => event.crisis)) return; // 已有危机挂起则不叠加
    if (world.lastCrisisTurn != null && world.turn - world.lastCrisisTurn < CRISIS_COOLDOWN) return;

    // 财政危机：国库见底——给"举债 / 增税 / 削军费"三条各有代价的出路（同时给小国一个不至于动作归零的活口）
    if (country.money <= 0) {
      world.playerEvents.push({
        id: `event-${world.historyNextId++}`,
        title: "国库见底",
        crisis: true,
        choices: [
          { id: "borrow", label: "向银行家举债", effect: { money: 45, legitimacy: -6 } },
          { id: "tax", label: "加征非常赋税", effect: { money: 28, legitimacy: -3 } },
          { id: "retrench", label: "削减军费开支", effect: { money: 12, military: -18 } },
        ],
      });
      world.lastCrisisTurn = world.turn;
      pushWorldEvent(world, `${country.name}财政告急，宫廷被迫裁断`, "council");
      return;
    }

    // 合法性危机（34 号 P2：给坠落的小国一个"可主动选择的恢复手段"，而非静态补贴）：
    // 合法性触底时给两条恢复路径——加冕大典（强但贵）/ 大赦减税（弱但廉价，破产小国也付得起）。
    if (country.legitimacy <= 10) {
      world.playerEvents.push({
        id: `event-${world.historyNextId++}`,
        title: "王权威信濒危",
        crisis: true,
        choices: [
          { id: "coronation", label: "举行加冕大典", effect: { legitimacy: 16, money: -25 } },
          { id: "amnesty", label: "大赦与减税", effect: { legitimacy: 9, money: -8 } },
        ],
      });
      world.lastCrisisTurn = world.turn;
      pushWorldEvent(world, `${country.name}王权威信濒危，亟需重振`, "council");
      return;
    }

    // 阶层冲突：最不满的阶层跌破临界——"让步安抚 vs 强力弹压"二选一，回灌该阶层满意度流
    if (country.estates) {
      const entries = Object.entries(country.estates);
      const worst = entries.reduce((min, cur) => cur[1].satisfaction < min[1].satisfaction ? cur : min, entries[0]);
      if (worst && worst[1].satisfaction <= -40) {
        world.playerEvents.push({
          id: `event-${world.historyNextId++}`,
          title: `${worst[1].label}群情激愤`,
          crisis: true,
          estateKey: worst[0],
          choices: [
            { id: "concede", label: "让步安抚", effect: { legitimacy: 6, money: -25 } },
            { id: "repress", label: "强力弹压", effect: { legitimacy: 3, military: -10 } },
          ],
        });
        world.lastCrisisTurn = world.turn;
        pushWorldEvent(world, `${country.name}阶层冲突激化，需君主裁断`, "council");
      }
    }
  }

  function applyCausalChain(world, key) {
    const chain = CAUSAL_CHAINS[key];
    if (!chain) throw new Error("未知历史因果链");
    Object.assign(world.flags, chain.flags || {});
    if (chain.effect) chain.effect(world);
    (world.firedChains ||= new Set()).add(key);
    world.pendingTransition = { title: chain.transition.title, sub: chain.transition.sub, chain: chain.steps };
    pushWorldEvent(world, chain.steps[0], "causality", chain.steps);
    return chain.steps;
  }

  // 资源流阈值触发的因果链（非纪元绑定）：新大陆白银航路开通 → 价格革命。
  function triggerFlowChains(world) {
    if (world.trade?.routes?.newWorld?.active && !world.firedChains?.has("price_revolution")) {
      applyCausalChain(world, "price_revolution");
    }
  }

  function checkEra(world) {
    const year = window.HIFI_WORLD_ENGINE.calendarForTurn(world.turn).year;
    let nextIndex = world.eraIndex;
    eras.forEach((era, index) => { if (year >= era.year) nextIndex = index; });
    if (nextIndex <= world.eraIndex) return false;
    world.eraIndex = nextIndex;
    const era = eras[nextIndex];
    const chainKey = CHAIN_BY_ERA[era.key];
    if (chainKey && !world.firedChains?.has(chainKey)) {
      applyCausalChain(world, chainKey); // 纪元转折升级为「文案 + 机制后果」
    } else {
      world.pendingTransition = {
        title: era.label,
        sub: `${era.year} 年后，旧规则开始松动`,
        chain: [`进入${era.label}`, "国家目标与可用机制发生变化"],
      };
      pushWorldEvent(world, `世界进入${era.label}`, "era", world.pendingTransition.chain);
    }
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
    if (typeof choice.apply === "function") choice.apply(world, country, event);
    // 阶层裁断回灌满意度流：让步平息怨气（升满意，脱离再触发区间），弹压只压一时（小升、留隐患）
    if (event.estateKey && country.estates?.[event.estateKey]) {
      const delta = choice.id === "concede" ? 36 : choice.id === "repress" ? -8 : 0;
      const estate = country.estates[event.estateKey];
      estate.satisfaction = Math.max(-100, Math.min(100, estate.satisfaction + delta));
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
    if (world.pendingElection) result.push({ id: "election", label: "选立新领导人", detail: world.pendingElection.polity, blocking: true, kind: "election", tier: "blocking" });
    for (const event of world.playerEvents) result.push({ id: event.id, label: event.title, detail: "需要裁断", blocking: true, kind: "event", tier: "blocking" });
    if (world.pendingTransition) result.push({ id: "transition", label: world.pendingTransition.title, detail: "时代转折", blocking: false, kind: "transition", tier: "opportunity" });
    const council = councilSummary(world);
    council.warnings
      .filter(warning => !warning.startsWith("国家目前没有"))
      .forEach((warning, index) => result.push({ id: `warning-${index}`, label: warning, detail: "顾问预警", blocking: false, kind: "council", tier: "opportunity" }));
    world.situations.forEach(item => {
      const severe = item.phase === "爆发" && item.eventGenerated;
      result.push({ id: `situation-${item.key}`, label: item.label, detail: item.phase, blocking: severe, kind: "council", tier: severe ? "blocking" : "opportunity" });
    });
    const player = world.playerPolity;
    if (window.HIFI_STRUGGLE_ENGINE) {
      const struggle = window.HIFI_STRUGGLE_ENGINE.struggleForPolity(world, player);
      const summary = struggle && window.HIFI_STRUGGLE_ENGINE.struggleSummary(world, player, struggle.key);
      if (summary) {
        result.push({
          id: `struggle-${summary.key}`,
          label: summary.label,
          detail: `${summary.displayPhaseLabel || summary.phaseLabel} · ${summary.recommendations?.[0] || "查看局势"}`,
          blocking: false,
          kind: "struggle",
          tier: "mainline",
          key: summary.key,
          target: { panel: "struggle", key: summary.key },
        });
      }
    }
    // 战争待办：玩家参战的每场战争（修 22 号 #3：战争没进队列）
    (world.diplomacy?.wars || []).forEach((war, index) => {
      const inAttack = war.attackers?.includes(player);
      const inDefend = war.defenders?.includes(player);
      if (!inAttack && !inDefend) return;
      const foes = (inAttack ? war.defenders : war.attackers) || [];
      const foe = foes[0] || "敌国";
      result.push({
        id: `war-${index}`,
        label: `与${foe}交战中`,
        detail: war.name ? `${war.name} · 可推进战争目标或议和` : "可推进战争目标或议和",
        blocking: false,
        kind: "war",
        tier: "mainline",
        target: { panel: "struggle", key: "hundred_years_war" },
      });
    });
    // 外交机会：与紧张邻国的关系（可派使节改善或威慑）
    if (window.HIFI_DIPLOMACY_ENGINE) {
      const tense = Object.keys(world.countries).find(target =>
        target !== player
        && ["wary", "rival", "hostile"].includes(window.HIFI_DIPLOMACY_ENGINE.diplomaticAttitude(world, player, target)));
      if (tense) result.push({
        id: "diplomacy-tense",
        label: `与${tense}关系紧张`,
        detail: "可派使节改善或威慑",
        blocking: false,
        kind: "diplomacy",
        tier: "opportunity",
        target: { drawer: "外交", tab: "外交:邦交", polity: tense },
      });
    }
    // 经济机会：可建设增收的己方地块
    if (window.HIFI_WORLD_ENGINE) {
      const buildable = window.HIFI_WORLD_ENGINE.controlledTiles(world, player)
        .find(tile => tile && !tile.isSea && Array.isArray(tile.buildings) && !tile.buildings.includes("market") && tile.population >= 2);
      if (buildable) result.push({
        id: `economy-${buildable.id}`,
        label: `${buildable.city || buildable.name || buildable.id}可建设增收`,
        detail: "可建市场提升产出",
        blocking: false,
        kind: "economy",
        tier: "opportunity",
        target: { drawer: "经济", tab: "经济:建设", tileId: buildable.id, focus: "[data-building]" },
      });
    }
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

  // 垂帘听政能否启动：有待选举/玩家事件/时代转折未处理时不能（否则 runRegency 会 0 推进、看似无响应）。
  // 不依赖 world.regency（startRegency 之前调用安全），供 UI 预判并给出反馈/置灰。
  function regencyBlocker(world) {
    if (world.pendingElection) return "需先选立新领导人";
    if (world.playerEvents && world.playerEvents.length) return "需先裁断当前事件";
    if (world.pendingTransition) return "需先确认时代转折";
    return null;
  }

  function canRunRegency(world) {
    return regencyBlocker(world) === null;
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

  // 局势鏖战压力回灌核心循环：当事国在 open_war 阶段每季被前线消耗军需与粮食，
  // 让资源停止无脑增长（核心循环：转折层→反作用回基底）。consumption 写进 lastReport.war，
  // 与黑死病救济(lastReport.event)、战争疲惫(warExhaustion 体感信号)三者互不叠加、各自可解释。
  function applyStruggleWarPressure(world) {
    const engine = window.HIFI_STRUGGLE_ENGINE;
    if (!engine) return;
    for (const struggle of engine.activeStruggles(world)) {
      const summaryByPolity = {};
      for (const [polity, party] of Object.entries(struggle.parties)) {
        if (party.role !== "principal") continue;
        const country = world.countries[polity];
        if (!country) continue;
        const summary = summaryByPolity[polity] ||= engine.struggleSummary(world, polity, struggle.key);
        const armies = Object.values(world.warfare?.armies || {}).filter(army => army.owner === polity);
        const soldiers = armies.reduce((sum, army) => sum + (army.units || []).reduce((inner, unit) => inner + (unit.soldiers || 0), 0), 0);
        const weightedMilitary = armies.reduce((sum, army) => sum + (army.units || []).reduce((inner, unit) => {
          const weight = { guard: 0.25, levy: 0.35, mercenary: 0.55, professional: 0.75, standing: 0.9 }[unit.serviceType] ?? 0.4;
          return inner + (unit.soldiers || 0) / 1000 * weight;
        }, 0), 0);
        let foodCost = 0, militaryCost = 0, moneyCost = 0, exhaustionGain = 0;
        if (struggle.phase === "open_war" && summary?.warActive) {
          foodCost = Math.ceil(soldiers / 1000 * 1.5);
          militaryCost = Math.ceil(weightedMilitary);
          exhaustionGain = 1 + Math.floor(Math.max(0, world.turn - struggle.phaseSinceTurn) / 4);
        } else if (struggle.phase === "truce") {
          moneyCost = Math.ceil((country.warfare?.warExhaustion || 0) / 5);
        } else if (struggle.phase === "standoff" && (struggle.warPressure || 0) >= 6) {
          militaryCost = Math.ceil(weightedMilitary * 0.5);
        }
        if (!foodCost && !militaryCost && !moneyCost && !exhaustionGain) continue;
        // 夹到 [0, 库存]：库存为负时不倒扣（Math.min(负, 正)=负 会变成加资源），破产国按 0 扣
        foodCost = Math.max(0, Math.min(country.food ?? 0, foodCost));
        militaryCost = Math.max(0, Math.min(country.military ?? 0, militaryCost));
        moneyCost = Math.max(0, Math.min(country.money ?? 0, moneyCost));
        country.food = (country.food ?? 0) - foodCost;
        country.military = (country.military ?? 0) - militaryCost;
        country.money = (country.money ?? 0) - moneyCost;
        country.warfare = country.warfare || { warExhaustion: 0 };
        country.warfare.warExhaustion = Math.min(100, (country.warfare.warExhaustion || 0) + exhaustionGain);
        country.lastReport = country.lastReport || {};
        country.lastReport.war = {
          label: struggle.label,
          phase: summary?.displayPhaseLabel || engine.phaseLabel(struggle),
          food: foodCost,
          military: militaryCost,
          money: moneyCost,
          exhaustion: exhaustionGain,
        };
      }
    }
  }

  // 季度账本：把本季 settleCountry 写入的 lastReport 重述成可读的资源变化与来源构成（修 22 号 #12）
  function quarterLedger(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    const report = country.lastReport || {};
    const central = .9 + Math.min(100, country.government?.centralPower ?? 60) / 500;
    const domesticMoney = country.tradePolicy === "closed" ? (report.money || 0) * 1.05 : (report.money || 0);
    const moneyProd = Math.round(domesticMoney * central);
    const moneyTrade = report.trade || 0;
    const moneyColonial = report.colonial || 0;
    const moneySources = [];
    if (moneyProd) moneySources.push(`地块产出 +${moneyProd}`);
    if (moneyTrade) moneySources.push(`贸易 +${moneyTrade}`);
    if (moneyColonial) moneySources.push(`殖民 +${moneyColonial}`);
    const militaryDelta = Math.round((report.military || 0) * central);
    const maint = report.maintenance || { food: 0, money: 0, military: 0 };
    const event = report.event || { food: 0, money: 0 };
    const war = report.war || { food: 0, money: 0, military: 0 };
    const seg = (gross, m, e, w, sources) => {
      const net = gross - m - e - w;
      return { gross, maintenance: m, event: e, war: w, net, delta: net, sources };
    };
    const warSrc = (cost) => (war.label && cost ? [`${war.label}·${war.phase} -${cost}`] : []);
    return {
      turn: world.turn,
      tiles: report.tiles || 0,
      food: seg(report.food || 0, maint.food || 0, event.food || 0, war.food || 0,
        [...(report.food ? [`地块产出 +${report.food}`] : []), ...warSrc(war.food || 0)]),
      money: seg(moneyProd + moneyTrade + moneyColonial, maint.money || 0, event.money || 0, war.money || 0,
        [...moneySources, ...warSrc(war.money || 0)]),
      military: seg(militaryDelta, maint.military || 0, 0, war.military || 0,
        [...(militaryDelta ? [`地块产出 +${militaryDelta}`] : []), ...warSrc(war.military || 0)]),
      war: report.war || null,
      completedAgenda: report.completedAgenda || null,
    };
  }

  function processHistory(world) {
    applyPressureEffects(world);
    processSituations(world);
    processPlayerCrises(world); // 压力层 → 必须裁断的阻塞决策（34 号 P1-2）
    if (window.HIFI_STRUGGLE_ENGINE) {
      window.HIFI_STRUGGLE_ENGINE.processStruggles(world); // 局势（百年战争）按季推进，与被动情势并列
      window.HIFI_STRUGGLE_ENGINE.reviewStruggles(world);  // 每 40 季给样板局一次战局评估
      window.HIFI_STRUGGLE_ENGINE.settleStruggles(world);  // 样板局第 12 季终局结算（不阻断沙盒继续）
    }
    applyStruggleWarPressure(world); // 鏖战阶段战争压力回灌产出流（在 settleCountry 写完 lastReport 之后追加 war 段）
    spreadTechnology(world);
    autoAdoptTechnology(world);
    processMilestones(world);
    applyMissions(world);
    triggerFlowChains(world);
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
    applyPressureEffects,
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
    canRunRegency,
    regencyBlocker,
    runRegency,
    completeTutorial,
    forecast,
    quarterLedger,
    missions,
    spreadTechnology,
    autoAdoptTechnology,
    shouldInterruptRegency,
    startRegency,
    tutorialTask,
  };
})();

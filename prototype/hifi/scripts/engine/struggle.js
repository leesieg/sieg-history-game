(() => {
  "use strict";

  // 局势引擎（Struggle）：把多国卷入、跨越数十年的大历史事件抽象成可交互的局势。
  // 设计依据 docs/design/26。与被动情势（黑死病/小冰期，history.js processSituations）分两类共存：
  // 局势用独立的 world.struggles[]，绝不触碰 world.situations 的旧逻辑。
  // 术语：阶段(Phase) / 诱因(Catalyst) / 参与度(Involvement) / 终局(Ending)。

  // 阶段循环：对峙→鏖战→疲惫议和 由诱因计量驱动循环；定局(resolution)只由终局结算进入（Phase 6）。
  const CYCLE_PHASES = ["standoff", "open_war", "truce"];

  const STRUGGLE_DEFINITIONS = {
    hundred_years_war: {
      key: "hundred_years_war",
      label: "百年战争",
      startYear: 1337,
      initialPhase: "standoff",
      flipThreshold: 8, // 单阶段计量达此值即翻阶段；时间默认诱因每季 +1
      parties: {
        "法兰西王国": { role: "principal" },
        "英格兰王国": { role: "principal" },
        "勃艮第公国": { role: "interloper", lean: 0 },   // lean<0 偏法 / >0 偏英
        "苏格兰王国": { role: "interloper", lean: -1 },
        "弗兰德斯伯国": { role: "interloper", lean: 0 },
        "教皇国": { role: "interloper", lean: 0 },
      },
      phases: {
        standoff: { label: "对峙", next: "open_war" },
        open_war: { label: "鏖战", next: "truce" },
        truce: { label: "疲惫议和", next: "standoff" },
        resolution: { label: "定局", next: null },
      },
    },
  };

  function definition(key) {
    return STRUGGLE_DEFINITIONS[key];
  }

  function phaseLabel(struggle, phase = struggle.phase) {
    return definition(struggle.key)?.phases?.[phase]?.label || phase;
  }

  // 自带的纪闻写入：不依赖 history 引擎也能跑（测试只加载 world+struggle 时仍可用）。
  function logStruggleEvent(world, text) {
    world.worldEvents = world.worldEvents || [];
    const id = `struggle-${world.struggleNextId = (world.struggleNextId || 0) + 1}`;
    world.worldEvents.unshift({ id, turn: world.turn, kind: "struggle", text, chain: null });
    world.worldEvents = world.worldEvents.slice(0, 80);
  }

  function startStruggle(world, key) {
    const def = definition(key);
    if (!def) throw new Error(`未知局势：${key}`);
    world.struggles = world.struggles || [];
    if (world.struggles.some(item => item.key === key)) return null;
    // 当事国必须齐全，否则这局势不成立（最小测试夹具或缺国的世界直接跳过）。
    const principals = Object.entries(def.parties).filter(([, party]) => party.role === "principal");
    if (!principals.every(([name]) => world.countries[name])) return null;
    const parties = {};
    for (const [name, config] of Object.entries(def.parties)) {
      if (world.countries[name]) parties[name] = { ...config };
    }
    const meters = {};
    for (const phase of CYCLE_PHASES) meters[phase] = 0;
    const struggle = {
      key,
      label: def.label,
      type: "struggle",
      startedTurn: world.turn,
      parties,
      phase: def.initialPhase,
      meters,
      phaseSinceTurn: world.turn,
      resolved: false,
      ending: null,
    };
    world.struggles.push(struggle);
    logStruggleEvent(world, `${def.label}成为左右欧洲的局势`);
    return struggle;
  }

  function initializeStruggles(world) {
    world.struggles = [];
    for (const key of Object.keys(STRUGGLE_DEFINITIONS)) startStruggle(world, key);
    return world;
  }

  function struggleFor(world, key) {
    return (world.struggles || []).find(item => item.key === key) || null;
  }

  function activeStruggles(world) {
    return (world.struggles || []).filter(item => !item.resolved);
  }

  // 参与度：当事国(principal) / 干涉者(interloper) / 旁观(bystander)
  function involvement(world, polity, struggle) {
    const role = struggle?.parties?.[polity]?.role;
    if (role === "principal") return "principal";
    if (role === "interloper") return "interloper";
    return "bystander";
  }

  function struggleForPolity(world, polity = world.playerPolity) {
    return activeStruggles(world).find(item => involvement(world, polity, item) !== "bystander") || null;
  }

  // 诱因：把已发生的事件折算成「推动某阶段」的计量分（Phase 3 接入战况信号时调用）。
  function addCatalyst(struggle, targetPhase, points = 1) {
    if (!struggle || struggle.resolved) return;
    if (!CYCLE_PHASES.includes(targetPhase)) return;
    struggle.meters[targetPhase] = (struggle.meters[targetPhase] || 0) + points;
  }

  // 计量达阈值即翻到该阶段（取分最高的目标阶段），翻后清零并记纪闻。
  function flipIfReady(world, struggle) {
    const threshold = definition(struggle.key).flipThreshold;
    let target = null;
    let best = threshold - 1;
    for (const phase of CYCLE_PHASES) {
      if (phase === struggle.phase) continue;
      if ((struggle.meters[phase] || 0) > best) {
        best = struggle.meters[phase];
        target = phase;
      }
    }
    if (!target) return false;
    struggle.phase = target;
    struggle.phaseSinceTurn = world.turn;
    for (const phase of CYCLE_PHASES) struggle.meters[phase] = 0;
    logStruggleEvent(world, `${struggle.label}进入「${phaseLabel(struggle)}」阶段`);
    return true;
  }

  function processStruggles(world) {
    for (const struggle of activeStruggles(world)) {
      if (struggle.phase === "resolution") continue;
      const next = definition(struggle.key).phases[struggle.phase]?.next;
      if (next && CYCLE_PHASES.includes(next)) {
        addCatalyst(struggle, next, 1); // 时间默认诱因：每季向默认下一阶段 +1
      }
      flipIfReady(world, struggle);
    }
  }

  window.HIFI_STRUGGLE_ENGINE = {
    STRUGGLE_DEFINITIONS,
    CYCLE_PHASES,
    initializeStruggles,
    startStruggle,
    processStruggles,
    involvement,
    struggleFor,
    struggleForPolity,
    activeStruggles,
    addCatalyst,
    phaseLabel,
  };
})();

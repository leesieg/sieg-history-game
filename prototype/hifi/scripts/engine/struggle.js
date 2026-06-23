(() => {
  "use strict";

  // 局势引擎（Struggle）：把多国卷入、跨越数十年的大历史事件抽象成可交互的局势。
  // 设计依据 docs/design/26。与被动情势（黑死病/小冰期，history.js processSituations）分两类共存：
  // 局势用独立的 world.struggles[]，绝不触碰 world.situations 的旧逻辑。
  // 术语：阶段(Phase) / 诱因(Catalyst) / 参与度(Involvement) / 终局(Ending)。

  // 阶段循环：对峙→鏖战→疲惫议和 由诱因计量驱动循环；定局(resolution)只由终局结算进入（Phase 6）。
  const CYCLE_PHASES = ["standoff", "open_war", "truce"];

  // 阶段限定操作（设计 §7）：操作 → 可用阶段（null=任意阶段）+ 参与度。摘要据此列「当前阶段可用操作」，
  // 作战室（Task 4.2）据此 gate。这里只声明可用性，不绑定具体引擎调用。
  const PHASE_ACTIONS = {
    press_claim: { label: "提王位主张", phase: "standoff", involvement: "principal" },
    muster_battle: { label: "决战集结", phase: "open_war", involvement: "principal" },
    favorable_truce: { label: "有利停战谈判", phase: "truce", involvement: "principal" },
    pick_side: { label: "选边支持", phase: null, involvement: "interloper" },
    ending_decision: { label: "终局决议", phase: "resolution", involvement: "principal" },
  };

  // 四终局预览（设计 §8）：摘要里静态展示，真实可达性由 Phase 6 终局结算判定。
  const ENDINGS = [
    { key: "france_hegemony", label: "法兰西霸权", hint: "三段使命全完成且进入定局阶段" },
    { key: "england_claim", label: "英格兰主张得逞", hint: "英格兰占据核心法兰西争议地" },
    { key: "negotiated_peace", label: "谈判和平", hint: "议和阶段达成双方妥协" },
    { key: "stalemate", label: "长期僵局", hint: "12 季内未分胜负" },
  ];

  const STRUGGLE_DEFINITIONS = {
    hundred_years_war: {
      key: "hundred_years_war",
      label: "百年战争",
      startYear: 1337,
      initialPhase: "standoff",
      flipThreshold: 8, // 单阶段计量达此值即翻阶段；时间默认诱因每季 +1
      // 争议区域（按城市名，与 objectives.CAMPAIGN_STAGES 的核心/收复城同源）：作战室「前线」与边境控制判定用
      regionCities: ["巴黎", "鲁昂", "奥尔良", "加斯科涅", "阿基坦", "波尔多", "加莱", "弗兰德斯"],
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
      // 诱因扫描的上季快照：战争分数 / 是否在战 / 各方统治者，用于折算战况增量
      signal: { score: 0, warActive: false, leaders: {} },
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

  // 当事国之间的主战争（百年战争=法兰西 vs 英格兰），从现有 world.diplomacy.wars 里查。
  function principalWar(world, struggle) {
    const principals = Object.keys(struggle.parties).filter(name => struggle.parties[name].role === "principal");
    if (principals.length < 2) return null;
    return (world.diplomacy?.wars || []).find(war =>
      principals.every(name => war.attackers.includes(name) || war.defenders.includes(name))
    ) || null;
  }

  // 诱因：把已发生的战况折算成阶段计量（读现有引擎产出，不新造事件）。
  function applyCatalysts(world, struggle) {
    const signal = struggle.signal || (struggle.signal = { score: 0, warActive: false, leaders: {} });
    const war = principalWar(world, struggle);
    if (war) {
      // 占领/会战推高 war.score（advanceOccupation +25）→ 鏖战诱因
      const delta = (war.score || 0) - (signal.score || 0);
      if (delta > 0) addCatalyst(struggle, "open_war", Math.max(1, Math.ceil(delta / 5)));
      signal.score = war.score || 0;
      signal.warActive = true;
    } else {
      // 上季还在打、这季战争消失 = 议和达成（concludePeace 移除了 war）→ 疲惫议和诱因
      if (signal.warActive) addCatalyst(struggle, "truce", definition(struggle.key).flipThreshold);
      signal.warActive = false;
      signal.score = 0;
    }
    // 统治者更替 / 当事国财政崩溃 → 疲惫议和诱因
    for (const polity of Object.keys(struggle.parties)) {
      const country = world.countries[polity];
      if (!country) continue;
      const leaderName = country.leader?.name;
      if (signal.leaders[polity] && signal.leaders[polity] !== leaderName) addCatalyst(struggle, "truce", 2);
      signal.leaders[polity] = leaderName;
      if (struggle.parties[polity].role === "principal" && (country.money ?? 0) < 0) addCatalyst(struggle, "truce", 2);
    }
  }

  function processStruggles(world) {
    for (const struggle of activeStruggles(world)) {
      if (struggle.phase === "resolution") continue;
      applyCatalysts(world, struggle); // 战况诱因
      const next = definition(struggle.key).phases[struggle.phase]?.next;
      if (next && CYCLE_PHASES.includes(next)) {
        addCatalyst(struggle, next, 1); // 时间默认诱因：每季向默认下一阶段 +1
      }
      flipIfReady(world, struggle);
    }
  }

  // --- Task 4.1：局势态势摘要 ----------------------------------------------
  // 把局势的阶段 / 战况 / 我方与敌方主力 / 阶段操作 / 终局预览 / 推荐下一步收成一个可展示对象。
  // 纯函数、读现有引擎产出（diplomacy.wars / warfare.armies），无 DOM，供作战室与顾问消费。

  function tileLabel(world, tileId) {
    const tile = (world.tiles || []).find(item => item.id === tileId);
    if (!tile) return null;
    return tile.city || `第 ${tile.id} 号地块`;
  }

  // 取某些归属国里实力最强的军团（实力 = 兵力 × 组织度），供「我方主力 / 敌方威胁」展示。
  function strongestArmy(world, owners) {
    let best = null;
    for (const army of Object.values(world.warfare?.armies || {})) {
      if (!owners.has(army.owner)) continue;
      const soldiers = (army.units || []).reduce((sum, unit) => sum + (unit.soldiers || 0), 0);
      const strength = Math.round(soldiers * (army.organization ?? 100) / 100);
      if (!best || strength > best.strength) {
        best = { id: army.id, owner: army.owner, strength, tileId: army.tileId, location: tileLabel(world, army.tileId) };
      }
    }
    return best;
  }

  // 争议区域地块集（按 regionCities 城市名解析成地块 id），作「前线 / 边境控制」判定。
  function regionTileIds(world, struggle) {
    const cities = new Set(definition(struggle.key)?.regionCities || []);
    return new Set((world.tiles || []).filter(tile => !tile.isSea && cities.has(tile.city)).map(tile => tile.id));
  }

  // 当前阶段 + 参与度下，玩家可用的阶段限定操作。
  function availableActions(struggle, role) {
    if (role === "bystander") return [];
    return Object.entries(PHASE_ACTIONS)
      .filter(([, action]) => action.involvement === role && (action.phase === null || action.phase === struggle.phase))
      .map(([id, action]) => ({ id, label: action.label, phase: action.phase }));
  }

  // 推荐下一步：先 3 条固定启发式（疲惫高→议和 / 主力军不在前线→集结 / 边境控制掉→增援）。
  function recommendations(world, polity, struggle, context) {
    const recs = [];
    const exhaustion = world.countries[polity]?.warfare?.warExhaustion || 0;
    if (exhaustion >= 20) recs.push("战争疲惫偏高，宜寻求有利停战");
    const front = regionTileIds(world, struggle);
    const atFront = context.ourArmy && front.has(context.ourArmy.tileId);
    if (!atFront) recs.push("主力军未在前线，集结决战");
    const weakBorder = (world.tiles || []).some(tile =>
      front.has(tile.id) && tile.polity === polity && (tile.control ?? 100) < 60);
    if (weakBorder) recs.push("边境控制下滑，增援巩固");
    return recs.slice(0, 3);
  }

  function struggleSummary(world, polity = world.playerPolity, key) {
    const struggle = key ? struggleFor(world, key) : struggleForPolity(world, polity);
    if (!struggle) return null; // 没有局势 → 空（不报错）
    const def = definition(struggle.key);
    const role = involvement(world, polity, struggle);
    const principals = Object.keys(struggle.parties).filter(name => struggle.parties[name].role === "principal");
    const opponents = principals.filter(name => name !== polity);
    const war = principalWar(world, struggle);
    const ourArmy = strongestArmy(world, new Set([polity]));
    const enemyThreat = strongestArmy(world, new Set(opponents));
    return {
      key: struggle.key,
      label: struggle.label,
      phase: struggle.phase,
      phaseLabel: phaseLabel(struggle),
      meters: { ...struggle.meters },
      flipThreshold: def.flipThreshold,
      involvement: role,
      principals,
      opponents,
      war: war ? { name: war.name, score: war.score || 0, goalTile: tileLabel(world, war.primaryGoal?.tileId) } : null,
      warExhaustion: world.countries[polity]?.warfare?.warExhaustion || 0,
      ourArmy,
      enemyThreat,
      actions: availableActions(struggle, role),
      endings: ENDINGS,
      recommendations: recommendations(world, polity, struggle, { ourArmy }),
    };
  }

  // 阶段限定操作 gate（设计 §7）：纯校验，不调别的引擎。校验通过返回对应局势对象，
  // 不通过抛中文错误（UI 层 runAction 捕获后 toast）。真实引擎调用由 UI 层在 gate 之后执行。
  function phaseActionGate(world, polity, actionId) {
    const action = PHASE_ACTIONS[actionId];
    if (!action) throw new Error("未知的局势操作");
    const struggle = struggleForPolity(world, polity);
    if (!struggle) throw new Error("当前没有可操作的局势");
    const role = involvement(world, polity, struggle);
    if (action.involvement !== role) {
      throw new Error(action.involvement === "interloper" ? "该操作仅供干涉者使用" : "只有当事国可执行该操作");
    }
    if (action.phase !== null && action.phase !== struggle.phase) {
      throw new Error(`「${action.label}」只能在「${phaseLabel(struggle, action.phase)}」阶段执行，当前为「${phaseLabel(struggle)}」`);
    }
    return struggle;
  }

  // 干涉者选边：改 lean 并注入对应阶段诱因（偏法→对峙、偏英→鏖战）。
  function pickSide(world, polity, lean = -1) {
    const struggle = struggleForPolity(world, polity);
    if (!struggle) throw new Error("当前没有可操作的局势");
    const party = struggle.parties[polity];
    if (party?.role !== "interloper") throw new Error("只有干涉者可以选边");
    party.lean = lean;
    addCatalyst(struggle, lean >= 0 ? "open_war" : "standoff", 2);
    logStruggleEvent(world, `${polity}在${struggle.label}中选边支持${lean >= 0 ? "英格兰" : "法兰西"}`);
    return struggle;
  }

  window.HIFI_STRUGGLE_ENGINE = {
    STRUGGLE_DEFINITIONS,
    CYCLE_PHASES,
    PHASE_ACTIONS,
    ENDINGS,
    initializeStruggles,
    startStruggle,
    processStruggles,
    involvement,
    struggleFor,
    struggleForPolity,
    activeStruggles,
    addCatalyst,
    phaseLabel,
    struggleSummary,
    phaseActionGate,
    pickSide,
  };
})();

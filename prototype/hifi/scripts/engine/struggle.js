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
    press_claim: {
      label: "提王位主张", phase: "standoff", involvement: "principal",
      precheck: (world, polity, struggle) => {
        if (principalWar(world, struggle)) {
          return { ok: false, reason: `与${opponentOf(struggle, polity)}已经交战，无需再提主张` };
        }
        if (underPrincipalTruce(world, struggle)) {
          return { ok: false, reason: "停战协议尚未到期，不能重新提出战争主张" };
        }
        return { ok: true };
      },
    },
    muster_battle: {
      label: "决战集结", phase: "open_war", involvement: "principal",
      precheck: (world, polity, struggle) => {
        if (!principalWar(world, struggle)) return { ok: false, reason: "当前没有真实战争，无法决战集结" };
        return hasMusterCity(world, polity) ? { ok: true } : { ok: false, reason: "没有可供集结的城市" };
      },
    },
    favorable_truce: {
      label: "有利停战谈判", phase: "truce", involvement: "principal",
      precheck: (world, polity, struggle) => principalWar(world, struggle)
        ? { ok: true }
        : { ok: false, reason: "目前没有与对手的战争可议和" },
    },
    pick_side: { label: "选边支持", phase: null, involvement: "interloper", precheck: () => ({ ok: true }) },
    ending_decision: { label: "终局决议", phase: "resolution", involvement: "principal" },
  };

  // 四终局预览（设计 §8）：摘要里展示，真实可达性由终局结算判定。
  // 决定性终局（霸权/英占核心）随时可触发；妥协/僵局只在历史终点年（1453）拍板。
  const ENDINGS = [
    { key: "france_hegemony", label: "法兰西霸权", hint: "三段使命全完成，英格兰被逐出大陆" },
    { key: "england_claim", label: "英格兰主张得逞", hint: "英格兰占据核心法兰西争议地" },
    { key: "negotiated_peace", label: "谈判和平", hint: "议和阶段双方妥协，争议地分割" },
    { key: "stalemate", label: "长期僵局", hint: "至 1453 仍未分胜负，两败俱疲" },
  ];

  const STRUGGLE_DEFINITIONS = {
    hundred_years_war: {
      key: "hundred_years_war",
      label: "百年战争",
      startYear: 1337,
      endYear: 1453,            // 历史终点：1337→1453 共 116 年。未达决定性终局则在此年拍板妥协/僵局
      initialPhase: "standoff",
      flipThreshold: 8, // 单阶段计量达此值即翻阶段；时间默认诱因每季 +1
      // 争议区域（按城市名，与 objectives.CAMPAIGN_STAGES 的核心/收复城同源）：作战室「前线」与边境控制判定用
      regionCities: ["巴黎", "鲁昂", "奥尔良", "加斯科涅", "阿基坦", "波尔多", "加莱", "弗兰德斯", "诺曼底", "布列塔尼", "香槟", "勃艮第"],
      // 参与方（数据驱动）：lean<0 偏法 / >0 偏英 / 0 中立。历史站位——苏格兰/卡斯蒂利亚盟法，
      // 勃艮第/弗兰德斯/巴伐利亚皇帝侧盟英，教皇国居中调停。缺席世界里不存在的国家会被 startStruggle 过滤。
      parties: {
        "法兰西王国": { role: "principal" },
        "英格兰王国": { role: "principal" },
        "勃艮第公国": { role: "interloper", lean: 1 },
        "弗兰德斯伯国": { role: "interloper", lean: 1 },
        "巴伐利亚公国": { role: "interloper", lean: 1 },
        "苏格兰王国": { role: "interloper", lean: -1 },
        "卡斯蒂利亚王国": { role: "interloper", lean: -1 },
        "教皇国": { role: "interloper", lean: 0 },
      },
      phases: {
        standoff: { label: "对峙", next: "open_war" },
        open_war: { label: "鏖战", next: "truce" },
        truce: { label: "疲惫议和", next: "standoff" },
        resolution: { label: "定局", next: null },
      },
    },
    thirty_years_war: {
      key: "thirty_years_war",
      label: "三十年战争",
      startYear: 1618,
      endYear: 1648,
      initialPhase: "standoff",
      flipThreshold: 8,
      principalAnchors: ["天主教联盟", "新教联盟"],
      principalLabels: { catholic_league: "天主教联盟", protestant_league: "新教联盟" },
      regionCities: ["维也纳", "慕尼黑", "布拉格", "莱比锡", "科隆", "第戎", "布鲁日", "米兰"],
      parties: {
        "巴伐利亚公国": { role: "principal", side: "catholic_league", lean: -1 },
        "奥地利公国": { role: "principal", side: "catholic_league", lean: -1 },
        "萨克森选侯国": { role: "principal", side: "protestant_league", lean: 1 },
        "波西米亚王国": { role: "principal", side: "protestant_league", lean: 1 },
        "弗兰德斯伯国": { role: "interloper", lean: 1 },
        "勃艮第公国": { role: "interloper", lean: -1 },
        "法兰西王国": { role: "interloper", lean: 1 },
        "教皇国": { role: "interloper", lean: -1 },
      },
      phases: {
        standoff: { label: "宗派对峙", next: "open_war" },
        open_war: { label: "帝国鏖战", next: "truce" },
        truce: { label: "疲惫议和", next: "standoff" },
        resolution: { label: "威斯特法利亚", next: null },
      },
      endings: [
        { key: "westphalia", label: "威斯特法利亚和约", hint: "诸侯主权确立，组内宗教战争失去法理" },
        { key: "catholic_imperial_victory", label: "皇帝集权胜利", hint: "帝国权威维持，皇帝压制宗派分裂" },
        { key: "protestant_princely_victory", label: "诸侯主权胜利", hint: "新教诸侯迫使皇帝承认高度自治" },
      ],
      endingResolver: "westphalia",
    },
  };

  function definition(key) {
    return STRUGGLE_DEFINITIONS[key];
  }

  function phaseLabel(struggle, phase = struggle.phase) {
    return definition(struggle.key)?.phases?.[phase]?.label || phase;
  }

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
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
    const year = window.HIFI_WORLD_ENGINE?.calendarForTurn?.(world.turn)?.year;
    if (def.startYear && year != null && year < def.startYear) return null;
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
      warPressure: 0,
      warningTurn: null,
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
  function principalsOf(struggle) {
    return Object.keys(struggle.parties).filter(name => struggle.parties[name].role === "principal");
  }

  function principalSides(struggle) {
    const sides = {};
    for (const [name, party] of Object.entries(struggle.parties)) {
      if (party.role !== "principal") continue;
      const side = party.side || name;
      (sides[side] ||= []).push(name);
    }
    return sides;
  }

  function opponentOf(struggle, polity) {
    const party = struggle.parties?.[polity];
    if (party?.side) {
      const labels = definition(struggle.key)?.principalLabels || {};
      const enemySide = Object.keys(principalSides(struggle)).find(side => side !== party.side);
      return labels[enemySide] || enemySide || "对手";
    }
    return principalsOf(struggle).find(name => name !== polity) || "对手";
  }

  function principalWar(world, struggle) {
    const sides = Object.values(principalSides(struggle));
    if (sides.length >= 2) {
      return (world.diplomacy?.wars || []).find(war =>
        sides.some(side => side.some(name => war.attackers.includes(name) || war.defenders.includes(name)))
        && sides.every(side => side.some(name => war.attackers.includes(name) || war.defenders.includes(name)))
      ) || null;
    }
    const principals = principalsOf(struggle);
    if (principals.length < 2) return null;
    return (world.diplomacy?.wars || []).find(war =>
      principals.every(name => war.attackers.includes(name) || war.defenders.includes(name))
    ) || null;
  }

  function hasMusterCity(world, polity) {
    return (world.tiles || []).some(tile => !tile.isSea && tile.polity === polity && tile.city);
  }

  function underPrincipalTruce(world, struggle) {
    const [a, b] = principalsOf(struggle);
    if (!a || !b || !window.HIFI_WARFARE_ENGINE?.underTruce) return false;
    return window.HIFI_WARFARE_ENGINE.underTruce(world, a, b);
  }

  function missionDone(world, polity, id) {
    const stages = window.HIFI_OBJECTIVES_ENGINE?.missionStages?.(world, polity) || [];
    const stage = stages.find(item => item.id === id);
    return !!stage?.done || stage?.status === "已完成";
  }

  function borderTension(world, struggle) {
    const front = regionTileIds(world, struggle);
    return (world.tiles || []).filter(tile => front.has(tile.id) && (tile.control ?? 100) < 70).length;
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
      // 记一笔「曾以停战收场」：终局判定据此判谈判和平，避免被默认诱因把阶段推回对峙后误判僵局。
      if (signal.warActive) {
        addCatalyst(struggle, "truce", definition(struggle.key).flipThreshold);
        struggle.peaceReached = true;
        struggle.lastPeaceTurn = world.turn;
      }
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
      const war = principalWar(world, struggle);
      if (war) addCatalyst(struggle, "open_war", 1);
      else if (struggle.phase === "open_war") addCatalyst(struggle, "truce", 2);
      else if (struggle.phase === "truce") addCatalyst(struggle, "standoff", 1);
      updateWarPressure(world, struggle);
      flipIfReady(world, struggle);
    }
  }

  function updateWarPressure(world, struggle) {
    if (struggle.phase !== "standoff" || principalWar(world, struggle)) return;
    if (struggle.key !== "hundred_years_war") return;
    struggle.warPressure ||= 0;
    if (!underPrincipalTruce(world, struggle)) struggle.warPressure += 1;
    if (!missionDone(world, "法兰西王国", "reclaim-disputed")) struggle.warPressure += 1;
    if (borderTension(world, struggle) > 0) struggle.warPressure += 1;

    if (struggle.warPressure >= 6 && !struggle.warningTurn) {
      struggle.warningTurn = world.turn;
      world.pendingStruggleWarning = { key: struggle.key, label: struggle.label, kind: "war_pressure" };
      logStruggleEvent(world, `${struggle.label}战云密布，双方开始重新集结`);
    }

    const prepared = struggle.warningTurn && world.turn - struggle.warningTurn >= 2;
    if (struggle.warPressure < 8 || !prepared || underPrincipalTruce(world, struggle)) return;
    if (!window.HIFI_WARFARE_ENGINE?.declareWarOn) return;
    // 重燃发生在两位当事国之间，与玩家身份无关（玩家可能是干涉者/旁观者，不能硬当被告）。
    const principals = principalsOf(struggle);
    if (principals.length < 2) return;
    const attacker = principals.find(name => name !== world.playerPolity) || principals[0];
    const defender = principals.find(name => name !== attacker);
    const permission = window.HIFI_WARFARE_ENGINE.canDeclareWar?.(world, attacker, defender);
    if (!permission?.ok) return;
    window.HIFI_WARFARE_ENGINE.declareWarOn(world, attacker, defender, `${struggle.label}·重燃`);
    struggle.warPressure = 0;
    struggle.warningTurn = null;
    addCatalyst(struggle, "open_war", definition(struggle.key).flipThreshold);
    logStruggleEvent(world, `${struggle.label}重燃战火，${attacker}再度兴兵`);
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

  // 两大阵营：principal 各为锚，interloper 按 lean 归边（<0 法 / >0 英 / 0 中立）。供统一界面左右两侧展示。
  function campsFor(struggle) {
    if (struggle.key === "thirty_years_war") {
      const catholic = [], protestant = [], neutral = [];
      for (const [name, party] of Object.entries(struggle.parties)) {
        if (party.role === "principal") continue;
        const lean = party.lean || 0;
        if (lean < 0) catholic.push(name);
        else if (lean > 0) protestant.push(name);
        else neutral.push(name);
      }
      return {
        france: { anchor: "天主教联盟", members: catholic },
        england: { anchor: "新教联盟", members: protestant },
        catholic: { anchor: "天主教联盟", members: catholic },
        protestant: { anchor: "新教联盟", members: protestant },
        neutral,
      };
    }
    const france = [], england = [], neutral = [];
    for (const [name, party] of Object.entries(struggle.parties)) {
      if (party.role === "principal") continue;
      const lean = party.lean || 0;
      if (lean < 0) france.push(name);
      else if (lean > 0) england.push(name);
      else neutral.push(name);
    }
    return {
      france: { anchor: "法兰西王国", members: france },
      england: { anchor: "英格兰王国", members: england },
      neutral,
    };
  }

  // 当前国家在该局势里能执行的「全部」决议（不止当前阶段）：enabled=false 的附中文不可用原因，供 UI 置灰。
  function decisionsFor(world, polity, struggle, role) {
    if (role === "bystander") return [];
    return Object.entries(PHASE_ACTIONS)
      .filter(([, action]) => action.involvement === role)
      .map(([id, action]) => {
        let enabled = true, reason = "";
        try { phaseActionGate(world, polity, id); } catch (error) { enabled = false; reason = error.message; }
        return {
          id,
          label: action.label,
          phase: action.phase,
          phaseLabel: action.phase ? phaseLabel(struggle, action.phase) : "任意阶段",
          enabled,
          reason,
        };
      });
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
    const war = principalWar(world, struggle);
    if (struggle.phase === "standoff") recs.push("集结备战，拉拢盟友，降低再开战压力");
    if (struggle.phase === "open_war" && war) recs.push("标记争议地，规划军团路线并围攻目标");
    if (struggle.phase === "open_war" && !war) recs.push("当前为备战态，先补员并等待战云密布");
    if (struggle.phase === "truce") recs.push(war ? "评估有利停战条款" : "休整军团，准备下一轮对峙");
    return [...new Set(recs)].slice(0, 3);
  }

  function struggleSummary(world, polity = world.playerPolity, key) {
    const struggle = key ? struggleFor(world, key) : struggleForPolity(world, polity);
    if (!struggle) return null; // 没有局势 → 空（不报错）
    const def = definition(struggle.key);
    const role = involvement(world, polity, struggle);
    const principals = principalsOf(struggle);
    const party = struggle.parties?.[polity];
    const opponents = party?.side ? Object.entries(struggle.parties)
      .filter(([, item]) => item.role === "principal" && item.side !== party.side)
      .map(([name]) => name) : principals.filter(name => name !== polity);
    const war = principalWar(world, struggle);
    const ourArmy = strongestArmy(world, new Set([polity]));
    const calendarOf = window.HIFI_WORLD_ENGINE?.calendarForTurn;
    const year = calendarOf ? calendarOf(world.turn).year : null;
    let ourSide = "france";
    if (struggle.key === "thirty_years_war") {
      if (role === "principal") ourSide = party?.side === "protestant_league" ? "protestant" : "catholic";
      else if (role === "interloper") ourSide = (struggle.parties[polity].lean || 0) > 0 ? "protestant" : "catholic";
    } else if (role === "principal") ourSide = polity === "英格兰王国" ? "england" : "france";
    else if (role === "interloper") ourSide = (struggle.parties[polity].lean || 0) > 0 ? "england" : "france";
    return {
      key: struggle.key,
      label: struggle.label,
      phase: struggle.phase,
      phaseLabel: phaseLabel(struggle),
      displayPhaseLabel: struggle.phase === "open_war" && !war ? "备战" : phaseLabel(struggle),
      warActive: !!war,
      resolved: struggle.resolved,
      ending: struggle.ending,
      meters: { ...struggle.meters },
      warPressure: struggle.warPressure || 0,
      flipThreshold: def.flipThreshold,
      involvement: role,
      principals,
      opponents,
      // 时期：供统一界面顶部横幅展示「1337–1453 · 当前年」
      year,
      startYear: def.startYear,
      endYear: def.endYear,
      camps: campsFor(struggle),
      ourSide,
      war: war ? { name: war.name, score: war.score || 0, goalTile: tileLabel(world, war.primaryGoal?.tileId) } : null,
      warExhaustion: world.countries[polity]?.warfare?.warExhaustion || 0,
      ourArmy,
      enemyThreat: strongestArmy(world, new Set(opponents)),
      actions: availableActions(struggle, role),
      decisions: decisionsFor(world, polity, struggle, role),
      endings: def.endings || ENDINGS,
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
    const check = action.precheck ? action.precheck(world, polity, struggle) : { ok: true };
    if (!check.ok) throw new Error(check.reason || "当前条件不足，无法执行该局势操作");
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
    const labels = definition(struggle.key)?.principalLabels;
    const support = labels
      ? (lean >= 0 ? labels.protestant_league : labels.catholic_league)
      : (lean >= 0 ? "英格兰" : "法兰西");
    logStruggleEvent(world, `${polity}在${struggle.label}中选边支持${support}`);
    return struggle;
  }

  // --- Task 6.1：12 季样板局终局结算（设计 §8）---------------------------------
  // 到样板局终点对三段使命状态拍快照，判定四终局之一，写永久区域修正，set world.pendingStruggleEnding 供 UI 展示。
  // 终局只作为样板局结果，resolved 后局势退出推进，但不阻断沙盒继续游玩。

  // 三段使命全完成（复用 objectives.missionStages 作同一真相源；未加载该引擎时视为未完成）。
  function franceMissionsAllDone(world) {
    // missionStages?. 兜底：缓存到旧版 objectives.js（无该方法）时也不崩，仅视为未完成。
    const stages = window.HIFI_OBJECTIVES_ENGINE?.missionStages?.(world, "法兰西王国") || [];
    return stages.length > 0 && stages.every(stage => stage.status === "已完成");
  }

  // 英格兰占据法兰西核心争议地（巴黎/鲁昂/奥尔良任一落入英手）。
  function englandHoldsFrenchCore(world) {
    const core = new Set(["巴黎", "鲁昂", "奥尔良"]);
    const coreTiles = (world.tiles || []).filter(tile => !tile.isSea && core.has(tile.city));
    return coreTiles.some(tile => tile.polity === "英格兰王国");
  }

  // 决定性终局：随时可触发（霸权 / 英占核心），让百年战争可以在任一年被某一方一锤定音。
  function decisiveEnding(world) {
    if (franceMissionsAllDone(world)) return "france_hegemony";    // 法兰西霸权：三段全完成
    if (englandHoldsFrenchCore(world)) return "england_claim";     // 英格兰主张得逞：占据核心
    return null;
  }

  // 历史终点年（1453）拍板：决定性终局未触发时，按当时阶段判妥协 / 僵局。
  function decideEnding(world, struggle) {
    if (definition(struggle.key)?.endingResolver === "westphalia") return decideWestphaliaEnding(world, struggle);
    const decisive = decisiveEnding(world);
    if (decisive) return decisive;
    // 谈判和平：当前无当事国战争，且历史上曾以停战收场（不只看瞬时阶段——
    // processStruggles 的默认诱因每个和平季把 truce 推回 standoff，瞬时 phase 很少停在 truce）。
    if (!principalWar(world, struggle) && (struggle.phase === "truce" || struggle.peaceReached)) return "negotiated_peace";
    return "stalemate";                                            // 长期僵局：均未达成
  }

  function decideWestphaliaEnding(world, struggle) {
    const hre = window.HIFI_SUPRANATIONAL_ENGINE?.structure?.(world, "hre");
    const protestant = principalsOf(struggle)
      .filter(polity => world.countries[polity]?.stateConfession && world.countries[polity].stateConfession !== "catholic").length;
    if ((hre?.authority || 0) >= 65 && protestant <= 1) return "catholic_imperial_victory";
    if ((hre?.authority || 0) <= 25 || protestant >= 2) return "protestant_princely_victory";
    return "westphalia";
  }

  function applyWestphalia(world, struggle, ending) {
    world.flags ||= {};
    world.flags.westphalia = true;
    world.flags.religiousSovereignty = true;
    world.flags.intraChristianReligiousWarsDisabled = true;
    const hre = window.HIFI_SUPRANATIONAL_ENGINE?.structure?.(world, "hre");
    if (hre) {
      hre.authority = ending === "catholic_imperial_victory"
        ? Math.max(hre.authority || 0, 70)
        : Math.min(hre.authority || 0, ending === "protestant_princely_victory" ? 18 : 28);
      hre.westphaliaSettlement = ending;
      for (const member of Object.values(hre.members || {})) {
        member.sovereign = ending !== "catholic_imperial_victory";
      }
    }
    for (const [polity, party] of Object.entries(struggle.parties)) {
      const country = world.countries[polity];
      if (!country) continue;
      country.religiousSovereignty = true;
      if (party.role === "principal") country.legitimacy = clamp((country.legitimacy || 50) + (ending === "westphalia" ? 4 : 2));
      if (country.warfare) country.warfare.warExhaustion = Math.max(0, (country.warfare.warExhaustion || 0) - 8);
    }
  }

  function applyEnding(world, struggle, ending) {
    struggle.resolved = true;
    struggle.ending = ending;
    struggle.phase = "resolution";
    struggle.phaseSinceTurn = world.turn;
    const france = world.countries["法兰西王国"];
    if (struggle.key === "thirty_years_war") {
      applyWestphalia(world, struggle, ending);
    } else if (ending === "france_hegemony" && france) {
      france.legitimacy = clamp((france.legitimacy || 0) + 10);              // 永久合法性加成
      france.struggleLegacy = { key: ending, outputBonus: 0.1 };             // 核心永久产出加成标记（供 economy 后续接入）
    } else if (ending === "england_claim" && france) {
      france.legitimacy = clamp((france.legitimacy || 0) - 10);              // 核心崩坏
      france.struggleLegacy = { key: ending, coreDebuff: true };
    } else if (ending === "negotiated_peace") {
      for (const name of Object.keys(struggle.parties)) {                    // 双方解除战争疲惫
        const country = world.countries[name];
        if (country?.warfare) country.warfare.warExhaustion = 0;
      }
    } else if (ending === "stalemate") {
      for (const name of Object.keys(struggle.parties)) {                    // 双方背疲惫 debt
        const country = world.countries[name];
        if (country?.warfare) country.warfare.warExhaustion = (country.warfare.warExhaustion || 0) + 5;
      }
    }
    const endingLabel = (definition(struggle.key)?.endings || ENDINGS).find(item => item.key === ending)?.label || ending;
    logStruggleEvent(world, `${struggle.label}迎来终局：${endingLabel}`);
    const stages = struggle.key === "hundred_years_war" && window.HIFI_OBJECTIVES_ENGINE
      ? window.HIFI_OBJECTIVES_ENGINE.missionStages(world, "法兰西王国")
      : [];
    world.pendingStruggleEnding = { key: struggle.key, label: struggle.label, ending, endingLabel, stages };
    return ending;
  }

  // 终局结算：让局势真正跑「百年」。阶段在 1337→1453 间反复循环，期间只有某方达成决定性
  // 终局才会提前定局；否则到历史终点年（1453）才拍板妥协 / 僵局。
  function settleStruggles(world) {
    const calendarOf = window.HIFI_WORLD_ENGINE?.calendarForTurn;
    for (const struggle of activeStruggles(world)) {
      const decisive = struggle.key === "hundred_years_war" ? decisiveEnding(world) : null;
      if (decisive) { applyEnding(world, struggle, decisive); continue; } // 决定性终局：随时一锤定音
      const endYear = definition(struggle.key)?.endYear;
      const year = calendarOf ? calendarOf(world.turn).year : null;
      if (endYear && year != null && year >= endYear) {                   // 到历史终点年：拍板妥协 / 僵局
        applyEnding(world, struggle, decideEnding(world, struggle));
      }
    }
  }

  function reviewStruggles(world) {
    const calendarOf = window.HIFI_WORLD_ENGINE?.calendarForTurn;
    for (const struggle of activeStruggles(world)) {
      const elapsed = world.turn - struggle.startedTurn;
      if (elapsed < 40 || elapsed % 40 !== 0) continue;
      if (struggle.lastReviewTurn === world.turn) continue;
      struggle.lastReviewTurn = world.turn;

      const stages = window.HIFI_OBJECTIVES_ENGINE?.missionStages?.(world, "法兰西王国") || [];
      const done = stages.filter(stage => stage.done || stage.status === "已完成").length;
      const war = principalWar(world, struggle);
      const exhaustion = world.countries["法兰西王国"]?.warfare?.warExhaustion || 0;
      const advantage = done * 2 + (war ? Math.sign(war.score || 0) : 0) - Math.floor(exhaustion / 20);
      const verdict = advantage >= 3 ? "优势" : advantage <= -1 ? "劣势" : "胶着";
      const france = world.countries["法兰西王国"];
      if (france) france.legitimacy = clamp((france.legitimacy || 0) + (verdict === "优势" ? 4 : verdict === "劣势" ? -4 : 0));
      world.pendingStruggleReview = {
        key: struggle.key,
        label: struggle.label,
        year: calendarOf ? calendarOf(world.turn).year : null,
        turn: world.turn,
        verdict,
        done,
        total: stages.length,
        exhaustion,
      };
      logStruggleEvent(world, `${struggle.label}十年战局评估：${verdict}`);
    }
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
    reviewStruggles,
    settleStruggles,
    updateWarPressure,
    decideEnding,
    decisiveEnding,
    campsFor,
  };
})();

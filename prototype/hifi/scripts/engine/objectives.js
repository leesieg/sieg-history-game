(() => {
  "use strict";

  // 目标引擎：长期使命（nationalMission）/ 中期议程（midAgenda）/ 本季三件事（seasonTasks）
  // 三者都是纯函数、零 DOM，规则全部从 world/country state 派生（核心循环：压力层 → 转折层的「目标」表达）。

  function isAtWar(world, polity) {
    const wars = world.diplomacy?.wars || [];
    return wars.some(war => war.attackers.includes(polity) || war.defenders.includes(polity));
  }

  function warsAgainst(world, polity) {
    const wars = world.diplomacy?.wars || [];
    return wars.filter(war => war.attackers.includes(polity) || war.defenders.includes(polity));
  }

  // 国家是否在某场战争中作为被宣战的一方、且对方对自己的地盘提出了领土主张
  // （primaryGoal.tileId 落在己方控制地块上 = 对方在打自己的领土）。
  function hasTerritorialClaimAgainst(world, polity) {
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const tileIds = new Set(tiles.map(tile => tile.id));
    return warsAgainst(world, polity).some(war => war.primaryGoal && tileIds.has(war.primaryGoal.tileId) && war.primaryGoal.claimant !== polity);
  }

  function lowControlTiles(world, polity, threshold = 55) {
    return window.HIFI_WORLD_ENGINE.controlledTiles(world, polity).filter(tile => (tile.control ?? 100) < threshold);
  }

  // --- nationalMission：长期使命，规则表按「处境」选一条，1 条 ---
  function nationalMission(world, polity = world.playerPolity) {
    const country = world.countries[polity];
    if (hasTerritorialClaimAgainst(world, polity)) {
      const claimedTiles = lowControlTiles(world, polity, 100).length
        ? lowControlTiles(world, polity, 100)
        : window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
      const targetLabel = claimedTiles.find(tile => tile.city)?.city || `${polity}本土地块`;
      return {
        id: "reclaim-territory",
        title: "收复失地",
        why: "恢复王权威信，终结敌国在本土的立足点",
        targets: [`${targetLabel}相关地块`],
      };
    }
    if (isAtWar(world, polity)) {
      return {
        id: "win-the-war",
        title: "赢得当下的战争",
        why: "对外战争消耗国力，必须以胜利或体面的和约收场，否则合法性会持续流失",
        targets: ["敌国前线军团", "停战或胜利和约"],
      };
    }
    if ((country.legitimacy ?? 100) < 55) {
      return {
        id: "consolidate-crown",
        title: "稳固王权",
        why: "统治合法性承压，必须先安抚阶层、巩固中央权力，再图对外扩张",
        targets: ["议会/阶层支持", "中央集权进程"],
      };
    }
    return {
      id: "expand-trade",
      title: "扩张贸易",
      why: "国内局势稳定，应当把握时机接入更广的商路网络，把国力转化为长期财富",
      targets: ["洲际商路", "港口与市场建设"],
    };
  }

  // --- missionStages：战役阶段使命，数据驱动（CAMPAIGN_STAGES），非法兰西国家返回 [] 走通用目标 ---
  // 设计依据 docs/design/26 §8 + france-campaign 计划 Task 2.1。终局结算（Phase 6）复用这套阶段状态。
  function existingCityTiles(world, cities) {
    const set = new Set(cities);
    return world.tiles.filter(tile => !tile.isSea && set.has(tile.city));
  }
  function controlledCityTiles(world, polity, cities) {
    return existingCityTiles(world, cities).filter(tile => tile.polity === polity);
  }

  const CAMPAIGN_STAGES = [
    {
      polity: "法兰西王国",
      struggle: "hundred_years_war",
      stages: [
        {
          id: "secure-core",
          name: "稳住王国核心",
          detail: "保持巴黎、鲁昂、奥尔良控制稳定（控制力 ≥ 60）",
          reward: "核心稳固，合法性不再流失",
          penalty: "核心动摇将拖垮整场战争",
          cities: ["巴黎", "鲁昂", "奥尔良"],
          done(world, polity) {
            const owned = controlledCityTiles(world, polity, this.cities);
            return owned.length > 0 && owned.every(tile => (tile.control ?? 100) >= 60);
          },
        },
        {
          id: "reclaim-disputed",
          name: "收复争议领地",
          detail: "夺回加斯科涅 / 阿基坦方向的争议地块，并清除敌国对本土的领土主张",
          reward: "削弱英格兰在大陆的立足点",
          penalty: "争议地久拖，英军会步步紧逼",
          cities: ["加斯科涅", "阿基坦", "波尔多"],
          done(world, polity) {
            const existing = existingCityTiles(world, this.cities);
            const owned = controlledCityTiles(world, polity, this.cities);
            return existing.length > 0 && owned.length === existing.length && !hasTerritorialClaimAgainst(world, polity);
          },
        },
        {
          id: "favorable-peace",
          name: "争取有利和平",
          detail: "以有利和约或足够战争分数（≥ 40）收场",
          reward: "百年战争向法兰西霸权倾斜",
          penalty: "战争无限拖延，国力被掏空",
          done(world, polity) {
            const wars = warsAgainst(world, polity);
            if (!wars.length) return false; // 还没开战，谈不上和平
            const englandWar = wars.find(war => war.attackers.includes("英格兰王国") || war.defenders.includes("英格兰王国"));
            if (!englandWar) return true; // 与英格兰已无战争 = 议和达成
            // score 约定：正分利于进攻方。法兰西按其所处一方判定是否有利。
            return englandWar.attackers.includes(polity) ? englandWar.score >= 40 : englandWar.score <= -40;
          },
        },
      ],
    },
  ];

  function campaignFor(polity) {
    return CAMPAIGN_STAGES.find(entry => entry.polity === polity) || null;
  }

  function missionStages(world, polity = world.playerPolity) {
    const entry = campaignFor(polity);
    if (!entry) return [];
    const resolved = entry.stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      detail: stage.detail,
      reward: stage.reward,
      penalty: stage.penalty,
      done: !!stage.done(world, polity),
    }));
    const firstPending = resolved.findIndex(stage => !stage.done);
    return resolved.map((stage, index) => ({
      ...stage,
      status: stage.done ? "已完成" : index === firstPending ? "进行中" : "未开始",
    }));
  }

  // --- midAgenda：中期议程，基于 pressures / 控制力低的地块，0-2 条 ---
  function midAgenda(world, polity) {
    const country = world.countries[polity];
    const pressures = country.pressures || {};
    const agenda = [];

    const weakTiles = lowControlTiles(world, polity);
    if (weakTiles.length) {
      const sample = weakTiles[0];
      const label = sample.city || `第 ${sample.id} 号地块`;
      agenda.push({
        id: "consolidate-low-control",
        title: `整顿${label}：提升控制力与财政`,
        why: `本地控制力偏低（${sample.control ?? 0}），任其松动会持续拖累财政与征兵`,
      });
    }

    if ((pressures.fiscal || 0) >= 55) {
      agenda.push({
        id: "fiscal-reform",
        title: "推行财政整顿",
        why: "财政压力已进入高位，国库长期吃紧会压垫合法性与军队补给",
      });
    } else if ((pressures.military || 0) >= 55) {
      agenda.push({
        id: "military-buildup",
        title: "扩充军备应对边境压力",
        why: "军事压力高企，意味着战争或边境对峙正在消耗国家资源，需要提前布防",
      });
    } else if ((pressures.trade || 0) >= 55) {
      agenda.push({
        id: "trade-expansion",
        title: "拓展商路网络",
        why: "贸易压力高企反映关税或商路冲突，需要主动调整通商政策",
      });
    }

    return agenda.slice(0, 2);
  }

  // --- seasonTasks：本季 2-3 件事，复用 councilSummary 的判定逻辑，输出结构化对象 ---
  function seasonTasks(world, polity) {
    const country = world.countries[polity];
    const tasks = [];

    if (country.money < 50) {
      tasks.push({
        id: "task-fiscal",
        label: "处理国库枯竭",
        advisor: "fiscal",
        reason: "国库接近枯竭，需要调整税制或削减开支",
      });
    } else {
      tasks.push({
        id: "task-internal-development",
        label: "推进控制力与建设",
        advisor: "internal",
        reason: "财政尚属健康，应当把行政行动点投入地块控制力与基础设施",
      });
    }

    const capacityUsed = world.diplomacy ? window.HIFI_DIPLOMACY_ENGINE.capacityUsed(world, polity) : 0;
    tasks.push({
      id: "task-diplomacy-capacity",
      label: `留意外交容量占用（当前 ${capacityUsed}）`,
      advisor: "diplomacy",
      reason: "外交容量超出上限会消耗外交行动点，需要预留处理空间",
    });

    if ((country.warfare?.warExhaustion || 0) > 5) {
      tasks.push({
        id: "task-military-peace",
        label: "寻求有利和平",
        advisor: "military",
        reason: "战争疲惫正在累积，继续拖延战事会侵蚀军队与民心",
      });
    } else {
      tasks.push({
        id: "task-military-supply",
        label: "保持主力军团补给",
        advisor: "military",
        reason: "战争疲惫尚在可控范围，维持补给线即可应对当前局势",
      });
    }

    if (country.legitimacy < 55 && tasks.length < 3) {
      tasks.push({
        id: "task-legitimacy",
        label: "处理统治合法性承压",
        advisor: "internal",
        reason: "统治合法性承压，需要安抚阶层或推行有利的法律",
      });
    }

    return tasks.slice(0, 3);
  }

  // --- advisorProposals：把财政/外交/军务三条顾问线各落到一个具体、当前可执行的行动 ---
  // 找不到合法目标/资源不足时，降级为「跳转面板」卡（不悄悄换成别的行动类型）。
  const advisorPanels = { fiscal: "经济", diplomacy: "外交", military: "军事", internal: "发展" };

  function buildFiscalProposal(world, polity) {
    const proposals = window.HIFI_PROPOSALS_ENGINE;
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const target = tiles.find(tile => !tile.buildings.includes("market"));
    if (target) {
      const proposal = { type: "build_market", params: { tileId: target.id } };
      const validation = proposals.validate(world, polity, proposal);
      if (validation.ok) return { advisor: "fiscal", proposal, preview: proposals.preview(world, polity, proposal) };
    }
    return { advisor: "fiscal", proposal: { type: "goto", panel: advisorPanels.fiscal }, preview: null };
  }

  function buildDiplomacyProposal(world, polity) {
    const proposals = window.HIFI_PROPOSALS_ENGINE;
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    const tenseAttitudes = new Set(["wary", "rival", "hostile"]);
    if (diplomacy.freeEnvoys(world, polity) > 0) {
      const target = Object.keys(world.countries)
        .filter(candidate => candidate !== polity)
        .find(candidate => tenseAttitudes.has(diplomacy.diplomaticAttitude(world, polity, candidate)));
      if (target) {
        const proposal = { type: "send_envoy", params: { target } };
        const validation = proposals.validate(world, polity, proposal);
        if (validation.ok) return { advisor: "diplomacy", proposal, preview: proposals.preview(world, polity, proposal) };
      }
    }
    return { advisor: "diplomacy", proposal: { type: "goto", panel: advisorPanels.diplomacy }, preview: null };
  }

  function buildMilitaryProposal(world, polity) {
    const proposals = window.HIFI_PROPOSALS_ENGINE;
    const tiles = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity);
    const target = tiles.find(tile => tile.population >= 2);
    if (target) {
      const proposal = { type: "mobilize_army", params: { tileId: target.id } };
      const validation = proposals.validate(world, polity, proposal);
      if (validation.ok) return { advisor: "military", proposal, preview: proposals.preview(world, polity, proposal) };
    }
    return { advisor: "military", proposal: { type: "goto", panel: advisorPanels.military }, preview: null };
  }

  function advisorProposals(world, polity = world.playerPolity) {
    return [
      buildFiscalProposal(world, polity),
      buildDiplomacyProposal(world, polity),
      buildMilitaryProposal(world, polity),
    ].slice(0, 3);
  }

  window.HIFI_OBJECTIVES_ENGINE = {
    advisorProposals,
    CAMPAIGN_STAGES,
    midAgenda,
    missionStages,
    nationalMission,
    seasonTasks,
  };
})();

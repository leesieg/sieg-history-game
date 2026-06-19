(() => {
  "use strict";

  // 行动目录引擎：声明式 actionCatalog 是行动白名单的唯一来源。
  // 本文件自身不直接写 world/country 字段——apply 只委托现有引擎函数（经济/外交/军事）。
  // 校验/预览复用各引擎已有的前置判断（cost、available、evaluateProposal 等），
  // 不做"智能兜底替换"：不可行就如实报告原因，不悄悄换成别的行动。

  function tileById(world, tileId) {
    return world.tiles.find(tile => tile.id === tileId);
  }

  function buildingCost(buildingKey) {
    const rules = window.HIFI_RULES;
    return rules?.buildings?.[buildingKey]?.cost ?? 0;
  }

  // --- build_market ---
  function buildMarketAvailable(world, polity, params) {
    const tile = tileById(world, params?.tileId);
    if (!tile || tile.isSea || tile.polity !== polity) return false;
    return !tile.buildings.includes("market");
  }

  function buildMarketCost() {
    return { money: buildingCost("market"), administrative: 1 };
  }

  // --- develop_tile ---
  function developTileAvailable(world, polity, params) {
    const tile = tileById(world, params?.tileId);
    return !!tile && !tile.isSea && tile.polity === polity;
  }

  // --- integrate_tile ---
  function integrateTileAvailable(world, polity, params) {
    const tile = tileById(world, params?.tileId);
    if (!tile || tile.isSea || tile.polity !== polity) return false;
    return (tile.control ?? 0) < 100;
  }

  // --- send_envoy ---
  function sendEnvoyAvailable(world, polity, params) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    if (!params?.target || params.target === polity) return false;
    return diplomacy.freeEnvoys(world, polity) > 0;
  }

  // --- propose_trade ---
  function proposeTradeAvailable(world, polity, params) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    if (!params?.target || params.target === polity) return false;
    const evaluation = diplomacy.evaluateProposal(world, polity, params.target, "trade");
    return evaluation.available && evaluation.accepted;
  }

  // --- mobilize_army ---
  function mobilizeArmyAvailable(world, polity, params) {
    const tile = tileById(world, params?.tileId);
    if (!tile || tile.isSea || tile.polity !== polity) return false;
    const country = world.countries[polity];
    if ((country.warfare?.warExhaustion || 0) >= 40) return false;
    const combatType = params?.combatType || "infantry";
    if (!["infantry", "cavalry", "artillery"].includes(combatType)) return false;
    if (combatType !== "artillery" && tile.population < 2) return false;
    return true;
  }

  const actionCatalog = {
    build_market: {
      label: "建设市场",
      advisor: "fiscal",
      cost: () => buildMarketCost(),
      apply: (world, polity, params) =>
        window.HIFI_ECONOMY_ENGINE.constructBuilding(world, polity, params.tileId, "market"),
      preview: (world, polity, params) => ({
        cost: `金钱 -${buildingCost("market")}，行政点 -1`,
        gain: "该地块金钱产出 +40%",
        risk: "占用一次行政行动点，无法同季再用于其他建设",
      }),
      available: (world, polity, params) => buildMarketAvailable(world, polity, params),
    },
    develop_tile: {
      label: "资本开发地块",
      advisor: "fiscal",
      cost: () => ({ capital: 30, administrative: 1 }),
      apply: (world, polity, params) =>
        window.HIFI_ECONOMY_ENGINE.developTile(world, polity, params.tileId),
      preview: () => ({
        cost: "资本 -30，行政点 -1",
        gain: "该地块人口 +1（抬高产出上限）",
        risk: "资本池不足 30 时无法执行",
      }),
      available: (world, polity, params) => developTileAvailable(world, polity, params),
    },
    integrate_tile: {
      label: "整合地块",
      advisor: "internal",
      cost: () => ({ money: 20, administrative: 1 }),
      apply: (world, polity, params) =>
        window.HIFI_ECONOMY_ENGINE.integrateTile(world, polity, params.tileId),
      preview: () => ({
        cost: "金钱 -20，行政点 -1",
        gain: "该地块控制力提升（改革等级越高，提升越多）",
        risk: "控制力已满（100）的地块无法再整合",
      }),
      available: (world, polity, params) => integrateTileAvailable(world, polity, params),
    },
    send_envoy: {
      label: "派遣使节",
      advisor: "diplomacy",
      cost: () => ({ diplomatic: 1, envoy: 1 }),
      apply: (world, polity, params) =>
        window.HIFI_DIPLOMACY_ENGINE.startMission(world, polity, params.target, "improve"),
      preview: (world, polity, params) => ({
        cost: "外交点 -1，占用一名使节",
        gain: `逐季改善与${params?.target || "目标国"}的关系`,
        risk: "无空闲使节或已有同类任务在执行时无法派遣",
      }),
      available: (world, polity, params) => sendEnvoyAvailable(world, polity, params),
    },
    propose_trade: {
      label: "提议贸易协定",
      advisor: "diplomacy",
      cost: () => ({ diplomatic: 1 }),
      apply: (world, polity, params) =>
        window.HIFI_DIPLOMACY_ENGINE.proposeTreaty(world, polity, params.target, "trade"),
      preview: (world, polity, params) => {
        const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
        const evaluation = diplomacy.evaluateProposal(world, polity, params?.target, "trade");
        return {
          cost: "外交点 -1，占用外交容量 0.5",
          gain: "缔结贸易协定，双方信任提升",
          risk: evaluation.available
            ? `对方评估分 ${evaluation.score} / 门槛 ${evaluation.threshold}，分数不足会被拒绝`
            : "外交容量已满或契约已存在，提案不可达",
        };
      },
      available: (world, polity, params) => proposeTradeAvailable(world, polity, params),
    },
    mobilize_army: {
      label: "动员军团",
      advisor: "military",
      cost: () => ({ military: 1 }),
      apply: (world, polity, params) =>
        window.HIFI_WARFARE_ENGINE.mobilizeArmy(world, polity, params.tileId, params?.combatType || "infantry"),
      preview: (world, polity, params) => ({
        cost: params?.combatType === "artillery" ? "军事点 -1，军需 -30" : "军事点 -1，地块人口下降",
        gain: "在该地块生成一支新军团",
        risk: "战争疲惫过高、地块非己方或人口不足时无法动员",
      }),
      available: (world, polity, params) => mobilizeArmyAvailable(world, polity, params),
    },
  };

  function insufficientResourceReason(world, polity, type, params) {
    const country = world.countries[polity];
    if (type === "build_market") {
      if (country.money < buildingCost("market")) return "金钱不足";
      if (country.actionPoints.administrative < 1) return "行政点不足";
    } else if (type === "develop_tile") {
      if ((country.capital || 0) < 30) return "资本池不足";
      if (country.actionPoints.administrative < 1) return "行政点不足";
    } else if (type === "integrate_tile") {
      if (country.money < 20) return "金钱不足";
      if (country.actionPoints.administrative < 1) return "行政点不足";
    } else if (type === "send_envoy") {
      if (window.HIFI_DIPLOMACY_ENGINE.freeEnvoys(world, polity) <= 0) return "无空闲使节";
      if (country.actionPoints.diplomatic < 1) return "外交点不足";
    } else if (type === "propose_trade") {
      if (country.actionPoints.diplomatic < 1) return "外交点不足";
      const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
      if (params?.target && params.target !== polity) {
        const evaluation = diplomacy.evaluateProposal(world, polity, params.target, "trade");
        if (!evaluation.available) return evaluation.reason || "外交容量已满或契约已存在";
        if (!evaluation.accepted) return "对方不会接受贸易协定";
      }
    } else if (type === "mobilize_army") {
      if (country.actionPoints.military < 1) return "军事点不足";
    }
    return null;
  }

  function validate(world, polity, proposal) {
    const type = proposal?.type;
    const entry = actionCatalog[type];
    if (!entry) return { ok: false, reason: "未知行动类型" };
    const params = proposal.params || {};
    if (!entry.available(world, polity, params)) {
      const reason = insufficientResourceReason(world, polity, type, params);
      return { ok: false, reason: reason || "地块非己方或前置条件不满足" };
    }
    const resourceReason = insufficientResourceReason(world, polity, type, params);
    if (resourceReason) return { ok: false, reason: resourceReason };
    return { ok: true };
  }

  function preview(world, polity, proposal) {
    const entry = actionCatalog[proposal?.type];
    if (!entry) return { cost: "无", gain: "无", risk: "未知行动类型，无法预览" };
    return entry.preview(world, polity, proposal.params || {});
  }

  function execute(world, polity, proposal) {
    const entry = actionCatalog[proposal?.type];
    if (!entry) throw new Error("未知行动类型，无法执行");
    return entry.apply(world, polity, proposal.params || {});
  }

  window.HIFI_PROPOSALS_ENGINE = {
    actionCatalog,
    execute,
    preview,
    validate,
  };
})();

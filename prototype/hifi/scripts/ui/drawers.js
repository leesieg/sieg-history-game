(() => {
  "use strict";

  const governmentMarks = {
    monarchy: "⚜",
    republic: "◆",
    merchant_republic: "⚓",
    empire: "♛",
    theocracy: "✝",
    tribal: "◇",
  };
  const reformLabels = {
    administrative: "行政改革",
    fiscal: "财政改革",
    military: "军事改革",
    religious: "宗教改革",
    political: "政治改革",
    maritime: "海事改革",
  };
  const lawCategoryLabels = {
    taxation: "税收制度",
    mobilization: "动员制度",
    religion: "宗教政策",
    authority: "权力结构",
  };
  const lawValueLabels = {
    customary: "传统税制",
    estate_exemptions: "阶层免税",
    uniform: "统一税制",
    limited: "有限动员",
    levy: "征召兵役",
    standing: "常备军制",
    toleration: "宗教宽容",
    orthodoxy: "正统信仰",
    reformed: "改革宗",
    dynastic: "王朝统治",
    civic: "公民政治",
    constitutional: "宪政体制",
    absolute: "绝对权力",
  };
  const pressureLabels = {
    trade: "贸易依赖",
    military: "军事竞争",
    fiscal: "财政压力",
    exploration: "探索冲动",
    faith: "信仰张力",
    ideas: "思想传播",
  };
  const resourceLabels = {
    administrative: "行政点",
    diplomatic: "外交点",
    military: "军事点",
    money: "金钱",
    food: "粮食",
    legitimacy: "合法性",
    ideas: "思想点",
  };
  // 敕令「效果」一律写入 country[resource] 库存（如 country.military 是军需），与花费走 actionPoints 的军事点不同，单独覆盖标签
  const effectLabels = {
    military: "军需",
  };
  const attitudeLabels = {
    close: "亲密",
    cooperative: "合作",
    neutral: "中立",
    wary: "戒备",
    rival: "敌对竞争",
    hostile: "强烈敌视",
  };
  // 行动预览成本标签：复用上方 resourceLabels，缺省项在此补充（envoy 等不在通用资源表里的口径）
  const previewCostLabels = Object.assign({ envoy: "使节名额", capital: "资本" }, resourceLabels);
  function costLabel(key) { return previewCostLabels[key] || key; }

  // 拼出按钮下方的成本/预期小字；不可行时附 action-blocked 类与原因（供按钮 title 复用）。
  // 注：actionPreview().effect 是 actionCatalog 条目的 preview() 返回值 { cost, gain, risk } 这一整块文案，
  // 不是逐资源的数值表——这里直接取 gain（必要时附 risk）展示，不能像 cost 一样 Object.entries 遍历。
  function actionPreviewHtml(world, polity, type, params) {
    const engine = window.HIFI_PROPOSALS_ENGINE;
    if (!engine) return "";
    const p = engine.actionPreview(world, polity, type, params);
    const costStr = Object.entries(p.cost || {}).map(([key, value]) => `${value}${costLabel(key)}`).join(" + ");
    const effStr = p.effect?.gain || "—";
    const blocked = p.available?.ok === false;
    const cls = blocked ? " action-blocked" : "";
    const titleAttr = blocked && p.reason ? ` title="${p.reason}"` : "";
    return `<div class="action-preview${cls}"${titleAttr}>成本：${costStr || "—"}　预期：${effStr}</div>`;
  }

  // 返回该 catalog 行动是否可行 + 原因，供按钮自身加 disabled/action-disabled 与 title
  function actionAvailability(world, polity, type, params) {
    const engine = window.HIFI_PROPOSALS_ENGINE;
    if (!engine) return { ok: true, reason: "" };
    const p = engine.actionPreview(world, polity, type, params);
    return { ok: p.available?.ok !== false, reason: p.reason || "" };
  }

  function countryRows(country) {
    return [
      ["政体", country.government.typeLabel],
      [country.government.powerName, Math.round(country.government.centralPower)],
      ["统治者", `${country.leader.title}${country.leader.name}`],
      ["家族", country.leader.dynasty],
      ["合法性", Math.round(country.legitimacy)],
      ["议会", country.government.assembly.unlocked ? country.government.assembly.type : "未解锁"],
    ];
  }

  // 通用抽屉分 tab 机制（所有系统共用）
  const systemTabs = {
    "国家": ["概览", "政制", "议会", "决议"],
    "经济": ["财政", "贸易", "建设"],
    "军事": ["概览", "军团", "战争"],
    "外交": ["邦交", "条约", "从属"],
    "发展": ["概览", "科技"],
  };
  const activeTab = {};
  function currentTab(system) { return activeTab[system] || systemTabs[system][0]; }
  function setDrawerTab(token) {
    const [system, tab] = String(token).split(":");
    if (systemTabs[system]?.includes(tab)) activeTab[system] = tab;
  }
  function tabBar(system) {
    const cur = currentTab(system);
    return `<div class="drawer-tabs">${systemTabs[system].map(tab =>
      `<button class="drawer-tab${tab === cur ? " active" : ""}" data-drawer-tab="${system}:${tab}">${tab}</button>`
    ).join("")}</div>`;
  }
  // 命令坞/省份按钮的聚焦定位可能指向某个 tab 内的控件，开抽屉前先切到对应 tab；返回 "system:tab"
  function drawerTabForSelector(system, selector) {
    if (!selector) return null;
    const rules = {
      "国家": [[/data-reform|data-law/, "政制"], [/data-assembly/, "议会"], [/data-decision|data-integrate/, "决议"]],
      "经济": [[/data-building|data-develop/, "建设"], [/data-trade-route|data-trade-policy|data-tariff|data-edict|data-agenda/, "贸易"]],
      "军事": [[/data-mobilize|data-hire-mercenary|data-army-open/, "军团"], [/data-peace-war/, "战争"]],
      "外交": [[/war:declare|mission:|leader:/, "邦交"], [/treaty:/, "条约"], [/subject:/, "从属"]],
    };
    for (const [pattern, tab] of (rules[system] || [])) if (pattern.test(selector)) return `${system}:${tab}`;
    return null;
  }

  function renderPolitics(country, world) {
    const activeCountryTab = currentTab("国家");
    const bar = tabBar("国家");

    if (activeCountryTab === "概览") {
      const ability = country.leader.abilities;
      const rows = [
        [codexTerm("政体", "政体"), country.government.typeLabel],
        [codexTerm("王权", country.government.powerName), Math.round(country.government.centralPower)],
        ["统治者", `${country.leader.title}${country.leader.name}`],
        ["家族", country.leader.dynasty],
        [codexTerm("统治者", "行政 / 外交 / 军事"), `${ability.administrative} / ${ability.diplomatic} / ${ability.military}`],
        [codexTerm("合法性", "合法性"), Math.round(country.legitimacy)],
        [codexTerm("议会", "议会"), country.government.assembly.unlocked ? country.government.assembly.type : "未解锁"],
      ];
      const basics = rows
        .map(([label, value]) => `<div class="drawer-row">${label}<span>${value}</span></div>`)
        .join("");
      return `${bar}${basics}`;
    }

    if (activeCountryTab === "政制") {
      const reforms = Object.entries(country.government.reforms)
        .map(([key, value]) => `<button class="drawer-row political-action" data-reform="${key}">${reformLabels[key]}<span>${value} / 5</span></button>`)
        .join("");
      const laws = Object.entries(country.government.laws).map(([category, value]) => {
        const options = window.HIFI_POLITICS_ENGINE.lawOptions[category];
        const next = options[(options.indexOf(value) + 1) % options.length];
        return actionButton(
          "data-law",
          `${category}:${next}`,
          lawCategoryLabels[category],
          `${lawValueLabels[value]} → ${lawValueLabels[next]}`
        );
      }).join("");
      return `${bar}<div class="drawer-subtitle">${codexTerm("改革", "改革槽")}</div>${reforms}
        <div class="drawer-subtitle">${codexTerm("法律", "法律")}</div>${laws}`;
    }

    if (activeCountryTab === "议会") {
      const assemblyType = country.government.assembly.type;
      const assembly = country.government.assembly.unlocked
        ? `${actionButton("data-assembly", "tax:privilege", `${assemblyType}·让渡特权`, "支持 +15 · 阶层权力 +2")}
           ${actionButton("data-assembly", "tax:money", `${assemblyType}·收买议会`, "支持 +10 · 12 金钱")}
           ${actionButton("data-assembly", "tax:none", `${assemblyType}·强硬施压`, `当前支持 ${country.government.assembly.support}`)}`
        : '<div class="drawer-row">议会尚未解锁<span>—</span></div>';
      const estates = Object.values(country.estates)
        .map((estate, index) => `<div class="drawer-row"><span><span class="estate-swatch" style="background:${estateColors[index % estateColors.length]}"></span>${estate.label}</span><span>${Math.round(estate.power)} / ${Math.round(estate.satisfaction)}</span></div>`)
        .join("");
      const unrestRow = country.unrest
        ? `<div class="drawer-row">${codexTerm("阶层", "国内不满")}<span>${Math.round(country.unrest)}</span></div>`
        : "";
      return `${bar}<div class="drawer-subtitle">${codexTerm("议会", "议会")}</div>${assembly}
        <div class="drawer-subtitle">${codexTerm("阶层", "阶层：权力 / 满意")}</div>${estatePie(country.estates)}${estates}${unrestRow}`;
    }

    // 决议
    const tile = world.tiles.find(candidate => candidate.id === world.selectedTile);
    const integrate = tile && !tile.isSea && tile.polity === country.name
      ? actionButton("data-integrate", String(tile.id), `整合 ${tile.city || tile.region}`, `控制度 ${Math.round(tile.control ?? 0)} · 20 金钱`,
          false, false, { world, polity: country.name, type: "integrate_tile", params: { tileId: tile.id } })
      : '<div class="drawer-row">整合：请选择己方地块<span>—</span></div>';
    const decisions = Object.entries(window.HIFI_POLITICS_ENGINE.decisions).map(([key, decision]) => {
      const can = decision.can(country, window.hifiGame?.store?.getState());
      const effect = window.HIFI_CODEX?.decisions[key]?.effect;
      return actionButton("data-decision", key, decision.label, can ? (effect || "可执行") : decision.why);
    }).join("");
    return `${bar}<div class="drawer-subtitle">国家决议</div>${decisions}
      <div class="drawer-subtitle">${codexTerm("领土整合", "领土整合")}</div>${integrate}`;
  }

  function codexTerm(key, label) {
    return `<span class="codex-term" data-codex="${key}">${label}</span>`;
  }

  const estateColors = ["#c9a227", "#a8842f", "#7d6b3f", "#b5763a", "#8f9e6a", "#6e5848", "#9c5a3c"];

  // 阶层权力分布饼图（无依赖原生 SVG）
  function estatePie(estates) {
    const list = Object.values(estates);
    const total = list.reduce((sum, estate) => sum + (estate.power || 0), 0) || 1;
    const cx = 60, cy = 60, r = 54;
    let angle = -Math.PI / 2;
    const slices = list.map((estate, index) => {
      const fraction = (estate.power || 0) / total;
      const next = angle + fraction * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(next), y2 = cy + r * Math.sin(next);
      const large = fraction > .5 ? 1 : 0;
      angle = next;
      return `<path d="M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${estateColors[index % estateColors.length]}"></path>`;
    }).join("");
    return `<svg class="estate-pie" viewBox="0 0 120 120" width="118" height="118" role="img" aria-label="阶层权力分布">${slices}</svg>`;
  }

  function actionButton(attribute, key, label, detail, active = false, disabled = false, preview = null) {
    // preview: 可选 { world, polity, type, params }，对应 actionCatalog 行动时附成本/预期小字并按可行性置灰
    let blockedClass = "";
    let titleAttr = "";
    let previewHtml = "";
    let isDisabled = disabled;
    if (preview) {
      const { world, polity, type, params } = preview;
      const availability = actionAvailability(world, polity, type, params);
      if (!availability.ok) {
        isDisabled = true;
        blockedClass = " action-disabled";
        titleAttr = availability.reason ? ` title="${availability.reason}"` : "";
      }
      previewHtml = actionPreviewHtml(world, polity, type, params);
    }
    return `<button class="drawer-row political-action${active ? " active" : ""}${blockedClass}" ${attribute}="${key}"${isDisabled ? " disabled" : ""}${titleAttr}>
      ${label}<span>${detail}</span>
    </button>${previewHtml}`;
  }

  function renderEconomy(country, world) {
    const rules = window.HIFI_RULES;
    const tile = world.tiles.find(candidate => candidate.id === world.selectedTile);
    const tab = currentTab("经济");
    const bar = tabBar("经济");

    if (tab === "财政") {
      const policies = [
        ["closed", "封闭贸易", "本土产出 +5% · 商路分成减半"],
        ["normal", "常规贸易", "均衡"],
        ["open", "开放贸易", "商路分成 +30% · 积累资本"],
      ].map(([key, label, detail]) => actionButton("data-trade-policy", key, label, detail, country.tradePolicy === key)).join("");
      const tariffs = [0, 10, 25].map(value =>
        actionButton("data-tariff", value, `${value}% 关税`, value === country.tariff ? "当前 · 本国分成 +" : "切换 · 免费", value === country.tariff)
      ).join("");
      const edicts = Object.entries(rules.edicts).map(([key, edict]) => {
        const cost = Object.entries(edict.cost).map(([resource, amount]) => `${resourceLabels[resource]} ${amount}`).join(" · ");
        // 敕令效果直接加到 country[resource]（如 military 对应「军需」库存），与 cost 里走 actionPoints 的「军事点」是两套量，不能共用同一份标签表
        const effect = ["food", "money", "military", "legitimacy"].filter(r => edict[r]).map(r => `${effectLabels[r] || resourceLabels[r]} ${edict[r] > 0 ? "+" : ""}${edict[r]}`).join(" · ");
        return actionButton("data-edict", key, edict.label, `耗 ${cost} → ${effect}`);
      }).join("");
      const agendas = Object.entries(rules.agendas).map(([key, agenda]) => {
        const reward = Object.entries(agenda.reward).map(([resource, amount]) => `${resourceLabels[resource]} +${amount}`).join(" · ");
        return actionButton("data-agenda", key, agenda.label, `${resourceLabels[agenda.target]} ≥ ${agenda.threshold} → ${reward}`, country.agenda === key);
      }).join("");
      return `${bar}
        <div class="drawer-row">${codexTerm("粮食", "粮食")}<span>${Math.round(country.food)}</span></div>
        <div class="drawer-row">${codexTerm("国库", "国库")}<span>${Math.round(country.money)}</span></div>
        <div class="drawer-row">${codexTerm("军需", "军需")}<span>${Math.round(country.military)}</span></div>
        <div class="drawer-row">${codexTerm("资本池", "资本池")}<span>${Math.round(country.capital)}</span></div>
        <div class="drawer-row">${codexTerm("物价指数", "物价指数")}<span>${(country.priceIndex || 1).toFixed(2)}</span></div>
        <div class="drawer-subtitle">${codexTerm("贸易政策", "贸易政策")}</div>${policies}
        <div class="drawer-subtitle">${codexTerm("关税", "关税")}</div>${tariffs}
        <div class="drawer-subtitle">${codexTerm("国家敕令", "国家敕令")}</div>${edicts}
        <div class="drawer-subtitle">${codexTerm("国家议程", "国家议程")}</div>${agendas}`;
    }

    if (tab === "贸易") {
      const routes = Object.entries(world.trade.routes).map(([key, route]) =>
        actionButton("data-trade-route", key, route.label, route.active
          ? `流量 ${route.flow} · 成本 ${route.cost}${route.boost ? ` · 已投资 +${Math.round(route.boost * 100)}%` : ""} · 投资 15 钱 + 1 行政`
          : "尚未解锁")
      ).join("");
      const pressures = Object.entries(country.pressures).map(([key, value]) =>
        `<div class="drawer-row">${pressureLabels[key]}<span>${value}</span></div>`
      ).join("");
      return `${bar}<div class="drawer-subtitle">${codexTerm("贸易路线", "贸易路线")}</div>${routes}
        <div class="drawer-subtitle">${codexTerm("压力层", "结构压力")}</div>${pressures}`;
    }

    // 建设
    const tileLabel = tile && !tile.isSea
      ? `${tile.city || tile.region} · ${tile.polity === country.name ? "可建设" : "非己方地块"}`
      : "请选择己方陆地";
    const buildings = Object.entries(rules.buildings).map(([key, building]) => {
      const built = Boolean(tile && !tile.isSea && tile.buildings.includes(key));
      // 仅 market 在 actionCatalog 中登记，能调 actionPreview；其余建筑维持原有按钮文案，不挂预览
      const preview = key === "market" && tile && !built
        ? { world, polity: country.name, type: "build_market", params: { tileId: tile.id } }
        : null;
      return actionButton(
        "data-building",
        key,
        built ? `${building.label}（已建成）` : building.label,
        built ? "已建成" : `${building.cost} 金钱 + 1 行政 · ${building.effect}`,
        built,
        built,
        preview
      );
    }).join("");
    const develop = tile && !tile.isSea && tile.polity === country.name
      ? actionButton("data-develop", String(tile.id), `资本开发 ${tile.city || tile.region}`, "30 资本 + 1 行政 · 人口 +1",
          false, false, { world, polity: country.name, type: "develop_tile", params: { tileId: tile.id } })
      : '<div class="drawer-row">资本开发：请选择己方地块<span>—</span></div>';
    return `${bar}<div class="drawer-subtitle">${codexTerm("地块建设", "地块建设")}：${tileLabel}</div>${buildings}
      <div class="drawer-subtitle">${codexTerm("资本池", "资本开发")}</div>${develop}`;
  }

  const resourceLabel = key => resourceLabels[key] || key;

  function renderDevelopment(country, world) {
    const tab = currentTab("发展");
    const bar = tabBar("发展");

    if (tab === "概览") {
      const missions = window.HIFI_HISTORY_ENGINE.missions(world).map(mission => {
        const reward = Object.entries(mission.reward || {}).map(([res, amount]) => `${resourceLabel(res)} +${amount}`).join(" · ");
        return `<div class="drawer-row"><span>${mission.label}</span><span>${mission.done ? "已完成" : `奖励 ${reward}`}</span></div>`;
      }).join("");
      const tutorial = window.HIFI_HISTORY_ENGINE.tutorialTask(world);
      return `${bar}
        <div class="drawer-row">${codexTerm("思想点", "思想点")}<span>${Math.round(country.ideas)}</span></div>
        <div class="drawer-row">${codexTerm("时代进度", "时代进度")}<span>${country.ageProgress}%</span></div>
        <div class="drawer-row">${codexTerm("探索点", "探索点")}<span>${country.exploration.points}${country.exploration.colonial ? " · 殖民" : ""}</span></div>
        <div class="drawer-subtitle">${codexTerm("时代使命", "时代使命")}</div>${missions}
        <div class="drawer-subtitle">导师指引</div><div class="drawer-row"><span>${tutorial?.label || "已完成全部指引"}</span><span>${world.tutorial.step} / 5</span></div>`;
    }

    // 科技
    const technologies = Object.entries(window.HIFI_RULES.technologies).map(([key, technology]) =>
      actionButton(
        "data-technology",
        key,
        technology.label,
        country.technology[key] ? `已采纳 · ${technology.effect}` : `${technology.cost} 思想 · 传播 ${country.technologyAwareness[key]}% · ${technology.effect}`,
        country.technology[key]
      )
    ).join("");
    return `${bar}<div class="drawer-subtitle">${codexTerm("科技", "科技采纳")}</div>${technologies}`;
  }

  function renderMilitary(country, world) {
    const armies = Object.values(world.warfare.armies).filter(army => army.owner === country.name);
    const wars = world.diplomacy.wars.filter(war => war.attackers.includes(country.name) || war.defenders.includes(country.name));
    const tile = world.tiles.find(candidate => candidate.id === world.selectedTile);
    const canRecruit = tile && !tile.isSea && tile.polity === country.name;
    const tab = currentTab("军事");
    const bar = tabBar("军事");

    if (tab === "概览") {
      const totalSoldiers = armies.reduce((sum, army) => sum + window.HIFI_WARFARE_ENGINE.armyTotalSoldiers(army), 0);
      return `${bar}
        <div class="drawer-row">${codexTerm("军事点", "军事点")}<span>${country.actionPoints.military}</span></div>
        <div class="drawer-row">${codexTerm("战争疲惫", "战争疲惫")}<span>${Math.round(country.warfare.warExhaustion)}</span></div>
        <div class="drawer-row">${codexTerm("军团", "军团数")}<span>${armies.length}</span></div>
        <div class="drawer-row">总兵力<span>${totalSoldiers} 人</span></div>
        <div class="drawer-row">${codexTerm("战争", "进行中战争")}<span>${wars.length}</span></div>`;
    }

    if (tab === "军团") {
      const mobilizePreview = combatType => tile
        ? { world, polity: country.name, type: "mobilize_army", params: { tileId: tile.id, combatType } }
        : null;
      return `${bar}<div class="drawer-subtitle">${codexTerm("动员", "征募")}：${canRecruit ? tile.city || tile.region : "请选择己方地块"}</div>
        ${actionButton("data-mobilize", "infantry", "动员步兵", "1 军事点 · 1200 步兵 · 耗地块人口", false, false, mobilizePreview("infantry"))}
        ${actionButton("data-mobilize", "cavalry", "动员骑兵", "1 军事点 · 500 骑兵 · 耗地块人口", false, false, mobilizePreview("cavalry"))}
        ${country.technology.artillery ? actionButton("data-mobilize", "artillery", "铸造炮队", "1 军事点 · 军需 30 · 300 炮兵", false, false, mobilizePreview("artillery")) : ""}
        ${actionButton("data-hire-mercenary", "company", "雇佣自由佣兵团", "40 金钱 · 约 2000 佣兵 · 8 季合约")}
        <div class="drawer-subtitle">${codexTerm("军团", "现役军团")}</div>
        ${armies.length ? armies.map(army => actionButton("data-army-open", army.id, army.name, `${window.HIFI_WARFARE_ENGINE.armyTotalSoldiers(army)} 人 · 点击整编`)).join("") : '<div class="drawer-row">暂无军团<span>—</span></div>'}`;
    }

    // 战争
    return `${bar}<div class="drawer-subtitle">${codexTerm("战争", "战争")}</div>
      ${wars.length ? wars.map(war =>
        `<button class="drawer-row political-action" data-peace-war="${war.id}" data-peace-term="${
          war.primaryGoal.claimant === country.name ? "target_territory" : "status_quo"
        }">${war.name}<span>${
          war.primaryGoal.claimant === country.name ? `索取目标 · 分数 ${war.score} · 点击议和` : "提议停战"
        }</span></button>`
      ).join("") : '<div class="drawer-row">当前和平<span>—</span></div>'}`;
  }

  function renderDiplomacy(country, world) {
    const engine = window.HIFI_DIPLOMACY_ENGINE;
    // Task C7：外交对象按敌国 > 邻国/接触 > 可缔约 > 其余排序，默认选中最该处理的对象。
    const targets = engine.sortDiplomacyTargets(world, country.name);
    if (!targets.includes(world.diplomacy.selectedTarget)) world.diplomacy.selectedTarget = targets[0];
    const target = world.diplomacy.selectedTarget;
    const relation = engine.relationView(world, target, country.name);
    const targetCountry = world.countries[target];
    const subject = engine.subjectBetween(world, country.name, target);
    const atWar = window.HIFI_WARFARE_ENGINE.areAtWar(world, country.name, target);
    const truce = window.HIFI_WARFARE_ENGINE.underTruce(world, country.name, target);
    const targetButtons = targets.map(name =>
      actionButton(
        "data-diplomatic-target",
        name,
        name,
        attitudeLabels[engine.diplomaticAttitude(world, country.name, name)],
        name === target
      )
    ).join("");
    // 第四个元素是可选的 catalog 行动类型（send_envoy/propose_trade），用于挂成本/预期预览；其余外交动作（私人会晤等）不在 catalog 中，维持原样
    const renderActions = list => list.map(([key, label, detail, catalogType]) => {
      const preview = catalogType ? { world, polity: country.name, type: catalogType, params: { target } } : null;
      return actionButton("data-diplomatic-action", key, label, detail, false, false, preview);
    }).join("");
    const tab = currentTab("外交");
    const bar = tabBar("外交");
    const targetLine = `<div class="drawer-subtitle">当前对象：${targetCountry.name}（在「邦交」可切换）</div>`;

    if (tab === "邦交") {
      const leaderActions = renderActions([
        ["mission:improve", "派遣使节", "1 外交点 · 改善关系（需空闲使节）", "send_envoy"],
        ["leader:meeting", "私人会晤", "1 外交点 · 友谊与尊重"],
        ["leader:gift", "赠送礼物", "1 外交点 · 20 金钱 · 提升信任"],
        ["leader:threaten", "公开威慑", "1 外交点 · 恐惧与宿怨"],
      ]);
      const warAction = atWar
        ? '<div class="drawer-row">宣战<span>已处于战争</span></div>'
        : truce
          ? '<div class="drawer-row">宣战<span>停战协定期</span></div>'
          : actionButton("data-diplomatic-action", "war:declare", "宣战", "开启战争");
      return `${bar}
        <div class="drawer-row">${codexTerm("外交点", "外交点")}<span>${country.actionPoints.diplomatic}</span></div>
        <div class="drawer-row">${codexTerm("使节", "使节")}<span>${engine.freeEnvoys(world, country.name)} / ${country.diplomacy.envoys}</span></div>
        <div class="drawer-row">${codexTerm("外交容量", "外交容量")}<span>${engine.capacityUsed(world, country.name)} / ${engine.capacity(world, country.name)}</span></div>
        <div class="drawer-subtitle">外交对象</div>
        <input class="diplo-search" type="search" data-diplo-search placeholder="搜索国家…" aria-label="搜索外交对象">
        <div class="drawer-scroll-list" id="diploTargetList">${targetButtons}</div>
        <div class="drawer-subtitle">${targetCountry.name} · 对我方态度</div>
        <div class="drawer-row">${codexTerm("信任", "信任")}<span>${relation.trust}</span></div>
        <div class="drawer-row">${codexTerm("威胁", "威胁")}<span>${relation.threat}</span></div>
        <div class="drawer-row">${codexTerm("战略利益", "战略利益")}<span>${relation.strategicInterest}</span></div>
        <div class="drawer-subtitle">元首外交</div>${leaderActions}${warAction}`;
    }

    if (tab === "条约") {
      const treaties = renderActions([
        ["treaty:trade", "贸易协定", "1 外交点 · 按贸易流计酬", "propose_trade"],
        ["treaty:access", "军事通行", "1 外交点 · 开放路线"],
        ["treaty:marriage", "王室联姻", "1 外交点 · 结王朝纽带 · 便于整合"],
        ["treaty:nonaggression", "互不侵犯", "1 外交点 · 短期止戈"],
        ["treaty:alliance", "防御同盟", "2 外交点 · 盟友被攻击自动参战"],
      ]);
      return `${bar}${targetLine}${treaties}`;
    }

    // 从属
    const subjects = renderActions([
      ["subject:tributary", "要求朝贡", "2 外交点 · 高自主 · 收贡赋"],
      ["subject:vassal", "要求附庸", "2 外交点 · 中自主"],
      ["subject:puppet", "建立傀儡", "3 外交点 · 低自主"],
    ]);
    const subjectRows = subject
      ? `<div class="drawer-subtitle">${codexTerm("从属", "权利结构")}</div>
        <div class="drawer-row">关系<span>${engine.subjectTypes[subject.type].label}</span></div>
        <div class="drawer-row">自主权<span>${subject.autonomy}</span></div>
        <div class="drawer-row">忠诚度<span>${subject.loyalty}</span></div>
        ${subject.overlord === country.name
          ? `${actionButton("data-subject-control", "tighten", "收紧控制", "1 外交点 · 自主 -10 · 贡赋 +1")}
             ${actionButton("data-subject-control", "loosen", "放宽自治", "1 外交点 · 忠诚 +12 · 贡赋 -1")}`
          : ""}`
      : `<div class="drawer-row">与 ${targetCountry.name} 暂无从属关系<span>—</span></div>`;
    return `${bar}${targetLine}<div class="drawer-subtitle">${codexTerm("从属", "建立从属")}</div>${subjects}${subjectRows}`;
  }

  function renderSystem(system, world) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(world);
    if (system === "国家") return renderPolitics(country, world);
    if (system === "经济") return renderEconomy(country, world);
    if (system === "外交") return renderDiplomacy(country, world);
    if (system === "军事") return renderMilitary(country, world);
    if (system === "发展") return renderDevelopment(country, world);
    return null;
  }

  function openLayer(id) {
    const layer = document.getElementById(id);
    layer.classList.add("open");
    layer.setAttribute("aria-hidden", "false");
  }

  function closeLayer(id) {
    const layer = document.getElementById(id);
    layer.classList.remove("open");
    layer.setAttribute("aria-hidden", "true");
  }

  function countryDetailHtml(country) {
    const estateHtml = Object.values(country.estates).map(estate =>
      `<div class="estate-line"><span>${estate.label}</span><span>${Math.round(estate.power)}</span><span>${Math.round(estate.satisfaction)}</span></div>`
    ).join("");
    const decisionHtml = (country.decisionLedger || []).slice(0, 5)
      .map(entry => `<div class="drawer-row">${entry.label}<span>${window.HIFI_WORLD_ENGINE.calendarLabel(entry.turn)}</span></div>`)
      .join("");
    return `<div class="state-grid">
      ${[
        ["政体", country.government.typeLabel],
        [country.government.powerName, Math.round(country.government.centralPower)],
        ["合法性", Math.round(country.legitimacy)],
        ["行政 / 外交 / 军事", `${country.leader.abilities.administrative} / ${country.leader.abilities.diplomatic} / ${country.leader.abilities.military}`],
        ["粮食", Math.round(country.food)],
        ["金钱", Math.round(country.money)],
        ["军需", Math.round(country.military)],
        ["资本池", Math.round(country.capital || 0)],
      ].map(([label, value]) => `<div class="state-stat"><small>${label}</small><strong>${value}</strong></div>`).join("")}
    </div>
    <section class="state-section"><h3>时代处境</h3><p>${country.introduction}</p></section>
    <section class="state-section"><h3>阶层权力 / 满意度</h3>${estateHtml}</section>
    <section class="state-section"><h3>决策回响</h3>${decisionHtml || "<p>尚无结构性决策。</p>"}</section>`;
  }

  function bindCountryDialogs(store) {
    let selectedPolity = store.getState().playerPolity;
    const modal = document.getElementById("countryModal");
    const selectModal = document.getElementById("countrySelectModal");
    const strip = document.getElementById("countryChoiceStrip");
    const preview = document.getElementById("countryChoicePreview");

    function renderCountryModal(polity = store.getState().playerPolity) {
      const country = store.getState().countries[polity];
      document.getElementById("countryModalTitle").textContent = country.name;
      document.getElementById("countryModalSubtitle").textContent = `${country.leader.title}${country.leader.name} · ${country.leader.dynasty}`;
      document.getElementById("countryModalBody").innerHTML = countryDetailHtml(country);
      openLayer("countryModal");
    }

    function renderChoicePreview() {
      const country = store.getState().countries[selectedPolity];
      preview.innerHTML = `<h3>${country.name}</h3><p>${country.introduction}</p>
        <div class="state-grid">${countryRows(country).slice(0, 4).map(([label, value]) => `<div class="state-stat"><small>${label}</small><strong>${value}</strong></div>`).join("")}</div>`;
      strip.querySelectorAll(".country-choice").forEach(button => button.classList.toggle("active", button.dataset.polity === selectedPolity));
    }

    function renderChoices(filter = "") {
      const query = filter.trim().toLowerCase();
      const playerPolity = store.getState().playerPolity;
      const countries = Object.values(store.getState().countries).filter(country =>
        !query || country.name.toLowerCase().includes(query) || country.government.typeLabel.includes(query)
      );
      strip.innerHTML = countries.map(country => {
        const mark = governmentMarks[country.government.type] || "◆";
        const isCurrent = country.name === playerPolity;
        return `<button class="country-choice${isCurrent ? " selected" : ""}" data-polity="${country.name}">
          <span class="country-choice-mark" aria-hidden="true">${mark}</span>${country.name}<br><small>${country.government.typeLabel}</small>
        </button>`;
      }).join("");
      strip.querySelectorAll(".country-choice").forEach(button => {
        button.addEventListener("click", () => {
          selectedPolity = button.dataset.polity;
          renderChoicePreview();
        });
      });
      if (!countries.some(country => country.name === selectedPolity)) selectedPolity = countries[0]?.name || store.getState().playerPolity;
      renderChoicePreview();
      const currentButton = strip.querySelector(`.country-choice[data-polity="${playerPolity}"]`);
      currentButton?.scrollIntoView({ block: "nearest", inline: "center" });
    }

    function renderPendingElection() {
      const election = store.getState().pendingElection;
      if (!election) {
        closeLayer("leaderElectionModal");
        return;
      }
      document.getElementById("leaderElectionReason").textContent = `${election.polity} · ${election.reason}`;
      const list = document.getElementById("leaderCandidateList");
      list.innerHTML = election.candidates.map((candidate, index) =>
        `<button class="leader-candidate" data-candidate="${index}">
          <strong>${candidate.title}${candidate.name}</strong>
          <span>${candidate.dynasty}</span>
          <span>行政 ${candidate.abilities.administrative} · 外交 ${candidate.abilities.diplomatic} · 军事 ${candidate.abilities.military}</span>
        </button>`
      ).join("");
      list.querySelectorAll("[data-candidate]").forEach(button => {
        button.addEventListener("click", () => {
          store.update(world => window.HIFI_POLITICS_ENGINE.completeElection(world, Number(button.dataset.candidate)));
          closeLayer("leaderElectionModal");
        });
      });
      openLayer("leaderElectionModal");
    }

    document.querySelectorAll("[data-close-dialog]").forEach(button => {
      button.addEventListener("click", () => closeLayer(button.dataset.closeDialog));
    });
    modal.addEventListener("click", event => { if (event.target === modal) closeLayer("countryModal"); });
    selectModal.addEventListener("click", event => { if (event.target === selectModal) closeLayer("countrySelectModal"); });
    document.getElementById("openCountrySelect").addEventListener("click", () => {
      closeLayer("countryModal");
      selectedPolity = store.getState().playerPolity;
      renderChoices();
      openLayer("countrySelectModal");
    });
    document.getElementById("countrySearch").addEventListener("input", event => renderChoices(event.target.value));
    document.getElementById("confirmCountryChoice").addEventListener("click", () => {
      store.update(world => window.HIFI_WORLD_ENGINE.setPlayerCountry(world, selectedPolity));
      closeLayer("countrySelectModal");
    });

    return { renderCountryModal, renderPendingElection };
  }

  window.HIFI_DRAWERS = { bindCountryDialogs, renderSystem, setDrawerTab, drawerTabForSelector };
})();

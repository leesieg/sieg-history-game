(() => {
  "use strict";

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
  const attitudeLabels = {
    close: "亲密",
    cooperative: "合作",
    neutral: "中立",
    wary: "戒备",
    rival: "敌对竞争",
    hostile: "强烈敌视",
  };

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

  const countryTabs = ["概览", "政制", "议会", "决议"];
  let countryTab = "概览";
  function setCountryTab(tab) {
    if (countryTabs.includes(tab)) countryTab = tab;
  }
  // 命令坞/省份按钮的聚焦定位可能指向某个 tab 内的控件，开抽屉前先切到对应 tab
  function countryTabForSelector(selector) {
    if (!selector) return null;
    if (selector.includes("data-reform") || selector.includes("data-law")) return "政制";
    if (selector.includes("data-assembly")) return "议会";
    if (selector.includes("data-decision") || selector.includes("data-integrate")) return "决议";
    return null;
  }

  function renderPolitics(country, world) {
    const tabBar = `<div class="drawer-tabs">${countryTabs.map(tab =>
      `<button class="drawer-tab${tab === countryTab ? " active" : ""}" data-country-tab="${tab}">${tab}</button>`
    ).join("")}</div>`;

    if (countryTab === "概览") {
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
      return `${tabBar}${basics}`;
    }

    if (countryTab === "政制") {
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
      return `${tabBar}<div class="drawer-subtitle">${codexTerm("改革", "改革槽")}</div>${reforms}
        <div class="drawer-subtitle">${codexTerm("法律", "法律")}</div>${laws}`;
    }

    if (countryTab === "议会") {
      const assemblyType = country.government.assembly.type;
      const assembly = country.government.assembly.unlocked
        ? `${actionButton("data-assembly", "tax:privilege", `${assemblyType}·让渡特权`, "支持 +15 · 阶层权力 +2")}
           ${actionButton("data-assembly", "tax:money", `${assemblyType}·收买议会`, "支持 +10 · 12 金钱")}
           ${actionButton("data-assembly", "tax:none", `${assemblyType}·强硬施压`, `当前支持 ${country.government.assembly.support}`)}`
        : '<div class="drawer-row">议会尚未解锁<span>—</span></div>';
      const estates = Object.values(country.estates)
        .map(estate => `<div class="drawer-row">${estate.label}<span>${Math.round(estate.power)} / ${Math.round(estate.satisfaction)}</span></div>`)
        .join("");
      const unrestRow = country.unrest
        ? `<div class="drawer-row">${codexTerm("阶层", "国内不满")}<span>${Math.round(country.unrest)}</span></div>`
        : "";
      return `${tabBar}<div class="drawer-subtitle">${codexTerm("议会", "议会")}</div>${assembly}
        <div class="drawer-subtitle">${codexTerm("阶层", "阶层：权力 / 满意")}</div>${estates}${unrestRow}`;
    }

    // 决议
    const tile = world.tiles.find(candidate => candidate.id === world.selectedTile);
    const integrate = tile && !tile.isSea && tile.polity === country.name
      ? actionButton("data-integrate", String(tile.id), `整合 ${tile.city || tile.region}`, `控制度 ${Math.round(tile.control ?? 0)} · 20 金钱`)
      : '<div class="drawer-row">整合：请选择己方地块<span>—</span></div>';
    const decisions = Object.entries(window.HIFI_POLITICS_ENGINE.decisions).map(([key, decision]) => {
      const can = decision.can(country, window.hifiGame?.store?.getState());
      const effect = window.HIFI_CODEX?.decisions[key]?.effect;
      return actionButton("data-decision", key, decision.label, can ? (effect || "可执行") : decision.why);
    }).join("");
    return `${tabBar}<div class="drawer-subtitle">国家决议</div>${decisions}
      <div class="drawer-subtitle">${codexTerm("领土整合", "领土整合")}</div>${integrate}`;
  }

  function codexTerm(key, label) {
    return `<span class="codex-term" data-codex="${key}">${label}</span>`;
  }

  function actionButton(attribute, key, label, detail, active = false) {
    return `<button class="drawer-row political-action${active ? " active" : ""}" ${attribute}="${key}">
      ${label}<span>${detail}</span>
    </button>`;
  }

  function renderEconomy(country, world) {
    const rules = window.HIFI_RULES;
    const tile = world.tiles.find(candidate => candidate.id === world.selectedTile);
    const policies = [
      ["closed", "封闭贸易", "本土产出 +5% · 商路分成减半"],
      ["normal", "常规贸易", "均衡"],
      ["open", "开放贸易", "商路分成 +30% · 积累资本"],
    ].map(([key, label, detail]) =>
      actionButton("data-trade-policy", key, label, detail, country.tradePolicy === key)
    ).join("");
    const tariffs = [0, 10, 25].map(value =>
      actionButton("data-tariff", value, `${value}% 关税`, value === country.tariff ? "当前" : "调整", value === country.tariff)
    ).join("");
    const routes = Object.entries(world.trade.routes).map(([key, route]) =>
      actionButton("data-trade-route", key, route.label, route.active
        ? `流量 ${route.flow} · 成本 ${route.cost}${route.boost ? ` · 投资 +${Math.round(route.boost * 100)}%` : " · 点击投资"}`
        : "尚未解锁")
    ).join("");
    const pressures = Object.entries(country.pressures).map(([key, value]) =>
      `<div class="drawer-row">${pressureLabels[key]}<span>${value}</span></div>`
    ).join("");
    const edicts = Object.entries(rules.edicts).map(([key, edict]) =>
      actionButton("data-edict", key, edict.label, Object.entries(edict.cost).map(([resource, cost]) => `${resourceLabels[resource]} ${cost}`).join(" · "))
    ).join("");
    const agendas = Object.entries(rules.agendas).map(([key, agenda]) =>
      actionButton("data-agenda", key, agenda.label, `${resourceLabels[agenda.target]} ≥ ${agenda.threshold}`, country.agenda === key)
    ).join("");
    const buildings = Object.entries(rules.buildings).map(([key, building]) =>
      actionButton("data-building", key, building.label, `${building.cost} 金钱`)
    ).join("");
    const tileLabel = tile && !tile.isSea
      ? `${tile.city || tile.region} · ${tile.polity === country.name ? "可建设" : "非己方地块"}`
      : "请选择己方陆地";
    const develop = tile && !tile.isSea && tile.polity === country.name
      ? actionButton("data-develop", String(tile.id), `资本开发 ${tile.city || tile.region}`, "30 资本 · 人口 +1")
      : '<div class="drawer-row">资本开发：请选择己方地块<span>—</span></div>';
    return `<div class="drawer-row">粮食<span>${Math.round(country.food)}</span></div>
      <div class="drawer-row">国库<span>${Math.round(country.money)}</span></div>
      <div class="drawer-row">军需<span>${Math.round(country.military)}</span></div>
      <div class="drawer-row">${codexTerm("资本池", "资本池")}<span>${Math.round(country.capital)}</span></div>
      <div class="drawer-row">${codexTerm("物价指数", "物价指数")}<span>${(country.priceIndex || 1).toFixed(2)}</span></div>
      ${develop}
      <div class="drawer-subtitle">贸易政策</div>${policies}
      <div class="drawer-subtitle">关税</div>${tariffs}
      <div class="drawer-subtitle">结构压力</div>${pressures}
      <div class="drawer-subtitle">贸易路线</div>${routes}
      <div class="drawer-subtitle">国家敕令</div>${edicts}
      <div class="drawer-subtitle">国家议程</div>${agendas}
      <div class="drawer-subtitle">地块建设：${tileLabel}</div>${buildings}`;
  }

  function renderDevelopment(country, world) {
    const technologies = Object.entries(window.HIFI_RULES.technologies).map(([key, technology]) =>
      actionButton(
        "data-technology",
        key,
        technology.label,
        country.technology[key] ? "已采纳" : `${technology.cost} 思想 · 传播 ${country.technologyAwareness[key]}%`,
        country.technology[key]
      )
    ).join("");
    const missions = window.HIFI_HISTORY_ENGINE.missions(world).map(mission =>
      `<div class="drawer-row">${mission.label}<span>${mission.done ? "完成" : "进行中"}</span></div>`
    ).join("");
    const tutorial = window.HIFI_HISTORY_ENGINE.tutorialTask(world);
    return `<div class="drawer-row">思想点<span>${Math.round(country.ideas)}</span></div>
      <div class="drawer-row">时代进度<span>${country.ageProgress}%</span></div>
      <div class="drawer-row">${codexTerm("探索点", "探索点")}<span>${country.exploration.points}${country.exploration.colonial ? " · 殖民" : ""}</span></div>
      <div class="drawer-subtitle">时代使命</div>${missions}
      <div class="drawer-subtitle">导师指引</div><div class="drawer-row">${tutorial?.label || "已完成全部指引"}<span>${world.tutorial.step} / 5</span></div>
      <div class="drawer-subtitle">科技采纳</div>${technologies}`;
  }

  function renderMilitary(country, world) {
    const armies = Object.values(world.warfare.armies).filter(army => army.owner === country.name);
    const wars = world.diplomacy.wars.filter(war => war.attackers.includes(country.name) || war.defenders.includes(country.name));
    const tile = world.tiles.find(candidate => candidate.id === world.selectedTile);
    const canRecruit = tile && !tile.isSea && tile.polity === country.name;
    return `<div class="drawer-row">军事点<span>${country.actionPoints.military}</span></div>
      <div class="drawer-row">${codexTerm("战争疲惫", "战争疲惫")}<span>${Math.round(country.warfare.warExhaustion)}</span></div>
      <div class="drawer-subtitle">征募：${canRecruit ? tile.city || tile.region : "请选择己方地块"}</div>
      ${actionButton("data-mobilize", "infantry", "动员步兵", "消耗地块 POP")}
      ${actionButton("data-mobilize", "cavalry", "动员骑兵", "消耗地块 POP")}
      ${country.technology.artillery ? actionButton("data-mobilize", "artillery", "铸造炮队", "军需 30") : ""}
      ${actionButton("data-hire-mercenary", "company", "雇佣自由佣兵团", "40 金钱")}
      <div class="drawer-subtitle">军团</div>
      ${armies.length ? armies.map(army => actionButton("data-army-open", army.id, army.name, `${window.HIFI_WARFARE_ENGINE.armyTotalSoldiers(army)} 人`)).join("") : '<div class="drawer-row">暂无军团<span>—</span></div>'}
      <div class="drawer-subtitle">战争</div>
      ${wars.length ? wars.map(war =>
        `<button class="drawer-row political-action" data-peace-war="${war.id}" data-peace-term="${
          war.primaryGoal.claimant === country.name ? "target_territory" : "status_quo"
        }">${war.name}<span>${
          war.primaryGoal.claimant === country.name ? `索取目标 · ${war.score}` : "提议停战"
        }</span></button>`
      ).join("") : '<div class="drawer-row">当前和平<span>—</span></div>'}`;
  }

  function renderDiplomacy(country, world) {
    const engine = window.HIFI_DIPLOMACY_ENGINE;
    const targets = Object.keys(world.countries).filter(name => name !== country.name);
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
    const actions = [
      ["mission:improve", "派遣使节", "改善关系"],
      ["leader:meeting", "私人会晤", "友谊与尊重"],
      ["leader:gift", "赠送礼物", "20 金钱"],
      ["leader:threaten", "公开威慑", "恐惧与宿怨"],
      ["treaty:trade", "贸易协定", "长期承诺"],
      ["treaty:access", "军事通行", "开放路线"],
      ["treaty:marriage", "王室联姻", "长期联结"],
      ["treaty:nonaggression", "互不侵犯", "短期止戈"],
      ["treaty:alliance", "防御同盟", "盟友被攻击自动参战"],
      ["subject:tributary", "要求朝贡", "高自主"],
      ["subject:vassal", "要求附庸", "中自主"],
      ["subject:puppet", "建立傀儡", "低自主"],
    ].map(([key, label, detail]) => actionButton("data-diplomatic-action", key, label, detail)).join("");
    const warAction = atWar
      ? '<div class="drawer-row">宣战<span>已处于战争</span></div>'
      : truce
        ? '<div class="drawer-row">宣战<span>停战协定期</span></div>'
        : actionButton("data-diplomatic-action", "war:declare", "宣战", "开启战争");
    const subjectRows = subject
      ? `<div class="drawer-subtitle">权利结构</div>
        <div class="drawer-row">关系<span>${engine.subjectTypes[subject.type].label}</span></div>
        <div class="drawer-row">自主权<span>${subject.autonomy}</span></div>
        <div class="drawer-row">忠诚度<span>${subject.loyalty}</span></div>
        ${subject.overlord === country.name
          ? `${actionButton("data-subject-control", "tighten", "收紧控制", "自主 -10")}
             ${actionButton("data-subject-control", "loosen", "放宽自治", "忠诚 +12")}`
          : ""}`
      : "";
    return `<div class="drawer-row">外交点<span>${country.actionPoints.diplomatic}</span></div>
      <div class="drawer-row">使节<span>${engine.freeEnvoys(world, country.name)} / ${country.diplomacy.envoys}</span></div>
      <div class="drawer-row">外交容量<span>${engine.capacityUsed(world, country.name)} / ${engine.capacity(world, country.name)}</span></div>
      <div class="drawer-subtitle">外交对象</div><div class="drawer-scroll-list">${targetButtons}</div>
      <div class="drawer-subtitle">${targetCountry.name} · 对我方态度</div>
      <div class="drawer-row">信任<span>${relation.trust}</span></div>
      <div class="drawer-row">威胁<span>${relation.threat}</span></div>
      <div class="drawer-row">${codexTerm("战略利益", "战略利益")}<span>${relation.strategicInterest}</span></div>
      <div class="drawer-subtitle">外交行动</div>${actions}${warAction}${subjectRows}`;
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
      const countries = Object.values(store.getState().countries).filter(country =>
        !query || country.name.toLowerCase().includes(query) || country.government.typeLabel.includes(query)
      );
      strip.innerHTML = countries.map(country =>
        `<button class="country-choice" data-polity="${country.name}">${country.name}<br><small>${country.government.typeLabel}</small></button>`
      ).join("");
      strip.querySelectorAll(".country-choice").forEach(button => {
        button.addEventListener("click", () => {
          selectedPolity = button.dataset.polity;
          renderChoicePreview();
        });
      });
      if (!countries.some(country => country.name === selectedPolity)) selectedPolity = countries[0]?.name || store.getState().playerPolity;
      renderChoicePreview();
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

  window.HIFI_DRAWERS = { bindCountryDialogs, renderSystem, setCountryTab, countryTabForSelector };
})();

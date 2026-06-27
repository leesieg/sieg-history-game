(() => {
  "use strict";

  const drawer = document.getElementById("systemDrawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerBody = document.getElementById("drawerBody");
  const seasonControl = document.getElementById("seasonControl");
  const seasonText = document.getElementById("seasonText");
  const seasonIcon = document.getElementById("seasonIcon");
  const issuePanel = document.getElementById("issuePanel");
  const issueHeading = document.getElementById("issueHeading");
  const toast = document.getElementById("toast");
  let toastTimer;

  const world = window.HIFI_WORLD_ENGINE.createWorld(window.prototypeMap.tiles);
  window.HIFI_POLITICS_ENGINE.initializePolitics(world);
  window.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
  window.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
  window.HIFI_WARFARE_ENGINE.initializeWarfare(world);
  window.HIFI_HISTORY_ENGINE.initializeHistory(world);
  window.HIFI_STRUGGLE_ENGINE.initializeStruggles(world);
  window.HIFI_TRADE_ENGINE.initializeTrade(world);
  const store = window.HIFI_STORE.createStore(world);
  const dialogs = window.HIFI_DRAWERS.bindCountryDialogs(store);
  window.HIFI_DIALOGS.bindArmyDialog(store);
  const narrativeDialogs = window.HIFI_DIALOGS.bindNarrativeDialogs(store);
  window.HIFI_CODEX_UI.init();

  function showToast(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function openModal(id) {
    document.querySelectorAll(".modal-layer").forEach(layer => {
      if (layer.id === id) return;
      layer.classList.remove("open");
      layer.setAttribute("aria-hidden", "true");
    });
    const layer = document.getElementById(id);
    if (!layer) throw new Error(`缺少弹窗：${id}`);
    // 打开任意主界面弹窗时统一收起系统抽屉与其 active 态，避免弹窗与抽屉同屏（33 号 P0-2）
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.getElementById("game").classList.remove("system-open");
    document.querySelectorAll(".system-button").forEach(b => b.classList.remove("active"));
    layer.classList.add("open");
    layer.setAttribute("aria-hidden", "false");
  }

  const RESOURCE_DIFF_LABELS = {
    food: "粮食",
    money: "金钱",
    military: "军需",
    legitimacy: "合法性",
    ideas: "思潮",
    capital: "资本",
    administrative: "行政点",
    diplomatic: "外交点",
    militaryPoint: "军事点",
  };

  function snapshotResources(world) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(world);
    return {
      food: country.food,
      money: country.money,
      military: country.military,
      legitimacy: country.legitimacy,
      ideas: country.ideas,
      capital: country.capital,
      administrative: country.actionPoints.administrative,
      diplomatic: country.actionPoints.diplomatic,
      militaryPoint: country.actionPoints.military,
    };
  }

  function diffResources(before, after) {
    const parts = [];
    for (const key of Object.keys(RESOURCE_DIFF_LABELS)) {
      const delta = (after[key] || 0) - (before[key] || 0);
      if (delta) parts.push(`${RESOURCE_DIFF_LABELS[key]} ${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta))}`);
    }
    return parts.length ? parts.join("，") : null;
  }

  function setResource(key, value) {
    const token = document.querySelector(`[data-resource="${key}"] .resource-total`);
    if (token) token.textContent = String(Math.round(value));
  }

  function setTrend(key, value, label) {
    const trend = document.querySelector(`[data-resource="${key}"] .resource-trend`);
    if (trend) trend.textContent = value === null ? label : `${value >= 0 ? "+" : ""}${Math.round(value)}/季`;
  }

  function renderHud(current) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(current);
    const rulerPlaque = document.getElementById("rulerPlaque");
    const rulerPortrait = document.getElementById("rulerPortrait");
    const countryShield = document.getElementById("countryShield");
    const governmentMarks = {
      monarchy: "⚜",
      republic: "◆",
      merchant_republic: "⚓",
      empire: "♛",
      theocracy: "✝",
      tribal: "◇",
    };
    const mark = governmentMarks[country.government.type] || "◆";
    rulerPlaque.setAttribute("aria-label", `查看${country.name}`);
    rulerPortrait.setAttribute("alt", country.leader.name);
    rulerPortrait.hidden = country.leader.name !== "腓力六世";
    rulerPlaque.classList.toggle("portrait-placeholder", rulerPortrait.hidden);
    rulerPlaque.dataset.monogram = country.leader.name.slice(0, 1);
    countryShield.setAttribute("aria-label", `${country.name}盾徽`);
    countryShield.querySelectorAll("span").forEach(item => { item.textContent = mark; });
    document.getElementById("dateMain").textContent = window.HIFI_WORLD_ENGINE.calendarLabel(current.turn);
    document.getElementById("dateEra").textContent = `${window.HIFI_HISTORY_ENGINE.eras[current.eraIndex].label} · ${country.leader.dynasty}`;
    setResource("food", country.food);
    setResource("administrative", country.actionPoints.administrative);
    setResource("diplomatic", country.actionPoints.diplomatic);
    setResource("militaryPoint", country.actionPoints.military);
    setResource("money", country.money);
    setResource("military", country.military);
    setResource("legitimacy", country.legitimacy);
    const forecast = window.HIFI_HISTORY_ENGINE.forecast(current);
    setTrend("food", forecast.food, "粮食");
    setTrend("money", forecast.money, "金钱");
    setTrend("military", forecast.military, "军需");
    setTrend("administrative", null, "行政点");
    setTrend("diplomatic", null, "外交点");
    setTrend("militaryPoint", null, "军事点");
    setTrend("legitimacy", null, "合法性");
    seasonControl.title = `预计下季：粮 ${forecast.food >= 0 ? "+" : ""}${forecast.food} · 金 ${forecast.money >= 0 ? "+" : ""}${forecast.money} · 军需 ${forecast.military >= 0 ? "+" : ""}${forecast.military}`;
    const issues = window.HIFI_HISTORY_ENGINE.issues(current);
    const blocking = window.HIFI_HISTORY_ENGINE.blockingIssues(current);
    const count = issues.length;
    const seasonHint = !count && window.HIFI_OBJECTIVES_ENGINE
      ? window.HIFI_OBJECTIVES_ENGINE.seasonTasks(current, current.playerPolity).length
      : 0;
    issueHeading.title = "打开御前会议：使命 / 预警 / 顾问草案 / 来信 / 季报";
    if (count) {
      issueHeading.textContent = `⚖ 御前会议 · ${count}`;
    } else if (seasonHint) {
      issueHeading.textContent = `⚖ 御前会议 · 本季 ${seasonHint} 件事`;
    } else {
      issueHeading.textContent = "⚖ 御前会议";
    }
    issuePanel.classList.toggle("issue-empty", count === 0);
    seasonText.textContent = blocking.length ? `处理裁断 ${blocking.length}` : (count ? `问题 ${count}` : "结束季度");
    // 播放/暂停样式：可推进显 ▶（绿），有阻塞裁断显 ‖（红）。
    seasonIcon.textContent = blocking.length ? "‖" : "▶";
    seasonControl.classList.toggle("ready", blocking.length === 0);
    const tierLabels = { blocking: "裁断", mainline: "主线", opportunity: "机会" };
    const groupedIssues = ["blocking", "mainline", "opportunity"]
      .map(tier => ({ tier, items: issues.filter(issue => (issue.tier || "opportunity") === tier) }))
      .filter(group => group.items.length);
    document.getElementById("issueList").innerHTML = groupedIssues.map(group =>
      `<div class="issue-group-title">${tierLabels[group.tier]}</div>` + group.items.map(issue =>
      `<button class="issue" data-history-issue="${issue.id}" data-kind="${issue.kind}" data-key="${issue.key || ""}"
        data-target-panel="${issue.target?.panel || ""}" data-target-drawer="${issue.target?.drawer || ""}"
        data-target-tab="${issue.target?.tab || ""}" data-target-polity="${issue.target?.polity || ""}"
        data-target-tile="${issue.target?.tileId ?? ""}" data-target-focus="${issue.target?.focus || ""}"
        data-target-key="${issue.target?.key || ""}">
        <span class="issue-symbol">${issue.blocking ? "!" : "◇"}</span>
        <span><strong>${issue.label}</strong><small>${issue.detail}</small></span><span class="issue-arrow">›</span>
      </button>`
    ).join("")).join("");
    document.querySelectorAll("[data-history-issue]").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.kind === "event") narrativeDialogs.renderEvent(button.dataset.historyIssue);
        else if (button.dataset.targetPanel || button.dataset.targetDrawer) openIssueTarget(button);
        else if (button.dataset.kind === "struggle") openStrugglePanel(button.dataset.key);
        else narrativeDialogs.renderCouncil();
      });
    });
    dialogs.renderPendingElection();
  }

  const RESOURCE_LEDGER_LABELS = {
    food: ["粮食", "人口与军队消耗的基础资源"],
    money: ["国库", "建设、外交、雇佣军和军队维护的通用资源"],
    military: ["军需", "动员、补给和战争消耗的军事资源"],
    legitimacy: ["合法性", "政权稳定、改革阻力和国内服从度"],
    administrative: ["行政点", "法律、建设和内政改革的行动点"],
    diplomatic: ["外交点", "使节、条约和领导人外交的行动点"],
    militaryPoint: ["军事点", "动员、军团命令和战时决断的行动点"],
  };

  function signed(value) {
    const rounded = Math.round(Number(value) || 0);
    return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded)}`;
  }

  function resourceLedgerRows(key, country, ledger) {
    if (ledger[key]) {
      const item = ledger[key];
      const sources = item.sources?.length ? item.sources.join("；") : "暂无来源明细";
      return [
        ["产出", signed(item.gross), sources],
        ["维护", item.maintenance ? `−${Math.round(item.maintenance)}` : "0", "军团、建筑与行政网络的季度维护"],
        ["事件", item.event ? `−${Math.round(item.event)}` : "0", "本季事件或局势带来的即时影响"],
        ["战争", item.war ? `−${Math.round(item.war)}` : "0", ledger.war ? `${ledger.war.label} · ${ledger.war.phase}` : "无战争消耗"],
        ["净变化", signed(item.net), `本季结算后${RESOURCE_LEDGER_LABELS[key][0]}变化`],
      ];
    }
    const pointRows = {
      administrative: ["行政点", country.actionPoints.administrative, country.leader.abilities.administrative, "内政、建设、改革"],
      diplomatic: ["外交点", country.actionPoints.diplomatic, country.leader.abilities.diplomatic, "外交、条约、元首互动"],
      militaryPoint: ["军事点", country.actionPoints.military, country.leader.abilities.military, "动员、军令、战场决断"],
    };
    if (pointRows[key]) {
      const [, current, ability, usage] = pointRows[key];
      return [
        ["当前", Math.round(current), "本季度可直接使用的行动点"],
        ["来源", `能力 ${ability}`, `${country.leader.title}${country.leader.name} 的对应能力影响季度行动点`],
        ["用途", "消耗", usage],
      ];
    }
    if (key === "legitimacy") {
      return [
        ["当前", Math.round(country.legitimacy), "政权稳定和国内服从的综合结果"],
        ["来源", country.government.powerName, `${country.government.typeLabel} 的权力结构影响合法性波动`],
        ["风险", country.legitimacy < 45 ? "偏低" : "稳定", "合法性偏低时，改革、阶层和局势压力更难处理"],
      ];
    }
    return [["状态", "暂无", "该资源还没有接入账本"]];
  }

  function renderResourceLedger(key) {
    const [label, subtitle] = RESOURCE_LEDGER_LABELS[key] || ["资源", "资源明细"];
    const current = store.getState();
    const country = window.HIFI_WORLD_ENGINE.activeCountry(current);
    const ledger = window.HIFI_HISTORY_ENGINE.quarterLedger(current, current.playerPolity);
    document.getElementById("resourceLedgerTitle").textContent = `${label}账本`;
    document.getElementById("resourceLedgerSubtitle").textContent =
      `${country.name} · ${window.HIFI_WORLD_ENGINE.calendarLabel(current.turn)} · ${subtitle}`;
    document.getElementById("resourceLedgerBody").innerHTML = `
      <section class="state-section">
        <h3>本季明细</h3>
        ${resourceLedgerRows(key, country, ledger).map(([name, value, detail]) =>
          `<div class="ledger-line"><span>${name}</span><b>${value}</b><small>${detail}</small></div>`
        ).join("")}
      </section>
      <section class="state-section">
        <h3>口径</h3>
        <p>这里读取本季结算账本，不另起一套计算。粮食、国库、军需来自地块产出、维护、事件和战争；行动点来自当前领导人能力。</p>
      </section>`;
    openModal("resourceLedgerModal");
  }

  function openIssueTarget(button) {
    if (button.dataset.targetPanel === "struggle") {
      openStrugglePanel(button.dataset.key || button.dataset.targetKey || "hundred_years_war");
      return;
    }
    const system = button.dataset.targetDrawer;
    if (!system) return narrativeDialogs.renderCouncil();
    store.update(current => {
      if (button.dataset.targetPolity) current.diplomacy.selectedTarget = button.dataset.targetPolity;
      if (button.dataset.targetTile) current.selectedTile = Number(button.dataset.targetTile);
    });
    if (button.dataset.targetTab) window.HIFI_DRAWERS.setDrawerTab(button.dataset.targetTab);
    const target = document.querySelector(`.system-button[data-system="${system}"]`);
    if (!target) return narrativeDialogs.renderCouncil();
    if (!target.classList.contains("active")) openSystem(target);
    else renderSystemBody(system);
    focusInDrawer(button.dataset.targetFocus);
  }

  function renderSystemBody(system) {
    const custom = window.HIFI_DRAWERS.renderSystem(system, store.getState());
    if (!custom) throw new Error(`未知系统界面：${system}`);
    drawerBody.innerHTML = custom;
    function actionLabel(button) {
      if (!button) return "操作";
      const firstNode = Array.from(button.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      return (firstNode ? firstNode.textContent : button.textContent).trim() || "操作";
    }
    function runAction(action, button) {
      const before = snapshotResources(store.getState());
      try {
        store.update(action);
        renderSystemBody(system);
        const diff = diffResources(before, snapshotResources(store.getState()));
        if (diff) showToast(`${actionLabel(button)} —— ${diff}`);
      } catch (error) {
        showToast(error.message);
      }
    }
    drawerBody.querySelectorAll("[data-drawer-tab]").forEach(button => {
      button.addEventListener("click", () => {
        window.HIFI_DRAWERS.setDrawerTab(button.dataset.drawerTab);
        renderSystemBody(system);
      });
    });
    drawerBody.querySelectorAll("[data-reform]").forEach(reformButton => {
      reformButton.addEventListener("click", () => {
        runAction(current => window.HIFI_POLITICS_ENGINE.advanceReform(
            current,
            current.playerPolity,
            reformButton.dataset.reform
        ), reformButton);
      });
    });
    drawerBody.querySelectorAll("[data-law]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        const [category, value] = button.dataset.law.split(":");
        return window.HIFI_POLITICS_ENGINE.setLaw(current, current.playerPolity, category, value);
      }, button));
    });
    drawerBody.querySelectorAll("[data-assembly]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        const [agenda, concession] = button.dataset.assembly.split(":");
        return window.HIFI_POLITICS_ENGINE.holdAssembly(current, current.playerPolity, agenda, concession);
      }, button));
    });
    drawerBody.querySelectorAll("[data-decision]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_POLITICS_ENGINE.enactDecision(current, current.playerPolity, button.dataset.decision)
      , button));
    });
    drawerBody.querySelectorAll("[data-trade-policy]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        (window.HIFI_ECONOMY_ENGINE.setTradePolicy(current, current.playerPolity, button.dataset.tradePolicy),
        window.HIFI_HISTORY_ENGINE.completeTutorial(current, "set_trade"))
      , button));
    });
    drawerBody.querySelectorAll("[data-tariff]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        (window.HIFI_TRADE_ENGINE.setTariff(current, current.playerPolity, Number(button.dataset.tariff)),
        window.HIFI_HISTORY_ENGINE.completeTutorial(current, "set_trade"))
      , button));
    });
    drawerBody.querySelectorAll("[data-trade-route]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        window.HIFI_TRADE_ENGINE.investRoute(current, current.playerPolity, button.dataset.tradeRoute);
        window.prototypeMap.setMode("trade");
      }, button));
    });
    drawerBody.querySelectorAll("[data-edict]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.enactEdict(current, current.playerPolity, button.dataset.edict)
      , button));
    });
    drawerBody.querySelectorAll("[data-agenda]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.setAgenda(current, current.playerPolity, button.dataset.agenda)
      , button));
    });
    drawerBody.querySelectorAll("[data-building]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.constructBuilding(
          current,
          current.playerPolity,
          current.selectedTile,
          button.dataset.building
        )
      , button));
    });
    drawerBody.querySelectorAll("[data-technology]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.adoptTechnology(current, current.playerPolity, button.dataset.technology)
      , button));
    });
    drawerBody.querySelectorAll("[data-diplomatic-target]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        current.diplomacy.selectedTarget = button.dataset.diplomaticTarget;
      }, button));
    });
    drawerBody.querySelectorAll("[data-diplomatic-action]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        const [group, action] = button.dataset.diplomaticAction.split(":");
        const target = current.diplomacy.selectedTarget;
        if (group === "mission") return window.HIFI_DIPLOMACY_ENGINE.startMission(current, current.playerPolity, target, action);
        if (group === "leader") return window.HIFI_DIPLOMACY_ENGINE.performLeaderAction(current, current.playerPolity, target, action);
        if (group === "treaty") return window.HIFI_DIPLOMACY_ENGINE.proposeTreaty(current, current.playerPolity, target, action);
        if (group === "war") return window.HIFI_WARFARE_ENGINE.declareWarOn(current, current.playerPolity, target);
        return window.HIFI_DIPLOMACY_ENGINE.proposeSubject(current, current.playerPolity, target, action);
      }, button));
    });
    drawerBody.querySelectorAll("[data-integrate]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.integrateTile(current, current.playerPolity, Number(button.dataset.integrate))
      , button));
    });
    drawerBody.querySelectorAll("[data-develop]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.developTile(current, current.playerPolity, Number(button.dataset.develop))
      , button));
    });
    drawerBody.querySelectorAll("[data-subject-control]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        const subject = window.HIFI_DIPLOMACY_ENGINE.subjectBetween(
          current,
          current.playerPolity,
          current.diplomacy.selectedTarget
        );
        return window.HIFI_DIPLOMACY_ENGINE.adjustSubjectControl(
          current,
          current.playerPolity,
          subject.id,
          button.dataset.subjectControl
        );
      }, button));
    });
    drawerBody.querySelectorAll("[data-army-open]").forEach(button => {
      button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("hifi:army-selected", {
        detail: { armyId: button.dataset.armyOpen },
      })));
    });
    drawerBody.querySelectorAll("[data-mobilize]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_WARFARE_ENGINE.mobilizeArmy(
          current,
          current.playerPolity,
          current.selectedTile,
          button.dataset.mobilize
        )
      , button));
    });
    drawerBody.querySelectorAll("[data-hire-mercenary]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_WARFARE_ENGINE.hireMercenary(current, current.playerPolity, current.selectedTile)
      , button));
    });
    drawerBody.querySelectorAll("[data-peace-war]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_WARFARE_ENGINE.concludePeace(
          current,
          button.dataset.peaceWar,
          current.playerPolity,
          [{ type: button.dataset.peaceTerm }]
        )
      , button));
    });
    drawerBody.querySelectorAll("[data-struggle-action]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        executeStruggleAction(current, current.playerPolity, button.dataset.struggleAction)
      , button));
    });
  }

  // 局势阶段限定操作：先过 struggle 引擎的阶段 gate（非当前阶段 → 中文报错 → toast），
  // 通过后委托现有 warfare/diplomacy 引擎，不另造战斗规则。
  function executeStruggleAction(world, polity, actionId) {
    const struggle = window.HIFI_STRUGGLE_ENGINE.phaseActionGate(world, polity, actionId);
    if (actionId === "press_claim") {
      const opponent = Object.keys(struggle.parties)
        .find(name => struggle.parties[name].role === "principal" && name !== polity);
      if (!opponent) throw new Error("没有可提出主张的对手");
      if (window.HIFI_WARFARE_ENGINE.areAtWar(world, polity, opponent)) throw new Error(`与${opponent}已经交战，无需再提主张`);
      return window.HIFI_WARFARE_ENGINE.declareWarOn(world, polity, opponent, `${struggle.label}·王位主张`);
    }
    if (actionId === "muster_battle") {
      const capital = window.HIFI_WORLD_ENGINE.controlledTiles(world, polity).find(tile => tile.city);
      if (!capital) throw new Error("没有可供集结的城市");
      return window.HIFI_WARFARE_ENGINE.mobilizeArmy(world, polity, capital.id, "infantry");
    }
    if (actionId === "favorable_truce") {
      const principals = Object.keys(struggle.parties).filter(name => struggle.parties[name].role === "principal");
      const war = (world.diplomacy?.wars || []).find(item =>
        principals.every(name => item.attackers.includes(name) || item.defenders.includes(name)));
      if (!war) throw new Error("目前没有与对手的战争可议和");
      const term = war.primaryGoal.claimant === polity && war.score >= 25 ? "target_territory" : "status_quo";
      return window.HIFI_WARFARE_ENGINE.concludePeace(world, war.id, polity, [{ type: term }]);
    }
    if (actionId === "pick_side") {
      return window.HIFI_STRUGGLE_ENGINE.pickSide(world, polity, -1);
    }
    throw new Error("该局势操作尚未开放");
  }

  // 右下角局势浮窗（统一入口，反馈 #1）：当前国家卷入的每个未定局局势渲染一张卡，点开统一局势界面。
  function renderStruggleDock(current) {
    const dock = document.getElementById("struggleDock");
    const engine = window.HIFI_STRUGGLE_ENGINE;
    if (!dock || !engine) return;
    const active = engine.activeStruggles(current)
      .filter(item => engine.involvement(current, current.playerPolity, item) !== "bystander");
    dock.innerHTML = active.map(item => {
      const summary = engine.struggleSummary(current, current.playerPolity, item.key);
      return `<button class="struggle-dock-card" data-struggle-open="${item.key}">
        <span class="struggle-dock-name">⚔ ${summary.label}</span>
        <span class="struggle-dock-phase">${summary.displayPhaseLabel || summary.phaseLabel} · ${summary.year ?? summary.startYear}年</span>
      </button>`;
    }).join("");
    dock.querySelectorAll("[data-struggle-open]").forEach(button =>
      button.addEventListener("click", () => openStrugglePanel(button.dataset.struggleOpen)));
  }

  // 打开统一局势界面并绑定决议按钮：执行经 executeStruggleAction（含阶段 gate），失败中文 toast，成功后刷新面板与浮窗。
  function openStrugglePanel(key) {
    if (!narrativeDialogs.renderStrugglePanel(key)) return;
    document.querySelectorAll("#struggleBody [data-struggle-action]").forEach(button => {
      if (button.disabled) return;
      button.addEventListener("click", () => {
        const before = snapshotResources(store.getState());
        try {
          store.update(current => executeStruggleAction(current, current.playerPolity, button.dataset.struggleAction));
          const diff = diffResources(before, snapshotResources(store.getState()));
          showToast(diff ? `局势决议 —— ${diff}` : "局势决议已执行");
          renderStruggleDock(store.getState());
          openStrugglePanel(key); // 重渲染面板，刷新阶段/决议可用性
        } catch (error) {
          showToast(error.message);
        }
      });
    });
  }

  function openSystem(button) {
    window.dispatchEvent(new CustomEvent("hifi:army-close"));
    const same = button.classList.contains("active");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
    if (same) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      document.getElementById("game").classList.remove("system-open");
      return;
    }
    button.classList.add("active");
    drawerTitle.textContent = button.dataset.system;
    renderSystemBody(button.dataset.system);
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.getElementById("game").classList.add("system-open");
  }

  document.querySelectorAll(".system-button").forEach(button => {
    button.addEventListener("click", () => openSystem(button));
  });

  document.querySelectorAll(".resource-token").forEach(token => {
    token.setAttribute("role", "button");
    token.tabIndex = 0;
    token.title = "查看资源账本";
    token.addEventListener("click", () => renderResourceLedger(token.dataset.resource));
    token.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      renderResourceLedger(token.dataset.resource);
    });
  });

  document.getElementById("drawerClose").addEventListener("click", () => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.getElementById("game").classList.remove("system-open");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
  });

  document.getElementById("rulerPlaque").addEventListener("click", () => {
    store.update(current => window.HIFI_HISTORY_ENGINE.completeTutorial(current, "open_country"));
    dialogs.renderCountryModal();
  });
  issueHeading.addEventListener("click", narrativeDialogs.renderCouncil);
  seasonControl.addEventListener("click", () => {
    const current = store.getState();
    const blocking = window.HIFI_HISTORY_ENGINE.blockingIssues(current);
    if (blocking.length) {
      showToast(`仍有 ${blocking.length} 项裁断需要处理`);
      return;
    }
    const snapshot = narrativeDialogs.captureSeasonSnapshot(current); // 推进前快照：人口/战争，供本季总结比对
    store.update(next => window.HIFI_TURN_ENGINE.advanceQuarter(next));
    window.HIFI_HISTORY_ENGINE.completeTutorial(current, "advance_turn");
    showToast(`进入${window.HIFI_WORLD_ENGINE.calendarLabel(current.turn)}`);
    // 局势终局 / 十年战局评估优先；否则展开本季总结
    if (!narrativeDialogs.renderStruggleEnding() && !narrativeDialogs.renderStruggleReview()) {
      narrativeDialogs.renderSeasonSummary(snapshot); // toast 之外的可展开本季总结，说明这季到底变了什么
    }
  });

  function focusInDrawer(selector) {
    if (!selector) return;
    const element = drawerBody.querySelector(selector);
    if (!element) return;
    element.scrollIntoView({ block: "nearest" });
    element.style.transition = "box-shadow .2s ease";
    element.style.boxShadow = "0 0 0 2px #c99a31";
    setTimeout(() => { element.style.boxShadow = ""; }, 1200);
  }

  // 用事件委托而非逐按钮 addEventListener：省份面板的 data-open-system 按钮由
  // tileActionsFor 按归属动态重渲染（见 map.js updateProvince），固定绑定会在重渲染后失效。
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-open-system]");
    if (!button) return;
    if (button.dataset.markTarget !== undefined) {
      store.update(current => { current.diplomacy.selectedTarget = button.dataset.tilePolity; });
    }
    const target = document.querySelector(`.system-button[data-system="${button.dataset.openSystem}"]`);
    if (!target) throw new Error(`缺少系统入口：${button.dataset.openSystem}`);
    const tab = window.HIFI_DRAWERS.drawerTabForSelector(button.dataset.openSystem, button.dataset.focusSel);
    if (tab) window.HIFI_DRAWERS.setDrawerTab(tab);
    if (!target.classList.contains("active")) openSystem(target);
    else if (tab) renderSystemBody(button.dataset.openSystem);
    focusInDrawer(button.dataset.focusSel);
  });

  // 省份面板的「查看国家」「标记目标」不开抽屉，单独委托处理。
  document.addEventListener("click", event => {
    const viewCountryButton = event.target.closest("[data-view-country]");
    if (viewCountryButton) {
      dialogs.renderCountryModal(viewCountryButton.dataset.tilePolity);
      return;
    }
    const markOnlyButton = event.target.closest("[data-mark-target]:not([data-open-system])");
    if (markOnlyButton) {
      store.update(current => { current.diplomacy.selectedTarget = markOnlyButton.dataset.tilePolity; });
      showToast(`已标记外交目标：${markOnlyButton.dataset.tilePolity}`);
    }
  });

  // Task C7：外交对象搜索——纯 DOM 过滤，不触发重渲染，输入框不丢焦点。
  document.addEventListener("input", event => {
    const search = event.target.closest("[data-diplo-search]");
    if (!search) return;
    const query = search.value.trim().toLowerCase();
    document.querySelectorAll("[data-diplomatic-target]").forEach(button => {
      const name = (button.dataset.diplomaticTarget || button.textContent || "").toLowerCase();
      button.style.display = name.includes(query) ? "" : "none";
    });
    document.querySelectorAll(".diplo-group").forEach(group => {
      const matches = Array.from(group.querySelectorAll("[data-diplomatic-target]"))
        .some(button => button.style.display !== "none");
      group.hidden = query && !matches;
      if (query && matches) group.open = true;
    });
  });

  window.addEventListener("hifi:open-system", event => {
    const target = document.querySelector(`.system-button[data-system="${event.detail.system}"]`);
    if (!target) return;
    if (!target.classList.contains("active")) openSystem(target);
  });

  window.addEventListener("hifi:tile-selected", event => {
    window.dispatchEvent(new CustomEvent("hifi:army-close"));
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.getElementById("game").classList.remove("system-open");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
    store.update(current => {
      current.selectedTile = event.detail.tileId;
      window.HIFI_HISTORY_ENGINE.completeTutorial(current, "select_tile");
      if (current.warfare?.planningArmy) {
        const planningArmy = current.warfare.planningArmy;
        current.warfare.planningArmy = null;
        try {
          window.HIFI_WARFARE_ENGINE.planArmyRoute(current, planningArmy, event.detail.tileId);
          showToast("军团路线已规划");
        } catch (error) {
          showToast(error.message === "目标不可达" ? "目标不可达，已退出规划" : error.message);
        }
      }
    });
  });

  window.addEventListener("hifi:army-selected", () => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.getElementById("game").classList.remove("system-open");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
    store.update(current => window.HIFI_HISTORY_ENGINE.completeTutorial(current, "manage_army"));
  });

  store.subscribe(current => {
    renderHud(current);
    renderStruggleDock(current);
    window.prototypeMap.syncSelection(current.selectedTile);
    window.prototypeMap.refreshSelected();
    window.prototypeMap.renderMainMap();
  });
  renderHud(store.getState());
  renderStruggleDock(store.getState());
  window.hifiGame = { store, showToast };
  window.prototypeMap.renderMainMap();
  window.prototypeMap.refreshSelected();
})();

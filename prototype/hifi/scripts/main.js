(() => {
  "use strict";

  const drawer = document.getElementById("systemDrawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerBody = document.getElementById("drawerBody");
  const seasonControl = document.getElementById("seasonControl");
  const seasonText = document.getElementById("seasonText");
  const topPending = document.getElementById("topPending");
  const toast = document.getElementById("toast");
  let toastTimer;

  const world = window.HIFI_WORLD_ENGINE.createWorld(window.prototypeMap.tiles);
  window.HIFI_POLITICS_ENGINE.initializePolitics(world);
  window.HIFI_ECONOMY_ENGINE.initializeEconomy(world);
  window.HIFI_DIPLOMACY_ENGINE.initializeDiplomacy(world);
  window.HIFI_WARFARE_ENGINE.initializeWarfare(world);
  window.HIFI_HISTORY_ENGINE.initializeHistory(world);
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
    topPending.textContent = count ? `待办 ${count} ›` : "待办已清";
    seasonText.textContent = blocking.length ? `处理裁断 ${blocking.length}` : "结束季度";
    seasonControl.classList.toggle("ready", blocking.length === 0);
    document.getElementById("issueList").innerHTML = issues.map(issue =>
      `<button class="issue" data-history-issue="${issue.id}" data-kind="${issue.kind}">
        <span class="issue-symbol">${issue.blocking ? "!" : "◇"}</span>
        <span><strong>${issue.label}</strong><small>${issue.detail}</small></span><span class="issue-arrow">›</span>
      </button>`
    ).join("");
    document.querySelectorAll("[data-history-issue]").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.kind === "event") narrativeDialogs.renderEvent(button.dataset.historyIssue);
        else narrativeDialogs.renderCouncil();
      });
    });
    dialogs.renderPendingElection();
  }

  function renderSystemBody(system) {
    const custom = window.HIFI_DRAWERS.renderSystem(system, store.getState());
    if (!custom) throw new Error(`未知系统界面：${system}`);
    drawerBody.innerHTML = custom;
    function runAction(action) {
      try {
        store.update(action);
        renderSystemBody(system);
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
        ));
      });
    });
    drawerBody.querySelectorAll("[data-law]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        const [category, value] = button.dataset.law.split(":");
        return window.HIFI_POLITICS_ENGINE.setLaw(current, current.playerPolity, category, value);
      }));
    });
    drawerBody.querySelectorAll("[data-assembly]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        const [agenda, concession] = button.dataset.assembly.split(":");
        return window.HIFI_POLITICS_ENGINE.holdAssembly(current, current.playerPolity, agenda, concession);
      }));
    });
    drawerBody.querySelectorAll("[data-decision]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_POLITICS_ENGINE.enactDecision(current, current.playerPolity, button.dataset.decision)
      ));
    });
    drawerBody.querySelectorAll("[data-trade-policy]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        (window.HIFI_ECONOMY_ENGINE.setTradePolicy(current, current.playerPolity, button.dataset.tradePolicy),
        window.HIFI_HISTORY_ENGINE.completeTutorial(current, "set_trade"))
      ));
    });
    drawerBody.querySelectorAll("[data-tariff]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        (window.HIFI_TRADE_ENGINE.setTariff(current, current.playerPolity, Number(button.dataset.tariff)),
        window.HIFI_HISTORY_ENGINE.completeTutorial(current, "set_trade"))
      ));
    });
    drawerBody.querySelectorAll("[data-trade-route]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        window.HIFI_TRADE_ENGINE.investRoute(current, current.playerPolity, button.dataset.tradeRoute);
        window.prototypeMap.setMode("trade");
      }));
    });
    drawerBody.querySelectorAll("[data-edict]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.enactEdict(current, current.playerPolity, button.dataset.edict)
      ));
    });
    drawerBody.querySelectorAll("[data-agenda]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.setAgenda(current, current.playerPolity, button.dataset.agenda)
      ));
    });
    drawerBody.querySelectorAll("[data-building]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.constructBuilding(
          current,
          current.playerPolity,
          current.selectedTile,
          button.dataset.building
        )
      ));
    });
    drawerBody.querySelectorAll("[data-technology]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.adoptTechnology(current, current.playerPolity, button.dataset.technology)
      ));
    });
    drawerBody.querySelectorAll("[data-diplomatic-target]").forEach(button => {
      button.addEventListener("click", () => runAction(current => {
        current.diplomacy.selectedTarget = button.dataset.diplomaticTarget;
      }));
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
      }));
    });
    drawerBody.querySelectorAll("[data-integrate]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.integrateTile(current, current.playerPolity, Number(button.dataset.integrate))
      ));
    });
    drawerBody.querySelectorAll("[data-develop]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.developTile(current, current.playerPolity, Number(button.dataset.develop))
      ));
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
      }));
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
      ));
    });
    drawerBody.querySelectorAll("[data-hire-mercenary]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_WARFARE_ENGINE.hireMercenary(current, current.playerPolity, current.selectedTile)
      ));
    });
    drawerBody.querySelectorAll("[data-peace-war]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_WARFARE_ENGINE.concludePeace(
          current,
          button.dataset.peaceWar,
          current.playerPolity,
          [{ type: button.dataset.peaceTerm }]
        )
      ));
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
  topPending.addEventListener("click", narrativeDialogs.renderCouncil);
  seasonControl.addEventListener("click", () => {
    const current = store.getState();
    const blocking = window.HIFI_HISTORY_ENGINE.blockingIssues(current);
    if (blocking.length) {
      showToast(`仍有 ${blocking.length} 项裁断需要处理`);
      return;
    }
    store.update(next => window.HIFI_TURN_ENGINE.advanceQuarter(next));
    window.HIFI_HISTORY_ENGINE.completeTutorial(current, "advance_turn");
    showToast(`进入${window.HIFI_WORLD_ENGINE.calendarLabel(current.turn)}`);
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

  document.querySelectorAll("[data-open-system]").forEach(button => {
    button.addEventListener("click", () => {
      const target = document.querySelector(`.system-button[data-system="${button.dataset.openSystem}"]`);
      if (!target) throw new Error(`缺少系统入口：${button.dataset.openSystem}`);
      const tab = window.HIFI_DRAWERS.drawerTabForSelector(button.dataset.openSystem, button.dataset.focusSel);
      if (tab) window.HIFI_DRAWERS.setDrawerTab(tab);
      if (!target.classList.contains("active")) openSystem(target);
      else if (tab) renderSystemBody(button.dataset.openSystem);
      focusInDrawer(button.dataset.focusSel);
    });
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
        window.HIFI_WARFARE_ENGINE.planArmyRoute(current, current.warfare.planningArmy, event.detail.tileId);
        current.warfare.planningArmy = null;
        showToast("军团路线已规划");
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
    window.prototypeMap.syncSelection(current.selectedTile);
    window.prototypeMap.refreshSelected();
    window.prototypeMap.renderMainMap();
  });
  renderHud(store.getState());
  window.hifiGame = { store, showToast };
  window.prototypeMap.renderMainMap();
})();

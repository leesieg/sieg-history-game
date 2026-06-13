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
  const store = window.HIFI_STORE.createStore(world);
  const dialogs = window.HIFI_DRAWERS.bindCountryDialogs(store);
  window.HIFI_DIALOGS.bindArmyDialog(store);
  const narrativeDialogs = window.HIFI_DIALOGS.bindNarrativeDialogs(store);

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

  function renderHud(current) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(current);
    document.getElementById("dateMain").textContent = window.HIFI_WORLD_ENGINE.calendarLabel(current.turn);
    document.getElementById("dateEra").textContent = `封建纪元 · ${country.leader.dynasty}`;
    setResource("food", country.food);
    setResource("administrative", country.actionPoints.administrative);
    setResource("diplomatic", country.actionPoints.diplomatic);
    setResource("militaryPoint", country.actionPoints.military);
    setResource("money", country.money);
    setResource("military", country.military);
    setResource("legitimacy", country.legitimacy);
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

  function fallbackRows(system, current) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(current);
    const systems = {
      "国家": [["政体", country.government.typeLabel], ["统治者", country.leader.name], ["家族", country.leader.dynasty], ["合法性", country.legitimacy]],
      "经济": [["粮食", country.food], ["国库", country.money], ["军需", country.military], ["资本池", country.capital]],
      "外交": [["外交行动点", country.actionPoints.diplomatic], ["可用使节", "2"], ["条约", "待接入"], ["附属关系", "待接入"]],
      "军事": [["军事行动点", country.actionPoints.military], ["军团", "待接入"], ["战争", "待接入"], ["战争疲惫", "0"]],
      "发展": [["行政行动点", country.actionPoints.administrative], ["科技", "待接入"], ["改革槽", "待接入"], ["时代目标", "巩固王权"]],
    };
    return systems[system];
  }

  function renderSystemBody(system) {
    const custom = window.HIFI_DRAWERS.renderSystem(system, store.getState());
    if (!custom) {
      const rows = fallbackRows(system, store.getState());
      drawerBody.innerHTML = rows.map(([label, value]) =>
        `<div class="drawer-row">${label}<span>${value}</span></div>`
      ).join("");
      return;
    }
    drawerBody.innerHTML = custom;
    function runAction(action) {
      try {
        store.update(action);
        renderSystemBody(system);
      } catch (error) {
        showToast(error.message);
      }
    }
    drawerBody.querySelectorAll("[data-reform]").forEach(reformButton => {
      reformButton.addEventListener("click", () => {
        runAction(current => window.HIFI_POLITICS_ENGINE.advanceReform(
            current,
            current.playerPolity,
            reformButton.dataset.reform
        ));
      });
    });
    drawerBody.querySelectorAll("[data-trade-policy]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_ECONOMY_ENGINE.setTradePolicy(current, current.playerPolity, button.dataset.tradePolicy)
      ));
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
        return window.HIFI_DIPLOMACY_ENGINE.proposeSubject(current, current.playerPolity, target, action);
      }));
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
    drawerBody.querySelectorAll("[data-peace-war]").forEach(button => {
      button.addEventListener("click", () => runAction(current =>
        window.HIFI_WARFARE_ENGINE.concludePeace(
          current,
          button.dataset.peaceWar,
          current.playerPolity,
          [{ type: "target_territory" }]
        )
      ));
    });
  }

  function openSystem(button) {
    const same = button.classList.contains("active");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
    if (same) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      return;
    }
    button.classList.add("active");
    drawerTitle.textContent = button.dataset.system;
    renderSystemBody(button.dataset.system);
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  document.querySelectorAll(".system-button").forEach(button => {
    button.addEventListener("click", () => openSystem(button));
  });

  document.getElementById("drawerClose").addEventListener("click", () => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
  });

  document.getElementById("rulerPlaque").addEventListener("click", () => dialogs.renderCountryModal());
  topPending.addEventListener("click", narrativeDialogs.renderCouncil);
  seasonControl.addEventListener("click", () => {
    const current = store.getState();
    const blocking = window.HIFI_HISTORY_ENGINE.blockingIssues(current);
    if (blocking.length) {
      showToast(`仍有 ${blocking.length} 项裁断需要处理`);
      return;
    }
    store.update(next => window.HIFI_TURN_ENGINE.advanceQuarter(next));
    showToast(`进入${window.HIFI_WORLD_ENGINE.calendarLabel(current.turn)}`);
  });

  document.querySelectorAll(".province-action,.command").forEach(button => {
    button.addEventListener("click", () => showToast(`该命令将在对应系统迁移时启用：${button.textContent.trim()}`));
  });

  window.addEventListener("hifi:tile-selected", event => {
    store.update(current => {
      current.selectedTile = event.detail.tileId;
      if (current.warfare?.planningArmy) {
        window.HIFI_WARFARE_ENGINE.planArmyRoute(current, current.warfare.planningArmy, event.detail.tileId);
        current.warfare.planningArmy = null;
        showToast("军团路线已规划");
      }
    });
  });

  store.subscribe(current => {
    renderHud(current);
    window.prototypeMap.renderMainMap();
  });
  renderHud(store.getState());
  window.hifiGame = { store, showToast };
  window.prototypeMap.renderMainMap();
})();

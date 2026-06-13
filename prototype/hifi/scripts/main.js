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
  const store = window.HIFI_STORE.createStore(world);
  const dialogs = window.HIFI_DRAWERS.bindCountryDialogs(store);

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
    const count = current.pendingIssues.length;
    topPending.textContent = count ? `待办 ${count} ›` : "待办已清";
    seasonText.textContent = count ? `处理待办 ${count}` : "结束季度";
    seasonControl.classList.toggle("ready", count === 0);
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
    drawerBody.querySelectorAll("[data-reform]").forEach(reformButton => {
      reformButton.addEventListener("click", () => {
        try {
          store.update(current => window.HIFI_POLITICS_ENGINE.advanceReform(
            current,
            current.playerPolity,
            reformButton.dataset.reform
          ));
          renderSystemBody(system);
        } catch (error) {
          showToast(error.message);
        }
      });
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

  document.querySelectorAll(".issue").forEach(issue => {
    issue.addEventListener("click", () => {
      const issueId = issue.dataset.issue;
      store.update(current => {
        current.pendingIssues = current.pendingIssues.filter(item => item.label !== issueId);
      });
      issue.remove();
      showToast(`已处理：${issueId}`);
    });
  });

  document.getElementById("rulerPlaque").addEventListener("click", () => dialogs.renderCountryModal());
  topPending.addEventListener("click", () => showToast(`当前有 ${store.getState().pendingIssues.length} 项待办`));
  seasonControl.addEventListener("click", () => {
    const current = store.getState();
    if (current.pendingIssues.length) {
      showToast(`仍有 ${current.pendingIssues.length} 项待办需要处理`);
      return;
    }
    store.update(next => window.HIFI_TURN_ENGINE.advanceQuarter(next));
    showToast(`进入${window.HIFI_WORLD_ENGINE.calendarLabel(current.turn)}`);
  });

  document.querySelectorAll(".province-action,.command").forEach(button => {
    button.addEventListener("click", () => showToast(`该命令将在对应系统迁移时启用：${button.textContent.trim()}`));
  });

  store.subscribe(renderHud);
  renderHud(store.getState());
  window.hifiGame = { store, showToast };
})();

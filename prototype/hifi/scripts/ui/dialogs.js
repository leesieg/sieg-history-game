(() => {
  "use strict";

  function bindArmyDialog(store) {
    const drawer = document.getElementById("armyDrawer");
    const body = document.getElementById("armyDrawerBody");
    function close() {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      document.getElementById("game").classList.remove("army-open");
    }
    function render(armyId) {
      const world = store.getState();
      const army = world.warfare.armies[armyId];
      if (!army) return close();
      world.warfare.selectedArmy = armyId;
      const tile = world.tiles.find(candidate => candidate.id === army.tileId);
      const composition = army.units.map(unit =>
        `<div class="drawer-row">${unit.combatType} · ${unit.serviceType}<span>${unit.soldiers}</span></div>`
      ).join("");
      document.getElementById("armyDrawerTitle").textContent = army.name;
      body.innerHTML = `<div class="drawer-row">所属<span>${army.owner}</span></div>
        <div class="drawer-row">位置<span>${tile.city || tile.region}</span></div>
        <div class="drawer-row">士气 / 组织 / 补给<span>${army.morale} / ${army.organization} / ${army.supply}</span></div>
        <div class="drawer-subtitle">编制</div>${composition}
        <button class="dialog-command primary" data-army-plan="${army.id}">规划路线</button>
        <button class="dialog-command" data-army-order="hold">原地防守</button>
        <button class="dialog-command" data-army-order="march">继续行军</button>`;
      body.querySelector("[data-army-plan]").addEventListener("click", () => {
        store.update(current => { current.warfare.planningArmy = armyId; });
        close();
      });
      body.querySelectorAll("[data-army-order]").forEach(button => {
        button.addEventListener("click", () => store.update(current => {
          current.warfare.armies[armyId].order = button.dataset.armyOrder;
        }));
      });
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      document.getElementById("game").classList.add("army-open");
    }
    document.getElementById("armyDrawerClose").addEventListener("click", close);
    window.addEventListener("hifi:army-close", close);
    window.addEventListener("hifi:army-selected", event => render(event.detail.armyId));
    return { close, render };
  }

  function bindNarrativeDialogs(store) {
    function open(id) {
      document.getElementById(id).classList.add("open");
      document.getElementById(id).setAttribute("aria-hidden", "false");
    }
    function renderCouncil() {
      const world = store.getState();
      const summary = window.HIFI_HISTORY_ENGINE.councilSummary(world);
      document.getElementById("councilSubtitle").textContent = `${summary.era} · ${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}`;
      document.getElementById("councilBody").innerHTML = `
        <div class="drawer-subtitle">国家预警</div>${summary.warnings.map(text => `<div class="drawer-row">${text}<span>!</span></div>`).join("")}
        <div class="drawer-subtitle">顾问建议</div>${summary.advisors.map(text => `<div class="drawer-row">${text}<span>›</span></div>`).join("")}
        <div class="drawer-subtitle">世界局势</div>${summary.situations.map(text => `<div class="drawer-row">${text}<span>◈</span></div>`).join("") || '<div class="drawer-row">暂无大型局势<span>—</span></div>'}
        ${world.pendingTransition ? `<button class="dialog-command primary" data-ack-transition>确认时代转折</button>` : ""}
        <button class="dialog-command" data-run-regency>垂帘听政 4 季</button>`;
      document.querySelector("[data-ack-transition]")?.addEventListener("click", () => {
        store.update(current => window.HIFI_HISTORY_ENGINE.acknowledgeTransition(current));
        document.getElementById("councilModal").classList.remove("open");
      });
      document.querySelector("[data-run-regency]").addEventListener("click", () => {
        const advanced = window.HIFI_HISTORY_ENGINE.runRegency(
          store.getState(),
          current => window.HIFI_TURN_ENGINE.advanceQuarter(current),
          4
        );
        store.update(() => {});
        document.getElementById("councilModal").classList.remove("open");
        return advanced;
      });
      open("councilModal");
    }
    function renderEvent(eventId) {
      const event = store.getState().playerEvents.find(item => item.id === eventId);
      if (!event) return;
      document.getElementById("historyEventTitle").textContent = event.title;
      const body = document.getElementById("historyEventBody");
      body.innerHTML = event.choices.map(choice =>
        `<button class="drawer-row political-action" data-history-choice="${choice.id}">${choice.label}<span>裁断</span></button>`
      ).join("");
      body.querySelectorAll("[data-history-choice]").forEach(button => {
        button.addEventListener("click", () => {
          store.update(world => window.HIFI_HISTORY_ENGINE.resolvePlayerEvent(world, eventId, button.dataset.historyChoice));
          document.getElementById("historyEventModal").classList.remove("open");
        });
      });
      open("historyEventModal");
    }
    return { renderCouncil, renderEvent };
  }

  window.HIFI_DIALOGS = { bindArmyDialog, bindNarrativeDialogs };
})();

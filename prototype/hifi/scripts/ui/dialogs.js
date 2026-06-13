(() => {
  "use strict";

  function bindArmyDialog(store) {
    const drawer = document.getElementById("armyDrawer");
    const body = document.getElementById("armyDrawerBody");
    function close() {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
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
    }
    document.getElementById("armyDrawerClose").addEventListener("click", close);
    window.addEventListener("hifi:army-selected", event => render(event.detail.armyId));
    return { close, render };
  }

  window.HIFI_DIALOGS = { bindArmyDialog };
})();

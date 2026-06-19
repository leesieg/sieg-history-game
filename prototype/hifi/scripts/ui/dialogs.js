(() => {
  "use strict";

  const combatTypeLabels = {
    infantry: "步兵",
    cavalry: "骑兵",
    artillery: "炮兵",
  };
  const serviceTypeLabels = {
    guard: "核心卫队",
    professional: "职业军团",
    standing: "常备军",
    levy: "征召兵",
    mercenary: "雇佣兵",
  };

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
        `<div class="drawer-row">${combatTypeLabels[unit.combatType]} · ${serviceTypeLabels[unit.serviceType]}<span>${unit.soldiers} · 经验 ${unit.experience || 0}</span></div>`
      ).join("");
      const mergeTargets = Object.values(world.warfare.armies).filter(candidate =>
        candidate.id !== army.id
        && candidate.owner === army.owner
        && candidate.tileId === army.tileId
        && (candidate.mercenaryLoyalty === undefined) === (army.mercenaryLoyalty === undefined)
      );
      const general = army.generalId ? world.warfare.generals[army.generalId] : null;
      document.getElementById("armyDrawerTitle").textContent = army.name;
      body.innerHTML = `<div class="drawer-row">所属<span>${army.owner}</span></div>
        <div class="drawer-row">位置<span>${tile.city || tile.region}</span></div>
        <div class="drawer-row"><span class="codex-term" data-codex="军备状态">士气 / 组织 / 补给</span><span>${army.morale} / ${army.organization} / ${army.supply}</span></div>
        <div class="drawer-row">将领<span>${general?.name || (army.mercenaryLoyalty !== undefined ? "佣兵首领" : "未任命")}</span></div>
        ${army.mercenaryLoyalty === undefined ? "" : `<div class="drawer-row">契约 / 忠诚<span>${Math.max(0, army.contractEndsTurn - world.turn)} 季 / ${army.mercenaryLoyalty}</span></div>`}
        <div class="drawer-subtitle">编制</div>${composition}
        <div class="drawer-subtitle">行军指令</div>
        <div class="icon-cmd-row">
          <button class="icon-cmd primary" data-tip="规划路线 · 选目标后自动行军" aria-label="规划路线" data-army-plan="${army.id}">⌖</button>
          <button class="icon-cmd" data-tip="原地防守 · 停止移动并恢复补给" aria-label="原地防守" data-army-order="hold">▣</button>
          <button class="icon-cmd" data-tip="继续行军 · 沿已定路线前进" aria-label="继续行军" data-army-order="march">➤</button>
        </div>
        <div class="drawer-subtitle">军团管理</div>
        <div class="icon-cmd-row">
          <button class="icon-cmd" data-tip="拆分军团 · 分出半数为新军团" aria-label="拆分军团" data-army-manage="split">⇄</button>
          <button class="icon-cmd" data-tip="补充兵员 · 耗军需补满缺额" aria-label="补充兵员" data-army-manage="reinforce">✚</button>
          <button class="icon-cmd" data-tip="训练军团 · 1 军事点 + 10 军需 → 经验/组织↑" aria-label="训练军团" data-army-manage="train">⚔</button>
          <button class="icon-cmd" data-tip="复员征召兵 · 兵员返乡、人口回流" aria-label="复员征召兵" data-army-manage="demobilize">⌂</button>
          ${army.mercenaryLoyalty === undefined
            ? `<button class="icon-cmd" data-tip="${general?.ruler ? "撤下统治者 · 解除指挥加成" : "统治者领军 · 军事能力→指挥加成"}" aria-label="${general?.ruler ? "撤下统治者" : "统治者领军"}" data-army-manage="${general?.ruler ? "dismiss-general" : "assign-ruler"}">${general?.ruler ? "♟" : "♛"}</button>`
            : `<button class="icon-cmd" data-tip="续约两年 · 付军饷 · 忠诚 +5" aria-label="续约两年" data-army-manage="renew-mercenary">↻</button>
               <button class="icon-cmd" data-tip="结束契约 · 解散佣兵团" aria-label="结束契约" data-army-manage="release-mercenary">✕</button>`}
        </div>
        ${mergeTargets.length ? `<div class="drawer-subtitle">合并到同地军团</div><div class="icon-cmd-row">${mergeTargets.map(candidate => `<button class="icon-cmd wide" data-tip="并入本军团" aria-label="合并 ${candidate.name}" data-army-merge="${candidate.id}">⊕ ${candidate.name}</button>`).join("")}</div>` : ""}`;
      body.querySelector("[data-army-plan]").addEventListener("click", () => {
        store.update(current => { current.warfare.planningArmy = armyId; });
        window.hifiGame?.showToast?.("规划路线中 · 点击地图目标地块");
        close();
      });
      body.querySelectorAll("[data-army-order]").forEach(button => {
        button.addEventListener("click", () => store.update(current => {
          const ordered = current.warfare.armies[armyId];
          ordered.order = button.dataset.armyOrder;
          if (button.dataset.armyOrder === "march" && !ordered.plannedPath.length) {
            window.hifiGame?.showToast?.("尚未规划路线，先点「规划路线」选择目标");
          }
        }));
      });
      body.querySelectorAll("[data-army-manage]").forEach(button => {
        button.addEventListener("click", () => {
          let nextArmyId = armyId;
          store.update(current => {
            const engine = window.HIFI_WARFARE_ENGINE;
            const action = button.dataset.armyManage;
            if (action === "split") nextArmyId = engine.splitArmy(current, armyId).id;
            if (action === "reinforce") engine.reinforceArmy(current, armyId);
            if (action === "train") engine.trainArmy(current, armyId);
            if (action === "demobilize") engine.demobilizeLevies(current, armyId);
            if (action === "assign-ruler") engine.assignGeneral(current, armyId, engine.rulerGeneral(current, army.owner).id);
            if (action === "dismiss-general") engine.dismissGeneral(current, armyId);
            if (action === "renew-mercenary") engine.renewMercenary(current, armyId);
            if (action === "release-mercenary") engine.releaseMercenary(current, armyId);
          });
          if (store.getState().warfare.armies[nextArmyId]) render(nextArmyId);
          else close();
        });
      });
      body.querySelectorAll("[data-army-merge]").forEach(button => {
        button.addEventListener("click", () => {
          store.update(current => window.HIFI_WARFARE_ENGINE.mergeArmies(current, armyId, button.dataset.armyMerge));
          render(armyId);
        });
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
    const advisorNames = { fiscal: "财政官", diplomacy: "外交官", military: "军务官", internal: "内政官" };
    const advisorPanels = { fiscal: "经济", diplomacy: "外交", military: "军事", internal: "发展" };
    function advisorPanelFor(advisor) {
      return advisorPanels[advisor] || "国家";
    }

    function warningsWithWarStatus(world, polity, warnings) {
      const wars = world.diplomacy?.wars || [];
      const activeWar = wars.find(war => war.attackers.includes(polity) || war.defenders.includes(polity));
      const isPlaceholderOnly = warnings.length === 0 || (warnings.length === 1 && warnings[0].startsWith("国家目前没有"));
      if (activeWar && isPlaceholderOnly) {
        const warLabel = activeWar.name === "百年战争" ? "仍在百年战争中" : "仍处于战争中";
        return [warLabel];
      }
      return warnings;
    }

    function renderProposalCard(item, index) {
      const advisorLabel = advisorNames[item.advisor] || item.advisor;
      const isGoto = item.proposal.type === "goto";
      const label = isGoto
        ? `当前没有可立即执行的行动，前往${item.proposal.panel}面板查看`
        : (window.HIFI_PROPOSALS_ENGINE.actionCatalog[item.proposal.type]?.label || item.proposal.type);
      const previewRows = item.preview
        ? `<div class="drawer-row">成本<span>${item.preview.cost}</span></div>
           <div class="drawer-row">收益<span>${item.preview.gain}</span></div>
           <div class="drawer-row">风险<span>${item.preview.risk}</span></div>`
        : "";
      return `<div class="drawer-subtitle">${advisorLabel}</div>
        <div class="drawer-row">${label}</div>
        ${previewRows}
        <div class="icon-cmd-row">
          ${isGoto ? "" : `<button class="dialog-command primary" data-proposal-exec="${index}">执行建议</button>`}
          <button class="dialog-command" data-proposal-goto="${index}">跳转面板</button>
        </div>`;
    }

    function renderCouncil() {
      const world = store.getState();
      const polity = world.playerPolity;
      const summary = window.HIFI_HISTORY_ENGINE.councilSummary(world);
      const mission = window.HIFI_OBJECTIVES_ENGINE.nationalMission(world, polity);
      const proposals = window.HIFI_OBJECTIVES_ENGINE.advisorProposals(world, polity);
      const warnings = warningsWithWarStatus(world, polity, summary.warnings);
      document.getElementById("councilSubtitle").textContent = `${summary.era} · ${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}`;
      document.getElementById("councilBody").innerHTML = `
        <div class="drawer-subtitle">国家使命</div>
        <div class="drawer-row">${mission.title}<span>${mission.why}</span></div>
        <div class="drawer-subtitle">国家预警</div>${warnings.map(text => `<div class="drawer-row">${text}<span>!</span></div>`).join("")}
        <div class="drawer-subtitle">顾问建议</div>${proposals.map((item, index) => renderProposalCard(item, index)).join("")}
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
      document.querySelectorAll("[data-proposal-exec]").forEach(button => {
        button.addEventListener("click", () => {
          const item = proposals[Number(button.dataset.proposalExec)];
          if (!item) return;
          const label = window.HIFI_PROPOSALS_ENGINE.actionCatalog[item.proposal.type]?.label || item.proposal.type;
          try {
            store.update(current => window.HIFI_PROPOSALS_ENGINE.execute(current, current.playerPolity, item.proposal));
            document.getElementById("councilModal").classList.remove("open");
            window.hifiGame?.showToast?.(`已执行：${label}`);
          } catch (error) {
            window.hifiGame?.showToast?.(error.message);
          }
        });
      });
      document.querySelectorAll("[data-proposal-goto]").forEach(button => {
        button.addEventListener("click", () => {
          const item = proposals[Number(button.dataset.proposalGoto)];
          if (!item) return;
          const panel = item.proposal.type === "goto" ? item.proposal.panel : advisorPanelFor(item.advisor);
          document.getElementById("councilModal").classList.remove("open");
          window.dispatchEvent(new CustomEvent("hifi:open-system", { detail: { system: panel } }));
        });
      });
      open("councilModal");
    }
    function renderEvent(eventId) {
      const event = store.getState().playerEvents.find(item => item.id === eventId);
      if (!event) return;
      document.getElementById("historyEventTitle").textContent = event.title;
      const body = document.getElementById("historyEventBody");
      const effectLabels = { food: "粮食", money: "金钱", military: "军需", legitimacy: "合法性", ideas: "思想" };
      body.innerHTML = event.choices.map(choice => {
        const effect = Object.entries(choice.effect || {})
          .map(([resource, amount]) => `${effectLabels[resource] || resource} ${amount > 0 ? "+" : ""}${amount}`)
          .join(" · ") || "裁断";
        return `<button class="drawer-row political-action" data-history-choice="${choice.id}">${choice.label}<span>${effect}</span></button>`;
      }).join("");
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

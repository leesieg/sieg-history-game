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
      // Phase E：将领花名册——统治者领军 + 已招募的非统治者将领任命 + 招募，让将领系统真正可用。
      const ownGenerals = Object.values(world.warfare.generals || {})
        .filter(candidate => candidate.owner === army.owner && !candidate.ruler && candidate.id !== army.generalId);
      const generalControls = army.mercenaryLoyalty !== undefined
        ? `<button class="icon-cmd" data-tip="续约两年 · 付军饷 · 忠诚 +5" aria-label="续约两年" data-army-manage="renew-mercenary">↻ 续约</button>
           <button class="icon-cmd" data-tip="结束契约 · 解散佣兵团" aria-label="结束契约" data-army-manage="release-mercenary">✕ 解约</button>`
        : `<button class="icon-cmd" data-tip="${general?.ruler ? "撤下统治者 · 解除指挥加成" : "统治者领军 · 军事能力→指挥加成"}" aria-label="${general?.ruler ? "撤下统治者" : "统治者领军"}" data-army-manage="${general?.ruler ? "dismiss-general" : "assign-ruler"}">${general?.ruler ? "♟ 撤将" : "♛ 领军"}</button>`
          + (general && !general.ruler ? `<button class="icon-cmd" data-tip="撤下将领" aria-label="撤下将领" data-army-manage="dismiss-general">♟ 撤将</button>` : "")
          + ownGenerals.map(candidate => `<button class="icon-cmd" data-tip="任命 ${candidate.name} 领军 · 指挥 ${candidate.command}" aria-label="任命 ${candidate.name}" data-assign-general="${candidate.id}">⚑ ${candidate.name}</button>`).join("")
          + `<button class="icon-cmd" data-tip="招募将领 · 1 军事点 → 新将领候选" aria-label="招募将领" data-recruit-general="1">＋ 招募</button>`;
      document.getElementById("armyDrawerTitle").textContent = army.name;
      body.innerHTML = `<div class="drawer-row">所属<span>${army.owner}</span></div>
        <div class="drawer-row">位置<span>${tile.city || tile.region}</span></div>
        <div class="drawer-row"><span class="codex-term" data-codex="军备状态">士气 / 组织 / 补给</span><span>${army.morale} / ${army.organization} / ${army.supply}</span></div>
        <div class="drawer-row">将领<span>${general?.name || (army.mercenaryLoyalty !== undefined ? "佣兵首领" : "未任命")}</span></div>
        ${army.mercenaryLoyalty === undefined ? "" : `<div class="drawer-row">契约 / 忠诚<span>${Math.max(0, army.contractEndsTurn - world.turn)} 季 / ${army.mercenaryLoyalty}</span></div>`}
        <div class="drawer-subtitle">编制</div>${composition}
        <div class="drawer-subtitle">行军指令</div>
        <div class="icon-cmd-row">
          <button class="icon-cmd primary" data-tip="规划路线 · 选目标后自动行军" aria-label="规划路线" data-army-plan="${army.id}">⌖ 规划</button>
          <button class="icon-cmd" data-tip="原地防守 · 停止移动并恢复补给" aria-label="原地防守" data-army-order="hold">▣ 防守</button>
          <button class="icon-cmd" data-tip="继续行军 · 沿已定路线前进" aria-label="继续行军" data-army-order="march">➤ 行军</button>
        </div>
        <div class="drawer-subtitle">军团管理</div>
        <div class="icon-cmd-row">
          <button class="icon-cmd" data-tip="拆分军团 · 分出半数为新军团" aria-label="拆分军团" data-army-manage="split">⇄ 拆分</button>
          <button class="icon-cmd" data-tip="补充兵员 · 耗军需补满缺额" aria-label="补充兵员" data-army-manage="reinforce">✚ 补员</button>
          <button class="icon-cmd" data-tip="训练军团 · 1 军事点 + 10 军需 → 经验/组织↑" aria-label="训练军团" data-army-manage="train">⚔ 训练</button>
          <button class="icon-cmd" data-tip="复员征召兵 · 兵员返乡、人口回流" aria-label="复员征召兵" data-army-manage="demobilize">⌂ 复员</button>
          ${generalControls}
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
      body.querySelectorAll("[data-assign-general]").forEach(button => {
        button.addEventListener("click", () => {
          store.update(current => window.HIFI_WARFARE_ENGINE.assignGeneral(current, armyId, button.dataset.assignGeneral));
          render(armyId);
        });
      });
      body.querySelector("[data-recruit-general]")?.addEventListener("click", () => {
        try {
          store.update(current => window.HIFI_WARFARE_ENGINE.recruitGeneral(current, army.owner));
          render(armyId);
        } catch (error) { window.hifiGame?.showToast?.(error.message); }
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

    // 单条资源账本行：产出 / 维护 / 事件 / 战争 四段拆分，net 为负时高亮（季报与季度总结共用）。
    function resourceLedgerLine(label, e) {
      const parts = [`产出 +${e.gross}`];
      if (e.maintenance) parts.push(`维护 −${e.maintenance}`);
      if (e.event) parts.push(`事件 −${e.event}`);
      if (e.war) parts.push(`战争 −${e.war}`);
      return `<div class="ledger-line${e.net < 0 ? " ledger-neg" : ""}"><span>${label}</span><b>${e.net >= 0 ? "+" : ""}${e.net}</b><small>${parts.join(" · ")}</small></div>`;
    }

    function playerPopulation(world, polity) {
      return window.HIFI_WORLD_ENGINE.controlledTiles(world, polity)
        .reduce((sum, tile) => sum + (tile.population || 0), 0);
    }

    function playerWarNames(world, polity) {
      return (world.diplomacy?.wars || [])
        .filter(war => war.attackers.includes(polity) || war.defenders.includes(polity))
        .map(war => war.name || "战争");
    }

    // 本季总结：推进季度后读 quarterLedger + 前后快照，把「收支 / 战争 / 外交 / 人口」的本季变化
    // 摊开给玩家——让玩家知道每季发生了什么，而不只是看资源数字上涨（Task 3.3）。
    function renderSeasonSummary(snapshot) {
      const world = store.getState();
      const polity = world.playerPolity;
      const ledger = window.HIFI_HISTORY_ENGINE.quarterLedger(world, polity);
      const calendar = window.HIFI_WORLD_ENGINE.calendarLabel(world.turn);

      const fiscalSection = `<div class="season-section"><h4>§ 收支变化</h4>
        ${resourceLedgerLine("国库", ledger.money)}${resourceLedgerLine("粮食", ledger.food)}${resourceLedgerLine("军需", ledger.military)}
      </div>`;

      // 战争变化：鏖战阶段的前线消耗 + 本季局势阶段翻转纪闻
      const flips = (world.worldEvents || [])
        .filter(ev => ev.kind === "struggle" && ev.turn === world.turn)
        .map(ev => ev.text);
      const warParts = [];
      if (ledger.war) warParts.push(`${ledger.war.label}·${ledger.war.phase}：前线消耗 粮 −${ledger.war.food} · 军需 −${ledger.war.military}`);
      flips.forEach(text => warParts.push(text));
      const warSection = warParts.length
        ? `<div class="season-section"><h4>⚔ 战争变化</h4>${warParts.map(t => `<p>${t}</p>`).join("")}</div>`
        : "";

      // 外交变化：本季新卷入 / 结束的战争
      const warsNow = playerWarNames(world, polity);
      const warsBefore = snapshot?.wars || [];
      const diploParts = [];
      warsNow.filter(name => !warsBefore.includes(name)).forEach(name => diploParts.push(`新卷入「${name}」`));
      warsBefore.filter(name => !warsNow.includes(name)).forEach(name => diploParts.push(`「${name}」已结束`));
      const diploSection = diploParts.length
        ? `<div class="season-section"><h4>✉ 外交变化</h4>${diploParts.map(t => `<p>${t}</p>`).join("")}</div>`
        : "";

      // 人口变化：与上季快照比对
      const popNow = playerPopulation(world, polity);
      const popDelta = snapshot ? popNow - snapshot.population : 0;
      const popSection = `<div class="season-section"><h4>👥 人口变化</h4>
        <p>总人口 ${popNow}${snapshot ? `（${popDelta >= 0 ? "+" : ""}${popDelta}）` : ""}</p></div>`;

      document.getElementById("seasonSummarySubtitle").textContent = calendar;
      document.getElementById("seasonSummaryBody").innerHTML = `${fiscalSection}${warSection}${diploSection}${popSection}`;
      open("seasonSummaryModal");
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

    // 卡牌渲染：御前会议每条信息都是一张可看 / 可用的卡牌（抽卡—用卡手感）。
    function councilCard(variant, kind, title, body, actions) {
      return `<article class="council-card council-card--${variant}">
        <div class="council-card-kind">${kind}</div>
        ${title ? `<div class="council-card-title">${title}</div>` : ""}
        ${body ? `<div class="council-card-body">${body}</div>` : ""}
        ${actions ? `<div class="council-card-actions">${actions}</div>` : ""}
      </article>`;
    }
    function councilSection(icon, title, inner, wide) {
      if (!inner) return "";
      return `<section class="council-section">
        <div class="council-section-head">${icon} ${title}</div>
        <div class="council-cards${wide ? " council-cards--wide" : ""}">${inner}</div>
      </section>`;
    }

    function renderProposalCard(item, index) {
      const advisorLabel = advisorNames[item.advisor] || item.advisor;
      const isGoto = item.proposal.type === "goto";
      const label = isGoto
        ? `前往${item.proposal.panel}面板查看`
        : (window.HIFI_PROPOSALS_ENGINE.actionCatalog[item.proposal.type]?.label || item.proposal.type);
      const meta = item.preview
        ? `<ul class="council-card-meta">
             <li><i>成本</i>${item.preview.cost}</li>
             <li><i>收益</i>${item.preview.gain}</li>
             <li><i>风险</i>${item.preview.risk}</li>
           </ul>`
        : (isGoto ? `<div class="council-card-body">当前没有可立即执行的行动</div>` : "");
      const actions = `${isGoto ? "" : `<button class="council-card-btn primary" data-proposal-exec="${index}">执行</button>`}
        <button class="council-card-btn" data-proposal-goto="${index}">${isGoto ? "前往面板" : "跳转"}</button>`;
      return `<article class="council-card council-card--advice">
        <div class="council-card-kind">🪶 ${advisorLabel} · 草案</div>
        <div class="council-card-title">${label}</div>
        ${meta}
        <div class="council-card-actions">${actions}</div>
      </article>`;
    }

    function renderCouncil() {
      const world = store.getState();
      const polity = world.playerPolity;
      const summary = window.HIFI_HISTORY_ENGINE.councilSummary(world);
      const mission = window.HIFI_OBJECTIVES_ENGINE.nationalMission(world, polity);
      const proposals = window.HIFI_OBJECTIVES_ENGINE.advisorProposals(world, polity);
      const ledger = window.HIFI_HISTORY_ENGINE.quarterLedger(world, polity);
      // Phase B：Agent 表达层（规则模板）——宫廷来信 / 阶层诉求 / 季报叙事。
      const narrative = window.HIFI_NARRATIVE_ENGINE;
      const letters = narrative?.leaderLetters(world, polity) || [];
      const demands = narrative?.estateDemands(world, polity) || [];
      const quarterNote = narrative?.quarterNarrative(world, polity)?.text || "";
      // 垂帘听政可否启动：有未处理的选举/事件/时代转折时不能（否则 0 推进、看似无响应）。
      const regencyBlocker = window.HIFI_HISTORY_ENGINE.regencyBlocker(world);
      const warnings = warningsWithWarStatus(world, polity, summary.warnings);

      // 战役阶段使命（数据驱动 missionStages）+ 当前局势阶段；非法兰西国家 stages 为空，退回单条本局目标
      const stages = window.HIFI_OBJECTIVES_ENGINE.missionStages(world, polity);
      const struggle = window.HIFI_STRUGGLE_ENGINE?.struggleForPolity?.(world, polity);
      const phaseName = struggle ? window.HIFI_STRUGGLE_ENGINE.phaseLabel(struggle) : "";
      const stageCards = stages.map(stage => {
        const icon = stage.status === "已完成" ? "✓" : stage.status === "进行中" ? "▶" : "•";
        const variant = stage.status === "已完成" ? "stage-done" : stage.status === "进行中" ? "stage-active" : "stage-todo";
        const body = `${stage.detail}<div class="council-card-foot">达成：${stage.reward}</div>`;
        return councilCard(variant, `${icon} ${stage.status}`, stage.name, body);
      }).join("");
      const missionTitle = struggle ? `国家使命 · ${struggle.label}「${phaseName}」` : "国家使命";
      const missionSection = councilSection("⚜", missionTitle,
        councilCard("mission", "本局目标", mission.title, mission.why) + stageCards);
      const warnSection = councilSection("⚠", "国家预警", warnings.map(text => {
        const calm = text.startsWith("国家目前没有");
        return councilCard(calm ? "calm" : "warn", calm ? "✓ 安稳" : "! 警讯", text);
      }).join(""));
      const adviceSection = councilSection("🪶", "顾问草案", proposals.map((item, index) => renderProposalCard(item, index)).join(""));
      const lettersSection = councilSection("✉", "宫廷来信", letters.map(l =>
        councilCard(`letter council-card--${l.tone}`, `✉ ${l.from}来信`, "", l.text)).join(""));
      const demandsSection = councilSection("⚑", "阶层诉求", demands.map(d => {
        const action = `<button class="council-card-btn" data-estate-panel="${d.panel || "国家"}">前往${d.panel || "国家"}面板</button>`;
        return councilCard("demand", "⚑ 阶层诉求", "", d.text, action);
      }).join(""));
      const situationsSection = councilSection("◈", "世界局势", summary.situations.length
        ? summary.situations.map(text => councilCard("situation", "◈ 局势", text)).join("")
        : councilCard("calm", "— 局势", "暂无大型局势"));
      const ledgerLine = (label, e) => resourceLedgerLine(label, e);
      const ledgerCard = `<article class="council-card council-card--ledger">
        <div class="council-card-kind">§ 本季季报</div>
        ${quarterNote ? `<div class="council-card-note">${quarterNote}</div>` : ""}
        ${ledgerLine("国库", ledger.money)}${ledgerLine("粮食", ledger.food)}${ledgerLine("军需", ledger.military)}
      </article>`;
      const ledgerSection = (ledger.money.net || ledger.food.net || ledger.military.net || ledger.money.gross || ledger.food.gross)
        ? councilSection("§", `<span class="codex-term" data-codex="维护费">本季季报</span>`, ledgerCard, true)
        : "";

      document.getElementById("councilSubtitle").textContent = `${summary.era} · ${window.HIFI_WORLD_ENGINE.calendarLabel(world.turn)}`;
      document.getElementById("councilBody").innerHTML = `
        ${missionSection}${warnSection}${adviceSection}${lettersSection}${demandsSection}${situationsSection}${ledgerSection}
        <div class="council-actions">
          ${world.pendingTransition ? `<button class="dialog-command primary" data-ack-transition>确认时代转折</button>` : ""}
          <button class="dialog-command${regencyBlocker ? " is-disabled" : ""}" data-run-regency title="${regencyBlocker || "连续自动推进，直到出现需要裁断的事项"}">⏩ 垂帘听政 4 季</button>
        </div>
        ${regencyBlocker ? `<div class="council-hint">⚑ 暂不能垂帘听政：${regencyBlocker}（请先在上方处理）</div>` : ""}`;
      document.querySelector("[data-ack-transition]")?.addEventListener("click", () => {
        store.update(current => window.HIFI_HISTORY_ENGINE.acknowledgeTransition(current));
        renderCouncil(); // 确认后就地刷新，让「垂帘听政」从置灰恢复可用，而不是关窗
      });
      document.querySelector("[data-run-regency]").addEventListener("click", () => {
        const blocker = window.HIFI_HISTORY_ENGINE.regencyBlocker(store.getState());
        if (blocker) { window.hifiGame?.showToast?.(`暂不能垂帘听政：${blocker}`); return; }
        const advanced = window.HIFI_HISTORY_ENGINE.runRegency(
          store.getState(),
          current => window.HIFI_TURN_ENGINE.advanceQuarter(current),
          4
        );
        store.update(() => {});
        document.getElementById("councilModal").classList.remove("open");
        window.hifiGame?.showToast?.(advanced > 0
          ? `垂帘听政推进了 ${advanced} 季${advanced < 4 ? "（出现新裁断，提前还政）" : ""}`
          : "本季暂无可自动推进的空间");
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
      document.querySelectorAll("[data-estate-panel]").forEach(button => {
        button.addEventListener("click", () => {
          document.getElementById("councilModal").classList.remove("open");
          window.dispatchEvent(new CustomEvent("hifi:open-system", { detail: { system: button.dataset.estatePanel } }));
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
    // 局势终局结算弹窗（Task 6.1）：到样板局第 12 季触发，复用季度总结弹窗外壳，
    // 展示终局名称 + 三段使命快照，告诉玩家这局百年战争打成了什么结果。结算后沙盒可继续。
    function renderStruggleEnding() {
      const world = store.getState();
      const ending = world.pendingStruggleEnding;
      if (!ending) return false;
      const stageList = (ending.stages || []).length
        ? `<div class="season-section"><h4>◈ 三段使命快照</h4>${ending.stages.map(stage =>
            `<p>${stage.status === "已完成" ? "✓" : "✗"} ${stage.name}（${stage.status}）</p>`).join("")}</div>`
        : "";
      const verdict = {
        france_hegemony: "三段使命达成，百年战争向法兰西霸权倾斜。核心永久强化。",
        england_claim: "英格兰主张得逞，法兰西核心崩坏。",
        negotiated_peace: "议和阶段双方妥协，争议地分割、战争疲惫解除。",
        stalemate: "12 季内未分胜负，局势转入长期僵局，双方背上疲惫。",
      }[ending.ending] || "局势落幕。";
      document.getElementById("seasonSummarySubtitle").textContent = `${ending.label} · 终局`;
      document.getElementById("seasonSummaryBody").innerHTML =
        `<div class="season-section"><h4>⚜ 终局：${ending.endingLabel}</h4><p>${verdict}</p></div>${stageList}`;
      open("seasonSummaryModal");
      store.update(next => { next.pendingStruggleEnding = null; return next; }); // 展示后清除，沙盒继续
      return true;
    }

    return { renderCouncil, renderEvent, renderSeasonSummary, renderStruggleEnding, captureSeasonSnapshot: world => ({
      turn: world.turn,
      population: playerPopulation(world, world.playerPolity),
      wars: playerWarNames(world, world.playerPolity),
    }) };
  }

  window.HIFI_DIALOGS = { bindArmyDialog, bindNarrativeDialogs };
})();

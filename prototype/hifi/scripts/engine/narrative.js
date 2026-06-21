(() => {
  "use strict";

  // Phase B — Agent 表达层（规则模板版）。
  // 只读世界状态，产出结构化「表达条目」并由 narrate() 适配器渲染文案；不改任何 state。
  // narrate() 是唯一的文案出口，将来可整体替换为 LLM 调用而不动规则与 UI（LLM 接缝）。
  // 所有条目带 basis 字段（来源可追溯），阶层诉求只绑定既有合法行动 / 面板（不可执行的不生成）。

  // 阶层主题分类：把随政体而异的阶层 key 归到主题，再映射到 actionCatalog 合法行动或跳转面板。
  const FAITH_ESTATES = new Set(["church", "clergy", "orders", "faithful", "shamans", "imperial_church", "legate"]);
  const COMMERCE_ESTATES = new Set(["merchants", "companies", "guilds", "patricians", "citizens", "port_nobles", "oligarchs", "cities"]);
  const NOBLE_ESTATES = new Set(["nobles", "princes", "court", "governors", "bureaucrats", "speaker", "kin"]);
  const MILITARY_ESTATES = new Set(["warriors", "clans"]);

  function classifyEstate(key) {
    if (FAITH_ESTATES.has(key)) return { theme: "faith", panel: "国家", appeal: "请求维护信仰秩序，慎对宗教改革" };
    if (COMMERCE_ESTATES.has(key)) return { theme: "commerce", action: "build_market", panel: "经济", appeal: "恳请扶持工商：兴建市场、广开商路" };
    if (NOBLE_ESTATES.has(key)) return { theme: "noble", action: "integrate_tile", panel: "国家", appeal: "要求强化领地治理与王权整合" };
    if (MILITARY_ESTATES.has(key)) return { theme: "military", action: "mobilize_army", panel: "军事", appeal: "主张扩军备战以彰武威" };
    return { theme: "common", action: "develop_tile", panel: "发展", appeal: "祈求开发地方、纾解民困" };
  }

  function leaderName(world, polity) {
    return world.countries[polity]?.leader?.name || `${polity}的统治者`;
  }

  // ===== 唯一文案出口：narrate(entry) =====
  function narrate(entry) {
    if (!entry) return "";
    if (entry.kind === "letter") {
      const who = `${entry.from}的${entry.fromLeader}`;
      switch (entry.tone) {
        case "hostile": return `${who}遣使递来战书：刀兵既起，休战之念莫存。`;
        case "threat": return `${who}来函语带锋芒：旧怨未消，望贵国好自为之。`;
        case "warm": return `${who}修书问候：两家血脉相连，愿世代交好。`;
        default: return `${who}遣使致意，愿两国相安无事。`;
      }
    }
    if (entry.kind === "estate") {
      const mood = typeof entry.satisfaction === "number" ? `满意度 ${entry.satisfaction}` : "情绪浮动";
      return `${entry.estate}（${mood}）：${entry.appeal}`;
    }
    if (entry.kind === "quarter") {
      if (entry.net > 0) return `本季${entry.resource}净增 ${entry.net}，主要来自${entry.source || "地块产出"}。`;
      if (entry.net < 0) return `本季${entry.resource}入不敷出（净 ${entry.net}），维护开支正在侵蚀积累。`;
      return `本季${entry.resource}收支大致持平。`;
    }
    return "";
  }

  // ===== 领导人来信：从外交/战争态势 + 领导人关系派生 =====
  function leaderLetters(world, viewer = world.playerPolity) {
    const diplomacy = window.HIFI_DIPLOMACY_ENGINE;
    const warfare = window.HIFI_WARFARE_ENGINE;
    if (!diplomacy || !world.countries) return [];
    const letters = [];
    for (const other of Object.keys(world.countries)) {
      if (other === viewer) continue;
      const rel = diplomacy.leaderRelationView(world, other, viewer); // 对方君主对玩家的观感
      const attitude = diplomacy.diplomaticAttitude(world, other, viewer);
      const atWar = warfare?.areAtWar?.(world, other, viewer);
      let tone = null;
      let intent = null;
      let basis = null;
      if (atWar) { tone = "hostile"; intent = "war"; basis = "交战中"; }
      else if (rel.kinship && ["close", "cooperative"].includes(attitude)) { tone = "warm"; intent = "kinship"; basis = "王朝纽带"; }
      else if ((rel.grudge || 0) >= 40 || ["hostile", "rival"].includes(attitude)) { tone = "threat"; intent = "warning"; basis = `态度 ${attitude}`; }
      if (!tone) continue;
      const entry = { kind: "letter", from: other, fromLeader: leaderName(world, other), tone, intent, basis };
      entry.text = narrate(entry);
      letters.push(entry);
    }
    // 优先级：战书 > 威胁 > 友好；最多 3 封，避免刷屏
    const priority = { hostile: 0, threat: 1, warm: 2, cordial: 3 };
    return letters.sort((a, b) => priority[a.tone] - priority[b.tone]).slice(0, 3);
  }

  // ===== 阶层诉求：从阶层满意度 + 信仰压力派生，绑定既有合法行动 / 跳转面板 =====
  function estateDemands(world, polity = world.playerPolity) {
    const country = world.countries?.[polity];
    if (!country?.estates) return [];
    const faith = country.pressures?.faith || 0;
    const out = [];
    for (const [key, estate] of Object.entries(country.estates)) {
      const cls = classifyEstate(key);
      const faithDriven = cls.theme === "faith" && faith >= 30; // 信仰压力高时教士主动发声
      if (estate.satisfaction >= -20 && !faithDriven) continue; // 否则只在明显不满时发声
      const entry = {
        kind: "estate",
        estate: estate.label,
        estateKey: key,
        theme: cls.theme,
        satisfaction: estate.satisfaction,
        actionKey: cls.action || null, // actionCatalog 合法行动（可执行），无则只跳转
        panel: cls.panel || null,
        appeal: cls.appeal,
        basis: faithDriven ? `信仰压力 ${faith}` : `满意度 ${estate.satisfaction}`,
      };
      entry.text = narrate(entry);
      out.push(entry);
    }
    out.sort((a, b) => (b.theme === "faith") - (a.theme === "faith") || a.satisfaction - b.satisfaction);
    return out.slice(0, 3);
  }

  // ===== 季报叙事：把 quarterLedger 的净额构成翻译成一句话 =====
  function quarterNarrative(world, polity = world.playerPolity) {
    const history = window.HIFI_HISTORY_ENGINE;
    if (!history?.quarterLedger) return { kind: "quarter", text: "" };
    const ledger = history.quarterLedger(world, polity);
    const candidates = [["国库", ledger.money], ["粮食", ledger.food], ["军需", ledger.military]];
    const [resource, seg] = candidates.sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))[0];
    const entry = {
      kind: "quarter",
      resource,
      net: seg.net,
      source: (seg.sources && seg.sources[0]) || null,
      maintenance: seg.maintenance,
      basis: "quarterLedger",
    };
    entry.text = narrate(entry);
    return entry;
  }

  window.HIFI_NARRATIVE_ENGINE = {
    narrate,
    leaderLetters,
    estateDemands,
    quarterNarrative,
    classifyEstate,
  };
})();

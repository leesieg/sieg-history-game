(() => {
  "use strict";

  const succession = {
    hereditary: { label: "世袭君主", title: "国王", estatesBase: ["nobles", "church", "peasants"], leaderRule: "hereditary" },
    elective_monarch: { label: "选举君主", title: "国王", estatesBase: ["nobles", "church", "peasants", "princes"], leaderRule: "elective_life" },
    republican_term: { label: "共和任期", title: "执政官", estatesBase: ["patricians", "citizens", "guilds", "commons"], leaderRule: "elective_term" },
    theocratic: { label: "神权推举", title: "大祭司", estatesBase: ["clergy", "orders", "faithful", "legate"], leaderRule: "elective_life" },
    tribal: { label: "部落推举", title: "大汗", estatesBase: ["clans", "warriors", "shamans", "herders"], leaderRule: "clan_elective" },
  };

  const fiscal = {
    demesne: { label: "领主代征", estatesAdd: ["nobles"], moneyMult: 0.9 },
    tax_farming: { label: "包税制", estatesAdd: ["merchants"], moneyMult: 1.05 },
    direct: { label: "直接征税", estatesAdd: ["bureaucrats"], moneyMult: 1.2 },
    commercial: { label: "商业关税", estatesAdd: ["companies", "oligarchs"], tradeShare: 1.2 },
    nomadic: { label: "游牧无税", estatesAdd: ["herders"], moneyBaseFactor: 0.2, foodBaseFactor: 0.5 },
  };

  const military = {
    feudal_levy: { label: "封建征召", estatesAdd: ["nobles"], baseService: "levy" },
    standing_army: { label: "常备军", estatesAdd: ["bureaucrats"], baseService: "standing" },
    nation_in_arms: { label: "全民皆兵", estatesAdd: ["warriors"], baseService: "levy" },
    mercenary_state: { label: "雇佣立国", estatesAdd: ["companies"], baseService: "mercenary" },
  };

  const assembly = {
    none: { label: "无议会", powerCap: 100, unlocked: false },
    estates_general: { label: "等级会议", powerCap: 80, unlocked: true },
    parliamentary: { label: "议会主权", powerCap: 55, unlocked: true, legitimacyBonus: 4 },
  };

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  function legacySuccession(type) {
    if (type === "republic" || type === "merchant_republic") return "republican_term";
    if (type === "theocracy") return "theocratic";
    if (type === "tribal") return "tribal";
    if (type === "empire") return "elective_monarch";
    return "hereditary";
  }

  function legacyFiscal(type, government) {
    if (type === "merchant_republic") return "commercial";
    if (type === "tribal") return "nomadic";
    const taxation = government?.laws?.taxation;
    if (taxation === "uniform") return "direct";
    if (taxation === "estate_exemptions") return "tax_farming";
    return "demesne";
  }

  function legacyMilitary(type, government) {
    if (type === "tribal") return "nation_in_arms";
    const mobilization = government?.laws?.mobilization;
    if (mobilization === "standing") return "standing_army";
    return "feudal_levy";
  }

  function legacyAssembly(government) {
    if (!government?.assembly?.unlocked) return { type: "none", support: 0, agenda: "tax" };
    if (government?.laws?.authority === "constitutional") {
      return { type: "parliamentary", support: government.assembly.support || 0, agenda: government.assembly.agenda || "tax" };
    }
    return { type: "estates_general", support: government.assembly.support || 0, agenda: government.assembly.agenda || "tax" };
  }

  function fromLegacyGovernment(type, government) {
    return {
      succession: legacySuccession(type),
      centralization: clamp(government?.centralPower ?? (type === "monarchy" ? 62 : 55)),
      fiscal: legacyFiscal(type, government),
      military: legacyMilitary(type, government),
      assembly: legacyAssembly(government),
    };
  }

  function optionLabel(group, key) {
    return group[key]?.label || key;
  }

  function assemblyKey(institutions) {
    return institutions?.assembly?.type || "none";
  }

  function estateKeys(institutions) {
    const keys = new Set();
    for (const key of succession[institutions.succession]?.estatesBase || []) keys.add(key);
    for (const key of fiscal[institutions.fiscal]?.estatesAdd || []) keys.add(key);
    for (const key of military[institutions.military]?.estatesAdd || []) keys.add(key);
    if (assemblyKey(institutions) !== "none") keys.add("commons");
    return [...keys];
  }

  function archetypeFor(institutions, legacyType = "monarchy") {
    const central = clamp(institutions.centralization ?? 60);
    const assemblyType = assemblyKey(institutions);
    const successionType = institutions.succession;
    const fiscalType = institutions.fiscal;
    if (successionType === "tribal") return { archetype: "tribal", archetypeLabel: "部族联盟", suffix: "联盟", powerName: "盟约权威", title: "大汗" };
    if (successionType === "theocratic") return { archetype: "theocracy", archetypeLabel: "神权国", suffix: "神权国", powerName: "教权", title: "大祭司" };
    if (successionType === "republican_term" && fiscalType === "commercial") return { archetype: "merchant_republic", archetypeLabel: "商业共和国", suffix: "共和国", powerName: "商贸权威", title: "总督" };
    if (successionType === "republican_term") return { archetype: "republic", archetypeLabel: "共和国", suffix: "共和国", powerName: "议会权威", title: "执政官" };
    if (legacyType === "empire") return { archetype: "empire", archetypeLabel: "帝国制", suffix: "帝国", powerName: "帝国权威", title: "皇帝" };
    if (assemblyType === "parliamentary") return { archetype: "parliamentary_monarchy", archetypeLabel: "议会君主国", suffix: "王国", powerName: "王权（受限）", title: "国王" };
    if (central >= 75) return { archetype: "absolute_monarchy", archetypeLabel: "绝对君主国", suffix: "王国", powerName: "绝对王权", title: "国王" };
    return { archetype: "feudal_monarchy", archetypeLabel: "封建君主国", suffix: "王国", powerName: "王权", title: "国王" };
  }

  function displayBase(name) {
    return name.replace(/(商业共和国|共和国|神权国|帝国|王国|公国|伯国|骑士团|酋长国|苏丹国|汗国|贝伊国|王朝|联盟|领)$/u, "");
  }

  function displayNameFor(identityName, suffix) {
    return `${displayBase(identityName)}${suffix}`;
  }

  function deriveGovernment(type, government) {
    const institutions = {
      ...fromLegacyGovernment(type, government),
      ...(government?.institutions || {}),
    };
    institutions.centralization = clamp(government?.centralPower ?? institutions.centralization ?? 60);
    const derived = archetypeFor(institutions, type);
    return {
      institutions,
      ...derived,
      typeLabel: derived.archetypeLabel,
      estateKeys: estateKeys(institutions),
      institutionLabels: {
        succession: optionLabel(succession, institutions.succession),
        centralization: Math.round(institutions.centralization),
        fiscal: optionLabel(fiscal, institutions.fiscal),
        military: optionLabel(military, institutions.military),
        assembly: optionLabel(assembly, assemblyKey(institutions)),
      },
    };
  }

  window.HIFI_INSTITUTIONS = {
    assembly,
    deriveGovernment,
    displayNameFor,
    fiscal,
    fromLegacyGovernment,
    military,
    succession,
  };
})();

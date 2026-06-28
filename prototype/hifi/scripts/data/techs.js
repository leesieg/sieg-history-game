(() => {
  "use strict";

  const domains = {
    administrative: { label: "治理", base: 1 },
    military: { label: "军事", base: 1 },
    economic: { label: "经济", base: 1 },
    naval: { label: "航海", base: 1 },
    cultural: { label: "文化", base: 1 },
  };

  const technologies = {
    codifiedLaw: {
      label: "成文法典",
      domain: "administrative",
      cost: 18,
      year: 1337,
      requires: [],
      awarenessGate: 0,
      effect: "治理研究奠基，强化国家整合",
    },
    plateCavalry: {
      label: "板甲重骑",
      domain: "military",
      cost: 18,
      year: 1337,
      requires: [],
      awarenessGate: 0,
      effect: "军事研究奠基，骑士军制成熟",
    },
    threeFieldSystem: {
      label: "三圃制",
      domain: "economic",
      cost: 18,
      year: 1337,
      requires: [],
      awarenessGate: 0,
      effect: "经济研究奠基，提高农业组织能力",
    },
    compassCharts: {
      label: "罗盘海图",
      domain: "naval",
      cost: 18,
      year: 1337,
      requires: [],
      awarenessGate: 0,
      effect: "航海研究奠基，提高沿海贸易能力",
    },
    universities: {
      label: "大学体系",
      domain: "cultural",
      cost: 18,
      year: 1337,
      requires: [],
      awarenessGate: 0,
      effect: "文化研究奠基，稳定思想传播",
    },
    artillery: {
      label: "火药与火炮",
      domain: "military",
      cost: 50,
      year: 1370,
      requires: ["plateCavalry"],
      awarenessGate: 25,
      effect: "解锁炮兵",
    },
    accounting: {
      label: "复式记账",
      domain: "economic",
      cost: 30,
      year: 1400,
      requires: ["codifiedLaw", "threeFieldSystem"],
      awarenessGate: 25,
      effect: "季度金钱 +10%",
    },
    oceanGoingShips: {
      label: "远洋帆装",
      domain: "naval",
      cost: 55,
      year: 1420,
      requires: ["compassCharts"],
      awarenessGate: 25,
      effect: "舰队可进入远洋",
    },
    printing: {
      label: "印刷术",
      domain: "cultural",
      cost: 40,
      year: 1450,
      requires: ["universities"],
      awarenessGate: 25,
      effect: "推动思想与宗教传播",
    },
    bastions: {
      label: "棱堡体系",
      domain: "military",
      cost: 60,
      year: 1500,
      requires: ["artillery"],
      awarenessGate: 30,
      effect: "降低围攻破坏",
    },
    standingArmy: {
      label: "常备军操典",
      domain: "military",
      cost: 45,
      year: 1550,
      requires: ["artillery", "accounting"],
      awarenessGate: 35,
      effect: "解锁常备军制度并提高军需产出",
      unlockInstitution: ["military", "standing_army"],
    },
    triangleTrade: {
      label: "跨洋贸易体系",
      domain: "naval",
      cost: 70,
      year: 1600,
      requires: ["oceanGoingShips", "accounting"],
      awarenessGate: 40,
      effect: "解锁跨洋贸易路线",
    },
    steamEngine: {
      label: "蒸汽动力",
      domain: "economic",
      cost: 85,
      year: 1750,
      requires: ["accounting"],
      awarenessGate: 45,
      effect: "工业产出提升",
    },
    railways: {
      label: "铁路运输",
      domain: "economic",
      cost: 100,
      year: 1820,
      requires: ["steamEngine"],
      awarenessGate: 50,
      effect: "陆上补给与市场连接提升",
    },
  };

  function legacyTechnologies() {
    return Object.fromEntries(Object.entries(technologies).map(([key, technology]) => [
      key,
      {
        label: technology.label,
        domain: technology.domain,
        cost: technology.cost,
        year: technology.year,
        requires: technology.requires || [],
        awarenessGate: technology.awarenessGate ?? 25,
        effect: technology.effect,
        unlockInstitution: technology.unlockInstitution,
      },
    ]));
  }

  window.HIFI_TECHS = { domains, technologies, legacyTechnologies };
})();

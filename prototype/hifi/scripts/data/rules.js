(() => {
  "use strict";

  const buildings = {
    farm: { label: "农庄", cost: 18, effect: "粮食产出 +35%" },
    market: { label: "市场", cost: 24, effect: "金钱产出 +40%" },
    fort: { label: "堡垒", cost: 30, effect: "军需产出与防御提升" },
    port: { label: "港口", cost: 28, effect: "沿海金钱与贸易能力提升" },
    workshop: { label: "工坊", cost: 34, effect: "金钱与军需产出提升" },
    mine: { label: "矿场", cost: 32, effect: "矿物与金属产出提升", goods: ["iron", "copper", "tin", "saltpeter", "gold", "silver"] },
    stable: { label: "马场", cost: 26, effect: "马匹产出提升", goods: ["horses"] },
    lumberyard: { label: "林场", cost: 24, effect: "木材产出提升", goods: ["timber", "naval_supplies"] },
    saltworks: { label: "盐场", cost: 22, effect: "盐产出提升", goods: ["salt"] },
    vineyard: { label: "葡萄园", cost: 24, effect: "葡萄酒产出提升", goods: ["wine"] },
    quarry: { label: "采石场", cost: 26, effect: "石材与大理石产出提升", goods: ["stone", "marble"] },
  };

  const technologies = window.HIFI_TECHS?.legacyTechnologies?.() || {
    artillery: { label: "火药与火炮", domain: "military", cost: 50, year: 1370, requires: [], awarenessGate: 25, effect: "解锁炮兵" },
    oceanGoingShips: { label: "远洋帆装", domain: "naval", cost: 55, year: 1420, requires: [], awarenessGate: 25, effect: "舰队可进入远洋" },
    printing: { label: "印刷术", domain: "cultural", cost: 40, year: 1450, requires: [], awarenessGate: 25, effect: "推动思想与宗教传播" },
    bastions: { label: "棱堡体系", domain: "military", cost: 60, year: 1500, requires: ["artillery"], awarenessGate: 30, effect: "降低围攻破坏" },
    accounting: { label: "复式记账", domain: "economic", cost: 30, year: 1400, requires: [], awarenessGate: 25, effect: "季度金钱 +10%" },
    standingArmy: { label: "常备军体系", domain: "military", cost: 45, year: 1550, requires: ["artillery"], awarenessGate: 35, effect: "军需产出 +20%" },
    triangleTrade: { label: "跨洋贸易体系", domain: "naval", cost: 70, year: 1600, requires: ["oceanGoingShips"], awarenessGate: 40, effect: "解锁跨洋贸易路线" },
    steamEngine: { label: "蒸汽动力", domain: "economic", cost: 85, year: 1750, requires: ["accounting"], awarenessGate: 45, effect: "工业产出提升" },
    railways: { label: "铁路运输", domain: "economic", cost: 100, year: 1820, requires: ["steamEngine"], awarenessGate: 50, effect: "陆上补给与市场连接提升" },
  };

  const edicts = {
    taxDrive: { label: "强化征税", cost: { administrative: 1 }, money: 25, legitimacy: -2 },
    grainReserve: { label: "建立粮储", cost: { administrative: 1, money: 12 }, food: 35 },
    militaryLevy: { label: "征集军需", cost: { military: 1, money: 10 }, military: 30 },
  };

  const agendas = {
    fiscal: { label: "平衡财政", target: "money", threshold: 120, reward: { legitimacy: 3 } },
    granary: { label: "充实粮仓", target: "food", threshold: 180, reward: { legitimacy: 2 } },
    army: { label: "整顿军备", target: "military", threshold: 160, reward: { legitimacy: 2 } },
  };

  const techDomains = window.HIFI_TECHS?.domains || {
    administrative: { label: "治理" },
    military: { label: "军事" },
    economic: { label: "经济" },
    naval: { label: "航海" },
    cultural: { label: "文化" },
  };

  window.HIFI_RULES = { agendas, buildings, edicts, technologies, techDomains };
})();

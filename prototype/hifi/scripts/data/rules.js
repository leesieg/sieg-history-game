(() => {
  "use strict";

  const buildings = {
    farm: { label: "农庄", cost: 18, effect: "粮食产出 +35%" },
    market: { label: "市场", cost: 24, effect: "金钱产出 +40%" },
    fort: { label: "堡垒", cost: 30, effect: "军需产出与防御提升" },
    port: { label: "港口", cost: 28, effect: "沿海金钱与贸易能力提升" },
    workshop: { label: "工坊", cost: 34, effect: "金钱与军需产出提升" },
  };

  const technologies = {
    artillery: { label: "火药与火炮", cost: 50, year: 1370, effect: "解锁炮兵" },
    oceanGoingShips: { label: "远洋帆装", cost: 55, year: 1420, effect: "舰队可进入远洋" },
    printing: { label: "印刷术", cost: 40, year: 1450, effect: "推动思想与宗教传播" },
    bastions: { label: "棱堡体系", cost: 60, year: 1500, effect: "降低围攻破坏" },
    accounting: { label: "复式记账", cost: 30, year: 1400, effect: "季度金钱 +10%" },
    standingArmy: { label: "常备军体系", cost: 45, year: 1550, effect: "军需产出 +20%" },
    triangleTrade: { label: "跨洋贸易体系", cost: 70, year: 1600, effect: "解锁跨洋贸易路线" },
    steamEngine: { label: "蒸汽动力", cost: 85, year: 1750, effect: "工业产出提升" },
    railways: { label: "铁路运输", cost: 100, year: 1820, effect: "陆上补给与市场连接提升" },
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

  window.HIFI_RULES = { agendas, buildings, edicts, technologies };
})();

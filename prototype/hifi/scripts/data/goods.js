(() => {
  "use strict";

  const goods = {
    grain: { label: "谷物", cat: "food", baseValue: 1, yield: 1.15, terrain: ["plains", "steppe"], climate: { temperate: 1.1, mediterranean: 1, cold: .75, arid: .55 }, special: "pop_growth" },
    fish: { label: "鱼", cat: "food", baseValue: 1.2, yield: 1, terrain: ["coast"], climate: { cold: 1.05, temperate: 1, mediterranean: .95 } },
    livestock: { label: "牲畜", cat: "food", baseValue: 1.5, yield: .9, terrain: ["hills", "steppe", "plains"] },
    olive_oil: { label: "橄榄油", cat: "food", baseValue: 2.2, yield: .65, terrain: ["coast", "hills"], climate: { mediterranean: 1.2, cold: .45 } },
    salt: { label: "盐", cat: "food", baseValue: 2, yield: .7, terrain: ["coast", "desert"], special: "preservation" },
    dates: { label: "椰枣", cat: "food", baseValue: 1.7, yield: .8, terrain: ["desert", "coast"], climate: { arid: 1.25, mediterranean: .85, cold: .3 } },
    sugar: { label: "糖", cat: "luxury", baseValue: 5, yield: .45, terrain: ["coast"], climate: { mediterranean: 1.05, arid: .8, cold: .25 }, satisfaction: 1 },
    wine: { label: "葡萄酒", cat: "luxury", baseValue: 3.2, yield: .7, terrain: ["hills", "plains"], climate: { mediterranean: 1.15, temperate: .9, cold: .45 }, satisfaction: 1 },
    iron: { label: "铁", cat: "military", baseValue: 2.6, yield: .8, terrain: ["hills", "mountains"] },
    copper: { label: "铜", cat: "military", baseValue: 2.4, yield: .65, terrain: ["hills", "mountains"] },
    tin: { label: "锡", cat: "military", baseValue: 2.3, yield: .55, terrain: ["hills", "mountains"] },
    leather: { label: "皮革", cat: "military", baseValue: 1.9, yield: .75, terrain: ["plains", "steppe", "hills"] },
    horses: { label: "马", cat: "strategic", baseValue: 3, yield: .6, terrain: ["steppe", "plains"], special: "cavalry_gate" },
    timber: { label: "木材", cat: "strategic", baseValue: 2, yield: .85, terrain: ["forest", "hills"], special: "construction" },
    naval_supplies: { label: "海军物资", cat: "strategic", baseValue: 3.4, yield: .5, terrain: ["coast", "forest"], special: "naval" },
    saltpeter: { label: "硝石", cat: "strategic", baseValue: 4.2, yield: .35, terrain: ["desert", "hills"], special: "artillery" },
    gold: { label: "黄金", cat: "money_metal", baseValue: 12, yield: .28, terrain: ["desert", "mountains"], special: "direct_income" },
    silver: { label: "白银", cat: "money_metal", baseValue: 8, yield: .4, terrain: ["hills", "mountains"], special: "inflation" },
    spices: { label: "香料", cat: "luxury", baseValue: 10, yield: .38, terrain: ["coast"], satisfaction: 1, transit: true },
    silk: { label: "丝绸", cat: "luxury", baseValue: 8, yield: .4, terrain: ["coast", "plains"], satisfaction: 1, transit: true },
    fur: { label: "毛皮", cat: "luxury", baseValue: 5, yield: .55, terrain: ["forest"], climate: { cold: 1.25, temperate: .8 }, satisfaction: 1 },
    amber: { label: "琥珀", cat: "luxury", baseValue: 6, yield: .35, terrain: ["coast", "forest"], satisfaction: 1 },
    glass: { label: "玻璃器", cat: "manufactured", baseValue: 5, yield: .5, terrain: ["coast", "plains"], chainFrom: "salt" },
    wool: { label: "羊毛", cat: "raw_textile", baseValue: 2, yield: .9, terrain: ["plains", "hills", "steppe"] },
    cloth: { label: "呢绒", cat: "manufactured", baseValue: 6, yield: .6, terrain: ["plains", "wetland"], chainFrom: "wool" },
    dye: { label: "染料", cat: "raw_textile", baseValue: 4, yield: .45, terrain: ["plains", "coast"], climate: { mediterranean: 1.1, temperate: .85 } },
    alum: { label: "明矾", cat: "raw_textile", baseValue: 5, yield: .35, terrain: ["hills", "coast"], special: "textile_bonus" },
    beeswax: { label: "蜂蜡", cat: "manufactured", baseValue: 3, yield: .55, terrain: ["forest", "plains"] },
    stone: { label: "石材", cat: "construction", baseValue: 1.8, yield: .8, terrain: ["hills", "mountains"] },
    marble: { label: "大理石", cat: "construction", baseValue: 3.5, yield: .45, terrain: ["mountains", "hills"] },
  };

  const aliases = {
    grain: "grain",
    fish: "fish",
    wine: "wine",
    dates: "dates",
    iron: "iron",
    horses: "horses",
    timber: "timber",
    gold: "gold",
    silver: "silver",
    spices: "spices",
    cloth: "cloth",
    wool: "wool",
    salt: "salt",
  };

  window.HIFI_GOODS = { goods, aliases };
})();

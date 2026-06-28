(() => {
  "use strict";

  const groups = {
    christian: { label: "基督教" },
    islam: { label: "伊斯兰教" },
    jewish: { label: "犹太教", minority: true },
  };

  const confessions = {
    catholic: { group: "christian", label: "天主教", authority: "papacy" },
    orthodox: { group: "christian", label: "东正教", authority: "patriarchate" },
    lutheran: { group: "christian", label: "路德宗", authority: null },
    reformed: { group: "christian", label: "归正宗", authority: null },
    sunni: { group: "islam", label: "逊尼派", authority: "caliphate" },
    shia: { group: "islam", label: "什叶派", authority: "caliphate" },
    jewish: { group: "jewish", label: "犹太教", authority: null },
  };

  const aliases = {
    "天主教": "catholic",
    "新教": "lutheran",
    "路德宗": "lutheran",
    "归正宗": "reformed",
    "改革宗": "reformed",
    "东正教": "orthodox",
    "逊尼派": "sunni",
    "什叶派": "shia",
    "伊斯兰教": "sunni",
    "犹太教": "jewish",
  };

  window.HIFI_FAITHS = { groups, confessions, aliases };
})();

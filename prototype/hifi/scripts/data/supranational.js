(() => {
  "use strict";

  const structures = {
    hre: {
      id: "hre",
      type: "imperial",
      name: "神圣罗马帝国",
      label: "神圣罗马帝国",
      authorityLabel: "帝国权威",
      emperor: "神圣罗马帝国",
      authority: 52,
      electors: ["神圣罗马帝国", "勃艮第公国", "弗兰德斯伯国", "米兰领", "条顿骑士团"],
      members: {
        "神圣罗马帝国": { role: "皇帝", voteWeight: 2 },
        "勃艮第公国": { role: "诸侯", voteWeight: 1 },
        "弗兰德斯伯国": { role: "诸侯", voteWeight: 1 },
        "米兰领": { role: "诸侯", voteWeight: 1 },
        "条顿骑士团": { role: "帝国修会", voteWeight: 1 },
      },
    },
    papacy: {
      id: "papacy",
      type: "religious",
      name: "教廷",
      label: "教廷",
      authorityLabel: "教廷权威",
      head: "教皇国",
      authority: 65,
      confessions: ["catholic"],
      memberRole: "天主教国",
      electors: [],
      members: {},
    },
    caliphate: {
      id: "caliphate",
      type: "religious",
      name: "哈里发权威",
      label: "哈里发",
      authorityLabel: "哈里发权威",
      head: "马穆鲁克苏丹国",
      authority: 55,
      confessions: ["sunni", "shia"],
      memberRole: "穆斯林政权",
      electors: [],
      members: {},
    },
  };

  window.HIFI_SUPRANATIONAL_DATA = { structures };
})();

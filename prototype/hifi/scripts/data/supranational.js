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
  };

  window.HIFI_SUPRANATIONAL_DATA = { structures };
})();

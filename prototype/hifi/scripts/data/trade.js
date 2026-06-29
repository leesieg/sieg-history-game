(() => {
  "use strict";

  const route = (label, pool, value, nodes, unlock = null) => ({ label, pool, value, nodes, unlock });
  window.HIFI_TRADE_DATA = {
    pools: { orient: 260, north: 120, west: 110, south: 70, silver: 0 },
    routes: {
      levant: route("黎凡特商路", "orient", 72, ["亚历山大", "君士坦丁堡", "威尼斯", "热那亚"]),
      blackSea: route("黑海商路", "orient", 42, ["君士坦丁堡", "诺夫哥罗德"]),
      redSea: route("红海香料路", "orient", 38, ["开罗", "亚历山大", "威尼斯"]),
      cape: route("好望角航路", "orient", 70, ["里斯本", "塞维利亚", "安特卫普"], "oceanGoingShips"),
      hansa: route("汉萨商路", "north", 42, ["诺夫哥罗德", "马林堡", "布鲁日", "伦敦"]),
      rhine: route("莱茵商路", "north", 34, ["科隆", "布鲁日", "巴黎"]),
      atlantic: route("大西洋沿岸", "west", 38, ["里斯本", "波尔多", "伦敦", "布鲁日"]),
      maghreb: route("马格里布商路", "south", 28, ["非斯", "特莱姆森", "突尼斯", "巴勒莫"]),
      newWorld: route("新大陆白银航路", "silver", 85, ["里斯本", "塞维利亚", "安特卫普"], "triangleTrade"),
      balticGrain: route("波罗的海谷物路", "north", 32, ["马林堡", "斯德哥尔摩", "罗斯基勒", "伦敦"], "printing"),
    },
    straits: {
      bosporus: { label: "博斯普鲁斯海峡", controllerCity: "君士坦丁堡", routes: ["levant", "blackSea"], tollRate: .06, cost: 4 },
      sound: { label: "松德海峡", controllerCity: "罗斯基勒", routes: ["balticGrain"], tollRate: .05, cost: 3 },
      gibraltar: { label: "直布罗陀海峡", controllerCity: "塞维利亚", routes: ["cape", "atlantic"], tollRate: .04, cost: 2 },
    },
  };
})();

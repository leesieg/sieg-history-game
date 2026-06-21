const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi");
const geographyPath = path.join(root, "scripts", "data", "geography.js");
const mapPath = path.join(root, "scripts", "ui", "map.js");
const htmlPath = path.join(root, "index.html");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(geographyPath, "utf8"), context);
assert.ok(context.window.HIFI_GEOGRAPHY, "地理数据应独立加载");
assert.deepEqual(
  Array.from(context.window.HIFI_GEOGRAPHY.CITY_COORDS["君士坦丁堡"]),
  [27.3, 39.7]
);

const mapSource = fs.readFileSync(mapPath, "utf8");
const geographySource = fs.readFileSync(geographyPath, "utf8");
const componentSource = fs.readFileSync(path.join(root, "styles", "components.css"), "utf8");
assert.ok(mapSource.includes("const HEX_R = 12.8"), "六边形半径必须与 Demo2 对齐");
assert.ok(mapSource.includes('mode: "political"'), "默认地图模式必须是政治");
assert.ok(mapSource.includes("Math.hypot(dx, dy) < 5"), "拖动必须保留点击阈值");
assert.ok(mapSource.includes("window.HIFI_GEOGRAPHY"), "地图必须读取高保真地理模块");
assert.ok(mapSource.includes("hifi:tile-selected"), "地图选格必须同步到唯一世界状态");
assert.ok(mapSource.includes("syncSelection"), "国家切换后地图必须同步世界状态中的选中地块");
assert.ok(
  geographySource.includes('"enemy","英格兰王国"'),
  "1337 年加斯科涅地块应归属英格兰王国，而不是虚构独立政权"
);
assert.ok(componentSource.includes(".map-city-dot, .map-capital-star"), "城市点和首都星必须共享穿透点击规则");
assert.ok(componentSource.includes("pointer-events: none"), "地图标注不能阻断地块点击");
assert.ok(mapSource.includes('../../assets/terrain-banners/${tile.terrain}.png'), "地形横幅必须使用正确资源路径");

const html = fs.readFileSync(htmlPath, "utf8");
assert.ok(html.includes("scripts/data/geography.js"));
assert.ok(html.includes("scripts/ui/map.js"));
assert.ok(!html.includes("assets/ui/prototype-map.js"));
assert.ok(!html.includes("assets/ui/prototype-map-data.js"));

console.log("hifi map integration passed");

// --- Task C3: 地块动作按归属 ---
// map.js 顶层执行依赖真实 DOM（createElementNS/querySelectorAll 等），无法在 vm 里整体跑；
// 因此这里只把纯函数 tileActionsFor 的源码抠出来单独求值，复用真实 world + warfare 引擎构造战争状态。
{
  const engineRoot = path.join(root, "scripts");
  const engineContext = { window: {} };
  for (const file of ["engine/world.js", "engine/economy.js", "engine/diplomacy.js", "engine/warfare.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(engineRoot, file), "utf8"), engineContext);
  }
  const worldEngine = engineContext.window.HIFI_WORLD_ENGINE;
  const diplomacy = engineContext.window.HIFI_DIPLOMACY_ENGINE;
  const warfare = engineContext.window.HIFI_WARFARE_ENGINE;

  const tiles = [
    { id: 0, isSea: false, polity: "法兰西王国", population: 12, buildings: [], city: "巴黎", terrain: "plains", x: 10, y: 10, control: 80, devastation: 0 },
    { id: 1, isSea: false, polity: "英格兰王国", population: 10, buildings: ["fort"], city: "加来", terrain: "plains", x: 50, y: 10, control: 70, devastation: 0 },
    { id: 2, isSea: false, polity: "勃艮第公国", population: 8, buildings: [], city: "第戎", terrain: "plains", x: 30, y: 30, control: 60, devastation: 0 },
    { id: 3, isSea: true, polity: "海域", population: 0, buildings: [], city: "", terrain: "sea", x: 70, y: 30, control: 0 },
  ];
  const world = worldEngine.createWorld(tiles);
  diplomacy.initializeDiplomacy(world);
  warfare.initializeWarfare(world);
  world.diplomacy.wars = [];
  warfare.declareWar(world, "法兰西王国", "英格兰王国", 1, "测试战争");
  assert.equal(warfare.areAtWar(world, "法兰西王国", "英格兰王国"), true);

  const match = mapSource.match(/function tileActionsFor\([\s\S]*?\n  \}/);
  assert.ok(match, "map.js 必须定义 tileActionsFor");
  const mapFnContext = { window: engineContext.window };
  vm.runInNewContext(`${match[0]}\nthis.tileActionsFor = tileActionsFor;`, mapFnContext);
  const tileActionsFor = mapFnContext.tileActionsFor;

  const own = tiles[0];
  const sea = tiles[3];
  const foreignAtWar = tiles[1];
  const foreignPeaceful = tiles[2];

  const ownActions = tileActionsFor(own, world);
  assert.ok(ownActions.includes("build") && ownActions.includes("integrate"), "己方应有建设/整合");

  const seaActions = tileActionsFor(sea, world);
  assert.ok(!seaActions.includes("build"), "海域不应有建设");
  assert.deepEqual(seaActions, ["view"], "海域只读");

  const atWarActions = tileActionsFor(foreignAtWar, world);
  assert.ok(!atWarActions.includes("build"), "交战地块不应有建设");
  assert.ok(atWarActions.includes("advance") || atWarActions.includes("siege"), "交战地块应有推进/围攻");

  const peacefulActions = tileActionsFor(foreignPeaceful, world);
  assert.ok(!peacefulActions.includes("build"), "外国地块不应有建设");
  assert.ok(peacefulActions.includes("diplomacy") || peacefulActions.includes("declareWar"),
    "外国和平地块应有外交/宣战");

  assert.ok(mapSource.includes("function tileActionsFor(tile, world)"), "tileActionsFor 签名必须固定");
  assert.ok(mapSource.includes("window.prototypeMap = {") && mapSource.includes("tileActionsFor"),
    "tileActionsFor 必须导出到 window.prototypeMap");

  console.log("C3 地块归属动作 OK");
}

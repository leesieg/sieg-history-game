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

const html = fs.readFileSync(htmlPath, "utf8");
assert.ok(html.includes("scripts/data/geography.js"));
assert.ok(html.includes("scripts/ui/map.js"));
assert.ok(!html.includes("assets/ui/prototype-map.js"));
assert.ok(!html.includes("assets/ui/prototype-map-data.js"));

console.log("hifi map integration passed");

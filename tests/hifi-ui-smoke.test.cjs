const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "prototype", "hifi");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const main = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
const map = fs.readFileSync(path.join(root, "scripts", "ui", "map.js"), "utf8");
const drawers = fs.readFileSync(path.join(root, "scripts", "ui", "drawers.js"), "utf8");
const dialogs = fs.readFileSync(path.join(root, "scripts", "ui", "dialogs.js"), "utf8");

for (const id of [
  "rulerPlaque",
  "systemDrawer",
  "armyDrawer",
  "countryModal",
  "countrySelectModal",
  "leaderElectionModal",
  "councilModal",
  "historyEventModal",
  "seasonControl",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `缺少界面容器 ${id}`);
}

assert.match(main, /openSystem\(button\)/, "系统按钮必须打开真实抽屉");
assert.match(main, /hifi:tile-selected/, "地图选格必须进入世界状态");
assert.match(main, /hifi:army-selected/, "军团标记必须打开独立军团界面");
assert.match(main, /hifi:army-close/, "切换操作对象时必须关闭军团界面");
assert.match(main, /syncSelection\(current\.selectedTile\)/, "国家切换必须同步地图选中地块");
assert.match(main, /dataset\.peaceTerm/, "和平操作必须读取具体和平条件");
assert.match(drawers, /data-peace-term/, "和平按钮必须区分索取领土与维持现状");
assert.match(main, /setAttribute\("aria-label", `查看\$\{country\.name\}`\)/, "玩家国家标识必须随国家切换");
assert.match(map, /data-map-tile/, "地图必须生成可点击地块");
assert.match(map, /data-army-marker/, "地图必须生成可点击军团标记");
assert.match(drawers, /openCountrySelect/, "国家详情必须接通国家选择窗口");
assert.match(drawers, /data-diplomatic-action/, "外交抽屉必须提供真实外交行动");
assert.match(dialogs, /data-army-plan/, "军团抽屉必须提供路线规划");
assert.match(dialogs, /hifi:army-close/, "军团界面必须响应统一关闭事件");
assert.doesNotMatch(main, /待接入|将在对应系统迁移时启用/);

console.log("hifi UI smoke contracts passed");

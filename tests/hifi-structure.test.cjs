const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "prototype", "hifi");
const requiredFiles = [
  "index.html",
  "styles/tokens.css",
  "styles/layout.css",
  "styles/components.css",
  "scripts/main.js",
  "scripts/data/geography.js",
  "scripts/data/countries.js",
  "scripts/data/rules.js",
  "scripts/engine/world.js",
  "scripts/engine/turn.js",
  "scripts/engine/politics.js",
  "scripts/engine/economy.js",
  "scripts/engine/diplomacy.js",
  "scripts/engine/warfare.js",
  "scripts/engine/history.js",
  "scripts/data/codex.js",
  "scripts/ui/store.js",
  "scripts/ui/map.js",
  "scripts/ui/widgets.js",
  "scripts/ui/drawers.js",
  "scripts/ui/codex.js",
  "scripts/ui/dialogs.js",
];

for (const relativePath of requiredFiles) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `缺少高保真模块：${relativePath}`
  );
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const reference of [
  "styles/tokens.css",
  "styles/layout.css",
  "styles/components.css",
  "scripts/engine/world.js",
  "scripts/engine/politics.js",
  "scripts/engine/economy.js",
  "scripts/engine/diplomacy.js",
  "scripts/engine/warfare.js",
  "scripts/engine/history.js",
  "scripts/data/codex.js",
  "scripts/ui/codex.js",
  "scripts/ui/dialogs.js",
  "scripts/main.js",
]) {
  assert.ok(html.includes(reference), `入口未引用 ${reference}`);
}

for (const id of [
  "systemDrawer",
  "armyDrawer",
  "countryModal",
  "countrySelectModal",
  "leaderElectionModal",
  "councilModal",
  "historyEventModal",
]) {
  assert.ok(html.includes(`id="${id}"`), `入口缺少交互容器 ${id}`);
}
const mainSource = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
assert.ok(!mainSource.includes("待接入"));
assert.ok(!mainSource.includes("将在对应系统迁移时启用"));
assert.ok(mainSource.includes("HIFI_HISTORY_ENGINE.eras[current.eraIndex].label"), "顶部必须显示当前时代");
const mapSourceStruct = fs.readFileSync(path.join(root, "scripts", "ui", "map.js"), "utf8");
assert.ok(mapSourceStruct.includes("data-open-system"), "地块动作（按归属生成）必须接入现有系统");
assert.ok(mainSource.includes('classList.add("system-open")'));
assert.ok(mainSource.includes('classList.remove("system-open")'));
assert.ok(mainSource.includes('setAttribute("aria-label", `查看${country.name}`)'));
assert.ok(mainSource.includes("portrait-placeholder"));

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
assert.ok(readme.includes("prototype/hifi/index.html"), "README 必须提供模块化高保真入口");
assert.ok(readme.includes("完整机制高保真版本"), "README 必须说明当前推荐版本");

console.log("hifi module structure passed");

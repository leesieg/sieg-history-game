const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "prototype", "hifi");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = [
  fs.readFileSync(path.join(root, "styles", "layout.css"), "utf8"),
  fs.readFileSync(path.join(root, "styles", "components.css"), "utf8"),
].join("\n");

for (const selector of [
  ".top-command-bar",
  ".system-rail",
  ".system-drawer",
  ".army-drawer",
  ".issue-panel",
  ".province-panel",
  ".command-dock",
  ".map-tools",
  ".season-control",
]) {
  assert.ok(css.includes(selector), `缺少 HUD 占位规则：${selector}`);
}
assert.ok(css.includes("@media (max-width: 1180px)"));
assert.ok(css.includes("@media (max-width: 900px) and (orientation: landscape)"));
assert.ok(css.includes(".system-drawer.open"));
assert.ok(css.includes(".army-drawer.open"));
assert.ok(css.includes(".game-shell.army-open .issue-panel"), "军团窗口打开时必须让出右侧问题区");
assert.ok(css.includes(".game-shell.system-open .province-panel"), "系统抽屉打开时必须让出左下地区区");
assert.ok(css.includes("@media (max-width: 760px) and (orientation: landscape)"), "窄横屏必须收起底部命令栏");
assert.ok(html.includes('preserveAspectRatio="xMidYMid slice"'));
assert.ok(html.includes('aria-hidden="true"'));

console.log("hifi layout contract passed");

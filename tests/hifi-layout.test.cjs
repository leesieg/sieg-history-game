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
assert.ok(css.includes("max-height: calc(100vh - 150px)"), "系统抽屉必须限制在视口内");
assert.ok(css.includes("overflow-y: auto"), "超长系统抽屉必须可滚动");
assert.ok(css.includes("visibility: hidden"), "互斥面板必须退出可见和命中状态");
assert.ok(!/@media \(max-width: 900px\)[\s\S]*?\.map-tools\s*\{\s*display:\s*none/.test(css), "900 横屏不能移除地图工具");
assert.ok(html.includes('preserveAspectRatio="xMidYMid slice"'));
assert.ok(html.includes('aria-hidden="true"'));

// --- Task C1: HUD 顶栏 ---
{
  assert(!/class="game-title"/.test(html), "应删除游戏名称 game-title");
  assert(!/id="topPending"/.test(html), "应删除顶部待办按钮 topPending");
  assert(/id="dateMain"/.test(html), "日期牌保留");
  assert(/id="countryShield"/.test(html), "国家盾徽保留");
  assert(css.includes("justify-content: space-between"), "顶栏应两端对齐，中间留白");
  assert(/\.top-command-bar\s*\{[^}]*pointer-events:\s*none/.test(css), "顶栏容器中间应透明、不遮挡地图");
  assert(/\.resource-strip\s*\{[^}]*flex-wrap:\s*nowrap/.test(css), "资源栏应单行不换行");
  console.log("C1 HUD 顶栏 OK");
}

// --- 顶栏体验微调：结束季度移入顶栏 + 命令坞移除 ---
{
  assert(/id="seasonControl"[\s\S]{0,400}id="seasonIcon"/.test(html), "结束季度应为顶栏播放/暂停按钮（season-icon）");
  assert(!/class="command-dock"/.test(html), "底部命令坞应移除（操作已并入地块详情/外交抽屉）");
  assert(/id="miniMapToggle"[^>]*>/.test(html) && /map-tool-footer[\s\S]{0,200}miniMapToggle/.test(html), "缩略图开关应移入图例栏");
  console.log("顶栏微调（季节按钮/去命令坞/缩略图开关）OK");
}

// --- 统一局势入口：右下角悬浮组件 + 统一局势窗（反馈 #1/#2）---
{
  assert.ok(html.includes('id="struggleDock"'), "应有局势浮窗容器 struggleDock");
  assert.ok(html.includes('id="struggleModal"'), "应有统一局势窗 struggleModal");
  assert.ok(css.includes(".struggle-dock"), "局势浮窗应有样式 .struggle-dock");
  assert.ok(css.includes(".struggle-banner"), "统一局势窗应有纹章横幅 .struggle-banner");
  assert.ok(/\.struggle-dock\s*\{[\s\S]*?right:\s*248px/.test(css), "局势浮窗应位于地图工具左侧（right 248px）");
  assert.ok(!css.includes(".war-room"), "旧作战室样式应已移除（统一到局势浮窗）");
  console.log("局势统一入口布局 OK");
}

console.log("hifi layout contract passed");

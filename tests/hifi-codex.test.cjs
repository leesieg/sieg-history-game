const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi");
const scripts = path.join(root, "scripts");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(scripts, "data", "codex.js"), "utf8"), context);

const codex = context.window.HIFI_CODEX;
assert.ok(codex, "百科模块必须挂到 window.HIFI_CODEX");

// 已绑定 tooltip 的核心概念必须存在
for (const key of ["政体", "统治者", "合法性", "王权", "改革", "制度模块", "议会", "阶层", "领土整合"]) {
  const entry = codex.get(key);
  assert.ok(entry && entry.term, `百科缺少概念：${key}`);
  assert.ok(entry.summary, `概念 ${key} 必须有 summary`);
}

// 概念必须用流模型词汇（受什么影响 / 影响什么）描述
const ruler = codex.get("统治者");
assert.ok(Array.isArray(ruler.affects) && ruler.affects.join("").includes("行动点"), "统治者能力必须说明影响行动点");
assert.ok(Array.isArray(ruler.affectedBy), "概念必须有 affectedBy");

// 决议效果说明必须与 politics 决议键一一对应
for (const key of ["estates_general", "fiscal_parliament", "fiscal_absolutism", "convert_reformed", "constitutional_monarchy", "civic_republic"]) {
  const entry = codex.decisions[key];
  assert.ok(entry && entry.effect, `决议百科缺少效果说明：${key}`);
}
assert.ok(codex.decisions.convert_reformed.effect.includes("路德宗"), "接纳宗教改革说明必须匹配实际国教变化");
assert.ok(codex.decisions.convert_reformed.effect.includes("世俗化教产"), "接纳宗教改革说明必须提示世俗化红利");

// toHtml 渲染包含术语名与说明
const html = codex.toHtml("统治者");
assert.ok(html.includes("统治者能力") && html.includes("受什么影响") && html.includes("影响什么"), "toHtml 必须渲染术语与影响说明");
assert.equal(codex.toHtml("不存在的概念"), "", "未知概念返回空串");

// UI 组件存在且 init 幂等可调用
const uiContext = { window: {}, document: null };
vm.runInNewContext(fs.readFileSync(path.join(scripts, "ui", "codex.js"), "utf8"), uiContext);
assert.ok(uiContext.window.HIFI_CODEX_UI && typeof uiContext.window.HIFI_CODEX_UI.init === "function", "必须导出 HIFI_CODEX_UI.init");

// 接线核对：抽屉引用 data-codex / codexTerm，入口初始化 UI，页面加载脚本
const drawerSource = fs.readFileSync(path.join(scripts, "ui", "drawers.js"), "utf8");
const mainSource = fs.readFileSync(path.join(scripts, "main.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(drawerSource.includes("data-codex") && drawerSource.includes("codexTerm"), "抽屉必须用 codexTerm 输出百科词");
assert.ok(drawerSource.includes("HIFI_CODEX") && drawerSource.includes(".effect"), "决议必须展示百科效果说明");
assert.ok(mainSource.includes("HIFI_CODEX_UI.init"), "入口必须初始化百科 tooltip");
assert.ok(indexHtml.includes("scripts/data/codex.js") && indexHtml.includes("scripts/ui/codex.js"), "页面必须加载百科脚本");

console.log("hifi codex passed");

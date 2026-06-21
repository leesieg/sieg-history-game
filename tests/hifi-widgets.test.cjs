const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "prototype", "hifi", "scripts");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "ui", "widgets.js"), "utf8"), context);
const W = context.window.HIFI_WIDGETS;

assert.ok(W, "必须导出 window.HIFI_WIDGETS");

// meter：填充宽度按比例，越界 clamp 到 0–100
assert.match(W.meter(50, 100), /width:50\.0%/, "meter 50/100 → 50%");
assert.match(W.meter(200, 100), /width:100\.0%/, "meter 超界 clamp 100%");
assert.match(W.meter(-5, 100), /width:0\.0%/, "meter 负值 clamp 0%");
assert.match(W.meter(50, 100, { threshold: 50 }), /ui-meter-mark/, "meter 阈值刻度");
assert.match(W.meter(1, 2, { tone: "red" }), /ui-meter--red/, "meter 色调");

// diverging：正向右(left:50%)、负向左(right:50%)
assert.match(W.diverging(40, 100), /ui-diverge--pos[\s\S]*left:50%;width:20\.0%/, "diverging 正值向右半宽");
assert.match(W.diverging(-40, 100), /ui-diverge--neg[\s\S]*right:50%;width:20\.0%/, "diverging 负值向左半宽");

// pips：on 的数量等于 value
{
  const html = W.pips(3, 5);
  assert.equal((html.match(/ui-pip on/g) || []).length, 3, "pips 点亮 3 个");
  assert.equal((html.match(/ui-pip(?!s)/g) || []).length, 5, "pips 共 5 个（不含 ui-pips 容器）");
}

// radar：n 轴 → 数据多边形有 n 个点，含网格与标签
{
  const html = W.radar([
    { label: "行政", value: 6, max: 10 },
    { label: "外交", value: 4, max: 10 },
    { label: "军事", value: 8, max: 10 },
  ]);
  assert.match(html, /ui-radar-area/, "radar 有数据区域");
  const area = html.match(/ui-radar-area" points="([^"]+)"/);
  assert.ok(area && area[1].trim().split(/\s+/).length === 3, "radar 数据点数 = 轴数");
  assert.match(html, /行政[\s\S]*外交[\s\S]*军事/, "radar 含轴标签");
  assert.match(html, /ui-radar-grid/, "radar 含网格");
}

// checklist：met 决定 ✓/✗ 与 class
{
  const html = W.checklist([{ label: "年代", met: true }, { label: "传播", met: false }]);
  assert.match(html, /ui-check met">✓ 年代/, "已满足显 ✓");
  assert.match(html, /ui-check">✗ 传播/, "未满足显 ✗");
}

// attitudeDot：按态度取色，未知态度有兜底色
assert.match(W.attitudeDot("hostile"), /background:#b34736/, "敌对取红");
assert.match(W.attitudeDot("close"), /background:#3f8c4e/, "亲近取绿");
assert.match(W.attitudeDot("???"), /background:#7d7d6a/, "未知态度兜底");

console.log("hifi widgets passed");

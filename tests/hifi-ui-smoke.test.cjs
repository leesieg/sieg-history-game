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
  "provincePanel",
  "provinceClose",
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
assert.match(dialogs, /data-recruit-general/, "军团抽屉必须提供招募将领入口（Phase E 将领系统）");
assert.match(dialogs, /data-assign-general/, "军团抽屉必须支持任命非统治者将领");
assert.match(dialogs, /HIFI_NARRATIVE_ENGINE/, "御前会议必须接入表达层引擎（Phase B）");
assert.match(dialogs, /宫廷来信/, "御前会议必须展示领导人来信");
assert.match(dialogs, /阶层诉求/, "御前会议必须展示阶层诉求");
assert.match(dialogs, /data-estate-panel/, "阶层诉求必须可跳转到相关面板");
assert.match(dialogs, /regencyBlocker/, "御前会议必须用 regencyBlocker 预判垂帘听政是否可启动（修无响应）");
assert.match(dialogs, /垂帘听政推进了|暂不能垂帘听政/, "垂帘听政必须给出执行结果/受阻反馈，而非静默");
assert.match(dialogs, /council-actions/, "御前会议操作按钮必须收进操作条");
assert.match(html, /council-emblem/, "御前会议弹窗必须有纹章头部（信息层次）");
assert.match(main, /打开御前会议/, "问题面板标题必须标明是御前会议入口");
assert.match(dialogs, /hifi:army-close/, "军团界面必须响应统一关闭事件");
assert.match(map, /provincePanel\.classList\.add\("closed"\)/, "地块详情关闭按钮必须隐藏面板");
assert.match(map, /provincePanel\.classList\.remove\("closed"\)/, "重新选择地块必须打开详情面板");
assert.doesNotMatch(html, />POP</, "地块人口字段必须使用中文");
assert.doesNotMatch(drawers, />\$\{key\}</, "改革和压力不能直接显示内部英文键");
assert.match(dialogs, /combatTypeLabels\[unit\.combatType\]/, "军团兵种必须显示中文");
assert.doesNotMatch(main, /待接入|将在对应系统迁移时启用/);

assert.match(drawers, /effectLabels/, "敕令效果文案必须区分军需库存与军事点（不能共用同一份资源标签表）");
assert.match(drawers, /已建成/, "已建成建筑必须在按钮副标题里提示「已建成」");
assert.match(drawers, /tile\.buildings\.includes\(key\)/, "建筑按钮的已建成判定必须读取地块真实建成记录 tile.buildings");

assert.match(dialogs, /data-proposal-exec/, "御前会议草案卡必须提供「执行建议」接线");
assert.match(dialogs, /data-proposal-goto/, "御前会议草案卡必须提供「跳转面板」接线");
assert.match(dialogs, /HIFI_OBJECTIVES_ENGINE\.advisorProposals/, "renderCouncil 必须调用 advisorProposals 生成草案卡");
assert.match(dialogs, /HIFI_PROPOSALS_ENGINE\.execute/, "执行建议必须委托 HIFI_PROPOSALS_ENGINE.execute");
assert.match(main, /hifi:open-system/, "main.js 必须接住御前会议的跳转面板事件");

// --- Task A6: 季报三段渲染 ---
{
  const src = fs.readFileSync(path.join(root, "scripts/ui/dialogs.js"), "utf8");
  assert(/ledger-neg/.test(src), "季报应有净负高亮类 ledger-neg");
  assert(/maintenance/.test(src) && /\.net/.test(src), "季报渲染应读 maintenance 与 net");
  console.log("A6 季报渲染 OK");
}

// --- Task B3: 按钮预览渲染 ---
{
  const src = fs.readFileSync(path.join(root, "scripts", "ui", "drawers.js"), "utf8");
  assert(/action-preview/.test(src), "动作按钮应渲染 action-preview 小字");
  assert(/action-blocked/.test(src) && /disabled/.test(src), "不可用动作应置灰（disabled + action-blocked）");
  assert(/actionPreview/.test(src), "应调用 HIFI_PROPOSALS_ENGINE.actionPreview 生成预览");
  console.log("B3 按钮预览渲染 OK");
}

// --- Task B4: 执行后 toast ---
{
  const src = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  // 执行动作前后快照资源并 toast 差值
  assert(/toast/.test(src) && /(before|snapshot)/i.test(src), "动作执行应快照并 toast 差值");
  console.log("B4 执行 toast OK");
}

// --- Task C2: 待办并入问题面板 ---
{
  const src = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
  assert.match(src, /御前会议\s*·/, "御前会议入口标题应带计数（统一命名为御前会议）");
  assert.doesNotMatch(src, /问题与对象/, "入口已统一为「御前会议」，不应再出现「问题与对象」");
  assert.match(src, /issue-empty/, "空状态应有折叠类 issue-empty");
  assert.doesNotMatch(src, /topPending/, "main.js 不应再引用已删除的 topPending");
  assert.doesNotMatch(html, /id="topPending"/, "html 不应再有 topPending 节点");
  console.log("C2 待办并入 OK");
}

// --- Task C1/C2 回归修复：本季三件事入口不能随 topPending 一并消失 ---
{
  const src = fs.readFileSync(path.join(root, "scripts", "main.js"), "utf8");
  assert.match(src, /HIFI_OBJECTIVES_ENGINE[\s\S]{0,80}seasonTasks/, "main.js 必须保留 seasonTasks 调用作为空态兜底入口");
  assert.match(src, /本季\s*\$\{?.*?\}?\s*件事/, "无问题时应展示「本季 N 件事」引导文案");
  assert.doesNotMatch(src, /待办\s*\$\{count\}/, "seasonText 兜底文案不应再使用「待办」措辞");
  console.log("C1/C2 回归修复：本季三件事 + 去待办措辞 OK");
}

// --- Task C4: 地块面板默认迷你卡 ---
{
  assert.match(html, /province-mini/, "地块面板应默认迷你态 province-mini");
  assert.match(html, /data-province-toggle/, "地块面板应有展开/收起按钮 data-province-toggle");
  assert.match(map, /province-mini/, "map.js 应绑定迷你卡展开切换");
  console.log("C4 地块迷你卡 OK");
}

// --- Task C5: 地图模式盘 ---
{
  assert.match(html, /data-mode-dial/, "地图工具应改为模式盘（data-mode-dial 当前模式按钮）");
  assert.match(html, /mode-dial/, "应有模式盘容器 mode-dial");
  assert.match(html, /mode-group/, "模式盘应按分组列出透镜 mode-group");
  assert.match(html, /class="mini-map collapsed"|mini-map collapsed/, "小地图应默认收起 collapsed");
  // 现存 10 个透镜不能丢
  for (const mode of ["political", "terrain", "population", "goods", "trade", "religion", "dynasty", "government", "estates", "military"]) {
    assert.match(html, new RegExp(`data-mode="${mode}"`), `透镜 ${mode} 应保留`);
  }
  assert.match(map, /mode-dial|modeDial/, "map.js 应处理模式盘展开/收起");
  console.log("C5 模式盘 OK");
}

// --- Task C6: 军团面板按钮图标+短文字 ---
{
  // 军团管理按钮在 dialogs.js（军团抽屉），原为纯图标，现需图标 + 短文字。
  assert.match(dialogs, /⇄\s*拆分/, "拆分按钮应为图标+文字");
  assert.match(dialogs, /✚\s*补员/, "补员按钮应为图标+文字");
  assert.match(dialogs, /⚔\s*训练/, "训练按钮应为图标+文字");
  assert.match(dialogs, /⌂\s*复员/, "复员按钮应为图标+文字");
  assert.match(dialogs, /⌖\s*规划/, "规划路线按钮应为图标+文字");
  console.log("C6 军令文字 OK");
}

// --- 抽屉数据可视化接线（widgets 全量接入五系统） ---
{
  const src = fs.readFileSync(path.join(root, "scripts", "ui", "drawers.js"), "utf8");
  assert.match(src, /const wd = \(\) => window\.HIFI_WIDGETS/, "drawers 应引用 widgets 基元");
  // 国家：雷达(统治者) / 点阵(改革) / 双向条(满意) / 量表(合法性、议会、不满)
  assert.match(src, /wd\(\)\.radar\(\[\s*\{ label: "行政"/, "统治者能力用雷达图");
  assert.match(src, /wd\(\)\.pips\(value, 5\)/, "改革槽用段位点阵");
  assert.match(src, /wd\(\)\.diverging\(estate\.satisfaction/, "阶层满意度用双向条");
  // 经济：分段(政策/关税) / 流量条(路线) / 雷达(压力)
  assert.match(src, /ui-segmented/, "贸易政策/关税用分段开关");
  assert.match(src, /wd\(\)\.radar\(Object\.entries\(country\.pressures\)/, "结构压力用雷达图");
  // 外交：态度色点 + 量表
  assert.match(src, /wd\(\)\.attitudeDot\(attitude\)/, "外交对象用态度色点");
  // 军事：军团状态 mini 量表 + 战争分数
  assert.match(src, /army\.morale.*mini: true/s, "军团用 mini 状态条");
  // 发展：科技门槛清单 + 时代进度量表 + 导师点阵
  assert.match(src, /wd\(\)\.checklist\(\[\s*\{ label: `年代/, "科技用门槛清单");
  assert.match(src, /wd\(\)\.pips\(world\.tutorial\.step, 5\)/, "导师指引用步骤点阵");
  console.log("抽屉数据可视化接线 OK");
}

console.log("hifi UI smoke contracts passed");

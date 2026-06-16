(() => {
  "use strict";

  // 游戏概念的统一说明来源（百科）。设计依据见 docs/design/19-国家机制深化设计.md。
  // 模型：地块/人口/资源（基底）→ 各种流（产出/贸易/人口/科技/信仰）→ 影响/事件；
  // 每条 entry 用「受什么影响 affectedBy」「影响什么 affects」表述机制在流模型中的位置。
  // 只有效果已经真实生效的概念才会被 UI 绑定 tooltip；法律/改革/阶层/王权的完整效果随
  // 后续阶段（doc 19 的 B–E）接入引擎后再绑定，避免展示尚未生效的影响。

  const concepts = {
    政体: {
      term: "政体",
      summary: "决定权力结构、可用的国家决议路径与阶层构成。",
      affectedBy: ["国家决议（可变更政体，如建立公民共和国）"],
      affects: ["议会是否解锁", "阶层构成", "统治者继承方式"],
    },
    统治者: {
      term: "统治者能力",
      summary: "统治者的行政 / 外交 / 军事三维，是全局行动点的主要来源。",
      affectedBy: ["继承与选举（去世 / 任期届满更替）"],
      affects: [
        "每季行政 / 外交 / 军事行动点（能力 2→2 点、4→3 点、6→4 点）",
        "军事能力 → 将领指挥；行政 → 攻城",
        "外交能力 → 外交容量",
      ],
    },
    合法性: {
      term: "合法性",
      summary: "统治的正当性，是压力层的总闸：过低会拖累全局并招致事件。",
      affectedBy: [
        "议会表决通过（+3）",
        "时代使命奖励、黑死病等情势事件",
        "政治改革推进会消耗合法性",
      ],
      affects: ["低于 55 触发「统治合法性承压」预警", "缓冲负面事件的能力"],
    },
    王权: {
      term: "王权 / 中央权威",
      summary: "中央对地方的直接控制力，决定能从产出流里直接汲取多少、被阶层截留多少。",
      affectedBy: ["国家决议（绝对主义 + / 立宪 −）", "阶层权力上升会挤压王权"],
      affects: ["集权决议的门槛", "（设计中）中央直辖产出与阶层满意的此消彼长"],
    },
    改革: {
      term: "改革槽",
      summary: "行政 / 财政 / 军事 / 政治 / 宗教 / 海事六条长期路线，逐级解锁加成与决议。",
      affectedBy: ["消耗对应资源推进（金钱 / 军需 / 合法性）"],
      affects: [
        "政治改革 → 议会支持、外交容量",
        "财政 / 政治 / 宗教改革 → 解锁对应国家决议",
        "（设计中）各级解锁产出 / 贸易 / 军需等流的加成",
      ],
    },
    法律: {
      term: "法律",
      summary: "税收 / 动员 / 宗教 / 权力四类长期制度，持续改写某条流的系数与阶层满意。",
      affectedBy: ["颁布法律消耗 1 行政点", "部分选项需要王权或改革前置"],
      affects: ["（设计中）税收→金钱产出流、动员→人口流募兵、宗教→信仰流、权力→王权与议会"],
    },
    议会: {
      term: "议会",
      summary: "代表阶层的政治机构；表决支持度由阶层满意均值、政治改革与让步决定。",
      affectedBy: ["阶层满意度均值", "政治改革等级（×5）", "让渡特权 / 收买议会等让步"],
      affects: ["支持 ≥50 通过表决并 +3 合法性", "让渡特权会抬升阶层权力"],
    },
    阶层: {
      term: "阶层：权力 / 满意度",
      summary: "各阶层的政治权力与满意度；被产出流分配喂养，又反向惩罚对应的流。",
      affectedBy: ["产出流分配（税制是否照顾该阶层）", "法律切换", "议会让步"],
      affects: [
        "满意度 → 议会支持",
        "（设计中）满意度 < −40 惩罚关联流并累积叛乱压力",
        "（设计中）权力与王权此消彼长，决定法律诉求权重",
      ],
    },
    领土整合: {
      term: "领土整合",
      summary: "对己方地块投入资源以提升控制度，控制度越高产出流越完整。",
      affectedBy: ["消耗 20 金钱 + 1 行政点"],
      affects: ["选中地块控制度 +20（上限 100，满 100 不可再整合）"],
    },
    产出流: {
      term: "产出流",
      summary: "地块按 人口 × 物产 × 控制度 ×（1 − 战争破坏）结算出的粮食 / 金钱 / 军需。",
      affectedBy: ["地块人口、控制度、战争破坏、占领", "（设计中）税收法律乘数"],
      affects: ["国库 / 粮仓 / 军需的每季增量"],
    },
  };

  // 国家决议的效果说明（与 politics.js 的 decisions.apply 对应）。
  const decisions = {
    estates_general: { term: "召开等级会议", effect: "解锁议会（等级会议），初始支持 42。" },
    fiscal_parliament: { term: "议会财政路线", effect: "税收→统一税制、权力→宪政；王权 −8。" },
    fiscal_absolutism: { term: "绝对主义财政路线", effect: "税收→统一税制、权力→绝对；王权 +10。" },
    convert_reformed: { term: "接纳宗教改革", effect: "宗教→改革宗；己方地块转为新教。" },
    constitutional_monarchy: { term: "建立君主立宪", effect: "权力→宪政；王权降至 45。" },
    civic_republic: { term: "建立公民共和国", effect: "政体变更为共和国，阶层与继承随之重置。" },
  };

  function get(key) {
    return concepts[key] || decisions[key] || null;
  }

  function toHtml(key) {
    const entry = get(key);
    if (!entry) return "";
    const lines = [];
    if (entry.summary) lines.push(`<p>${entry.summary}</p>`);
    if (entry.effect) lines.push(`<p>${entry.effect}</p>`);
    if (entry.affectedBy) lines.push(`<div class="codex-block"><strong>受什么影响</strong><ul>${entry.affectedBy.map(item => `<li>${item}</li>`).join("")}</ul></div>`);
    if (entry.affects) lines.push(`<div class="codex-block"><strong>影响什么</strong><ul>${entry.affects.map(item => `<li>${item}</li>`).join("")}</ul></div>`);
    return `<strong class="codex-title">${entry.term}</strong>${lines.join("")}`;
  }

  window.HIFI_CODEX = { concepts, decisions, get, toHtml };
})();

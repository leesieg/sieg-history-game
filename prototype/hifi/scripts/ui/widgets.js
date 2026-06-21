(() => {
  "use strict";

  // 可复用展示基元：纯函数，返回 HTML/SVG 字符串，供抽屉渲染拼装（与 estate-pie 同思路）。
  // 设计依据见 docs/design/24-hifi抽屉数据可视化方案.md。

  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  // 量表条：0–max 有界值，可选阈值刻度与色调（gold/green/red/blue）。
  function meter(value, max = 100, opts = {}) {
    const ratio = max ? clamp(value / max, 0, 1) : 0;
    const tone = opts.tone || "gold";
    const mini = opts.mini ? " ui-meter--mini" : "";
    const mark = opts.threshold != null
      ? `<i class="ui-meter-mark" style="left:${clamp(opts.threshold / max, 0, 1) * 100}%"></i>`
      : "";
    return `<span class="ui-meter ui-meter--${tone}${mini}"><span class="ui-meter-fill" style="width:${(ratio * 100).toFixed(1)}%"></span>${mark}</span>`;
  }

  // 双向条：±max（满意度类），中线为 0，正绿负红。
  function diverging(value, max = 100) {
    const ratio = max ? clamp(value / max, -1, 1) : 0;
    const half = (Math.abs(ratio) * 50).toFixed(1);
    const side = value >= 0 ? `left:50%;width:${half}%` : `right:50%;width:${half}%`;
    const cls = value >= 0 ? "pos" : "neg";
    return `<span class="ui-diverge"><span class="ui-diverge-fill ui-diverge--${cls}" style="${side}"></span></span>`;
  }

  // 段位点阵：0–max 等级。
  function pips(value, max) {
    let out = "";
    for (let i = 0; i < max; i += 1) out += `<i class="ui-pip${i < value ? " on" : ""}"></i>`;
    return `<span class="ui-pips">${out}</span>`;
  }

  // 雷达图：axes = [{ label, value, max }]，多维同量纲对比。
  function radar(axes) {
    const n = axes.length;
    const cx = 60;
    const cy = 60;
    const r = 44;
    const point = (i, frac) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + Math.cos(angle) * r * frac, cy + Math.sin(angle) * r * frac];
    };
    const ring = frac => `<polygon class="ui-radar-grid" points="${axes.map((_, i) => point(i, frac).map(v => v.toFixed(1)).join(",")).join(" ")}"/>`;
    const grid = [0.25, 0.5, 0.75, 1].map(ring).join("");
    const spokes = axes.map((_, i) => {
      const [x, y] = point(i, 1);
      return `<line class="ui-radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }).join("");
    const area = axes.map((ax, i) => point(i, ax.max ? clamp(ax.value / ax.max, 0, 1) : 0).map(v => v.toFixed(1)).join(",")).join(" ");
    const labels = axes.map((ax, i) => {
      const [x, y] = point(i, 1.2);
      return `<text class="ui-radar-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${ax.label}</text>`;
    }).join("");
    return `<svg class="ui-radar" viewBox="0 0 120 120" role="img" aria-label="雷达图">${grid}${spokes}<polygon class="ui-radar-area" points="${area}"/>${labels}</svg>`;
  }

  // 门槛清单：items = [{ label, met }]，多条件解锁可视化。
  function checklist(items) {
    return `<span class="ui-checklist">${items.map(item =>
      `<span class="ui-check${item.met ? " met" : ""}">${item.met ? "✓" : "✗"} ${item.label}</span>`
    ).join("")}</span>`;
  }

  const ATTITUDE_TONE = {
    close: "#3f8c4e",
    cooperative: "#6fa84a",
    neutral: "#b9a35a",
    wary: "#c98a3b",
    rival: "#bf6a36",
    hostile: "#b34736",
  };

  // 态度色点：亲→敌六色阶，挂在外交对象名前便于扫视。
  function attitudeDot(attitude) {
    return `<span class="ui-dot" style="background:${ATTITUDE_TONE[attitude] || "#7d7d6a"}"></span>`;
  }

  window.HIFI_WIDGETS = { meter, diverging, pips, radar, checklist, attitudeDot, ATTITUDE_TONE };
})();

(() => {
  const drawer = document.getElementById("systemDrawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerBody = document.getElementById("drawerBody");
  const seasonControl = document.getElementById("seasonControl");
  const seasonText = document.getElementById("seasonText");
  const topPending = document.getElementById("topPending");
  const toast = document.getElementById("toast");
  let toastTimer;

  const systems = {
    "国家": [["政体", "封建君主制"], ["统治者", "腓力六世"], ["家族", "瓦卢瓦"], ["合法性", "78"]],
    "经济": [["国库", "812"], ["季度收入", "+52"], ["市场中心", "巴黎"], ["建设队列", "2"]],
    "外交": [["盟友", "苏格兰"], ["主要对手", "英格兰"], ["关系容量", "4 / 5"], ["可用使节", "1"]],
    "军事": [["总兵力", "18,400"], ["可用军团", "3"], ["征召上限", "27,000"], ["战争疲惫", "0.8"]],
    "发展": [["当前研究", "行政文书"], ["研究进度", "64%"], ["改革槽", "2 / 3"], ["时代目标", "巩固王权"]]
  };

  function showToast(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function updatePending() {
    const count = document.querySelectorAll(".issue").length;
    topPending.textContent = count ? `待办 ${count} ›` : "待办已清";
    seasonText.textContent = count ? `处理待办 ${count}` : "结束季度";
    seasonControl.classList.toggle("ready", count === 0);
  }

  document.querySelectorAll(".system-button").forEach(button => {
    button.addEventListener("click", () => {
      const same = button.classList.contains("active");
      document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
      if (same) {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
        return;
      }
      button.classList.add("active");
      drawerTitle.textContent = button.dataset.system;
      drawerBody.innerHTML = systems[button.dataset.system].map(([label, value]) =>
        `<div class="drawer-row">${label}<span>${value}</span></div>`
      ).join("");
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
    });
  });

  document.getElementById("drawerClose").addEventListener("click", () => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".system-button").forEach(item => item.classList.remove("active"));
  });

  document.querySelectorAll(".issue").forEach(issue => {
    issue.addEventListener("click", () => {
      showToast(`已定位：${issue.dataset.issue}`);
      issue.remove();
      updatePending();
    });
  });

  document.getElementById("rulerPlaque").addEventListener("click", () => showToast("法兰西王国 · 腓力六世 · 瓦卢瓦家族"));
  topPending.addEventListener("click", () => showToast(`当前有 ${document.querySelectorAll(".issue").length} 项待办`));
  seasonControl.addEventListener("click", () => {
    const count = document.querySelectorAll(".issue").length;
    showToast(count ? `仍有 ${count} 项待办需要处理` : "可以进入下一季度");
  });
  document.querySelectorAll(".province-action,.command").forEach(button => {
    button.addEventListener("click", () => showToast(`已选择：${button.textContent.trim()}`));
  });
})();

(() => {
  "use strict";

  // 百科 tooltip：对带 data-codex 的概念词（下划线样式）显示统一说明。
  // 事件委托挂在 document 上，抽屉每次重渲染后自动生效，无需逐次重新绑定。
  // 桌面端 hover 预览，触屏 / 微信端点击钉住，点其它处关闭。

  function init() {
    if (window.__codexInited) return;
    window.__codexInited = true;

    const pop = document.createElement("div");
    pop.className = "codex-pop";
    pop.setAttribute("aria-hidden", "true");
    document.body.appendChild(pop);
    let pinned = false;

    function positionAt(el) {
      const rect = el.getBoundingClientRect();
      pop.style.visibility = "hidden";
      pop.classList.add("open");
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(Math.max(8, top))}px`;
      pop.style.visibility = "";
    }

    function showFor(el) {
      const html = window.HIFI_CODEX?.toHtml(el.dataset.codex);
      if (!html) return false;
      pop.innerHTML = html;
      pop.setAttribute("aria-hidden", "false");
      positionAt(el);
      return true;
    }

    function close() {
      pinned = false;
      pop.classList.remove("open");
      pop.setAttribute("aria-hidden", "true");
    }

    document.addEventListener("mouseover", event => {
      if (pinned) return;
      const term = event.target.closest("[data-codex]");
      if (!term) return;
      showFor(term);
    });
    document.addEventListener("mouseout", event => {
      if (pinned) return;
      if (event.target.closest("[data-codex]")) close();
    });
    document.addEventListener("click", event => {
      const term = event.target.closest("[data-codex]");
      if (term) {
        if (showFor(term)) {
          pinned = true;
          event.stopPropagation();
        }
        return;
      }
      if (!event.target.closest(".codex-pop")) close();
    });
    window.addEventListener("hifi:tile-selected", close);
  }

  window.HIFI_CODEX_UI = { init };
})();

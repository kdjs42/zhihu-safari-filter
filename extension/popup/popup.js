(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  const browserApi = globalThis.browser ?? globalThis.chrome;
  const store = new api.SettingsStore(browserApi);
  const $ = (id) => document.getElementById(id);
  const count = () => { $("count").textContent = `${api.parseKeywords($("keywords").value).length} 个`; };
  const show = (text, error = false) => {
    $("message").textContent = text;
    $("message").dataset.error = String(error);
  };

  async function pageStatus() {
    try {
      const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      const status = await browserApi.tabs.sendMessage(tab.id, { type: "zhf:status" });
      const refillMessages = {
        loading: "正在等待下一批推荐…", ready: "可见内容充足。", "waiting-scroll": "继续浏览，接近底部时尝试补充。",
        limit: "本轮已尝试补充 5 次，已暂停。", "no-progress": "未检测到新推荐，自动补充已暂停。",
        error: "加载异常，自动补充已暂停。", ended: "推荐已到底。"
      };
      $("refill-status").textContent = status.active && status.enabled && $("auto-refill").checked ?
        refillMessages[status.refill] || "" : "";
      $("refill-retry").hidden = !(status.active && status.enabled && $("auto-refill").checked &&
        ["limit", "no-progress", "error"].includes(status.refill));
      $("page-status").textContent = status.storageError ? "页面读取设置失败，请刷新知乎重试。" :
        !status.active ? "当前页面不在过滤范围，请打开知乎首页推荐。" :
          !status.enabled ? "过滤已暂停，页面内容已恢复。" :
            status.detected === 0 ? "尚未识别到推荐卡片，请等待加载或刷新页面。" :
              `当前页面识别 ${status.detected} 张卡片，已隐藏 ${status.blocked} 张。`;
    } catch {
      $("refill-status").textContent = "";
      $("refill-retry").hidden = true;
      $("page-status").textContent = "请打开知乎首页；首次启用需允许访问知乎并刷新页面。";
    }
  }

  $("refill-retry").addEventListener("click", async () => {
    try {
      const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true });
      await browserApi.tabs.sendMessage(tab.id, { type: "zhf:refill" });
      await pageStatus();
    } catch { show("无法连接页面，请刷新知乎后重试。", true); }
  });

  $("keywords").addEventListener("input", count);
  $("settings").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("fields").disabled = true;
    try {
      const settings = await store.save({
        enabled: $("enabled").checked,
        autoRefill: $("auto-refill").checked,
        blockAds: $("block-ads").checked,
        blockYanxuanFiction: $("block-fiction").checked,
        scope: $("scope").value,
        keywords: $("keywords").value
      });
      $("keywords").value = settings.keywords.join("\n");
      count();
      show("已保存，规则已应用到打开的知乎页面。");
      setTimeout(pageStatus, 180);
    } catch { show("保存失败，请重试。", true); }
    finally { $("fields").disabled = false; }
  });

  store.load().then((settings) => {
    $("enabled").checked = settings.enabled;
    $("auto-refill").checked = settings.autoRefill;
    $("block-ads").checked = settings.blockAds;
    $("block-fiction").checked = settings.blockYanxuanFiction;
    $("scope").value = settings.scope;
    $("keywords").value = settings.keywords.join("\n");
    count();
    $("fields").disabled = false;
    show("修改后点击保存即可生效；关闭过滤可恢复内容。");
  }).catch(() => show("无法读取设置，请重新打开扩展。", true));
  pageStatus();
  // The feed continues loading while the popup is open.
  setInterval(pageStatus, 1000);
})();

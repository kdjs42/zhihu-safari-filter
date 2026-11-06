(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  const HOST_ID = "zhihu-filter-userscript";
  if (window.top !== window || document.getElementById(HOST_ID)) return;
  if (typeof GM === "undefined" || typeof GM.getValue !== "function" || typeof GM.setValue !== "function") {
    console.warn("知乎过滤器：请使用支持 GM.getValue / GM.setValue 的 Userscripts，并允许内容脚本运行。");
    return;
  }
  const store = new api.UserscriptSettingsStore(GM, window);
  const controller = new api.FeedController({ window, store });
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;left:18px;bottom:18px;z-index:2147483647;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif";
  // The script keeps its API private; the settings UI is separate from Zhihu's DOM styles.
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = assets.panelCSS;
  const launcher = document.createElement("button");
  launcher.id = "launcher";
  launcher.type = "button";
  launcher.textContent = "过滤设置";
  launcher.setAttribute("aria-haspopup", "dialog");
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "知乎过滤器设置");
  // All HTML is a bundled, static template. Keywords only enter input values/textContent.
  dialog.innerHTML = '<button id="close-panel" type="button" aria-label="关闭设置">关闭</button><div class="panel-content">' + assets.panelHTML + '</div>';
  shadow.append(style, launcher, dialog);
  document.body.append(host);
  const $ = id => shadow.getElementById(id);
  const toggles = { enabled: "enabled", autoRefill: "auto-refill", blockAds: "block-ads", blockYanxuanFiction: "block-fiction" };
  let statusTimer = null;
  let opening = 0;
  const message = (text, error = false) => {
    $("message").textContent = text;
    $("message").dataset.error = String(error);
  };
  const count = () => { $("count").textContent = `${api.parseKeywords($("keywords").value).length} 个`; };
  const fill = settings => {
    for (const [key, id] of Object.entries(toggles)) $(id).checked = settings[key];
    $("scope").value = settings.scope;
    $("keywords").value = settings.keywords.join("\n");
    count();
  };
  const read = () => api.normalizeSettings({
    ...Object.fromEntries(Object.entries(toggles).map(([key, id]) => [key, $(id).checked])),
    scope: $("scope").value, keywords: $("keywords").value
  });
  function updateStatus() {
    const status = controller.status();
    $("page-status").textContent = !status.active ? "仅过滤电脑网页版的知乎首页推荐流。" :
      !status.enabled ? "过滤已暂停，内容已恢复。" : `已识别 ${status.detected} 张卡片，隐藏 ${status.blocked} 张。`;
    const paused = ["limit", "no-progress", "error"].includes(status.refill);
    $("refill-status").textContent = status.enabled && controller.settings.autoRefill && paused ?
      "自动补充已暂停，可重试或继续浏览。" : "";
    $("refill-retry").hidden = !(status.active && status.enabled && controller.settings.autoRefill && paused);
  }
  launcher.addEventListener("click", async () => {
    if (dialog.open) return;
    dialog.showModal();
    const request = ++opening;
    $("fields").disabled = true;
    message("正在读取设置…");
    updateStatus();
    statusTimer = window.setInterval(updateStatus, 1000);
    try {
      const settings = await store.load();
      if (!dialog.open || request !== opening) return;
      fill(settings);
      $("fields").disabled = false;
      message("修改后保存。旧插件的关键词可直接粘贴到上方。");
    } catch { if (request === opening) message("读取失败，请关闭面板后重试。", true); }
  });
  $("close-panel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    opening++;
    window.clearInterval(statusTimer);
    statusTimer = null;
    launcher.focus();
  });
  $("keywords").addEventListener("input", count);
  $("settings").addEventListener("submit", async event => {
    event.preventDefault();
    const request = opening;
    $("fields").disabled = true;
    try {
      const settings = await store.save(read());
      if (request !== opening) return;
      fill(settings);
      message("已保存；其他知乎标签页切回前台后会读取新设置。");
    } catch { if (request === opening) message("保存失败，原设置未覆盖，请重试。", true); }
    finally { if (request === opening) $("fields").disabled = false; }
  });
  $("refill-retry").addEventListener("click", () => { controller.refill.resume(); updateStatus(); });
  $("export-settings").addEventListener("click", () => {
    $("backup").value = JSON.stringify(read(), null, 2);
    $("backup").focus();
    $("backup").select();
    message("设置已导出到文本框，可复制保存。");
  });
  $("import-settings").addEventListener("click", () => {
    try {
      const value = JSON.parse($("backup").value);
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          !(typeof value.keywords === "string" || (Array.isArray(value.keywords) && value.keywords.every(word => typeof word === "string")))) {
        throw new Error("Invalid settings");
      }
      fill(api.normalizeSettings(value));
      message("已读入备份，点击“保存并应用”后生效。");
    } catch { message("备份格式不正确，请粘贴完整的设置 JSON。", true); }
  });

  const filterStyle = document.createElement("style");
  filterStyle.textContent = assets.filterCSS;
  document.head.append(filterStyle);
  let active = true;
  let startup = Promise.resolve();
  const start = () => {
    startup = startup.then(() => {
      if (active && controller.stopped) return controller.start();
    }).catch(() => {
      controller.stop();
      message("过滤器启动失败，请刷新页面重试。", true);
    });
  };
  start();
  // Release timers while a page is in the back-forward cache, restart on return.
  window.addEventListener("pagehide", () => {
    active = false;
    controller.stop();
    if (dialog.open) dialog.close();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) { active = true; start(); } });
})();

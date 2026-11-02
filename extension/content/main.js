(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  if (api.controller) return;
  const browserApi = globalThis.browser ?? globalThis.chrome;
  const controller = new api.FeedController({ window, store: new api.SettingsStore(browserApi) });
  api.controller = controller;
  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type === "zhf:refill") {
      controller.refill.resume();
      return Promise.resolve(controller.status());
    }
    if (message?.type === "zhf:status") return Promise.resolve(controller.status());
    return undefined;
  });
  controller.start().catch(() => {
    controller.stop();
    console.warn("知乎轻筛启动失败，请刷新页面后重试。");
  });
})();

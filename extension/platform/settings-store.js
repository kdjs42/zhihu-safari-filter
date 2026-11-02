(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  const KEY = "zhihuFilterSettings";

  class SettingsStore {
    constructor(browserApi = globalThis.browser ?? globalThis.chrome) {
      this.browser = browserApi;
    }
    async load() {
      const result = await this.browser.storage.local.get(KEY);
      return api.normalizeSettings(result[KEY]);
    }
    async save(settings) {
      const normalized = api.normalizeSettings(settings);
      await this.browser.storage.local.set({ [KEY]: normalized });
      return normalized;
    }
    subscribe(callback) {
      const listener = (changes, area) => {
        if (area === "local" && Object.hasOwn(changes, KEY)) {
          callback(api.normalizeSettings(changes[KEY].newValue));
        }
      };
      this.browser.storage.onChanged.addListener(listener);
      return () => this.browser.storage.onChanged.removeListener(listener);
    }
  }
  api.SettingsStore = SettingsStore;
})();

(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  const KEY = "zhihuFilterSettings";

  class UserscriptSettingsStore {
    constructor(gm, window) {
      Object.assign(this, { gm, window });
      this.listeners = new Set();
      this.current = api.normalizeSettings();
      this.fingerprint = null;
      this.generation = 0;
      this.onFocus = () => {
        if (!window.document.hidden) this.load().catch(() => {});
      };
    }

    async load() {
      // Opening the panel and starting the controller can request settings together.
      // Share that read so neither caller receives an uninitialized default value.
      if (this.loading) return this.loading;
      const generation = this.generation;
      const request = Promise.resolve().then(() => this.gm.getValue(KEY)).then(value => {
        if (generation === this.generation) this.publish(api.normalizeSettings(value));
        return this.current;
      });
      this.loading = request;
      try { return await request; }
      finally { if (this.loading === request) this.loading = null; }
    }

    publish(settings) {
      const fingerprint = JSON.stringify(settings);
      this.current = settings;
      if (fingerprint === this.fingerprint) return;
      this.fingerprint = fingerprint;
      for (const callback of this.listeners) callback(settings);
    }

    async save(settings) {
      const normalized = api.normalizeSettings(settings);
      await this.gm.setValue(KEY, normalized);
      this.generation++;
      this.publish(normalized);
      return normalized;
    }

    subscribe(callback) {
      if (!this.listeners.size) {
        this.window.addEventListener("focus", this.onFocus);
        this.window.document.addEventListener("visibilitychange", this.onFocus);
      }
      this.listeners.add(callback);
      return () => {
        this.listeners.delete(callback);
        if (!this.listeners.size) {
          this.window.removeEventListener("focus", this.onFocus);
          this.window.document.removeEventListener("visibilitychange", this.onFocus);
        }
      };
    }
  }
  api.UserscriptSettingsStore = UserscriptSettingsStore;
})();

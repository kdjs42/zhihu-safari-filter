(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  const abstain = () => ({ action: "abstain" });

  class FilterEngine {
    constructor(filters = [new api.AdFilter(), new api.YanxuanFictionFilter(), new api.KeywordFilter()], { timeoutMs = 2000 } = {}) {
      this.filters = filters;
      // Unknown/custom filters receive the complete post, including the summary.
      this.requiresFullPost = filters.some((filter) => ![api.KeywordFilter, api.AdFilter,
        api.YanxuanFictionFilter].some((Type) => filter instanceof Type));
      this.timeoutMs = timeoutMs;
    }

    async evaluate(post, settings, signal) {
      if (!settings.enabled || signal?.aborted) return abstain();
      for (const filter of this.filters) {
        if (signal?.aborted) return abstain();
        const result = await this.runFilter(filter, post, settings, signal);
        if (signal?.aborted) return abstain();
        if (result?.action === "block" || result?.action === "allow") {
          return { ...result, filterId: filter.id };
        }
      }
      return abstain();
    }

    async runFilter(filter, post, settings, signal) {
      const controller = new AbortController();
      let timer;
      let cancel;
      try {
        // Synchronous local rules need no timeout Promise or timer.
        const output = filter.evaluate(post, settings, controller.signal);
        if (!output || typeof output.then !== "function") return output;
        const cancelled = new Promise((resolve) => {
          cancel = () => { controller.abort(); resolve(abstain()); };
          signal?.addEventListener("abort", cancel, { once: true });
          if (signal?.aborted) cancel();
          timer = setTimeout(cancel, this.timeoutMs);
        });
        return await Promise.race([output, cancelled]);
      } catch {
        // A failed classifier must not make the feed disappear.
        return abstain();
      } finally {
        clearTimeout(timer);
        if (cancel) signal?.removeEventListener("abort", cancel);
        controller.abort();
      }
    }
  }
  api.FilterEngine = FilterEngine;
})();

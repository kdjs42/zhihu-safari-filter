(() => {
  "use strict";
  const api = globalThis.ZhihuFilter = globalThis.ZhihuFilter || {};
  api.normalizeText = (value) => String(value ?? "").normalize("NFKC")
    .toLowerCase().replace(/\s+/gu, " ").trim();

  api.parseKeywords = (input) => {
    const lines = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n/u);
    return [...new Set(lines.filter((line) => typeof line === "string")
      .map(api.normalizeText).filter(Boolean))];
  };

  api.normalizeSettings = (input = {}) => {
    const value = input && typeof input === "object" ? input : {};
    return {
      schemaVersion: 3,
      enabled: value.enabled !== false,
      autoRefill: value.autoRefill !== false,
      blockAds: value.blockAds !== false,
      blockYanxuanFiction: value.blockYanxuanFiction !== false,
      scope: value.scope === "title-summary" ? "title-summary" : "title",
      keywords: api.parseKeywords(value.keywords ?? [])
    };
  };
})();

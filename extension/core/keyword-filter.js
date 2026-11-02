(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;

  // Filters consume serializable data only; DOM and storage belong to other layers.
  class KeywordFilter {
    id = "keyword";

    evaluate(post, settings, signal) {
      if (signal?.aborted || !settings.enabled) return { action: "abstain" };
      const fields = [{ name: "title", text: api.normalizeText(post.title) }];
      if (settings.scope === "title-summary") {
        fields.push({ name: "summary", text: api.normalizeText(post.summary) });
      }
      for (const keyword of settings.keywords) {
        const hit = fields.find((field) => field.text.includes(keyword));
        if (hit) return {
          action: "block", filterId: this.id, keyword, field: hit.name,
          reason: `命中关键词「${keyword}」`
        };
      }
      return { action: "abstain", filterId: this.id };
    }
  }

  api.KeywordFilter = KeywordFilter;
})();

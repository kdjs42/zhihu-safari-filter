(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  class AdFilter {
    id = "advertisement";
    evaluate(post, settings, signal) {
      if (signal?.aborted || !settings.enabled || !settings.blockAds || !post.signals?.advertisement) {
        return { action: "abstain" };
      }
      return { action: "block", reason: "知乎广告标记", evidence: post.signals.adEvidence };
    }
  }
  api.AdFilter = AdFilter;
})();

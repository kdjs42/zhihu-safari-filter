(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;
  class YanxuanFictionFilter {
    id = "yanxuan-fiction";
    evaluate(post, settings, signal) {
      if (signal?.aborted || !settings.enabled || !settings.blockYanxuanFiction) return { action: "abstain" };
      // Paid content alone is not evidence of fiction.
      if (post.signals?.yanxuan && post.signals?.fiction) {
        return { action: "block", reason: "盐选小说／故事标记", evidence: post.signals.fictionEvidence };
      }
      return { action: "abstain" };
    }
  }
  api.YanxuanFictionFilter = YanxuanFictionFilter;
})();

(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;

  class ZhihuAdapter {
    // Keep site-specific selectors here. Deliberately exclude questions/search/hot/follow.
    primarySelector = ".TopstoryItem.TopstoryItem-isRecommend, .TopstoryItem--advertCard, .Card.Banner";
    cardSelector = `${this.primarySelector}, .Topstory-mainColumn [data-za-detail-view-path-is_ad]`;
    titleSelector = ".ContentItem-title";
    summarySelector = ".RichContent-inner .RichText, .RichContent-inner, .ContentItem-excerpt";

    isActive(location) {
      return location.hostname === "www.zhihu.com" &&
        ["/", "/recommend", "/recommend/"].includes(location.pathname);
    }

    closest(node) {
      const element = node.nodeType === 1 ? node : node.parentElement;
      const candidate = element?.closest(this.cardSelector);
      return candidate?.closest(".TopstoryItem.TopstoryItem-isRecommend, .TopstoryItem--advertCard") ||
        candidate?.closest(".Card.Banner") || candidate;
    }

    collectDetached(root, result = new Set()) {
      const selector = `${this.primarySelector}, [data-za-detail-view-path-is_ad]`;
      if (root.matches?.(selector)) result.add(root);
      root.querySelectorAll?.(selector).forEach((node) => result.add(node));
      return result;
    }

    collect(root, result = new Set()) {
      const element = root.nodeType === 1 ? root : root.parentElement;
      const add = (candidate) => result.add(
        candidate.closest(".TopstoryItem.TopstoryItem-isRecommend, .TopstoryItem--advertCard") ||
        candidate.closest(".Card.Banner") || candidate);
      const parentCard = element?.closest(this.cardSelector);
      if (parentCard) { add(parentCard); return result; }
      root.querySelectorAll?.(this.cardSelector).forEach(add);
      return result;
    }

    signals(card, { blockAds = true, blockYanxuanFiction = true } = {}) {
      const adEvidence = [];
      if (blockAds && (card.matches(".TopstoryItem--advertCard") || card.querySelector(".TopstoryItem--advertCard"))) {
        adEvidence.push("TopstoryItem--advertCard");
      }
      if (blockAds && (card.matches(".Card.Banner") || card.querySelector(".Card.Banner"))) adEvidence.push("Card.Banner");
      const marked = blockAds ? [card, ...card.querySelectorAll("[data-za-detail-view-path-is_ad]")] : [];
      if (marked.some((node) => ["1", "true"].includes(node.getAttribute("data-za-detail-view-path-is_ad")?.toLowerCase()))) {
        adEvidence.push("is_ad");
      }

      if (!blockYanxuanFiction) return { advertisement: adEvidence.length > 0, adEvidence };

      // Read UI badges, not story text or question titles that merely discuss novels.
      const labels = [...card.querySelectorAll("span, .ContentItem-meta, .AnswerItem-status, .AnswerItem-statusContent, [class*='KfeCollection-']")]
        .filter((node) => !node.closest(".ContentItem-title, .RichText, .RichContent-inner, .ContentItem-excerpt"))
        .map((node) => (node.textContent || "").trim()).filter((text) => text.length <= 40);
      const author = (card.querySelector(".AuthorInfo-name")?.textContent || "").trim();
      const fictionBrands = ["盐选小说", "盐选故事", "盐言故事"];
      const fictionEvidence = labels.filter((text) => fictionBrands.includes(text));
      if (fictionBrands.includes(author)) fictionEvidence.push(`作者：${author}`);
      const explicitFiction = labels.some((text) => /^(?:该内容)?(?:包含)?虚构创作[。]?$/u.test(text));
      if (explicitFiction) fictionEvidence.push("虚构创作标记");
      const brandedFiction = labels.some((text) => fictionBrands.includes(text)) || fictionBrands.includes(author);
      const paid = Boolean(card.querySelector(
        ".KfeCollection-AnswerTopCard-Container, .KfeCollection-AnswerTopCard-newContainer, .KfeCollection-PurchaseBtn, .KfeCollection-PaidAnswerFooter"
      ));
      const yanxuan = brandedFiction || paid || labels.some((text) =>
        ["盐选", "盐选专栏", "盐选会员专享", "盐选内容"].includes(text));
      return {
        advertisement: adEvidence.length > 0, adEvidence,
        yanxuan, fiction: brandedFiction || explicitFiction, fictionEvidence
      };
    }

    isFeedCard(card) {
      return card.matches(".TopstoryItem.TopstoryItem-isRecommend, .TopstoryItem--advertCard") &&
        Boolean(card.closest(".Topstory-mainColumn, .Topstory-recommend"));
    }

    feedRoot(document) {
      return document.querySelector(".Topstory-recommend") || document.querySelector(".Topstory-mainColumn");
    }

    loadControl(root) {
      // Restrict activation to a native footer button, never answer expand/retry,
      // ads, refresh-feed controls, links, or arbitrary buttons labelled 'more'.
      const controls = root.querySelectorAll(
        ".List > button, .List > div > button, .List-footer button, .List-loadMore, " +
        ":scope > button, :scope > div > button, .List-loading, .List-end, .List-error"
      );
      for (const node of controls) {
        if (node.closest(".TopstoryItem, .ContentItem, .Card.Banner") || !node.getClientRects().length) continue;
        const text = (node.textContent || "").replace(/[\s\u200b]+/gu, "");
        if (/^(?:没有更多(?:内容)?了?|已加载全部|已到底了|到底了)[。！]?$/u.test(text)) return { state: "ended" };
        if (/^(?:加载失败|网络异常|请求过于频繁|请稍后重试)/u.test(text)) return { state: "error" };
        if (/^(?:正在)?加载中[.。…]*$/u.test(text)) return { state: "busy" };
        if (node.tagName === "BUTTON" && /^(?:加载更多|查看更多内容|更多推荐)$/u.test(text)) {
          if (node.disabled || node.getAttribute("aria-disabled") === "true") return { state: "busy" };
          return { state: "ready", button: node };
        }
      }
      return { state: "ready" };
    }

    requestMore(window, { button }) {
      if (button) button.click();
      else {
        // Notify native scroll listeners after filtering changed the list height.
        // Neither scroll position nor page-owned DOM/layout is modified.
        window.dispatchEvent(new window.Event("scroll"));
      }
    }

    extract(card, settings, fullPost = true) {
      const signals = this.signals(card, fullPost ? undefined : settings);
      const titleElement = card.querySelector(this.titleSelector);
      const titleMeta = titleElement?.querySelector('meta[itemprop="name"], meta[itemprop="headline"]') ??
        card.querySelector('meta[itemprop="headline"]');
      const title = (titleMeta?.getAttribute("content") || titleElement?.textContent || "").trim();
      // Image-only advertisements and branded story cards may have no title.
      if (!title && !signals.advertisement && !(signals.yanxuan && signals.fiction)) return null;
      const link = titleElement?.querySelector("a[href]");
      let url = "";
      if (link) {
        try {
          const parsed = new URL(link.getAttribute("href"), "https://www.zhihu.com");
          if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            parsed.hash = "";
            parsed.search = "";
            url = parsed.href;
          }
        } catch { /* A malformed link should not disable title filtering. */ }
      }
      return {
        id: card.querySelector("[data-zop]")?.getAttribute("data-zop") || url || title,
        url,
        title,
        summary: fullPost || settings?.scope === "title-summary" ?
          (card.querySelector(this.summarySelector)?.textContent || "").trim() : "",
        author: fullPost ? (card.querySelector(".AuthorInfo-name")?.textContent || "").trim() : "",
        signals
      };
    }
  }
  api.ZhihuAdapter = ZhihuAdapter;
})();

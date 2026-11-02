(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;

  class Renderer {
    entries = new Map();

    apply(card, result) {
      if (result.action !== "block") { this.restore(card); return; }
      // Hide the whole card, including padding and border. No placeholder DOM.
      this.entries.set(card, { result });
      if (!card.hasAttribute("data-zhf-hidden")) card.setAttribute("data-zhf-hidden", "true");
    }

    restore(card) {
      if (card.hasAttribute("data-zhf-hidden")) card.removeAttribute("data-zhf-hidden");
      this.entries.delete(card);
    }
    restoreAll() { for (const card of this.entries.keys()) this.restore(card); }
    prune() { for (const card of this.entries.keys()) if (!card.isConnected) this.restore(card); }
  }
  api.Renderer = Renderer;
})();

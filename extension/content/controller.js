(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;

  class FeedController {
    constructor({ window, store, adapter = new api.ZhihuAdapter(),
      renderer = new api.Renderer(), engine = new api.FilterEngine() }) {
      Object.assign(this, { window, store, adapter, renderer, engine });
      this.settings = api.normalizeSettings();
      this.cards = new Set();
      this.states = new Map();
      this.pending = new Set();
      this.versions = new WeakMap();
      this.revision = 0;
      this.stopped = true;
      this.storageError = false;
      this.onRoute = () => this.checkRoute();
      this.refill = new api.FeedRefiller({ window, adapter,
        enabled: () => !this.stopped && this.settings.enabled && this.settings.autoRefill &&
          this.adapter.isActive(window.location),
        settled: () => !this.pending.size && !this.inFlight.size,
        blocked: () => this.renderer.entries.size });
      this.inFlight = new Set();
    }

    async start() {
      this.stopped = false;
      const revision = this.revision;
      this.unsubscribe = this.store.subscribe((settings) => this.setSettings(settings));
      try {
        const settings = await this.store.load();
        if (this.revision === revision) this.settings = settings;
      } catch { this.storageError = true; }
      if (this.stopped) return;
      this.route = this.window.location.pathname;
      this.observer = new this.window.MutationObserver((records) => this.onMutations(records));
      this.observer.observe(this.window.document, {
        subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
        attributeFilter: ["href", "content", "class", "data-zop", "data-za-detail-view-path-is_ad"]
      });
      this.window.addEventListener("popstate", this.onRoute);
      this.routeTimer = this.window.setInterval(this.onRoute, 500);
      this.refill.start();
      this.rescan();
    }

    onMutations(records) {
      if (!records.length || this.stopped) return;
      this.checkRoute();
      if (!this.adapter.isActive(this.window.location)) return;
      const affected = new Set();
      const added = new Set();
      const removed = new Set();
      for (const mutation of records) {
        // An append to the list affects only added branches, never the entire parent list.
        const owner = this.adapter.closest(mutation.target);
        if (owner) affected.add(owner);
        if (this.cards.has(mutation.target)) affected.add(mutation.target);
        for (const node of mutation.addedNodes) if (node.nodeType === 1) added.add(node);
        for (const node of mutation.removedNodes) if (node.nodeType === 1) removed.add(node);
        if (mutation.type === "attributes" && mutation.attributeName === "class" &&
          (mutation.target.matches(".Topstory-mainColumn") ||
            (mutation.oldValue || "").split(/\s+/u).includes("Topstory-mainColumn"))) {
          this.adapter.collect(mutation.target, affected);
          this.adapter.collectDetached(mutation.target, affected);
        }
      }
      for (const root of added) {
        let ancestor = root.parentElement;
        while (ancestor && !added.has(ancestor)) ancestor = ancestor.parentElement;
        if (!ancestor) this.adapter.collect(root, affected);
      }
      for (const root of removed) {
        // Detached selectors do not rely on an ancestor that has already disappeared.
        const candidates = this.adapter.collectDetached(root);
        if (this.cards.has(root)) candidates.add(root);
        for (const card of candidates) {
          if (!card.isConnected) this.forget(card);
          else affected.add(card); // A move may change its selector scope.
        }
      }
      for (const card of affected) this.queue(card);
      if (this.pending.size) this.schedule();
      // Also notice replacement of the site's loading control, without rescanning cards.
      this.refill.schedule();
    }

    queue(card) {
      if (!card.isConnected || !card.matches(this.adapter.cardSelector)) { this.forget(card); return; }
      const canonical = this.adapter.closest(card);
      if (canonical && canonical !== card) { this.forget(card); this.queue(canonical); return; }
      if (!this.cards.has(card)) this.refill.noteCard(card);
      this.cards.add(card);
      this.versions.set(card, (this.versions.get(card) || 0) + 1);
      this.states.get(card)?.abort.abort();
      this.pending.add(card);
    }

    forget(card) {
      this.states.get(card)?.abort.abort();
      this.states.delete(card);
      this.pending.delete(card);
      this.cards.delete(card);
      this.renderer.restore(card);
    }

    setSettings(settings) {
      this.storageError = false;
      this.settings = api.normalizeSettings(settings);
      this.revision++;
      this.reset();
      if (!this.stopped) this.rescan();
    }

    reset() {
      for (const state of this.states.values()) state.abort.abort();
      this.states.clear();
      this.pending.clear();
      this.cards.clear();
      this.inFlight.clear();
      this.renderer.restoreAll();
      this.refill.reset();
    }

    checkRoute() {
      if (this.route === this.window.location.pathname) return;
      this.route = this.window.location.pathname;
      this.reset();
      this.rescan();
    }

    rescan() {
      if (!this.adapter.isActive(this.window.location)) return;
      for (const card of this.adapter.collect(this.window.document)) this.queue(card);
      this.schedule();
    }

    schedule() {
      if (this.timer || this.stopped) return;
      this.timer = this.window.setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 32);
    }

    flush() {
      this.checkRoute();
      if (!this.adapter.isActive(this.window.location)) return;
      // Iterate only this batch, without copying or sweeping the entire feed.
      let processed = 0;
      for (const card of this.pending) {
        this.pending.delete(card);
        if (card.isConnected && card.matches(this.adapter.cardSelector)) this.evaluate(card);
        else this.forget(card);
        if (++processed === 40) break;
      }
      if (this.pending.size) this.schedule();
      this.refill.schedule();
    }

    async evaluate(card) {
      if (!this.settings.enabled) { this.renderer.restore(card); return; }
      const version = this.versions.get(card);
      const post = this.adapter.extract(card, this.settings, this.engine.requiresFullPost ?? true);
      if (!post) { this.states.delete(card); this.renderer.restore(card); return; }
      const state = { abort: new AbortController(), result: null, version };
      this.states.set(card, state);
      this.inFlight.add(state);
      try {
        const result = await this.engine.evaluate(post, this.settings, state.abort.signal);
        // Drain mutations queued earlier in this microtask turn before accepting an async result.
        this.onMutations(this.observer?.takeRecords() || []);
        if (this.stopped || state.abort.signal.aborted || this.states.get(card) !== state ||
          version !== this.versions.get(card) || !card.isConnected ||
          !this.adapter.isActive(this.window.location)) return;
        state.result = result;
        this.renderer.apply(card, result);
      } catch {
        if (this.states.get(card) === state) this.renderer.restore(card);
      } finally {
        this.inFlight.delete(state);
        this.refill.schedule();
      }
    }

    status() {
      return {
        active: this.adapter.isActive(this.window.location), enabled: this.settings.enabled,
        detected: this.cards.size, blocked: this.renderer.entries.size,
        storageError: this.storageError, refill: this.refill.status
      };
    }

    stop() {
      this.stopped = true;
      this.observer?.disconnect();
      this.unsubscribe?.();
      this.window.clearInterval(this.routeTimer);
      this.window.clearTimeout(this.timer);
      this.timer = null;
      this.window.removeEventListener("popstate", this.onRoute);
      this.refill.stop();
      this.reset();
    }
  }
  api.FeedController = FeedController;
})();

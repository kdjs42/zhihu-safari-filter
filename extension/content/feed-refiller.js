(() => {
  "use strict";
  const api = globalThis.ZhihuFilter;

  // Scheduling is independent of Zhihu's loading entry point and of the filter chain.
  class FeedRefiller {
    constructor({ window, adapter, enabled, settled, blocked,
      maxAttempts = 5, intervalMs = 1500, timeoutMs = 12000, debounceMs = 160 }) {
      Object.assign(this, { window, adapter, enabled, settled, blocked,
        maxAttempts, intervalMs, timeoutMs, debounceMs });
      this.running = false;
      this.arrivals = 0;
      this.status = "idle";
      this.onScroll = (event) => {
        // Synthetic notifications must never renew the loading budget.
        if (event.isTrusted && this.paused &&
          Math.abs(window.scrollY - this.pauseY) >= window.innerHeight / 2) this.resume();
        this.schedule();
      };
      this.onVisibility = () => {
        if (window.document.hidden) this.clearTimer();
        else this.schedule();
      };
      this.onResize = () => this.schedule();
      this.reset();
    }

    start() {
      this.running = true;
      this.window.addEventListener("scroll", this.onScroll, { passive: true });
      this.window.addEventListener("resize", this.onResize, { passive: true });
      this.window.document.addEventListener("visibilitychange", this.onVisibility);
    }

    clearTimer() { this.window.clearTimeout(this.timer); this.timer = null; }

    reset() {
      this.clearTimer();
      this.attempts = 0;
      this.waiting = null;
      this.paused = false;
      this.lastRequest = -Infinity;
      this.status = "idle";
      this.root = null;
    }

    resume() {
      this.attempts = 0;
      this.paused = false;
      // Keep an outstanding request and its timeout: retry must not overlap it.
      this.status = this.waiting ? "loading" : "idle";
      this.schedule();
    }

    noteCard(card) {
      if (this.adapter.isFeedCard(card)) {
        this.arrivals++;
        if (this.waiting) { this.clearTimer(); this.schedule(); }
      }
    }

    schedule(delay = this.debounceMs) {
      if (!this.running || this.timer || !this.enabled() || this.window.document.hidden) return;
      this.timer = this.window.setTimeout(() => {
        this.timer = null;
        this.tick();
      }, delay);
    }

    pause(reason) {
      this.paused = true;
      this.pauseY = this.window.scrollY;
      this.status = reason;
    }

    tick() {
      if (!this.running || !this.enabled() || this.window.document.hidden) return;
      const now = Date.now();
      if (this.waiting) {
        if (this.arrivals > this.waiting.arrivals) this.waiting = null;
        else if (now - this.waiting.since >= this.timeoutMs) {
          this.waiting = null;
          this.pause("no-progress");
          return;
        } else { this.schedule(Math.min(500, this.timeoutMs)); return; }
      }
      if (this.paused || !this.blocked()) return;
      if (!this.settled()) { this.schedule(); return; }
      if (!this.root?.isConnected) this.root = this.adapter.feedRoot(this.window.document);
      const root = this.root;
      if (!root || !root.getClientRects().length) return;
      const rect = root.getBoundingClientRect();
      const height = this.window.innerHeight;
      if (rect.top > height || rect.bottom < 0) return;
      // Count only space below the current viewport, not cards already read above it.
      if (rect.bottom >= height * 3) {
        this.attempts = 0;
        this.status = "ready";
        return;
      }
      if (this.attempts >= this.maxAttempts) { this.pause("limit"); return; }
      const control = this.adapter.loadControl(root);
      if (control.state === "ended" || control.state === "error") { this.pause(control.state); return; }
      if (control.state === "busy") {
        this.waiting = { since: now, arrivals: this.arrivals };
        this.status = "loading";
        this.schedule(500);
        return;
      }
      // Scroll-based loaders still enforce their own near-bottom threshold. Do not
      // pretend a synthetic scroll prefetches pages that are several screens away.
      if (!control.button && rect.bottom > height + 200) {
        this.status = "waiting-scroll";
        return;
      }
      const gap = this.intervalMs - (now - this.lastRequest);
      if (gap > 0) { this.schedule(gap); return; }
      this.attempts++;
      this.lastRequest = now;
      this.waiting = { since: now, arrivals: this.arrivals };
      this.status = "loading";
      try {
        this.adapter.requestMore(this.window, control);
      } catch {
        this.waiting = null;
        this.pause("error");
        return;
      }
      this.schedule(500);
    }

    stop() {
      this.running = false;
      this.clearTimer();
      this.window.removeEventListener("scroll", this.onScroll);
      this.window.removeEventListener("resize", this.onResize);
      this.window.document.removeEventListener("visibilitychange", this.onVisibility);
    }
  }
  api.FeedRefiller = FeedRefiller;
})();

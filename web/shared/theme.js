// shared/theme.js
// Production theme manager. Replaces the dormant Claude-Design tweaks-panel
// for the user-facing toggle. Reads the user's preference (saved or system
// default), applies it to <html data-theme>, and exposes a tiny pub/sub so
// the nav button can stay in sync across pages.

(function () {
  const KEY = 'zerocode.theme';
  const root = document.documentElement;

  function systemTheme() {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'dark' || v === 'light') return v;
    } catch {}
    return systemTheme();
  }

  function write(t) {
    try { localStorage.setItem(KEY, t); } catch {}
  }

  function apply(t) {
    root.dataset.theme = t;
    window.dispatchEvent(new CustomEvent('zerocode:theme', { detail: t }));
  }

  // Initial apply at script load (before React renders).
  apply(read());

  // React to OS-level changes if the user hasn't set an explicit preference.
  if (window.matchMedia) {
    const m = window.matchMedia('(prefers-color-scheme: light)');
    m.addEventListener?.('change', () => {
      let stored;
      try { stored = localStorage.getItem(KEY); } catch {}
      if (!stored) apply(systemTheme());
    });
  }

  window.ZeroCodeTheme = {
    get: () => root.dataset.theme || read(),
    set: (t) => { write(t); apply(t); },
    toggle: () => {
      const next = (root.dataset.theme === 'light') ? 'dark' : 'light';
      write(next); apply(next);
      return next;
    },
  };
})();

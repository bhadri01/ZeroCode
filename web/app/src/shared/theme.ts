/*
 * Theme manager — applies the user's saved or system theme to <html data-theme>
 * and exposes a tiny pub/sub via the `zerocode:theme` CustomEvent so React
 * components can stay in sync.
 *
 * Import for side effects in the app entry point (`import './shared/theme';`),
 * or call `setTheme/toggleTheme` from a settings UI.
 */

export type Theme = 'dark' | 'light';

const KEY = 'zerocode.theme';
const root = typeof document === 'undefined' ? null : document.documentElement;

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    // localStorage unavailable (private browsing, SSR, etc.)
  }
  return null;
}

function read(): Theme {
  return readStored() ?? systemTheme();
}

function write(t: Theme): void {
  try { localStorage.setItem(KEY, t); } catch { /* noop */ }
}

function apply(t: Theme): void {
  if (!root) return;
  root.dataset.theme = t;
  window.dispatchEvent(new CustomEvent('zerocode:theme', { detail: t }));
}

export function getTheme(): Theme {
  return (root?.dataset.theme as Theme | undefined) ?? read();
}

export function setTheme(t: Theme): void {
  write(t);
  apply(t);
}

export function toggleTheme(): Theme {
  const next: Theme = root?.dataset.theme === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}

if (root) {
  apply(read());

  if (window.matchMedia) {
    const m = window.matchMedia('(prefers-color-scheme: light)');
    m.addEventListener?.('change', () => {
      if (!readStored()) apply(systemTheme());
    });
  }
}

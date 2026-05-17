import { useCallback, useEffect, useState } from 'react';
import { toggleTheme, getTheme, type Theme } from '../shared/theme';
import { fetchRepoStars, formatStars } from '../shared/github';

const GITHUB_REPO = 'bhadri01/ZeroCode';

function useGitHubStars(repo: string): string | null {
  const [stars, setStars] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRepoStars(repo).then(r => {
      if (cancelled) return;
      setStars(r.stars != null ? formatStars(r.stars) : null);
    });
    return () => { cancelled = true; };
  }, [repo]);
  return stars;
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('zerocode:theme', onChange);
    return () => window.removeEventListener('zerocode:theme', onChange);
  }, []);
  const toggle = useCallback(() => { toggleTheme(); }, []);
  return [theme, toggle];
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      className="zc-theme"
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      onClick={toggle}
      title={isLight ? 'Dark mode' : 'Light mode'}
    >
      <style>{`
        .zc-theme {
          appearance: none; border: 1px solid var(--line-2); background: transparent;
          color: var(--fg-1); width: 32px; height: 32px; border-radius: 6px;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease;
        }
        .zc-theme:hover { border-color: var(--accent); color: var(--accent); background: color-mix(in oklab, var(--accent) 8%, transparent); }
        .zc-theme:active { transform: translateY(1px); }
        .zc-theme svg { display: block; }
      `}</style>
      {isLight ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13.5 10.3A6 6 0 0 1 5.7 2.5a6 6 0 1 0 7.8 7.8z"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3"/>
          <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5l-1.1-1.1"/>
        </svg>
      )}
    </button>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const stars = useGitHubStars(GITHUB_REPO);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, (y / max) * 100) : 0;
      document.documentElement.style.setProperty('--scroll', pct + '%');
      setScrolled(y > 20);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <>
    <div className="zc-scrollbar" />
    <nav className={`zc-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <style>{`
        .zc-nav {
          position: sticky; top: 0; z-index: 50;
          background: color-mix(in oklab, var(--bg) 70%, transparent);
          backdrop-filter: blur(14px) saturate(160%);
          -webkit-backdrop-filter: blur(14px) saturate(160%);
          border-bottom: 1px solid transparent;
          transition: background .2s ease, border-color .2s ease, box-shadow .2s ease;
        }
        .zc-nav.is-scrolled {
          background: color-mix(in oklab, var(--bg) 92%, transparent);
          border-bottom: 1px solid var(--line);
          box-shadow: 0 6px 30px -16px rgba(0,0,0,0.5);
        }
        .zc-nav-inner {
          max-width: var(--max-w); margin: 0 auto;
          padding: 14px var(--pad-x);
          display: flex; align-items: center; gap: 28px;
        }
        .zc-mark {
          display: flex; align-items: center; gap: 10px;
          font-family: var(--f-mono); font-size: 13.5px;
          color: var(--fg); font-weight: 500;
          letter-spacing: -0.01em;
          transition: opacity .15s ease;
        }
        .zc-mark:hover { opacity: .85; }
        .zc-mark-glyph {
          width: 18px; height: 18px;
          position: relative;
          transition: transform .3s ease;
        }
        .zc-mark:hover .zc-mark-glyph { transform: rotate(-10deg); }
        .zc-mark-glyph::before, .zc-mark-glyph::after {
          content: ''; position: absolute; inset: 0;
          border: 1.5px solid currentColor;
        }
        .zc-mark-glyph::before { transform: rotate(0deg); opacity: .35; }
        .zc-mark-glyph::after  { transform: rotate(20deg) scale(.7); color: var(--accent); }
        .zc-mark-glyph { color: var(--fg); }
        .zc-mark b { font-weight: 500; }
        .zc-mark .ver {
          font-size: 10.5px; color: var(--fg-3);
          padding: 2px 6px; border: 1px solid var(--line-2);
          border-radius: 3px; letter-spacing: 0.08em;
        }
        .zc-nav-links {
          display: flex; align-items: center; gap: 22px;
          margin-left: 8px;
          font-family: var(--f-mono); font-size: 12.5px;
          color: var(--fg-2);
          white-space: nowrap;
        }
        @media (max-width: 1080px) { .zc-nav-links { display: none; } }
        .zc-nav-links a { position: relative; transition: color .15s ease; }
        .zc-nav-links a:hover { color: var(--fg); }
        .zc-nav-links a::after {
          content: ''; position: absolute; left: 0; right: 0; bottom: -6px;
          height: 1px; background: var(--accent);
          transform: scaleX(0); transform-origin: center;
          transition: transform .2s ease;
        }
        .zc-nav-links a:hover::after { transform: scaleX(1); }
        .zc-nav-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
        .zc-star {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 10px; border: 1px solid var(--line-2);
          border-radius: 6px; font-family: var(--f-mono); font-size: 12px;
          color: var(--fg-1); transition: border-color .15s ease, color .15s ease, background .15s ease;
          background: color-mix(in oklab, var(--bg-1) 50%, transparent);
        }
        .zc-star:hover { border-color: var(--line-strong); color: var(--fg); background: color-mix(in oklab, var(--bg-2) 70%, transparent); }
        .zc-star .sep { color: var(--fg-3); }
        .zc-star .count { color: var(--accent); }
        .zc-cta-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 7px 12px; border-radius: 6px;
          background: var(--accent); color: #0a0a0a;
          font-family: var(--f-mono); font-size: 12px; font-weight: 500;
          letter-spacing: 0.02em;
          white-space: nowrap;
          transition: transform .15s ease, filter .15s ease, box-shadow .2s ease;
          box-shadow: 0 6px 16px -6px color-mix(in oklab, var(--accent) 70%, transparent);
        }
        .zc-star { white-space: nowrap; }
        .zc-cta-primary:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 10px 22px -6px color-mix(in oklab, var(--accent) 80%, transparent); }
        .zc-cta-primary:active { transform: translateY(1px); }
      `}</style>
      <div className="zc-nav-inner">
        <a className="zc-mark" href="/">
          <span className="zc-mark-glyph" />
          <b>zerocode</b>
          <span className="ver">v0.1.4</span>
        </a>
        <div className="zc-nav-links">
          <a href="#features">features</a>
          <a href="#architecture">architecture</a>
          <a href="#languages">languages</a>
          <a href="/docs/">docs</a>
          <a href="/playground.html">playground</a>
        </div>
        <div className="zc-nav-right">
          <ThemeToggle />
          <a className="zc-star" href={`https://github.com/${GITHUB_REPO}`} target="_blank" rel="noreferrer">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25l2.39 4.84 5.34.78-3.86 3.77.91 5.31L8 12.42 3.22 14.95l.91-5.31L.27 5.87l5.34-.78L8 .25z"/></svg>
            <span>github</span>
            {stars != null && <><span className="sep">·</span><span className="count">{stars}</span></>}
          </a>
          <a className="zc-cta-primary" href="/docs/">
            get started
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 5h8M5 1l4 4-4 4"/></svg>
          </a>
        </div>
      </div>
    </nav>
    </>
  );
}

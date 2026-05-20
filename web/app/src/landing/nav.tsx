import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Close the mobile menu on outside click / Escape / route change.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.zc-nav') && !t.closest('.zc-nav-mobile-sheet')) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);
  return (
    <>
    <div className="zc-scrollbar" />
    <motion.nav
      className={`zc-nav ${scrolled ? 'is-scrolled' : ''}`}
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
    >
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
          width: 22px; height: 22px;
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--fg);
          transition: transform .35s cubic-bezier(.22,.61,.36,1);
        }
        .zc-mark:hover .zc-mark-glyph { transform: rotate(-22.5deg); }
        .zc-mark-glyph svg { width: 100%; height: 100%; display: block; }
        .zc-mark-glyph .frame { stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
        .zc-mark-glyph .core  { fill: var(--accent); transition: fill .25s ease; }
        .zc-mark b { font-weight: 500; }
        .zc-nav-links {
          display: flex; align-items: center; gap: 22px;
          margin-left: 8px;
          font-family: var(--f-mono); font-size: 12.5px;
          color: var(--fg-2);
          white-space: nowrap;
        }
        @media (max-width: 920px) { .zc-nav-links { display: none; } }
        @media (max-width: 480px) {
          .zc-star span:not(.sep):not(.count) { display: none; }
          .zc-cta-primary span.cta-label { display: none; }
        }

        /* Mobile menu toggle — shown only when the inline links hide. */
        .zc-nav-burger {
          display: none;
          appearance: none; background: transparent;
          border: 1px solid var(--line-2); border-radius: 6px;
          width: 36px; height: 36px; padding: 0;
          align-items: center; justify-content: center;
          color: var(--fg-1); cursor: pointer;
          transition: border-color .15s ease, color .15s ease, background .15s ease;
        }
        .zc-nav-burger:hover { border-color: var(--accent); color: var(--accent); }
        .zc-nav-burger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        @media (max-width: 920px) { .zc-nav-burger { display: inline-flex; } }

        /* Full-screen menu sheet (only mounts when open). */
        .zc-nav-mobile-sheet {
          position: fixed; inset: 56px 0 0 0; z-index: 49;
          background: color-mix(in oklab, var(--bg) 96%, transparent);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          padding: 24px clamp(20px, 5vw, 32px);
          display: flex; flex-direction: column; gap: 4px;
          animation: zc-sheet-in 180ms ease;
        }
        @keyframes zc-sheet-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .zc-nav-mobile-sheet a {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 8px;
          font-family: var(--f-mono); font-size: 16px;
          color: var(--fg-1); text-decoration: none;
          border-bottom: 1px solid var(--line);
          min-height: 48px;
          transition: color .15s ease;
        }
        .zc-nav-mobile-sheet a:hover { color: var(--accent); }
        .zc-nav-mobile-sheet a .arrow { color: var(--fg-3); }
        .zc-nav-mobile-sheet .cta {
          margin-top: 16px;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 14px 18px; border-radius: 8px;
          background: var(--accent); color: #0a0a0a;
          font: 500 14px var(--f-sans);
          text-decoration: none;
          min-height: 48px;
          border: 0;
        }
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
        <a className="zc-mark" href="/" aria-label="ZeroCode home">
          <span className="zc-mark-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img">
              <path className="frame" d="M9 3 H15 L21 9 V15 L15 21 H9 L3 15 V9 Z"/>
              <circle className="core" cx="12" cy="12" r="2.4"/>
            </svg>
          </span>
          <b>zerocode</b>
        </a>
        <div className="zc-nav-links">
          <a href="#isolation">isolation</a>
          <a href="#how">how it works</a>
          <a href="#languages">languages</a>
          <a href="#batch">test cases</a>
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
          <a className="zc-cta-primary" href="/docs/quickstart">
            <span className="cta-label">get started</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 5h8M5 1l4 4-4 4"/></svg>
          </a>
          <button
            type="button"
            className="zc-nav-burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 5h12M3 9h12M3 13h12"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </motion.nav>
    {/* The sheet MUST live outside <nav>: the nav has backdrop-filter, which
        per CSS spec makes it the containing block for fixed-position
        descendants. Inside the nav, `inset: 56px 0 0 0` was being measured
        against the ~56px-tall nav itself, collapsing the sheet to zero height
        — it was "open" in state but invisible on screen. */}
    {menuOpen && (
      <div className="zc-nav-mobile-sheet" role="menu">
        <a href="#isolation" onClick={() => setMenuOpen(false)}>isolation<span className="arrow">→</span></a>
        <a href="#how" onClick={() => setMenuOpen(false)}>how it works<span className="arrow">→</span></a>
        <a href="#languages" onClick={() => setMenuOpen(false)}>languages<span className="arrow">→</span></a>
        <a href="#batch" onClick={() => setMenuOpen(false)}>test cases<span className="arrow">→</span></a>
        <a href="/docs/" onClick={() => setMenuOpen(false)}>docs<span className="arrow">→</span></a>
        <a href="/playground.html" onClick={() => setMenuOpen(false)}>playground<span className="arrow">→</span></a>
        <a href={`https://github.com/${GITHUB_REPO}`} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>github<span className="arrow">↗</span></a>
        <a className="cta" href="/docs/quickstart" onClick={() => setMenuOpen(false)}>get started →</a>
      </div>
    )}
    </>
  );
}

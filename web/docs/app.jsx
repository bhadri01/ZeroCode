// docs/app.jsx
// Docs shell: top nav · left sidebar · scrollable content · right TOC.

const { useState, useEffect, useRef } = React;

const PAGES = [
  { section: 'getting started', items: [
    { id: 'quickstart',  name: 'Quickstart' },
  ]},
  { section: 'reference', items: [
    { id: 'api',         name: 'REST API reference' },
    { id: 'grpc',        name: 'gRPC API reference' },
    { id: 'languages',   name: 'Language catalog' },
  ]},
  { section: 'operations', items: [
    { id: 'architecture',name: 'Architecture' },
    { id: 'deployment',  name: 'Deployment' },
    { id: 'observability',name: 'Observability' },
  ]},
  { section: 'security', items: [
    { id: 'security',    name: 'Threat model' },
  ]},
  { section: 'updates', items: [
    { id: 'changelog',   name: 'Changelog' },
  ]},
];

// Map docs page id → source-of-truth file in the repo, for the "Edit on GitHub"
// link in the right TOC. Pages with no markdown source (auto-generated ones)
// point at the JSX article so contributors land somewhere actionable.
const GITHUB_ROOT = 'https://github.com/zerocode-rs/zerocode/edit/main/';
const SOURCE_FOR_PAGE = {
  quickstart:    'README.md',
  api:           'web/docs/content.jsx',
  grpc:          'crates/zerocode-api/proto/zerocode.proto',
  languages:     'runners/languages.toml',
  architecture:  'docs/ARCHITECTURE.md',
  deployment:    'docs/DEPLOY.md',
  observability: 'web/docs/content.jsx',
  security:      'docs/THREAT_MODEL.md',
  changelog:     'CHANGELOG.md',
};

function findPage(id) {
  for (const s of PAGES) for (const i of s.items) if (i.id === id) return i;
  return null;
}

function TopNav({ onSearchFocus }) {
  return (
    <nav className="dc-nav">
      <style>{`
        .dc-nav {
          display: flex; align-items: center; gap: 18px;
          padding: 10px 22px;
          border-bottom: 1px solid var(--line);
          background: var(--bg-1);
          flex-shrink: 0;
        }
        .dc-mark { display: flex; align-items: center; gap: 10px; font-family: var(--f-mono); font-size: 13px; font-weight: 500; color: var(--fg); }
        .dc-mark .g { width: 16px; height: 16px; position: relative; }
        .dc-mark .g::before, .dc-mark .g::after { content: ''; position: absolute; inset: 0; border: 1.5px solid currentColor; }
        .dc-mark .g::before { opacity: .35; }
        .dc-mark .g::after { transform: rotate(20deg) scale(.7); color: var(--accent); }
        .dc-mark .docs {
          margin-left: 4px; padding: 2px 6px;
          border: 1px solid var(--line-2); border-radius: 4px;
          font-size: 10.5px; letter-spacing: 0.08em; color: var(--fg-2);
        }
        .dc-nav-links {
          display: flex; gap: 22px; margin-left: 18px;
          font-family: var(--f-mono); font-size: 12.5px; color: var(--fg-2);
        }
        .dc-nav-links a:hover { color: var(--fg); }
        .dc-search {
          margin-left: auto; position: relative;
          width: 360px;
        }
        .dc-search input {
          width: 100%; appearance: none; border: 1px solid var(--line-2);
          background: var(--bg); color: var(--fg);
          padding: 7px 36px 7px 30px; border-radius: 6px;
          font: 12.5px var(--f-mono); outline: none;
        }
        .dc-search input::placeholder { color: var(--fg-3); }
        .dc-search input:focus { border-color: var(--accent); }
        .dc-search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--fg-3); }
        .dc-search .kbd {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          font: 10px var(--f-mono); color: var(--fg-3);
          padding: 2px 5px; border: 1px solid var(--line-2); border-radius: 3px;
        }
        .dc-nav-right { display: flex; gap: 14px; align-items: center; font-family: var(--f-mono); font-size: 12px; color: var(--fg-2); }
        .dc-nav-right a:hover { color: var(--fg); }
      `}</style>
      <a className="dc-mark" href="index.html">
        <span className="g"/>zerocode<span className="docs">docs</span>
      </a>
      <div className="dc-nav-links">
        <a href="index.html">home</a>
        <a href="playground.html">playground</a>
        <a href="#">blog</a>
      </div>
      <div className="dc-search" onClick={onSearchFocus}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/></svg>
        <input placeholder="search the docs · jump to a symbol …" />
        <span className="kbd">⌘K</span>
      </div>
      <div className="dc-nav-right">
        <a href="#">v0.1.4</a>
        <a href="#">github</a>
      </div>
    </nav>
  );
}

function Sidebar({ page, setPage }) {
  return (
    <aside className="dc-side">
      <style>{`
        .dc-side {
          width: 260px; flex-shrink: 0;
          border-right: 1px solid var(--line);
          padding: 24px 18px 24px 24px;
          overflow-y: auto;
          background: var(--bg);
        }
        .dc-side h5 {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.16em; text-transform: uppercase;
          margin: 22px 0 6px;
        }
        .dc-side h5:first-child { margin-top: 0; }
        .dc-side ul { list-style: none; margin: 0; padding: 0; }
        .dc-side button {
          appearance: none; border: 0; background: transparent; cursor: pointer;
          width: 100%; text-align: left;
          padding: 6px 10px; border-radius: 6px;
          font-family: var(--f-sans); font-size: 13.5px;
          color: var(--fg-2);
          transition: background .12s ease, color .12s ease;
        }
        .dc-side button:hover { color: var(--fg); background: var(--bg-1); }
        .dc-side button.active {
          color: var(--accent);
          background: color-mix(in oklab, var(--accent) 12%, var(--bg-1));
          font-weight: 500;
          border-left: 2px solid var(--accent);
          padding-left: 8px;
        }
      `}</style>
      {PAGES.map(s => (
        <React.Fragment key={s.section}>
          <h5>{s.section}</h5>
          <ul>
            {s.items.map(it => (
              <li key={it.id}>
                <button className={page === it.id ? 'active' : ''} onClick={() => setPage(it.id)}>{it.name}</button>
              </li>
            ))}
          </ul>
        </React.Fragment>
      ))}
    </aside>
  );
}

function Breadcrumb({ page }) {
  const p = findPage(page);
  const section = PAGES.find(s => s.items.find(i => i.id === page))?.section || '';
  return (
    <div className="dc-crumb">
      <style>{`
        .dc-crumb {
          display: flex; align-items: center; gap: 10px;
          font-family: var(--f-mono); font-size: 11px;
          color: var(--fg-3); letter-spacing: 0.04em;
          padding-bottom: 18px;
          flex-wrap: wrap;
        }
        .dc-crumb > * { white-space: nowrap; }
        .dc-crumb a { color: var(--fg-2); }
        .dc-crumb a:hover { color: var(--fg); }
        .dc-crumb .arr { color: var(--fg-4); }
        .dc-crumb .edit {
          margin-left: auto;
          display: inline-flex; align-items: center; gap: 6px;
          color: var(--fg-2); border: 1px solid var(--line-2);
          padding: 4px 8px; border-radius: 4px;
        }
        .dc-crumb .edit:hover { color: var(--accent); border-color: var(--accent); }
      `}</style>
      <a href="#">docs</a>
      <span className="arr">›</span>
      <a href="#">{section}</a>
      <span className="arr">›</span>
      <span style={{ color: 'var(--fg-1)' }}>{p?.name}</span>
      <a className="edit" href="#">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 11l3-1 7-7-2-2-7 7-1 3z"/></svg>
        edit on github
      </a>
    </div>
  );
}

function ContentPane({ page }) {
  const Article = Articles[page];
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [page]);
  return (
    <main className="dc-content" ref={ref}>
      <style>{`
        .dc-content {
          flex: 1; min-width: 0; overflow-y: auto;
          padding: 28px 56px 96px;
          scroll-behavior: smooth;
        }
        .dc-content-inner { max-width: 800px; }
      `}</style>
      <div className="dc-content-inner">
        <Breadcrumb page={page} />
        {Article ? <Article.body /> : <p>missing</p>}
        <PrevNextNav page={page} />
      </div>
    </main>
  );
}

function PrevNextNav({ page }) {
  const flat = PAGES.flatMap(s => s.items);
  const idx = flat.findIndex(p => p.id === page);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx < flat.length - 1 ? flat[idx + 1] : null;
  return (
    <nav className="dc-pnn">
      <style>{`
        .dc-pnn {
          margin-top: 56px; padding-top: 24px;
          border-top: 1px solid var(--line);
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        }
        .dc-pnn a {
          padding: 14px 18px; border: 1px solid var(--line);
          border-radius: 8px;
          display: flex; flex-direction: column; gap: 4px;
          transition: border-color .15s ease;
        }
        .dc-pnn a:hover { border-color: var(--accent); }
        .dc-pnn .lbl { font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.12em; text-transform: uppercase; }
        .dc-pnn .nm { color: var(--fg); font-size: 16px; font-family: var(--f-display); }
        .dc-pnn .next { text-align: right; }
      `}</style>
      {prev && (
        <a href="#" onClick={(e) => { e.preventDefault(); window.__setPage?.(prev.id); }}>
          <span className="lbl">← previous</span>
          <span className="nm">{prev.name}</span>
        </a>
      ) || <span/>}
      {next && (
        <a className="next" href="#" onClick={(e) => { e.preventDefault(); window.__setPage?.(next.id); }}>
          <span className="lbl">next →</span>
          <span className="nm">{next.name}</span>
        </a>
      )}
    </nav>
  );
}

function TocPane({ page }) {
  const toc = Articles[page]?.toc || [];
  const [active, setActive] = useState(toc[0]?.id);
  useEffect(() => { setActive(toc[0]?.id); }, [page]);

  // basic intersection-observer-driven active highlighter
  useEffect(() => {
    const ids = ['top', ...toc.map(t => t.id)];
    const els = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (els.length === 0) return;
    const obs = new IntersectionObserver((entries) => {
      const v = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (v.length) setActive(v[0].target.id);
    }, { root: document.querySelector('.dc-content'), rootMargin: '0px 0px -70% 0px' });
    els.forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, [page, toc]);

  return (
    <aside className="dc-toc">
      <style>{`
        .dc-toc {
          width: 240px; flex-shrink: 0;
          border-left: 1px solid var(--line);
          padding: 28px 22px 28px 22px;
          overflow-y: auto;
          background: var(--bg);
        }
        .dc-toc h6 {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.16em; text-transform: uppercase;
          margin: 0 0 12px;
        }
        .dc-toc ul { list-style: none; margin: 0; padding: 0; }
        .dc-toc a {
          display: block; padding: 4px 0 4px 12px;
          color: var(--fg-2); font-size: 13px;
          border-left: 1px solid var(--line);
          transition: color .12s ease, border-color .12s ease;
        }
        .dc-toc a:hover { color: var(--fg); }
        .dc-toc a.active {
          color: var(--accent);
          border-left-color: var(--accent);
        }
        .dc-toc .meta {
          margin-top: 24px; padding-top: 16px;
          border-top: 1px dashed var(--line);
          font-family: var(--f-mono); font-size: 11px;
          color: var(--fg-3);
          display: flex; flex-direction: column; gap: 8px;
        }
        .dc-toc .meta a { padding: 0; border: 0; color: var(--fg-1); }
        .dc-toc .meta a:hover { color: var(--accent); }
      `}</style>
      <h6>on this page</h6>
      <ul>
        {toc.map(t => (
          <li key={t.id}>
            <a className={active === t.id ? 'active' : ''}
               href={`#${t.id}`}
               onClick={(e) => {
                 e.preventDefault();
                 document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
               }}>{t.name}</a>
          </li>
        ))}
      </ul>
      <div className="meta">
        <a href={`${GITHUB_ROOT}${SOURCE_FOR_PAGE[page] || 'README.md'}`} target="_blank" rel="noreferrer">↗ edit on github</a>
        <a href="https://github.com/zerocode-rs/zerocode/issues/new" target="_blank" rel="noreferrer">↗ open an issue</a>
        <a href="https://discord.gg/zerocode" target="_blank" rel="noreferrer">↗ discord · #docs</a>
      </div>
    </aside>
  );
}

/* ─── ⌘K search palette ──────────────────────────────────────────── */

// Flat search index built once on mount. Includes every page + every TOC entry
// (so users can jump to a specific section, not just a page). No third-party
// fuzzy matcher — a small token-aware scorer is enough for ~60 entries.
function buildSearchIndex() {
  const entries = [];
  for (const s of PAGES) {
    for (const it of s.items) {
      entries.push({ kind: 'page', id: it.id, name: it.name, section: s.section, hash: `#/${it.id}` });
      const art = (typeof window !== 'undefined') && window.Articles?.[it.id];
      if (art?.toc) {
        for (const t of art.toc) {
          entries.push({ kind: 'section', id: it.id, name: t.name, section: it.name, hash: `#/${it.id}#${t.id}` });
        }
      }
    }
  }
  return entries;
}

function scoreEntry(e, q) {
  if (!q) return 0;
  const hay = (e.name + ' ' + e.section).toLowerCase();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of tokens) {
    const idx = hay.indexOf(t);
    if (idx < 0) return -1;
    score += 100 - idx;
    if (e.name.toLowerCase().startsWith(t)) score += 50;
  }
  if (e.kind === 'page') score += 10;
  return score;
}

function SearchPalette({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const index = React.useMemo(() => buildSearchIndex(), []);
  const results = React.useMemo(() => {
    if (!q.trim()) return index.slice(0, 10);
    return index.map(e => ({ e, s: scoreEntry(e, q) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(x => x.e);
  }, [q, index]);

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[active];
        if (r) { onPick(r); onClose(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, active, onClose, onPick]);

  if (!open) return null;
  return (
    <div className="dc-pal" onClick={onClose}>
      <style>{`
        .dc-pal {
          position: fixed; inset: 0; z-index: 100;
          background: color-mix(in oklab, var(--bg) 70%, transparent);
          backdrop-filter: blur(8px) saturate(140%);
          -webkit-backdrop-filter: blur(8px) saturate(140%);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 14vh;
        }
        .dc-pal-box {
          width: min(640px, calc(100vw - 40px));
          border: 1px solid var(--line-2);
          background: var(--surface);
          border-radius: 12px;
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6);
          overflow: hidden;
        }
        .dc-pal-input {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--line);
        }
        .dc-pal-input svg { color: var(--fg-3); flex-shrink: 0; }
        .dc-pal-input input {
          flex: 1; appearance: none; border: 0; background: transparent;
          color: var(--fg); font-family: var(--f-mono); font-size: 14px;
          outline: none; min-width: 0;
        }
        .dc-pal-input input::placeholder { color: var(--fg-3); }
        .dc-pal-input .esc {
          font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3);
          border: 1px solid var(--line-2); padding: 2px 7px; border-radius: 4px;
          letter-spacing: 0.06em;
        }
        .dc-pal-results { max-height: 60vh; overflow-y: auto; padding: 6px; }
        .dc-pal-row {
          display: grid; grid-template-columns: 24px 1fr auto; gap: 10px;
          padding: 10px 12px; border-radius: 8px; cursor: pointer;
          align-items: center;
          transition: background .12s ease;
        }
        .dc-pal-row:hover, .dc-pal-row.active { background: var(--bg-2); }
        .dc-pal-row .ic { color: var(--fg-3); }
        .dc-pal-row.active .ic { color: var(--accent); }
        .dc-pal-row .nm { color: var(--fg); font-size: 14px; }
        .dc-pal-row .nm .sec { color: var(--fg-3); font-family: var(--f-mono); font-size: 11px; margin-left: 8px; }
        .dc-pal-row .ent {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.06em;
        }
        .dc-pal-empty {
          padding: 28px 18px; text-align: center;
          color: var(--fg-3); font-family: var(--f-mono); font-size: 12.5px;
        }
        .dc-pal-foot {
          border-top: 1px solid var(--line); padding: 8px 14px;
          display: flex; gap: 12px;
          font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3);
          letter-spacing: 0.06em;
        }
        .dc-pal-foot kbd {
          font-family: var(--f-mono); border: 1px solid var(--line-2);
          padding: 1px 5px; border-radius: 3px; color: var(--fg-2);
        }
      `}</style>
      <div className="dc-pal-box" onClick={(e) => e.stopPropagation()}>
        <div className="dc-pal-input">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5"/><path d="m9.5 9.5 3 3"/>
          </svg>
          <input
            ref={inputRef}
            type="search"
            placeholder="search pages, sections, symbols…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="esc">esc</span>
        </div>
        <div className="dc-pal-results">
          {results.length === 0 ? (
            <div className="dc-pal-empty">no results · try “sandbox”, “grpc”, “seccomp”, “cgroup”</div>
          ) : results.map((r, i) => (
            <div key={r.hash + i}
                 className={`dc-pal-row ${i === active ? 'active' : ''}`}
                 onMouseEnter={() => setActive(i)}
                 onClick={() => { onPick(r); onClose(); }}>
              <span className="ic">{r.kind === 'page' ? '◆' : '§'}</span>
              <span className="nm">{r.name}<span className="sec">{r.section}</span></span>
              <span className="ent">↵</span>
            </div>
          ))}
        </div>
        <div className="dc-pal-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const getInitialPage = () => {
    const id = location.hash.replace(/^#\/?/, '').split('#')[0];
    return findPage(id) ? id : 'quickstart';
  };
  const [page, setPage] = useState(getInitialPage);
  const [palOpen, setPalOpen] = useState(false);
  useEffect(() => { window.__setPage = setPage; }, []);
  // also support back/forward via hashchange
  useEffect(() => {
    const onHash = () => {
      const id = location.hash.replace(/^#\/?/, '').split('#')[0];
      if (findPage(id) && id !== page) setPage(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [page]);
  useEffect(() => { if (location.hash !== '#/' + page) location.hash = '#/' + page; }, [page]);

  // ⌘K / Ctrl+K to open palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handlePick(r) {
    // hash drives both the page and the in-page section
    location.hash = r.hash;
  }

  return (
    <>
      <TopNav onSearchFocus={() => setPalOpen(true)} />
      <div className="dc-main">
        <style>{`
          .dc-main { flex: 1; min-height: 0; display: flex; background: var(--bg); }
        `}</style>
        <Sidebar page={page} setPage={setPage} />
        <ContentPane page={page} />
        <TocPane page={page} />
      </div>
      <SearchPalette open={palOpen} onClose={() => setPalOpen(false)} onPick={handlePick} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);

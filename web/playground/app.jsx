// playground/app.jsx
// ZeroCode Code Space — fake-real playground.

const { useState, useEffect, useRef, useMemo } = React;

/* ─── Top nav (slim variant) ──────────────────────────────────────── */
function TopNav({ token, status }) {
  return (
    <nav className="pg-nav">
      <style>{`
        .pg-nav {
          display: flex; align-items: center; gap: 18px;
          padding: 10px 18px;
          border-bottom: 1px solid var(--line);
          background: var(--bg-1);
          flex-shrink: 0;
        }
        .pg-mark { display: flex; align-items: center; gap: 10px; font-family: var(--f-mono); font-size: 13px; font-weight: 500; color: var(--fg); }
        .pg-mark .g { width: 16px; height: 16px; position: relative; }
        .pg-mark .g::before, .pg-mark .g::after { content: ''; position: absolute; inset: 0; border: 1.5px solid currentColor; }
        .pg-mark .g::before { opacity: .35; }
        .pg-mark .g::after { transform: rotate(20deg) scale(.7); color: var(--accent); }
        .pg-divider { width: 1px; height: 18px; background: var(--line); }
        .pg-crumb { font-family: var(--f-mono); font-size: 12px; color: var(--fg-2); }
        .pg-crumb b { color: var(--fg); font-weight: 500; }
        .pg-nav-right { margin-left: auto; display: flex; gap: 12px; align-items: center; font-family: var(--f-mono); font-size: 11.5px; color: var(--fg-3); }
        .pg-nav-right a { color: var(--fg-2); }
        .pg-nav-right a:hover { color: var(--fg); }
        .pg-tok {
          padding: 3px 8px; border: 1px solid var(--line-2); border-radius: 4px;
          color: var(--fg-1); letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .pg-nav-right > * { white-space: nowrap; }
        @media (max-width: 760px) {
          .pg-nav { flex-wrap: wrap; row-gap: 6px; padding: 10px 12px; }
          .pg-nav-right { width: 100%; margin-left: 0; }
          .pg-crumb { font-size: 11.5px; }
        }
      `}</style>
      <a className="pg-mark" href="index.html"><span className="g"/>zerocode</a>
      <div className="pg-divider"/>
      <span className="pg-crumb">code space · <b>untitled.rs</b></span>
      <div className="pg-nav-right">
        <a href="index.html">home</a>
        <span>·</span>
        <a href="docs.html">docs</a>
        <span>·</span>
        <span className="pg-tok">token · {token}</span>
      </div>
    </nav>
  );
}

/* ─── Language picker (left rail) ─────────────────────────────────── */
function LanguagePicker({ selected, onSelect, history }) {
  const [q, setQ] = useState('');
  const filtered = LANGS.filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || String(l.id).includes(q));
  const core = filtered.filter(l => l.core);
  const rest = filtered.filter(l => !l.core);
  return (
    <aside className="pg-rail">
      <style>{`
        .pg-rail {
          width: 260px; flex-shrink: 0;
          border-right: 1px solid var(--line);
          background: var(--bg);
          display: flex; flex-direction: column;
          min-height: 0;
        }
        @media (max-width: 880px) {
          .pg-rail {
            width: 100%;
            max-height: 220px;
            border-right: 0;
            border-bottom: 1px solid var(--line);
          }
        }
        .pg-rail-hd {
          padding: 14px 16px 8px;
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.14em; text-transform: uppercase;
          display: flex; justify-content: space-between; align-items: center;
        }
        .pg-rail-hd .count { color: var(--accent); }
        .pg-rail-search {
          margin: 0 12px 8px; position: relative;
        }
        .pg-rail-search input {
          width: 100%; appearance: none; border: 1px solid var(--line-2);
          background: var(--bg-1); color: var(--fg);
          padding: 7px 10px 7px 28px; border-radius: 6px;
          font: 12.5px var(--f-mono); outline: none;
        }
        .pg-rail-search input::placeholder { color: var(--fg-3); }
        .pg-rail-search input:focus { border-color: var(--line-strong); }
        .pg-rail-search svg {
          position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
          color: var(--fg-3);
        }
        .pg-rail-list { flex: 1; overflow-y: auto; padding: 4px 8px 16px; min-height: 0; }
        .pg-rail-section {
          padding: 12px 8px 6px;
          font-family: var(--f-mono); font-size: 10px; color: var(--fg-3);
          letter-spacing: 0.16em; text-transform: uppercase;
          display: flex; align-items: center; gap: 8px;
        }
        .pg-rail-section::after { content: ''; flex: 1; height: 1px; background: var(--line); }
        .pg-row {
          appearance: none; border: 0; width: 100%; text-align: left;
          padding: 8px 10px; border-radius: 6px;
          background: transparent;
          display: flex; align-items: center; gap: 10px;
          color: var(--fg-1); cursor: pointer;
          transition: background .12s ease, color .12s ease;
        }
        .pg-row:hover { background: var(--bg-1); }
        .pg-row.active { background: color-mix(in oklab, var(--accent) 12%, var(--bg-1)); color: var(--fg); }
        .pg-row.active .id { color: var(--accent); }
        .pg-row .name { font-size: 13px; flex: 1; }
        .pg-row .v {
          font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.02em;
        }
        .pg-row .id {
          font-family: var(--f-mono); font-size: 10px; color: var(--fg-4);
          padding: 1px 4px; border-radius: 3px;
        }
        .pg-row .dot {
          width: 8px; height: 8px; border-radius: 2px;
          background: var(--accent-mark, var(--fg-3));
        }
        .pg-rail-hist {
          border-top: 1px solid var(--line);
          padding: 12px 16px;
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-2);
          flex-shrink: 0;
        }
        .pg-rail-hist .h {
          font-size: 10px; color: var(--fg-3);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 6px;
        }
        .pg-rail-hist .hr {
          display: flex; justify-content: space-between;
          padding: 4px 0; color: var(--fg-1);
          border-top: 1px dashed var(--line);
        }
        .pg-rail-hist .hr:first-child { border-top: 0; }
        .pg-rail-hist .hr .t { color: var(--fg-3); }
        .pg-rail-hist .hr .ok { color: var(--st-accepted); }
        .pg-rail-hist .hr .tle { color: var(--st-tle); }
        .pg-rail-hist .hr .re { color: var(--st-re); }
      `}</style>
      <div className="pg-rail-hd">
        <span>languages</span>
        <span className="count">{LANGS.length}</span>
      </div>
      <div className="pg-rail-search">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/></svg>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search 41 langs · by name or id" />
      </div>
      <div className="pg-rail-list">
        {core.length > 0 && <div className="pg-rail-section">core 7</div>}
        {core.map(l => (
          <button key={`c-${l.id}`} className={`pg-row ${selected.id === l.id ? 'active' : ''}`} onClick={() => onSelect(l)}>
            <span className="dot" style={{ background: l.accent }}/>
            <span className="name">{l.name}</span>
            <span className="v">{l.version}</span>
            <span className="id">{l.id}</span>
          </button>
        ))}
        {rest.length > 0 && <div className="pg-rail-section">+ {rest.length} more</div>}
        {rest.map(l => (
          <button key={`r-${l.id}-${l.name}`} className={`pg-row ${selected.id === l.id && selected.name === l.name ? 'active' : ''}`} onClick={() => onSelect(l)}>
            <span className="dot" style={{ background: 'var(--fg-4)' }}/>
            <span className="name">{l.name}</span>
            <span className="v">{l.version}</span>
            <span className="id">{l.id}</span>
          </button>
        ))}
      </div>
      <div className="pg-rail-hist">
        <div className="h">history · session</div>
        {history.length === 0 && <div className="hr"><span className="t">no runs yet</span></div>}
        {history.map((h, i) => (
          <div key={i} className="hr">
            <span>{h.name}</span>
            <span className={h.verdict === 'accepted' ? 'ok' : h.verdict === 'tle' ? 'tle' : 're'}>{h.verdict} · {h.time.toFixed(3)}s</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ─── Workspace bar (file tabs + run + limits + share) ─────────────── */
function WorkspaceBar({ lang, status, statusDetail, onRun, onCancel, onReset, limits, setLimits, ceilings, apiOnline, apiAuthed, onShare, onOpenSettings, showApi, setShowApi }) {
  const [showLimits, setShowLimits] = useState(false);
  const [copied, setCopied] = useState(false);
  const isRunning = status === 'queued' || status === 'processing';
  const max = ceilings || { memoryMb: 2048, timeS: 60 };
  const handleShare = () => {
    if (!onShare) return;
    onShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const liveLabel =
    apiOnline && apiAuthed ? 'live api' :
    apiOnline && !apiAuthed ? 'no auth' :
    'demo';
  const liveColor =
    apiOnline && apiAuthed ? 'var(--st-accepted)' :
    apiOnline && !apiAuthed ? 'var(--st-tle)' :
    'var(--fg-3)';
  const liveHint =
    apiOnline && apiAuthed ? 'Connected to a live ZeroCode API and authenticated — runs hit the real backend.' :
    apiOnline && !apiAuthed ? 'API reachable but /v1/languages returned 401. Click here to set a bearer key.' :
    'No API reachable. Runs are simulated locally. Click here to point at a server.';

  return (
    <div className="pg-wbar">
      <style>{`
        .pg-wbar {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px;
          border-bottom: 1px solid var(--line);
          background: var(--bg-1);
          font-family: var(--f-mono);
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          min-width: 0;
        }
        @media (max-width: 760px) {
          .pg-wbar {
            flex-wrap: wrap;
            padding: 8px 12px;
            row-gap: 6px;
            overflow: visible;
          }
          .pg-wbar .pg-wbar-right { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
        }
        .pg-wbar-right { flex-shrink: 0; }
        .pg-tabs { display: flex; align-items: center; gap: 4px; }
        .pg-tab {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 6px 6px 0 0;
          font-size: 12px; color: var(--fg-1);
          background: var(--bg);
          border: 1px solid var(--line);
          border-bottom: 0;
          margin-bottom: -9px;
        }
        .pg-tab .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent);
        }
        .pg-tab .x { color: var(--fg-3); cursor: pointer; padding: 0 2px; }
        .pg-tab .x:hover { color: var(--fg); }
        .pg-tab-add {
          appearance: none; border: 0; background: transparent;
          color: var(--fg-3); font-size: 13px; padding: 4px 8px; cursor: pointer;
        }
        .pg-tab-add:hover { color: var(--fg); }
        .pg-wbar .sep { width: 1px; height: 18px; background: var(--line); margin: 0 4px; }
        .pg-wbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

        .pg-btn {
          appearance: none; border: 1px solid var(--line-2); background: var(--bg);
          color: var(--fg-1); padding: 6px 10px; border-radius: 6px;
          font: 12px var(--f-mono); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          white-space: nowrap;
          transition: border-color .12s ease, color .12s ease, background .12s ease;
        }
        .pg-btn:hover { border-color: var(--line-strong); color: var(--fg); }
        .pg-btn.primary {
          background: var(--accent); color: #0a0a0a; border-color: var(--accent);
          font-weight: 500;
        }
        .pg-btn.primary:hover { filter: brightness(1.08); }
        .pg-btn.primary:disabled { opacity: .55; cursor: not-allowed; }
        .pg-btn.cancel {
          background: color-mix(in oklab, var(--st-re) 14%, var(--bg-1));
          color: var(--st-re);
          border-color: color-mix(in oklab, var(--st-re) 55%, var(--line-2));
          font-weight: 500;
        }
        .pg-btn.cancel:hover { border-color: var(--st-re); filter: brightness(1.05); }
        .pg-btn:disabled { opacity: .5; cursor: not-allowed; }
        .pg-btn.ghost { background: transparent; }

        .pg-limits-popover {
          position: absolute; right: 14px; top: calc(100% + 8px); z-index: 30;
          width: 280px;
          border: 1px solid var(--line-2); background: var(--bg-1);
          border-radius: 8px; padding: 14px;
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.65);
        }
        .pg-limits-popover h4 {
          font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin: 0 0 12px;
        }
        .pg-lim-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .pg-lim-row:last-child { margin-bottom: 0; }
        .pg-lim-row .lbl { display: flex; justify-content: space-between; font-family: var(--f-mono); font-size: 11px; color: var(--fg-2); }
        .pg-lim-row .v { color: var(--accent); }
        .pg-lim-row input[type="range"] {
          appearance: none; -webkit-appearance: none; height: 3px; background: var(--line-2); border-radius: 999px; outline: none;
        }
        .pg-lim-row input[type="range"]::-webkit-slider-thumb {
          appearance: none; -webkit-appearance: none; width: 12px; height: 12px; background: var(--accent);
          border: 0; border-radius: 50%; cursor: pointer;
        }
        .pg-lim-row input[type="range"]::-moz-range-thumb {
          width: 12px; height: 12px; background: var(--accent); border: 0; border-radius: 50%; cursor: pointer;
        }
      `}</style>
      <div className="pg-tabs">
        <div className="pg-tab"><span className="dot"/>main.{lang.ext}<span className="x">×</span></div>
        <button className="pg-tab-add">+</button>
      </div>
      <div className="sep"/>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--fg-2)' }}>
        <span style={{ color: 'var(--accent)' }}>{lang.name}</span> · {lang.version} · id&nbsp;{lang.id}
      </span>
      <div className="pg-wbar-right">
        <button
          className="pg-btn ghost"
          title={liveHint}
          onClick={onOpenSettings}
        >
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: liveColor,
            boxShadow: apiOnline ? `0 0 6px ${liveColor}` : 'none',
          }}/>
          {liveLabel}
        </button>
        <button className="pg-btn ghost" onClick={() => setShowLimits(s => !s)}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="4.5"/><path d="M6 2v4l2.5 1.5"/></svg>
          {limits.memoryMb}mb · {limits.timeS}s
        </button>
        <button className="pg-btn ghost" onClick={handleShare} title="Copy share link (encodes lang + source + stdin + token in the URL hash)">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="3.5" cy="7" r="1.6"/><circle cx="10.5" cy="3.6" r="1.6"/><circle cx="10.5" cy="10.4" r="1.6"/><path d="m5 6.3 4-2M5 7.7l4 2"/></svg>
          {copied ? 'copied!' : 'share'}
        </button>
        <button className="pg-btn ghost" onClick={() => setShowApi(true)}>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 7h8M7 3l4 4-4 4"/></svg>
          api
        </button>
        <button className="pg-btn ghost" onClick={onOpenSettings} title="API endpoint + bearer key">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="2"/><path d="M7 0v2.5M7 11.5V14M0 7h2.5M11.5 7H14M2 2l1.8 1.8M10.2 10.2l1.8 1.8M2 12l1.8-1.8M10.2 3.8l1.8-1.8"/></svg>
        </button>
        <button className="pg-btn ghost" onClick={onReset} disabled={isRunning}>reset</button>
        {isRunning ? (
          <button className="pg-btn cancel" onClick={onCancel} title="Cancel (⌘.) — drops the SSE stream; submission keeps running server-side">
            <svg width="9" height="9" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" rx="1"/></svg>
            cancel
          </button>
        ) : (
          <button className="pg-btn primary" onClick={onRun}>
            <svg width="9" height="9" viewBox="0 0 8 8" fill="currentColor"><path d="M1 0 L7 4 L1 8 Z"/></svg>
            run · ⌘↵
          </button>
        )}
      </div>
      {showLimits && (
        <div className="pg-limits-popover" onMouseLeave={() => setShowLimits(false)}>
          <h4>execution limits {apiOnline && ceilings ? '· server ceilings' : '· client defaults'}</h4>
          <div className="pg-lim-row">
            <div className="lbl"><span>memory</span><span className="v">{limits.memoryMb} MB</span></div>
            <input type="range" min="16" max={max.memoryMb} step="16"
              value={Math.min(limits.memoryMb, max.memoryMb)}
              onChange={e => setLimits({ ...limits, memoryMb: +e.target.value })} />
          </div>
          <div className="pg-lim-row">
            <div className="lbl"><span>wall time</span><span className="v">{limits.timeS} s</span></div>
            <input type="range" min="1" max={max.timeS} step="1"
              value={Math.min(limits.timeS, max.timeS)}
              onChange={e => setLimits({ ...limits, timeS: +e.target.value })} />
          </div>
          <p style={{
            margin: '4px 0 0', padding: '8px 10px',
            fontFamily: 'var(--f-mono)', fontSize: 10.5, lineHeight: 1.55,
            color: 'var(--fg-3)', borderTop: '1px dashed var(--line)',
          }}>
            max pids is fixed by the language's <code>default_limits</code> — the REST API doesn't accept a client override.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Editor — textarea + highlight overlay ───────────────────────── */
function Editor({ code, setCode, family }) {
  const wrapRef = useRef(null);
  const taRef = useRef(null);
  const preRef = useRef(null);

  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const html = useMemo(() => highlight(code + '\n', family), [code, family]);

  function onScroll() {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
    if (wrapRef.current?.querySelector('.ed-gutter')) {
      wrapRef.current.querySelector('.ed-gutter').scrollTop = taRef.current.scrollTop;
    }
  }

  function onKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = taRef.current;
      const s = ta.selectionStart, en = ta.selectionEnd;
      const v = ta.value;
      const ins = '    ';
      const next = v.slice(0, s) + ins + v.slice(en);
      setCode(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + ins.length; });
    }
  }

  return (
    <div className="ed" ref={wrapRef}>
      <style>{`
        .ed {
          flex: 1; min-height: 0;
          position: relative;
          display: flex;
          background: var(--bg);
          overflow: hidden;
        }
        .ed-gutter {
          flex-shrink: 0;
          width: 46px;
          padding: 14px 8px 14px 0;
          font-family: var(--f-mono); font-size: 12.5px;
          color: var(--fg-4); line-height: 1.65;
          text-align: right;
          user-select: none;
          overflow: hidden;
        }
        .ed-main {
          flex: 1; position: relative; min-width: 0;
          overflow: hidden;
        }
        .ed-pre, .ed-ta {
          margin: 0;
          padding: 14px 18px;
          font-family: var(--f-mono); font-size: 12.5px;
          line-height: 1.65;
          white-space: pre;
          tab-size: 4;
          -moz-tab-size: 4;
        }
        .ed-pre {
          position: absolute; inset: 0;
          color: var(--fg);
          overflow: auto;
          pointer-events: none;
        }
        .ed-ta {
          position: absolute; inset: 0;
          background: transparent;
          color: transparent;
          caret-color: var(--accent);
          border: 0; outline: none;
          resize: none;
          overflow: auto;
          width: 100%; height: 100%;
        }
        .ed-ta::selection { background: color-mix(in oklab, var(--accent) 30%, transparent); }
        .ed .hl-str { color: #9be39b; }
        .ed .hl-num { color: #d2a86a; }
        .ed .hl-com { color: var(--fg-3); font-style: italic; }
        .ed .hl-kw  { color: var(--blue-1); }
        .ed .hl-fn  { color: #f5d76e; }
        .ed .hl-pre { color: var(--accent); }
      `}</style>
      <div className="ed-gutter">
        {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="ed-main">
        <pre ref={preRef} className="ed-pre" dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          ref={taRef}
          className="ed-ta"
          value={code}
          spellCheck={false}
          onChange={e => setCode(e.target.value)}
          onScroll={onScroll}
          onKeyDown={onKey}
        />
      </div>
    </div>
  );
}

/* ─── Stdin pane (collapsible) ────────────────────────────────────── */
function StdinPane({ stdin, setStdin }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`pg-stdin ${open ? 'open' : ''}`}>
      <style>{`
        .pg-stdin {
          border-top: 1px solid var(--line);
          background: var(--bg-1);
          flex-shrink: 0;
        }
        .pg-stdin-hd {
          padding: 8px 14px;
          font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--fg-3); cursor: pointer;
          display: flex; align-items: center; gap: 8px;
        }
        .pg-stdin-hd:hover { color: var(--fg-1); }
        .pg-stdin-hd .chev { transition: transform .15s ease; }
        .pg-stdin.open .pg-stdin-hd .chev { transform: rotate(90deg); }
        .pg-stdin-bd {
          padding: 8px 14px 14px;
          display: none;
        }
        .pg-stdin.open .pg-stdin-bd { display: block; }
        .pg-stdin-bd textarea {
          width: 100%; height: 80px; resize: vertical;
          background: var(--bg); color: var(--fg);
          border: 1px solid var(--line-2); border-radius: 6px;
          padding: 8px 10px;
          font: 12px var(--f-mono); outline: none;
        }
        .pg-stdin-bd textarea:focus { border-color: var(--line-strong); }
      `}</style>
      <div className="pg-stdin-hd" onClick={() => setOpen(o => !o)}>
        <span className="chev">›</span>
        <span>stdin</span>
        <span style={{ color: 'var(--fg-4)' }}>{stdin ? `${stdin.length} chars` : 'empty'}</span>
      </div>
      <div className="pg-stdin-bd">
        <textarea value={stdin} onChange={e => setStdin(e.target.value)} placeholder="bytes piped to the runtime's stdin..." />
      </div>
    </div>
  );
}

/* ─── Output pane (tabs + streaming output + meta) ─────────────────── */
function OutputPane({ status, statusDetail, output, stderr, compileOutput, lang, metrics, token }) {
  const [tab, setTab] = useState('stdout');
  const outRef = useRef(null);

  // Auto-jump to the most informative tab when a terminal verdict arrives.
  useEffect(() => {
    if (status === 'ce' && compileOutput) setTab('compile');
    else if ((status === 're' || status === 'nze') && stderr.length) setTab('stderr');
    else if (status === 'tle' || status === 'mle' || status === 'se') setTab('meta');
  }, [status]);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [output, stderr, status, tab]);

  const tabs = [
    { id: 'stdout',  name: 'stdout',  count: output.length },
    { id: 'stderr',  name: 'stderr',  count: stderr?.length || 0 },
    { id: 'compile', name: 'compile', count: compileOutput ? 1 : 0 },
    { id: 'meta',    name: 'meta',    count: 0 },
  ];

  return (
    <section className="pg-output">
      <style>{`
        .pg-output {
          width: 440px; flex-shrink: 0;
          border-left: 1px solid var(--line);
          background: var(--bg);
          display: flex; flex-direction: column;
          min-width: 0;
        }
        @media (max-width: 880px) {
          .pg-output {
            width: 100%;
            border-left: 0;
            border-top: 1px solid var(--line);
            min-height: 320px;
          }
        }
        .pg-output-tabs {
          display: flex; gap: 0; border-bottom: 1px solid var(--line);
          background: var(--bg-1);
          flex-shrink: 0;
        }
        .pg-output-tab {
          appearance: none; border: 0; background: transparent;
          padding: 12px 16px; cursor: pointer;
          font: 11.5px var(--f-mono);
          color: var(--fg-3); letter-spacing: 0.06em;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color .12s ease, border-color .12s ease;
          display: flex; align-items: center; gap: 6px;
        }
        .pg-output-tab:hover { color: var(--fg-1); }
        .pg-output-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .pg-output-tab .pill {
          background: var(--bg-2); color: var(--fg-3);
          padding: 0 5px; border-radius: 99px; font-size: 10px; min-width: 14px; text-align: center;
        }
        .pg-output-tab.active .pill { background: color-mix(in oklab, var(--accent) 18%, var(--bg-2)); color: var(--accent); }
        .pg-output-body {
          flex: 1; min-height: 0; overflow-y: auto;
          padding: 14px 18px;
          font-family: var(--f-mono); font-size: 12.5px;
          line-height: 1.7;
          color: var(--st-accepted);
          white-space: pre-wrap; word-break: break-all;
        }
        .pg-output-body.empty { color: var(--fg-3); font-style: italic; padding-top: 24px; }
        .pg-output-body .ln { white-space: pre; }
        .pg-output-body .caret {
          display: inline-block; width: 7px; height: 13px;
          background: var(--accent); vertical-align: -2px; margin-left: 1px;
          animation: pg-blink 1s steps(1) infinite;
        }
        @keyframes pg-blink { 50% { opacity: 0; } }
        .pg-output-meta dt {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.12em; text-transform: uppercase;
          margin-top: 14px;
        }
        .pg-output-meta dt:first-child { margin-top: 0; }
        .pg-output-meta dd {
          margin: 4px 0 0;
          color: var(--fg-1); font-family: var(--f-mono); font-size: 13px;
        }
        .pg-output-meta dd b { color: var(--accent); font-weight: 500; }
        .pg-output-stderr, .pg-output-compile {
          color: var(--fg-3);
        }
      `}</style>
      <div className="pg-output-tabs">
        {tabs.map(t => (
          <button key={t.id}
            className={`pg-output-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.name}
            {t.count > 0 && <span className="pill">{t.count}</span>}
          </button>
        ))}
      </div>
      <div ref={outRef} className={`pg-output-body ${output.length === 0 && status === 'idle' ? 'empty' : ''}`}>
        {tab === 'stdout' && (
          <>
            {output.length === 0 && status === 'idle' && <div>awaiting first run · click <b style={{color:'var(--accent)',fontStyle:'normal'}}>run</b> to begin</div>}
            {status === 'queued' && <div style={{ color: 'var(--st-queued)' }}>queued · waiting for worker NOTIFY ...</div>}
            {output.map((l, i) => <div key={i} className="ln">{l}</div>)}
            {status === 'processing' && <span className="caret"/>}
            {output.length === 0 && status !== 'idle' && status !== 'queued' && status !== 'processing' && (
              <div className="pg-output-stderr">— stdout empty —</div>
            )}
          </>
        )}
        {tab === 'stderr' && (
          stderr && stderr.length > 0
            ? <div style={{ color: 'var(--st-re)' }}>{stderr.map((l, i) => <div key={i} className="ln">{l}</div>)}</div>
            : <div className="pg-output-stderr">— no bytes on stderr —</div>
        )}
        {tab === 'compile' && (
          compileOutput
            ? <div style={{ color: 'var(--st-ce)' }}>{compileOutput.split('\n').map((l, i) => <div key={i} className="ln">{l || ' '}</div>)}</div>
            : <div className="pg-output-compile">— no compile step or compile output —</div>
        )}
        {tab === 'meta' && (
          <dl className="pg-output-meta">
            <dt>token</dt><dd><b style={{userSelect:'all'}}>{token}</b></dd>
            <dt>verdict</dt><dd>
              <b style={{color: VERDICT_COLOR[status] || 'var(--fg-1)'}}>{VERDICT_LABEL[status] || status}</b>
              {statusDetail ? <> · <span style={{color:'var(--fg-2)'}}>{statusDetail}</span></> : null}
              {metrics.exitCode != null && <> · exit {metrics.exitCode}</>}
              {metrics.signal && <> · signal {metrics.signal}</>}
            </dd>
            <dt>wall time</dt><dd>{metrics.time != null ? metrics.time.toFixed(3) + ' s' : '—'}</dd>
            <dt>memory peak</dt><dd>{metrics.memory != null ? metrics.memory.toFixed(1) + ' MB' : '—'}</dd>
            <dt>language</dt><dd>{lang.name} · {lang.version} · id {lang.id}</dd>
            <dt>runner</dt><dd>zerocode-runner</dd>
            <dt>sandbox</dt><dd>8 layers · cgroup v2 · landlock</dd>
          </dl>
        )}
      </div>
    </section>
  );
}

/* ─── Bottom status strip ─────────────────────────────────────────── */
function StatusStrip({ status, statusDetail, metrics, lang, token, apiOnline }) {
  const phases = ['queued', 'processing', 'accepted'];
  // Treat non-accepted terminal verdicts as "processing complete" so the
  // flow chip still reads done even on TLE/MLE/RE/CE.
  const isTerminal = !['idle', 'queued', 'processing'].includes(status);
  const phaseIdx = status === 'idle' ? -1
                 : isTerminal ? phases.length - 1
                 : phases.indexOf(status);
  const verdictColor = VERDICT_COLOR[status] || 'var(--fg-3)';
  const verdictLabel = VERDICT_LABEL[status] || status;
  return (
    <footer className="pg-strip">
      <style>{`
        .pg-strip {
          display: flex; align-items: center; gap: 18px;
          padding: 8px 18px;
          border-top: 1px solid var(--line);
          background: var(--bg-1);
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        @media (max-width: 760px) {
          .pg-strip { flex-wrap: wrap; row-gap: 6px; padding: 8px 12px; }
          .pg-strip .right { margin-left: 0; }
        }
        .pg-flow { display: flex; align-items: center; gap: 8px; }
        .pg-flow .step {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 9px; border-radius: 999px;
          border: 1px solid var(--line); color: var(--fg-4);
          background: var(--bg);
          letter-spacing: 0.12em; text-transform: uppercase; font-size: 10px;
        }
        .pg-flow .step.done { color: var(--fg-2); border-color: var(--line-2); }
        .pg-flow .step.active {
          color: var(--accent); border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 10%, transparent);
        }
        .pg-flow .step .dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
        }
        .pg-flow .arr { color: var(--fg-4); }
        .pg-strip .metrics { display: flex; gap: 14px; }
        .pg-strip .metrics span b { color: var(--fg-1); font-weight: 500; }
        .pg-strip .right { margin-left: auto; display: flex; gap: 14px; align-items: center; }
        .pg-strip .verdict {
          padding: 3px 10px; border-radius: 999px;
          border: 1px solid var(--st-accepted); color: var(--st-accepted);
          background: color-mix(in oklab, var(--st-accepted) 10%, transparent);
          letter-spacing: 0.12em; text-transform: uppercase; font-size: 10px;
        }
        .pg-strip .verdict.idle { border-color: var(--line); color: var(--fg-3); background: transparent; }
      `}</style>
      <div className="pg-flow">
        {phases.map((p, i) => (
          <React.Fragment key={p}>
            <span className={`step ${i < phaseIdx ? 'done' : i === phaseIdx ? 'active' : ''}`}>
              <span className="dot"/> {p}
            </span>
            {i < phases.length - 1 && <span className="arr">→</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="metrics">
        <span>wall · <b>{metrics.time != null ? metrics.time.toFixed(3) + 's' : '—'}</b></span>
        <span>mem · <b>{metrics.memory != null ? metrics.memory.toFixed(1) + ' MB' : '—'}</b></span>
        <span>exit · <b>{metrics.exitCode != null ? metrics.exitCode : (status === 'accepted' ? '0' : '—')}</b></span>
      </div>
      <div className="right">
        <span title={apiOnline ? 'Connected to a live ZeroCode API.' : 'No API reachable — simulated.'}>
          mode · <b style={{ color: apiOnline ? 'var(--st-accepted)' : 'var(--fg-2)', fontWeight: 500 }}>
            {apiOnline ? 'live' : 'demo'}
          </b>
        </span>
        <span>endpoint · <b style={{color:'var(--fg-1)',fontWeight:500}}>POST /v1/submissions</b></span>
        <span
          className="verdict"
          style={{
            color: verdictColor,
            borderColor: status === 'idle' ? 'var(--line)' : verdictColor,
            background: status === 'idle' ? 'transparent' : `color-mix(in oklab, ${verdictColor} 10%, transparent)`,
          }}
        >
          {status === 'idle' ? 'ready' : verdictLabel}
          {statusDetail ? ` · ${statusDetail}` : ''}
        </span>
      </div>
    </footer>
  );
}

/* ─── "Open in API" modal ─────────────────────────────────────────── */
function ApiModal({ open, onClose, lang, code, limits, token }) {
  const [mode, setMode] = useState('curl');
  if (!open) return null;
  const escape = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const json = `{"language_id":${lang.id},"source_code":"${escape(code)}","cpu_time_limit":${limits.timeS},"memory_limit":${limits.memoryMb * 1024},"max_processes_and_or_threads":${limits.pids}}`;
  const blocks = {
    curl: `curl -X POST 'https://api.zerocode.run/v1/submissions?wait=true' \\
  -H 'authorization: bearer $ZC_KEY' \\
  -H 'content-type: application/json' \\
  -d '${json}'`,
    grpc: `grpcurl -plaintext \\
  -d '{"language_id":${lang.id},"source_code":"<...>","limits":{"time_s":${limits.timeS},"memory_mb":${limits.memoryMb},"pids":${limits.pids}}}' \\
  api.zerocode.run:50051 zerocode.v2.ZeroCode/Create`,
  };

  return (
    <div className="pg-modal-bg" onClick={onClose}>
      <style>{`
        .pg-modal-bg {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 40px;
        }
        .pg-modal {
          width: 720px; max-width: 100%; max-height: 80vh;
          background: var(--bg-1);
          border: 1px solid var(--line-2);
          border-radius: 12px;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .pg-modal-hd {
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
          display: flex; align-items: center;
        }
        .pg-modal-hd h3 { margin: 0; font-family: var(--f-display); font-size: 22px; font-weight: 400; color: var(--fg); }
        .pg-modal-hd h3 .it { font-style: italic; color: var(--accent); }
        .pg-modal-hd .x {
          margin-left: auto; appearance: none; border: 0; background: transparent;
          color: var(--fg-3); cursor: pointer; font-size: 18px; padding: 4px;
        }
        .pg-modal-hd .x:hover { color: var(--fg); }
        .pg-modal-tabs {
          display: flex; padding: 0 20px; gap: 8px;
          border-bottom: 1px solid var(--line);
        }
        .pg-modal-tab {
          appearance: none; border: 0; background: transparent;
          padding: 10px 12px; cursor: pointer;
          font: 12px var(--f-mono); color: var(--fg-3); letter-spacing: 0.06em;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
        }
        .pg-modal-tab:hover { color: var(--fg-1); }
        .pg-modal-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .pg-modal-bd {
          padding: 20px;
          overflow-y: auto; flex: 1; min-height: 0;
        }
        .pg-modal-bd pre {
          margin: 0; padding: 18px;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 8px;
          font: 12.5px/1.7 var(--f-mono); color: var(--fg-1);
          white-space: pre-wrap; word-break: break-all;
        }
        .pg-modal-foot {
          padding: 12px 20px;
          border-top: 1px solid var(--line);
          display: flex; align-items: center; gap: 10px;
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
        }
        .pg-modal-foot b { color: var(--fg-1); font-weight: 500; }
        .pg-modal-foot button {
          margin-left: auto;
          appearance: none; border: 1px solid var(--line-2); background: var(--bg);
          color: var(--fg-1); padding: 6px 12px; border-radius: 6px;
          font: 12px var(--f-mono); cursor: pointer;
        }
        .pg-modal-foot button:hover { border-color: var(--accent); color: var(--accent); }
      `}</style>
      <div className="pg-modal" onClick={e => e.stopPropagation()}>
        <div className="pg-modal-hd">
          <h3>Open in <span className="it">API</span></h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="pg-modal-tabs">
          {['curl', 'grpc'].map(m => (
            <button key={m} className={`pg-modal-tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="pg-modal-bd">
          <pre>{blocks[mode]}</pre>
        </div>
        <div className="pg-modal-foot">
          <span>token · <b>{token}</b></span>
          <span>·</span>
          <span>{Object.keys(blocks).length} transports · same state machine</span>
          <button>copy</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Settings dialog ─────────────────────────────────────────────────
 * Configures the API endpoint + bearer key. Persists to localStorage via
 * window.ZeroCodeAPI.{setBase,setKey}. "Test" runs GET /v1/health, then
 * GET /v1/languages so a bad bearer is caught immediately. On Save we
 * re-probe the API so the App's apiOnline state updates automatically.
 */
function SettingsDialog({ open, onClose, onApplied }) {
  const api = typeof window !== 'undefined' ? window.ZeroCodeAPI : null;
  const [base, setBase]   = useState('');
  const [key,  setKey]    = useState('');
  const [test, setTest]   = useState(null);  // null | 'pending' | { ok, message }
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!open || !api) return;
    setBase(api.base || '');
    setKey(api.key || '');
    setTest(null);
  }, [open]);

  if (!open) return null;

  async function runTest() {
    if (!api) { setTest({ ok: false, message: 'API client not loaded' }); return; }
    // apply tentatively so the test hits the new config
    api.setBase(base.trim().replace(/\/$/, '') || null);
    api.setKey(key.trim() || null);
    setTest('pending');
    try {
      const h = await api.health();
      try {
        const langs = await api.languages();
        setTest({ ok: true, message: `connected · ${Array.isArray(langs) ? langs.length : '?'} languages · health=${h?.status || 'ok'}` });
      } catch (e) {
        setTest({ ok: false, message: `health OK but /v1/languages failed: ${e.message}` });
      }
    } catch (e) {
      setTest({ ok: false, message: e.message });
    }
  }

  function save() {
    if (!api) return;
    api.setBase(base.trim().replace(/\/$/, '') || null);
    api.setKey(key.trim() || null);
    onApplied?.();
    onClose?.();
  }

  function clear() {
    if (!api) return;
    api.setBase(null);
    api.setKey(null);
    setBase('');
    setKey('');
    setTest({ ok: true, message: 'cleared · will use ' + location.origin });
  }

  return (
    <div className="pg-modal-bg" onClick={onClose}>
      <style>{`
        .pg-set { width: 560px; max-width: 92vw; }
        .pg-set .row { display: flex; flex-direction: column; gap: 6px; margin: 14px 0; }
        .pg-set .row .lbl {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.14em; text-transform: uppercase;
          display: flex; align-items: center; gap: 8px;
        }
        .pg-set .row .lbl .hint { color: var(--fg-4); text-transform: none; letter-spacing: 0; font-size: 11px; }
        .pg-set .row input {
          appearance: none; border: 1px solid var(--line-2);
          background: var(--bg); color: var(--fg);
          padding: 10px 12px; border-radius: 6px;
          font: 13px var(--f-mono); outline: none;
        }
        .pg-set .row input:focus { border-color: var(--accent); }
        .pg-set .row .with-action { display: flex; gap: 8px; }
        .pg-set .row .with-action input { flex: 1; min-width: 0; }
        .pg-set .row .toggle-btn {
          appearance: none; border: 1px solid var(--line-2); background: var(--bg);
          color: var(--fg-2); padding: 0 12px; border-radius: 6px;
          font: 11px var(--f-mono); cursor: pointer; white-space: nowrap;
        }
        .pg-set .row .toggle-btn:hover { color: var(--fg); border-color: var(--line-strong); }
        .pg-set .testbox {
          margin: 0 0 4px;
          padding: 10px 12px;
          border-radius: 6px;
          font-family: var(--f-mono); font-size: 11.5px;
          border: 1px dashed var(--line);
          color: var(--fg-2);
        }
        .pg-set .testbox.pending { color: var(--st-queued); border-color: var(--st-queued); }
        .pg-set .testbox.ok      { color: var(--st-accepted); border-color: var(--st-accepted); background: color-mix(in oklab, var(--st-accepted) 6%, transparent); }
        .pg-set .testbox.fail    { color: var(--st-re); border-color: var(--st-re); background: color-mix(in oklab, var(--st-re) 6%, transparent); }
        .pg-set .note {
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
          line-height: 1.55; margin-top: 6px;
        }
        .pg-set .note code { background: var(--bg-2); padding: 1px 5px; border-radius: 3px; color: var(--fg-1); }
        .pg-set-foot {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 20px;
          border-top: 1px solid var(--line);
        }
        .pg-set-foot button {
          appearance: none; border: 1px solid var(--line-2); background: var(--bg);
          color: var(--fg-1); padding: 7px 12px; border-radius: 6px;
          font: 12px var(--f-mono); cursor: pointer;
        }
        .pg-set-foot button:hover { border-color: var(--line-strong); color: var(--fg); }
        .pg-set-foot button.primary {
          background: var(--accent); color: #0a0a0a; border-color: var(--accent); font-weight: 500;
        }
        .pg-set-foot button.primary:hover { filter: brightness(1.08); }
        .pg-set-foot .spacer { flex: 1; }
      `}</style>
      <div className="pg-modal pg-set" onClick={e => e.stopPropagation()}>
        <div className="pg-modal-hd">
          <h3>API <span className="it">settings</span></h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="pg-modal-bd">
          <div className="row">
            <span className="lbl">api base url <span className="hint">— where your ZeroCode service is listening</span></span>
            <input
              type="url"
              value={base}
              onChange={e => setBase(e.target.value)}
              placeholder={`leave empty to use ${location.origin}`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="row">
            <span className="lbl">bearer key <span className="hint">— Authorization: Bearer &lt;key&gt;</span></span>
            <div className="with-action">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="dev-only-replace-me · or your prod ZEROCODE_API_KEY"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="toggle-btn" onClick={() => setShowKey(v => !v)}>{showKey ? 'hide' : 'show'}</button>
            </div>
          </div>
          {test === 'pending' && <div className="testbox pending">testing connection…</div>}
          {test && test !== 'pending' && (
            <div className={`testbox ${test.ok ? 'ok' : 'fail'}`}>{test.ok ? '✓ ' : '✗ '}{test.message}</div>
          )}
          <p className="note">
            Stored in <code>localStorage</code> as <code>zerocode.api</code> / <code>zerocode.key</code>.
            For a session-only override, append <code>?api=URL&amp;key=…</code> to the page URL. Health and
            languages-catalog are checked on save so a bad bearer is caught before you submit code.
          </p>
        </div>
        <div className="pg-set-foot">
          <button type="button" onClick={clear}>clear</button>
          <button type="button" onClick={runTest}>test connection</button>
          <div className="spacer"/>
          <button type="button" onClick={onClose}>cancel</button>
          <button type="button" className="primary" onClick={save}>save · reload api</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main app ─────────────────────────────────────────────────────── */

const HISTORY_KEY = 'zerocode.playground.history';
const STATE_KEY   = 'zerocode.playground.state';

function loadHistory() {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 20) : [];
  } catch { return []; }
}
function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20))); } catch {}
}
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; }
}
function saveDraft(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

// Maps server Status `{ kind, detail }` (or legacy strings) to the flat code
// the UI uses for chip colour / verdict label. Mirrors `ZeroCodeAPI.statusKind`
// so we work even when the shared client isn't loaded (e.g. simulation-only).
function statusFromApi(s) {
  if (!s) return 'idle';
  if (window.ZeroCodeAPI) return window.ZeroCodeAPI.statusKind(s);
  if (typeof s === 'object' && s.kind) {
    return ({
      accepted: 'accepted', queued: 'queued', processing: 'processing',
      time_limit_exceeded: 'tle', memory_limit_exceeded: 'mle',
      output_limit_exceeded: 'ole', compile_error: 'ce',
      runtime_error: 're', non_zero_exit: 'nze',
      sandbox_failure: 'se', internal_error: 'se',
      cancelled: 'cancelled', expired: 'expired',
    })[s.kind] || s.kind;
  }
  const k = String(s).toLowerCase();
  if (k.includes('queued'))      return 'queued';
  if (k.includes('process'))     return 'processing';
  if (k.includes('accepted'))    return 'accepted';
  if (k.includes('time'))        return 'tle';
  if (k.includes('memory'))      return 'mle';
  if (k.includes('compile'))     return 'ce';
  if (k.includes('runtime') || k.includes('signal') || k.includes('nzec')) return 're';
  if (k.includes('sandbox') || k.includes('internal')) return 'se';
  return 'idle';
}

// Color token for each verdict kind. Pulled from tokens.css `--st-*` set.
const VERDICT_COLOR = {
  idle:       'var(--fg-3)',
  queued:     'var(--st-queued)',
  processing: 'var(--st-processing)',
  accepted:   'var(--st-accepted)',
  tle:        'var(--st-tle)',
  mle:        'var(--st-mle)',
  ole:        'var(--st-tle)',
  ce:         'var(--st-ce)',
  re:         'var(--st-re)',
  nze:        'var(--st-re)',
  se:         'var(--st-se)',
  cancelled:  'var(--fg-3)',
  expired:    'var(--fg-3)',
};

const VERDICT_LABEL = {
  idle: 'idle',
  queued: 'queued',
  processing: 'processing',
  accepted: 'accepted',
  tle: 'time limit',
  mle: 'memory limit',
  ole: 'output limit',
  ce:  'compile error',
  re:  'runtime error',
  nze: 'non-zero exit',
  se:  'sandbox error',
  cancelled: 'cancelled',
  expired: 'expired',
};

// Restore source/lang/limits/stdin from share-link hash, then localStorage draft.
function readShareHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const p = new URLSearchParams(h);
  const code = p.get('code') ? decodeURIComponent(escape(atob(p.get('code')))) : null;
  return {
    lang:    p.get('lang'),
    token:   p.get('token'),
    code,
    stdin:   p.get('stdin') ? decodeURIComponent(escape(atob(p.get('stdin')))) : '',
  };
}

function writeShareHash({ langId, code, stdin, token }) {
  const p = new URLSearchParams();
  if (langId != null)  p.set('lang', String(langId));
  if (code)            p.set('code', btoa(unescape(encodeURIComponent(code))));
  if (stdin)           p.set('stdin', btoa(unescape(encodeURIComponent(stdin))));
  if (token)           p.set('token', token);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '#' + qs : location.pathname);
}

function App() {
  // ── initial state from share-link → localStorage → defaults ────────
  const share = readShareHash();
  const draft = !share && loadDraft();
  const initialLang = (() => {
    if (share?.lang) {
      const byId = LANGS.find(l => String(l.id) === share.lang);
      if (byId) return byId;
    }
    if (draft?.langId != null) {
      const byId = LANGS.find(l => l.id === draft.langId);
      if (byId) return byId;
    }
    return LANGS.find(l => l.name === 'Rust');
  })();

  const [lang, setLang]     = useState(initialLang);
  const [code, setCode]     = useState(share?.code ?? draft?.code ?? initialLang.snippet);
  const [stdin, setStdin]   = useState(share?.stdin ?? draft?.stdin ?? '');
  const [status, setStatus] = useState('idle');
  const [statusDetail, setStatusDetail] = useState(null);   // tagged-object `detail` from server (e.g. "wall" for TLE, signal name for RE)
  const [output, setOutput] = useState([]);                  // stdout lines
  const [stderr, setStderr] = useState([]);                  // stderr lines (separate buffer)
  const [compileOutput, setCompileOutput] = useState('');    // full compile_output string (only on CompileError)
  const [metrics, setMetrics] = useState({ time: null, memory: null, exitCode: null, signal: null });
  // No `pids` slider — the REST API doesn't accept a client override for max_pids.
  // It's resolved per-language on the server. We expose only memory + wall time.
  const [limits, setLimits] = useState(() => {
    const d = draft?.limits || {};
    return { memoryMb: d.memoryMb ?? 256, timeS: d.timeS ?? 5 };
  });
  const [token, setToken]   = useState(share?.token || ('zc_' + Math.random().toString(36).slice(2, 10)));
  const [history, setHistory] = useState(loadHistory);
  const [showApi, setShowApi] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);                  // {message, retry?} for transport-level failures

  // ── API probe + server-fetched languages + dynamic ceilings ────────
  const [apiOnline, setApiOnline] = useState(false);
  const [apiAuthed, setApiAuthed] = useState(false);
  const [apiLangs, setApiLangs] = useState(null);            // server-fetched LanguageView[]
  const [apiCeilings, setApiCeilings] = useState(null);      // { memoryMb, timeS } from server defaults
  const cancelStreamRef = useRef(null);
  const runCtlRef = useRef(null);                            // AbortController for the active run

  async function probeApi() {
    const api = window.ZeroCodeAPI;
    if (!api) return;
    const { ok, authed } = await api.probe();
    setApiOnline(!!ok);
    setApiAuthed(!!authed);
    if (!ok) { setApiLangs(null); setApiCeilings(null); return; }
    try {
      const langs = await api.languages();
      if (!Array.isArray(langs)) return;
      setApiLangs(langs);
      // Conservative ceiling: max default across all languages, so the slider
      // top reflects what the server will actually accept somewhere.
      let mMax = 0, tMax = 0;
      for (const l of langs) {
        const lim = l.default_limits || l.limits || {};
        mMax = Math.max(mMax, +lim.memory_mb || 0);
        tMax = Math.max(tMax, +lim.wall_time || 0);
      }
      setApiCeilings({ memoryMb: mMax || 2048, timeS: tMax || 60 });
    } catch (e) {
      // Probe said /v1/health was up but /v1/languages 401'd — we know the
      // bearer is wrong. Surface that so the user opens settings.
      setApiAuthed(false);
    }
  }
  useEffect(() => { probeApi(); }, []);

  // Persist draft on every relevant change.
  useEffect(() => {
    saveDraft({ langId: lang.id, code, stdin, limits });
  }, [lang.id, code, stdin, limits]);

  // Server-fetched version pinned to the picker entry (so users see what's
  // actually deployed, not the snapshot in playground/data.jsx).
  const langWithServerVersion = React.useMemo(() => {
    if (!apiLangs) return lang;
    const m = apiLangs.find(l => l.id === lang.id);
    if (!m) return lang;
    return { ...lang, version: m.version || lang.version, _serverName: m.name };
  }, [lang, apiLangs]);

  function clearResults() {
    setStatus('idle');
    setStatusDetail(null);
    setOutput([]);
    setStderr([]);
    setCompileOutput('');
    setMetrics({ time: null, memory: null, exitCode: null, signal: null });
    setError(null);
  }
  function selectLang(l) {
    cancelRun();
    setLang(l);
    setCode(l.snippet);
    setStdin('');
    clearResults();
    setToken('zc_' + Math.random().toString(36).slice(2, 10));
  }
  function reset() {
    cancelRun();
    setCode(lang.snippet);
    setStdin('');
    clearResults();
  }
  function copyShareLink() {
    writeShareHash({ langId: lang.id, code, stdin, token });
    const url = location.href;
    try { navigator.clipboard?.writeText(url); } catch {}
    return url;
  }

  function cancelRun() {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    runCtlRef.current?.abort();
    runCtlRef.current = null;
  }

  // Apply a fully-fetched SubmissionView (from polling fallback or wait=true).
  function applySubmissionView(sub) {
    const api = window.ZeroCodeAPI;
    const kind = api ? api.statusKind(sub.status) : statusFromApi(sub.status);
    const detail = api ? api.statusDetail(sub.status) : null;
    setStatus(kind);
    setStatusDetail(detail);
    // outputs are base64 when ?base64_encoded=true
    if (sub.stdout) {
      const text = api ? api.decode(sub.stdout) : sub.stdout;
      setOutput(text.split(/\r?\n/).filter((_, i, a) => i < a.length - 1 || a[i] !== ''));
    }
    if (sub.stderr) {
      const text = api ? api.decode(sub.stderr) : sub.stderr;
      setStderr(text.split(/\r?\n/).filter((_, i, a) => i < a.length - 1 || a[i] !== ''));
    }
    if (sub.compile_output) {
      setCompileOutput(api ? api.decode(sub.compile_output) : sub.compile_output);
    }
    setMetrics({
      time:   sub.time      != null ? +sub.time      : (sub.wall_time != null ? +sub.wall_time : null),
      memory: sub.memory    != null ? +sub.memory / 1024 : null,            // KB → MB for display
      exitCode: sub.exit_code != null ? +sub.exit_code : null,
      signal:   sub.signal?.name || null,
    });
  }

  function recordHistory(kind, t, tkn) {
    const h = { name: lang.name, verdict: kind, time: t, token: tkn, when: Date.now() };
    setHistory(prev => { const next = [h, ...prev].slice(0, 20); saveHistory(next); return next; });
  }

  // ── execution: real API path ───────────────────────────────────────
  // POST /v1/submissions → SSE /v1/submissions/{token}/stream
  // SSE events:
  //   processing (initial)
  //   stdout { data: <string> }
  //   stderr { data: <string> }
  //   finished { status: { kind, detail? } }
  //   error <plain text>
  // On SSE failure, fall back to GET /v1/submissions/{token}?base64_encoded=true
  // polling until terminal status.
  async function runOnApi() {
    const api = window.ZeroCodeAPI;
    clearResults();
    setStatus('queued');
    const ctl = new AbortController();
    runCtlRef.current = ctl;
    let stdoutBuf = '';
    let stderrBuf = '';
    let tkn;

    try {
      const idem = api.idemKey([lang.id, code, stdin, limits.memoryMb, limits.timeS]);
      const ack = await api.submit({
        language_id: lang.id,
        source_code: code,
        stdin,
        limits: { cpu_time: limits.timeS, wall_time: limits.timeS, memory_mb: limits.memoryMb },
        idempotency_key: idem,
      });
      tkn = ack?.token;
      if (!tkn) throw new Error('server returned no token');
      setToken(tkn);
      writeShareHash({ langId: lang.id, code, stdin, token: tkn });
      // If the cache hit returned a full view, apply it and stop.
      if (ack.stdout != null || ack.status?.kind === 'accepted' || ack.status?.kind === 'compile_error' || ack.status?.kind === 'runtime_error') {
        applySubmissionView(ack);
        recordHistory(api.statusKind(ack.status), ack.time, tkn);
        runCtlRef.current = null;
        return;
      }
      setStatus('processing');
    } catch (e) {
      if (ctl.signal.aborted) return;
      setStatus('se');
      setError({ message: e.message || String(e), retry: true });
      runCtlRef.current = null;
      return;
    }

    // open SSE stream
    let finished = false;
    cancelStreamRef.current = api.stream(tkn, {
      onEvent: ({ event, json, raw }) => {
        if (ctl.signal.aborted) return;
        if (event === 'processing') {
          setStatus('processing');
        } else if (event === 'stdout') {
          const chunk = json?.data ?? raw;
          stdoutBuf += chunk;
          flushLines(stdoutBuf, setOutput, (rest) => stdoutBuf = rest);
        } else if (event === 'stderr') {
          const chunk = json?.data ?? raw;
          stderrBuf += chunk;
          flushLines(stderrBuf, setStderr, (rest) => stderrBuf = rest);
        } else if (event === 'finished') {
          finished = true;
          // flush any trailing partial lines
          if (stdoutBuf.length) { setOutput(p => [...p, stdoutBuf]); stdoutBuf = ''; }
          if (stderrBuf.length) { setStderr(p => [...p, stderrBuf]); stderrBuf = ''; }
          const s = json?.status;
          const kind = api.statusKind(s);
          setStatus(kind);
          setStatusDetail(api.statusDetail(s));
          // For verdicts that carry payload (compile_output, exit_code, memory),
          // pull the full row so the meta tab is correct.
          api.get(tkn).then((sub) => { if (!ctl.signal.aborted) applySubmissionView(sub); }).catch(() => {});
          recordHistory(kind, null, tkn);
          cancelStreamRef.current?.();
          cancelStreamRef.current = null;
        } else if (event === 'error') {
          setError({ message: 'stream error: ' + (raw || 'unknown') });
        }
      },
      onError: async (err) => {
        if (ctl.signal.aborted || finished) return;
        // SSE dropped → poll until terminal.
        cancelStreamRef.current = null;
        try {
          const sub = await api.poll(tkn, { intervalMs: 400, signal: ctl.signal });
          if (ctl.signal.aborted) return;
          applySubmissionView(sub);
          recordHistory(api.statusKind(sub.status), sub.time, tkn);
        } catch (e) {
          if (!ctl.signal.aborted) {
            setStatus('se');
            setError({ message: 'stream + poll failed: ' + (e.message || e), retry: true });
          }
        }
      },
    });
    runCtlRef.current = ctl;
  }

  // Helper: push complete lines into a state setter, return the remainder.
  function flushLines(buf, setter, remainder) {
    let i; let lastEnd = 0;
    const lines = [];
    while ((i = buf.indexOf('\n', lastEnd)) !== -1) {
      lines.push(buf.slice(lastEnd, i));
      lastEnd = i + 1;
    }
    if (lines.length) setter(prev => [...prev, ...lines]);
    remainder(buf.slice(lastEnd));
  }

  // ── execution: simulated path (no API) ─────────────────────────────
  function runSimulated() {
    clearResults();
    setStatus('queued');
    setToken('zc_' + Math.random().toString(36).slice(2, 10));
    setTimeout(() => setStatus('processing'), 280);
  }

  // simulated streaming effect; only runs when API is offline
  useEffect(() => {
    if (apiOnline) return;
    if (status !== 'processing') return;
    const lines = lang.output;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > lines.length) {
        clearInterval(id);
        setStatus('accepted');
        setMetrics({ time: lang.metrics.time, memory: lang.metrics.memory, exitCode: 0, signal: null });
        recordHistory('accepted', lang.metrics.time, token);
        return;
      }
      setOutput(prev => [...prev, lines[i - 1]]);
    }, 95);
    return () => clearInterval(id);
  }, [status, lang, apiOnline]);

  function run() {
    if (status === 'queued' || status === 'processing') return;
    if (apiOnline) runOnApi();
    else runSimulated();
  }

  // ⌘/Ctrl + Enter → run · ⌘/Ctrl + . → cancel
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        cancelRun();
        if (status === 'queued' || status === 'processing') setStatus('cancelled');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, apiOnline]);

  useEffect(() => () => cancelRun(), []);

  const isRunning = status === 'queued' || status === 'processing';

  return (
    <>
      <TopNav token={token} status={status} />
      <WorkspaceBar lang={langWithServerVersion} status={status} statusDetail={statusDetail}
                    onRun={run} onCancel={() => { cancelRun(); if (isRunning) setStatus('cancelled'); }}
                    onReset={reset}
                    limits={limits} setLimits={setLimits}
                    ceilings={apiCeilings}
                    apiOnline={apiOnline} apiAuthed={apiAuthed}
                    onShare={copyShareLink}
                    onOpenSettings={() => setShowSettings(true)}
                    showApi={showApi} setShowApi={setShowApi} />
      {error && (
        <div className="pg-errbar">
          <style>{`
            .pg-errbar {
              padding: 8px 14px;
              background: color-mix(in oklab, var(--st-re) 12%, var(--bg-1));
              border-bottom: 1px solid color-mix(in oklab, var(--st-re) 40%, var(--line));
              color: var(--st-re);
              font: 12px var(--f-mono);
              display: flex; align-items: center; gap: 12px;
              flex-shrink: 0;
            }
            .pg-errbar .x { margin-left: auto; cursor: pointer; opacity: .8; }
            .pg-errbar .x:hover { opacity: 1; }
            .pg-errbar button {
              appearance: none; background: transparent; border: 1px solid currentColor;
              color: inherit; padding: 3px 9px; border-radius: 4px; font: 11px var(--f-mono);
              cursor: pointer; letter-spacing: 0.04em;
            }
          `}</style>
          <span>✗ {error.message}</span>
          {error.retry && <button onClick={run}>retry</button>}
          {!apiAuthed && apiOnline && <button onClick={() => setShowSettings(true)}>open settings</button>}
          <span className="x" onClick={() => setError(null)}>dismiss</span>
        </div>
      )}
      <main className="pg-main">
        <style>{`
          .pg-main {
            flex: 1; min-height: 0;
            display: flex;
            background: var(--bg);
          }
          .pg-center {
            flex: 1; min-width: 0;
            display: flex; flex-direction: column;
            min-height: 0;
          }
          @media (max-width: 880px) {
            .pg-main { flex-direction: column; }
            .pg-main > * { flex-shrink: 0; }
            .pg-center { min-height: 360px; }
          }
          @media (max-width: 760px) {
            html, body { overflow: auto !important; height: auto !important; }
          }
        `}</style>
        <LanguagePicker selected={lang} onSelect={selectLang} history={history} />
        <div className="pg-center">
          <Editor code={code} setCode={setCode} family={lang.family} />
          <StdinPane stdin={stdin} setStdin={setStdin} />
        </div>
        <OutputPane status={status} statusDetail={statusDetail}
                    output={output} stderr={stderr} compileOutput={compileOutput}
                    lang={langWithServerVersion} metrics={metrics} token={token} />
      </main>
      <StatusStrip status={status} statusDetail={statusDetail}
                   metrics={metrics} lang={lang} token={token} apiOnline={apiOnline} />
      <ApiModal open={showApi} onClose={() => setShowApi(false)} lang={lang} code={code} limits={limits} token={token} />
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} onApplied={probeApi} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);

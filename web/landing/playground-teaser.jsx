// landing/playground-teaser.jsx
// A scaled-down IDE preview with a working "Run" button that fake-streams output.

const TEASER_CODE_LINES = [
  { tx: 'fn fibonacci(n: u32) -> u64 {' },
  { tx: '    let (mut a, mut b) = (0u64, 1u64);', i: 1 },
  { tx: '    for _ in 0..n {', i: 1 },
  { tx: '        (a, b) = (b, a + b);', i: 2 },
  { tx: '    }', i: 1 },
  { tx: '    a', i: 1 },
  { tx: '}' },
  { tx: '' },
  { tx: 'fn main() {' },
  { tx: '    for n in 0..10 {', i: 1 },
  { tx: '        println!("fib({n}) = {}", fibonacci(n));', i: 2 },
  { tx: '    }', i: 1 },
  { tx: '}' },
];

function colorize(line) {
  // very small Rust syntax highlight
  return line
    .replace(/\b(fn|let|mut|for|in|return)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(u32|u64|i32)\b/g, '<span class="ty">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="num">$1</span>')
    .replace(/"([^"]*)"/g, '<span class="str">"$1"</span>')
    .replace(/(println!|format!)/g, '<span class="mac">$1</span>')
    .replace(/(fibonacci|main)(?=\()/g, '<span class="fn">$1</span>');
}

const FIB_OUTPUT = [
  'fib(0) = 0',
  'fib(1) = 1',
  'fib(2) = 1',
  'fib(3) = 2',
  'fib(4) = 3',
  'fib(5) = 5',
  'fib(6) = 8',
  'fib(7) = 13',
  'fib(8) = 21',
  'fib(9) = 34',
];

function PlaygroundTeaser() {
  const [phase, setPhase] = React.useState('idle'); // idle | queued | processing | accepted
  const [outIdx, setOutIdx] = React.useState(0);
  const [metrics, setMetrics] = React.useState({ time: '—', mem: '—', token: '—' });

  function run() {
    if (phase !== 'idle' && phase !== 'accepted') return;
    setOutIdx(0);
    setMetrics({ time: '—', mem: '—', token: 'zc_' + Math.random().toString(36).slice(2,10) });
    setPhase('queued');
    setTimeout(() => setPhase('processing'), 320);
  }

  React.useEffect(() => {
    if (phase !== 'processing') return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > FIB_OUTPUT.length) {
        clearInterval(id);
        setPhase('accepted');
        setMetrics(m => ({ ...m, time: '0.014 s', mem: '3.2 MB' }));
        return;
      }
      setOutIdx(i);
    }, 110);
    return () => clearInterval(id);
  }, [phase]);

  // auto-run once on mount for demo
  React.useEffect(() => {
    const t = setTimeout(run, 800);
    return () => clearTimeout(t);
  }, []);

  const statusColor = {
    idle: 'var(--fg-3)',
    queued: 'var(--st-queued)',
    processing: 'var(--st-processing)',
    accepted: 'var(--st-accepted)',
  }[phase];
  const statusLabel = { idle: 'idle', queued: 'queued', processing: 'processing', accepted: 'accepted' }[phase];

  return (
    <section className="zc-teaser">
      <style>{`
        .zc-teaser .shell { padding-bottom: 96px; }
        .zc-teaser-grid {
          display: grid; grid-template-columns: minmax(0, 1.45fr) 1fr; gap: 36px; align-items: start;
        }
        @media (max-width: 1020px) { .zc-teaser-grid { grid-template-columns: 1fr; } }

        .zc-ide {
          border: 1px solid var(--line-2); border-radius: 12px; overflow: hidden;
          background: var(--bg-1);
          font-family: var(--f-mono);
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6);
        }
        .zc-ide-hd {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-bottom: 1px solid var(--line);
        }
        .zc-ide-hd .dots { display: flex; gap: 6px; }
        .zc-ide-hd .dots span { width: 9px; height: 9px; border-radius: 50%; border: 1px solid var(--line-2); }
        .zc-ide-hd .lang {
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-2);
          padding: 2px 8px; border: 1px solid var(--line-2); border-radius: 4px;
          letter-spacing: 0.04em;
          margin-left: 8px;
        }
        .zc-ide-hd .lang b { color: var(--accent); font-weight: 500; }
        .zc-ide-hd .right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
        .zc-ide-hd .status {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;
          padding: 3px 8px; border-radius: 999px;
          border: 1px solid var(--line-2);
          color: var(--fg-2);
        }
        .zc-ide-hd .status .pulse {
          width: 6px; height: 6px; border-radius: 50%;
        }
        .zc-ide-hd .run-btn {
          appearance: none; border: 0; background: var(--accent); color: #0a0a0a;
          padding: 6px 12px; border-radius: 6px; font-family: var(--f-mono); font-size: 11.5px;
          letter-spacing: 0.04em; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: filter .15s ease;
        }
        .zc-ide-hd .run-btn:hover { filter: brightness(1.08); }
        .zc-ide-hd .run-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .zc-ide-body {
          display: grid; grid-template-columns: 1.2fr 1fr;
          min-height: 360px;
        }
        @media (max-width: 700px) { .zc-ide-body { grid-template-columns: 1fr; } }
        .zc-ide-editor {
          border-right: 1px solid var(--line);
          padding: 14px 16px;
          font-size: 12.5px; line-height: 1.75; color: var(--fg-1);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.012), transparent 30%),
            var(--bg-1);
        }
        .zc-ide-editor .ln { display: flex; gap: 14px; }
        .zc-ide-editor .lno { color: var(--fg-4); width: 18px; text-align: right; user-select: none; flex-shrink: 0; }
        .zc-ide-editor .tx { white-space: pre; }
        .zc-ide-editor .kw  { color: var(--blue-1); }
        .zc-ide-editor .ty  { color: var(--magenta); }
        .zc-ide-editor .str { color: #9be39b; }
        .zc-ide-editor .num { color: #d2a86a; }
        .zc-ide-editor .mac { color: var(--accent); }
        .zc-ide-editor .fn  { color: #f5d76e; }

        .zc-ide-output {
          padding: 14px 16px;
          font-size: 12.5px; line-height: 1.75; color: var(--st-accepted);
          background: var(--bg);
        }
        .zc-ide-output .ohd {
          display: flex; gap: 14px; padding-bottom: 8px;
          border-bottom: 1px solid var(--line);
          font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--fg-3); margin-bottom: 10px;
        }
        .zc-ide-output .ohd .tab.active { color: var(--accent); border-bottom: 1px solid var(--accent); padding-bottom: 6px; margin-bottom: -9px; }
        .zc-ide-output .out-ln { white-space: pre; }
        .zc-ide-output .out-empty { color: var(--fg-3); font-style: italic; }
        .zc-ide-output .caret {
          display: inline-block; width: 7px; height: 14px; background: var(--st-accepted);
          vertical-align: -2px; margin-left: 2px;
          animation: zc-blink 1s steps(1) infinite;
        }
        @keyframes zc-blink { 50% { opacity: 0; } }

        .zc-ide-foot {
          border-top: 1px solid var(--line);
          padding: 10px 14px;
          display: flex; gap: 16px; flex-wrap: wrap;
          font-size: 11px; color: var(--fg-3); letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .zc-ide-foot > span { white-space: nowrap; }
        .zc-ide-foot b { color: var(--fg-1); font-weight: 500; font-family: var(--f-mono); }

        .zc-teaser-side h3 {
          font-family: var(--f-display); font-weight: 400;
          font-size: 32px; line-height: 1.1; letter-spacing: -0.012em;
          margin: 0 0 14px; color: var(--fg);
        }
        .zc-teaser-side h3 .it { font-style: italic; }
        .zc-teaser-side p { color: var(--fg-2); font-size: 15px; max-width: 460px; }
        .zc-teaser-side .features {
          list-style: none; padding: 0; margin: 24px 0 0;
          display: grid; gap: 0;
        }
        .zc-teaser-side .features li {
          display: flex; gap: 12px; padding: 12px 0;
          border-top: 1px dashed var(--line);
          font-size: 13.5px; color: var(--fg-1);
        }
        .zc-teaser-side .features li:first-child { border-top: 0; }
        .zc-teaser-side .features li .k {
          font-family: var(--f-mono); font-size: 11px; color: var(--accent);
          letter-spacing: 0.12em; text-transform: uppercase;
          flex: 0 0 110px;
        }
        .zc-teaser-side .open-btn {
          margin-top: 28px;
          display: inline-flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 8px;
          font-family: var(--f-mono); font-size: 13px;
          background: var(--bg-2); border: 1px solid var(--line-2); color: var(--fg);
          transition: border-color .15s ease, background .15s ease;
        }
        .zc-teaser-side .open-btn:hover { border-color: var(--accent); background: color-mix(in oklab, var(--accent) 8%, var(--bg-2)); color: var(--accent); }
      `}</style>
      <div className="shell">
        <SectionHeader
          kicker="playground"
          title='Try it. <span class="it">No install.</span>'
          sub="A live workspace backed by the same API. Pick a language, type, run. Stream stdout while it executes."
        />
        <div className="zc-teaser-grid">
          <div className="zc-ide">
            <div className="zc-ide-hd">
              <div className="dots"><span/><span/><span/></div>
              <span className="lang">lang · <b>rust 1.85</b></span>
              <span className="lang">id · 73</span>
              <div className="right">
                <span className="status" style={{ color: statusColor, borderColor: statusColor }}>
                  <span className="pulse" style={{ background: statusColor, boxShadow: phase !== 'idle' ? `0 0 8px ${statusColor}` : 'none' }} />
                  {statusLabel}
                </span>
                <button className="run-btn" onClick={run} disabled={phase === 'queued' || phase === 'processing'}>
                  <svg width="9" height="9" viewBox="0 0 8 8" fill="currentColor"><path d="M1 0 L7 4 L1 8 Z"/></svg>
                  {phase === 'queued' || phase === 'processing' ? 'running…' : 'run'}
                </button>
              </div>
            </div>
            <div className="zc-ide-body">
              <div className="zc-ide-editor">
                {TEASER_CODE_LINES.map((l, i) => (
                  <div key={i} className="ln">
                    <span className="lno">{i+1}</span>
                    <span className="tx" dangerouslySetInnerHTML={{ __html: colorize('    '.repeat(l.i || 0) + l.tx) || '&nbsp;' }} />
                  </div>
                ))}
              </div>
              <div className="zc-ide-output">
                <div className="ohd">
                  <span className="tab active">stdout</span>
                  <span className="tab">stderr</span>
                  <span className="tab">compile</span>
                  <span className="tab">meta</span>
                </div>
                {outIdx === 0 && phase === 'idle' && <div className="out-empty">awaiting run…</div>}
                {phase === 'queued' && <div className="out-empty">queued · waiting for worker NOTIFY</div>}
                {FIB_OUTPUT.slice(0, outIdx).map((l, i) => <div key={i} className="out-ln">{l}</div>)}
                {phase === 'processing' && outIdx > 0 && <span className="caret"/>}
              </div>
            </div>
            <div className="zc-ide-foot">
              <span>token · <b>{metrics.token}</b></span>
              <span>wall · <b>{metrics.time}</b></span>
              <span>memory · <b>{metrics.mem}</b></span>
              <span style={{ marginLeft: 'auto' }}>exit · <b>{phase === 'accepted' ? '0' : '—'}</b></span>
            </div>
          </div>

          <div className="zc-teaser-side">
            <h3>The same API, <span className="it">with a UI.</span></h3>
            <p>Backed by <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--fg-1)' }}>POST /v1/submissions/&#123;token&#125;/stream</span> — the SSE endpoint your agents will use in production. The playground is just one of its consumers.</p>
            <ul className="features">
              <li><span className="k">streaming</span>stdout line-by-line via SSE, not polling</li>
              <li><span className="k">share</span>permalink each run · sealed token, replayable</li>
              <li><span className="k">limits</span>memory / time / pids exposed as sliders</li>
              <li><span className="k">api</span>"open in curl" reveals the equivalent request</li>
            </ul>
            <a className="open-btn" href="playground.html">
              open the full playground
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 5h8M5 1l4 4-4 4"/></svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { PlaygroundTeaser });

// landing/hero.jsx
// The hero. Four variants exposed via tweaks: diagram (default), typing, split, big-type.

function HeroKicker({ accent }) {
  return (
    <div className="zc-kicker">
      <style>{`
        .zc-kicker {
          display: inline-flex; align-items: center; gap: 12px;
          font-family: var(--f-mono); font-size: 11px;
          color: var(--fg-2); letter-spacing: 0.14em; text-transform: uppercase;
          padding: 6px 12px 6px 10px;
          border: 1px solid var(--line-2);
          border-radius: 999px;
          background: color-mix(in oklab, var(--bg-1) 70%, transparent);
          backdrop-filter: blur(8px);
          box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 18px -8px rgba(0,0,0,0.5);
        }
        .zc-kicker .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 70%, transparent);
          animation: zc-pulse 1.6s ease-out infinite;
        }
        @keyframes zc-pulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 70%, transparent); }
          70%  { box-shadow: 0 0 0 10px color-mix(in oklab, var(--accent) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 0%, transparent); }
        }
        .zc-kicker .sep { color: var(--fg-4); }
        .zc-kicker .v { color: var(--fg-1); }
      `}</style>
      <span className="dot" />
      <span className="v">v0.1.4</span>
      <span className="sep">/</span>
      <span>rust 1.85 · edition 2024</span>
      <span className="sep">/</span>
      <span>kernel ≥ 5.14</span>
    </div>
  );
}

/* ── stat row docked below the layer diagram ────────────────────────
   Replaces the older floating chips that overlapped the diagram labels.
   Four equal-width tiles, each with an italic display-font value, monospace
   label, and a small caption. The DISPATCH tile reads its live ms value
   from a window CustomEvent published by LayerDiagram. */
function FloatingChips() {
  const [ms, setMs] = React.useState(() => (typeof window !== 'undefined' && window.__zcDispatchMs) || 0);
  React.useEffect(() => {
    const onMs = (e) => setMs(e.detail);
    window.addEventListener('zerocode:dispatch-ms', onMs);
    return () => window.removeEventListener('zerocode:dispatch-ms', onMs);
  }, []);

  const tiles = [
    { label: 'security', value: '0',           unit: 'known cves',     hint: 'auditable threat model' },
    { label: 'dispatch', value: ms.toFixed(2), unit: 'ms · p99',       hint: 'listen / notify wake', mono: true },
    { label: 'langs',    value: '41',          unit: 'runtimes',       hint: 'core 7 first-class' },
    { label: 'layers',   value: '8',           unit: 'kernel-enforced', hint: 'userns → seccomp → nnp' },
  ];

  return (
    <div className="zc-statrow">
      <style>{`
        .zc-statrow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          padding: 12px 0 0;
          margin-top: 12px;
          border-top: 1px solid var(--line);
        }
        @media (max-width: 720px) {
          .zc-statrow { grid-template-columns: repeat(2, 1fr); }
        }
        .zc-stat {
          display: flex; flex-direction: column; gap: 4px;
          padding: 12px 14px;
          border: 1px solid var(--line-2);
          border-radius: 8px;
          background: color-mix(in oklab, var(--bg-1) 88%, transparent);
          backdrop-filter: blur(6px);
          box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
          transition: border-color .15s ease, transform .15s ease;
        }
        .zc-stat:hover {
          border-color: color-mix(in oklab, var(--accent) 50%, var(--line-2));
          transform: translateY(-1px);
        }
        .zc-stat .label {
          font-family: var(--f-mono); font-size: 10px;
          color: var(--fg-3); letter-spacing: 0.16em; text-transform: uppercase;
        }
        .zc-stat .vrow {
          display: flex; align-items: baseline; gap: 6px;
          min-height: 28px;
        }
        .zc-stat .v {
          font-family: var(--f-display); font-style: italic;
          font-size: 28px; line-height: 1; color: var(--accent);
          letter-spacing: -0.012em;
          font-variant-numeric: tabular-nums;
        }
        .zc-stat .v.mono {
          font-family: var(--f-mono); font-style: normal;
          font-size: 20px;
          color: var(--accent);
        }
        .zc-stat .u {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-2); letter-spacing: 0.06em;
        }
        .zc-stat .hint {
          font-family: var(--f-mono); font-size: 10px;
          color: var(--fg-3); letter-spacing: 0.04em;
        }
      `}</style>
      {tiles.map((t, i) => (
        <div key={i} className="zc-stat">
          <div className="label">{t.label}</div>
          <div className="vrow">
            <span className={`v ${t.mono ? 'mono' : ''}`}>{t.value}</span>
            <span className="u">{t.unit}</span>
          </div>
          <div className="hint">{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

/* ── headline & subhead shared by diagram & typing variants ──────────── */
function HeroCopy() {
  return (
    <div className="zc-copy">
      <style>{`
        .zc-copy h1 {
          font-family: var(--f-display);
          font-weight: 400;
          font-size: clamp(56px, 7.4vw, 112px);
          line-height: 0.94;
          letter-spacing: -0.02em;
          margin: 22px 0 0;
          color: var(--fg);
          text-wrap: balance;
        }
        .zc-copy h1 .ln { display: block; }
        .zc-copy h1 .it {
          font-style: italic;
          background: linear-gradient(180deg, var(--fg) 0%, var(--fg-1) 60%, var(--accent) 110%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
        }
        .zc-copy h1 .mono {
          font-family: var(--f-mono);
          font-size: 0.58em;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--accent);
          padding: 0 8px;
          vertical-align: 0.08em;
          background: color-mix(in oklab, var(--accent) 10%, transparent);
          border: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
          border-radius: 6px;
          margin: 0 4px;
          box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 8%, transparent),
                      0 6px 20px -10px color-mix(in oklab, var(--accent) 60%, transparent);
        }
        .zc-copy p.sub {
          font-family: var(--f-sans);
          font-size: 18px; line-height: 1.6;
          color: var(--fg-2);
          max-width: 560px;
          margin: 28px 0 0;
        }
        .zc-copy p.sub b { color: var(--fg); font-weight: 500; }
        .zc-copy p.sub .hl {
          color: var(--fg);
          background: linear-gradient(180deg, transparent 62%, color-mix(in oklab, var(--accent) 22%, transparent) 62%);
          padding: 0 2px;
        }
      `}</style>
      <h1>
        <span className="ln">Code in.</span>
        <span className="ln"><span className="mono">stdout</span> out.</span>
        <span className="ln"><span className="it">Nothing else</span> escapes.</span>
      </h1>
      <p className="sub">
        An open-source, security-hardened code execution sandbox in Rust. <b>Eight kernel-enforced isolation layers</b>,
        <b> 41 language runtimes</b>, <span className="hl">sub-5 ms dispatch</span>. A drop-in replacement for
        Judge0 with defense-in-depth and a modern API.
      </p>
    </div>
  );
}

function HeroCTAs() {
  return (
    <div className="zc-ctas">
      <style>{`
        .zc-ctas { display: flex; gap: 10px; margin-top: 32px; flex-wrap: wrap; }
        .zc-btn {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 13px 18px; border-radius: 9px;
          font-family: var(--f-mono); font-size: 13px; letter-spacing: 0.02em;
          white-space: nowrap;
          transition: filter .15s ease, border-color .15s ease, background .15s ease, transform .12s ease, box-shadow .2s ease;
          cursor: pointer; position: relative;
        }
        .zc-btn.primary {
          background: var(--accent);
          color: #0a0a0a;
          border: 1px solid var(--accent);
          box-shadow: 0 10px 30px -10px color-mix(in oklab, var(--accent) 80%, transparent),
                      0 1px 0 rgba(255,255,255,0.18) inset;
        }
        .zc-btn.primary:hover {
          filter: brightness(1.06);
          transform: translateY(-1px);
          box-shadow: 0 14px 36px -10px color-mix(in oklab, var(--accent) 90%, transparent),
                      0 1px 0 rgba(255,255,255,0.2) inset;
        }
        .zc-btn.ghost {
          background: color-mix(in oklab, var(--bg-1) 60%, transparent);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          backdrop-filter: blur(8px);
        }
        .zc-btn.ghost:hover { border-color: var(--line-strong); color: var(--fg); background: color-mix(in oklab, var(--bg-2) 70%, transparent); }
        .zc-btn:active { transform: translateY(1px); }
        .zc-btn .arrow { transition: transform .2s ease; }
        .zc-btn:hover .arrow { transform: translateX(3px); }
      `}</style>
      <a className="zc-btn primary" href="docs.html">
        get started
        <svg className="arrow" width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 5h8M5 1l4 4-4 4"/></svg>
      </a>
      <a className="zc-btn ghost" href="#">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.88 2.34.67.07-.52.28-.88.5-1.08-1.77-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82A7.6 7.6 0 018 4.07c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.74.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        view on github
      </a>
      <a className="zc-btn ghost" href="playground.html">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="2" width="14" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8 10h4"/></svg>
        open playground
      </a>
    </div>
  );
}

function Terminal({ lines, status = 'accepted' }) {
  return (
    <div className="zc-term">
      <style>{`
        .zc-term {
          margin-top: 40px;
          border: 1px solid var(--line-2);
          border-radius: 12px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 60%),
            var(--bg-1);
          font-family: var(--f-mono);
          font-size: 12.5px;
          line-height: 1.65;
          overflow: hidden;
          max-width: 660px;
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6),
                      0 1px 0 rgba(255,255,255,0.04) inset;
          position: relative;
        }
        .zc-term::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(60% 90% at 50% 0%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 60%);
          pointer-events: none;
        }
        .zc-term-bar {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          color: var(--fg-3); font-size: 11px;
          letter-spacing: 0.08em; text-transform: uppercase;
          position: relative; z-index: 1;
        }
        .zc-term-dots { display: flex; gap: 6px; margin-right: 4px; }
        .zc-term-dots span {
          width: 10px; height: 10px; border-radius: 50%;
          border: 1px solid var(--line-2);
        }
        .zc-term-bar .path { color: var(--fg-2); text-transform: none; letter-spacing: 0; font-size: 11.5px; }
        .zc-term-bar .verdict {
          margin-left: auto;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 9px; border-radius: 999px;
          border: 1px solid color-mix(in oklab, var(--st-accepted) 50%, transparent);
          color: var(--st-accepted); background: color-mix(in oklab, var(--st-accepted) 8%, transparent);
          text-transform: uppercase; font-size: 10px; letter-spacing: 0.14em;
        }
        .zc-term-bar .verdict .pulse {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--st-accepted); box-shadow: 0 0 8px var(--st-accepted);
        }
        .zc-term-body { padding: 16px 18px 20px; position: relative; z-index: 1; }
        .zc-term-body .ln { display: flex; gap: 14px; }
        .zc-term-body .lno { color: var(--fg-4); width: 18px; text-align: right; user-select: none; flex-shrink: 0; }
        .zc-term-body .tx { color: var(--fg-1); white-space: pre-wrap; word-break: break-all; }
        .zc-term-body .tx .pr { color: var(--accent); }
        .zc-term-body .tx .cmd { color: var(--fg); }
        .zc-term-body .tx .flag { color: var(--blue-1); }
        .zc-term-body .tx .str { color: #9be39b; }
        .zc-term-body .tx .num { color: #d2a86a; }
        .zc-term-body .tx .key { color: var(--fg-2); }
        .zc-term-body .tx .punct { color: var(--fg-3); }
        .zc-term-body .tx .out { color: var(--st-accepted); }
        .zc-term-body .sep { height: 8px; }
      `}</style>
      <div className="zc-term-bar">
        <div className="zc-term-dots"><span/><span/><span/></div>
        <span className="path">~/zerocode</span>
        <span className="verdict"><span className="pulse"/>accepted · 18 ms</span>
      </div>
      <div className="zc-term-body">
        {lines.map((ln, i) => ln === null
          ? <div key={i} className="sep" />
          : (
            <div key={i} className="ln">
              <span className="lno">{ln.no ?? ''}</span>
              <span className="tx" dangerouslySetInnerHTML={{ __html: ln.html }} />
            </div>
          )
        )}
      </div>
    </div>
  );
}

const CURL_LINES = [
  { no: '1', html: `<span class="pr">$</span> <span class="cmd">curl</span> <span class="flag">-sX POST</span> https://api.zerocode.run/v1/submissions?wait=true \\` },
  { no: '2', html: `    <span class="flag">-H</span> <span class="str">'authorization: bearer $ZC_KEY'</span> \\` },
  { no: '3', html: `    <span class="flag">-d</span> <span class="str">'{"language_id":71, "source_code":"print(\\"hello, zerocode\\")"}'</span>` },
  null,
  { no: '', html: `<span class="punct">{</span><span class="key">"token"</span><span class="punct">:</span> <span class="str">"7c8e‥a31"</span><span class="punct">,</span> <span class="key">"status"</span><span class="punct">:</span> <span class="punct">{</span><span class="key">"id"</span><span class="punct">:</span><span class="num">3</span><span class="punct">,</span> <span class="key">"description"</span><span class="punct">:</span> <span class="str">"Accepted"</span><span class="punct">},</span>` },
  { no: '', html: `<span class="key"> "stdout"</span><span class="punct">:</span> <span class="out">"hello, zerocode\\n"</span><span class="punct">,</span> <span class="key">"time"</span><span class="punct">:</span> <span class="str">"0.018"</span><span class="punct">,</span> <span class="key">"memory"</span><span class="punct">:</span> <span class="num">3712</span><span class="punct">}</span>` },
];

/* ── mouse-tracked spotlight on a wrapper ────────────────────────────── */
function useSpotlight() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', `${mx}%`);
      el.style.setProperty('--my', `${my}%`);
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, []);
  return ref;
}

/* ── variant: diagram (default) ──────────────────────────────────────── */
function HeroDiagram({ accent }) {
  const spotRef = useSpotlight();
  return (
    <div className="zc-hero-grid" ref={spotRef}>
      <style>{`
        .zc-hero { position: relative; overflow: hidden; }
        .zc-hero::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(var(--line) 1px, transparent 1px),
            linear-gradient(90deg, var(--line) 1px, transparent 1px);
          background-size: 80px 80px;
          mask-image: radial-gradient(60% 70% at 50% 30%, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(60% 70% at 50% 30%, black 30%, transparent 75%);
          opacity: 0.4;
          pointer-events: none;
        }
        .zc-hero::after {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(500px circle at var(--mx, 50%) var(--my, 30%),
            color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%);
          pointer-events: none;
          transition: background-position .15s ease;
        }
        .zc-hero-grid {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 580px;
          gap: 56px;
          padding: 96px 0 112px;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .zc-hero-grid { grid-template-columns: 1fr; }
          .zc-hero-right { display: none; }
        }
        .zc-hero-right {
          position: relative;
          display: flex; flex-direction: column;
          min-height: 560px;
        }
        .zc-hero-left { position: relative; z-index: 2; }
      `}</style>
      <div className="zc-hero-left">
        <HeroKicker accent={accent} />
        <HeroCopy />
        <HeroCTAs />
        <Terminal lines={CURL_LINES} />
      </div>
      <div className="zc-hero-right">
        <LayerDiagram accent={accent} />
        <FloatingChips />
      </div>
    </div>
  );
}

/* ── variant: live-typing curl ──────────────────────────────────────── */
function useTyping(text, speed = 18, start = 200) {
  const [t, setT] = React.useState('');
  React.useEffect(() => {
    let i = 0; let id;
    const startT = setTimeout(() => {
      id = setInterval(() => {
        i += 1;
        if (i > text.length) { clearInterval(id); return; }
        setT(text.slice(0, i));
      }, speed);
    }, start);
    return () => { clearTimeout(startT); if (id) clearInterval(id); };
  }, [text, speed, start]);
  return t;
}

function HeroTyping({ accent }) {
  const cmd = `curl -sX POST https://api.zerocode.run/v1/submissions?wait=true \\
    -H 'authorization: bearer $ZC_KEY' \\
    -d '{"language_id":71,"source_code":"for i in range(5): print(i*i)"}'`;
  const out = `{"token":"7c8e..a31","status":{"id":3,"description":"Accepted"},"stdout":"0\\n1\\n4\\n9\\n16\\n","time":"0.014","memory":3712}`;
  const typed = useTyping(cmd, 14, 400);
  const showOut = typed.length >= cmd.length;
  const typedOut = useTyping(showOut ? out : '', 6, 200);

  return (
    <div className="zc-hero-typing">
      <style>{`
        .zc-hero-typing {
          padding: 96px 0 110px;
          display: grid; grid-template-columns: 1fr; gap: 0;
          place-items: center;
        }
        .zc-hero-typing .inner { max-width: 940px; width: 100%; }
        .zc-hero-typing h1 {
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(56px, 8vw, 96px); line-height: 1;
          margin: 14px 0 8px; letter-spacing: -0.018em;
        }
        .zc-hero-typing h1 .it { font-style: italic; }
        .zc-hero-typing .sub {
          color: var(--fg-2); max-width: 620px; font-size: 17px;
          margin: 22px 0 36px;
        }
        .zc-hero-typing .term-wrap { font-family: var(--f-mono); font-size: 13px; line-height: 1.65;
          border: 1px solid var(--line-2); border-radius: 10px; padding: 22px 26px;
          background: var(--bg-1); }
        .zc-hero-typing .cmd { color: var(--fg-1); white-space: pre-wrap; word-break: break-all; }
        .zc-hero-typing .cmd .pr { color: var(--accent); }
        .zc-hero-typing .out { color: var(--st-accepted); margin-top: 16px; white-space: pre-wrap; word-break: break-all; }
        .zc-hero-typing .caret {
          display: inline-block; width: 8px; height: 16px; background: var(--accent);
          vertical-align: -3px; margin-left: 2px;
          animation: zc-blink 1s steps(1) infinite;
        }
        @keyframes zc-blink { 50% { opacity: 0; } }
      `}</style>
      <div className="inner">
        <HeroKicker accent={accent} />
        <h1>Run code <span className="it">in three lines.</span></h1>
        <p className="sub">REST or gRPC. 41 languages. Same API shape as Judge0, twelve isolation layers tighter.</p>
        <div className="term-wrap">
          <div className="cmd"><span className="pr">$</span> {typed}{!showOut && <span className="caret"/>}</div>
          {showOut && <div className="out">{typedOut}{typedOut.length < out.length && <span className="caret"/>}</div>}
        </div>
        <HeroCTAs />
      </div>
    </div>
  );
}

/* ── variant: split editor + output ─────────────────────────────────── */
function HeroSplit({ accent }) {
  return (
    <div className="zc-hero-split">
      <style>{`
        .zc-hero-split { padding: 72px 0 96px; display: grid; grid-template-columns: 1.05fr 1fr; gap: 56px; align-items: center; }
        @media (max-width: 1100px) { .zc-hero-split { grid-template-columns: 1fr; } }
        .zc-hero-split h1 { font-family: var(--f-display); font-weight: 400;
          font-size: clamp(48px, 6.4vw, 88px); line-height: 1; margin: 14px 0 0; letter-spacing: -0.018em; }
        .zc-hero-split h1 .it { font-style: italic; }
        .zc-hero-split p.sub { color: var(--fg-2); max-width: 480px; margin: 22px 0 28px; font-size: 16.5px; }
        .zc-hero-split .pane { border: 1px solid var(--line-2); border-radius: 10px; background: var(--bg-1); overflow: hidden; }
        .zc-hero-split .pane-hd {
          padding: 9px 12px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px;
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .zc-hero-split .pane-bd { font-family: var(--f-mono); font-size: 12.5px; line-height: 1.7;
          padding: 14px 16px; color: var(--fg-1); }
        .zc-hero-split .kw { color: var(--blue-1); }
        .zc-hero-split .st { color: #9be39b; }
        .zc-hero-split .cm { color: var(--fg-3); font-style: italic; }
        .zc-hero-split .num { color: #d2a86a; }
        .zc-hero-split .stack { display: grid; gap: 14px; }
        .zc-hero-split .out-line { color: var(--st-accepted); }
      `}</style>
      <div>
        <HeroKicker accent={accent} />
        <h1>Source in.<br/><span className="it">Streams</span> out.</h1>
        <p className="sub">SSE for stdout, stderr and verdict events. Open the stream, read until <span className="mono dim">[DONE]</span>, ship.</p>
        <HeroCTAs />
      </div>
      <div className="stack">
        <div className="pane">
          <div className="pane-hd">submission.py · python 3.12</div>
          <div className="pane-bd"><pre style={{margin:0,fontFamily:'inherit'}}>
{`
`}<span className="cm"># compute prime sieve, stream as we go</span>{`
`}<span className="kw">def</span> sieve(n):{`
    `}flags = [True] * n{`
    `}<span className="kw">for</span> i <span className="kw">in</span> range(<span className="num">2</span>, n):{`
        `}<span className="kw">if</span> flags[i]:{`
            `}<span className="kw">yield</span> i{`
            `}<span className="kw">for</span> j <span className="kw">in</span> range(i*i, n, i): flags[j] = <span className="kw">False</span>{`
`}<span className="kw">for</span> p <span className="kw">in</span> sieve(<span className="num">100</span>): print(p)</pre>
          </div>
        </div>
        <div className="pane">
          <div className="pane-hd">stdout · sse stream</div>
          <div className="pane-bd">
            <div className="out-line">event: stdout</div>
            <div className="out-line">data: 2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 53 59 61 67 71 73 79 83 89 97</div>
            <div className="out-line">event: status</div>
            <div className="out-line">data: {`{"description":"Accepted","time":"0.012","memory":3208}`}</div>
            <div className="out-line">[DONE]</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── variant: big-type wordmark ────────────────────────────────────── */
function HeroBigType({ accent }) {
  return (
    <div className="zc-hero-big">
      <style>{`
        .zc-hero-big {
          padding: 120px 0 140px;
          text-align: left;
        }
        .zc-hero-big .wordmark {
          font-family: var(--f-display); font-style: italic;
          font-size: clamp(120px, 22vw, 320px);
          line-height: 0.88; letter-spacing: -0.04em;
          color: var(--fg);
          margin: 24px 0;
          background: linear-gradient(180deg, var(--fg) 0%, var(--fg) 70%, var(--accent) 100%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
        }
        .zc-hero-big .claim {
          font-family: var(--f-display); font-size: clamp(28px, 3vw, 44px);
          line-height: 1.1; color: var(--fg-1); max-width: 740px; margin: 0 0 36px;
          letter-spacing: -0.012em;
        }
        .zc-hero-big .claim .mono { font-family: var(--f-mono); color: var(--accent); font-size: 0.7em; }
      `}</style>
      <HeroKicker accent={accent} />
      <div className="wordmark">zerocode</div>
      <div className="claim">
        A security-hardened code execution sandbox. <span className="mono">8 layers</span>, <span className="mono">41 langs</span>,
        <span className="mono"> sub-5 ms</span> — open source, in Rust.
      </div>
      <HeroCTAs />
    </div>
  );
}

function Hero({ variant, accent }) {
  return (
    <section className="zc-hero">
      <div className="shell">
        {variant === 'diagram' && <HeroDiagram accent={accent} />}
        {variant === 'typing' && <HeroTyping accent={accent} />}
        {variant === 'split' && <HeroSplit accent={accent} />}
        {variant === 'bigtype' && <HeroBigType accent={accent} />}
      </div>
    </section>
  );
}

window.Hero = Hero;
window.useSpotlight = useSpotlight;

// landing/sections.jsx
// Smaller sections: trust strip, "why" three-up, deploy, footer, section header helper.

function SectionHeader({ kicker, title, sub, anchor }) {
  return (
    <header className="zc-sh" id={anchor}>
      <style>{`
        .zc-sh { padding: 96px 0 40px; max-width: 760px; }
        .zc-sh .k {
          font-family: var(--f-mono); font-size: 11px;
          color: var(--accent); letter-spacing: 0.16em; text-transform: uppercase;
          display: inline-flex; align-items: center; gap: 12px;
        }
        .zc-sh .k::before {
          content: ''; width: 28px; height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent));
        }
        .zc-sh h2 {
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(40px, 4.6vw, 60px); line-height: 1.05;
          letter-spacing: -0.018em;
          margin: 22px 0 16px; color: var(--fg);
          text-wrap: balance;
        }
        .zc-sh h2 .it {
          font-style: italic;
          background: linear-gradient(180deg, var(--fg) 0%, var(--fg-1) 50%, var(--accent) 110%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
        }
        .zc-sh p {
          color: var(--fg-2); max-width: 620px; font-size: 17px; margin: 0;
          line-height: 1.6;
        }
      `}</style>
      {kicker && <div className="k">{kicker}</div>}
      <h2 dangerouslySetInnerHTML={{ __html: title }} />
      {sub && <p>{sub}</p>}
    </header>
  );
}

/* ───────────── Trust strip ───────────── */
function MiniSpark({ data, color }) {
  // ascending sparkline
  const W = 56, H = 18;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (W - 2) + 1;
    const y = H - 1 - ((v - min) / (max - min || 1)) * (H - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.18" filter="blur(2px)"/>
    </svg>
  );
}

function TrustStrip() {
  const items = [
    { v: '8',     u: 'isolation layers',      n: 'kernel-enforced',     spark: [3,4,4,5,6,7,7,8] },
    { v: '41',    u: 'language runtimes',     n: 'core 7 first-class',  spark: [12,15,20,24,28,33,38,41] },
    { v: '< 5',   u: 'ms job dispatch',       n: 'postgres listen/notify', spark: [12,9,7,6,5,5,4,5] },
    { v: '71',    u: 'adversarial tests',     n: 'memory, fork, escape', spark: [10,18,24,33,42,55,64,71] },
    { v: '0',     u: 'known cves',            n: 'auditable threat model', spark: [0,0,0,0,0,0,0,0] },
  ];
  return (
    <section className="zc-trust">
      <style>{`
        .zc-trust {
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          background:
            linear-gradient(180deg, color-mix(in oklab, var(--bg-1) 95%, transparent), color-mix(in oklab, var(--bg) 95%, transparent));
          position: relative; overflow: hidden;
        }
        .zc-trust::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(60% 80% at 50% 0%, color-mix(in oklab, var(--accent) 5%, transparent), transparent 70%);
          pointer-events: none;
        }
        .zc-trust-inner {
          max-width: var(--max-w); margin: 0 auto;
          padding: 32px var(--pad-x);
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 0;
          position: relative;
        }
        @media (max-width: 900px) { .zc-trust-inner { grid-template-columns: repeat(2, 1fr); gap: 24px; } }
        .zc-trust-cell {
          padding: 6px 24px; border-left: 1px solid var(--line);
          display: flex; flex-direction: column; gap: 6px;
          position: relative;
        }
        .zc-trust-cell:first-child { border-left: 0; padding-left: 0; }
        .zc-trust-cell .row { display: flex; align-items: flex-end; gap: 12px; justify-content: space-between; }
        .zc-trust-cell .v {
          font-family: var(--f-display); font-size: 50px; line-height: 0.95;
          color: var(--fg); letter-spacing: -0.025em;
          background: linear-gradient(180deg, var(--fg) 0%, var(--accent) 130%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
        }
        .zc-trust-cell .u {
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-2);
          letter-spacing: 0.1em; text-transform: uppercase;
        }
        .zc-trust-cell .n {
          font-size: 12px; color: var(--fg-3); margin-top: 1px;
        }
        .zc-trust-cell .spark { opacity: 0.7; margin-bottom: 6px; }
      `}</style>
      <div className="zc-trust-inner">
        {items.map((it, i) => (
          <div key={i} className="zc-trust-cell">
            <div className="row">
              <div className="v">{it.v}</div>
              <div className="spark"><MiniSpark data={it.spark} color="var(--accent)"/></div>
            </div>
            <div className="u">{it.u}</div>
            <div className="n">{it.n}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────── Why three-up ───────────── */
function WhyCard({ no, label, title, body, points, accent, glyph }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, []);
  return (
    <article className="zc-why" ref={ref}>
      <style>{`
        .zc-why {
          position: relative;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 32px 28px 28px;
          background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg) 100%);
          transition: border-color .25s ease, transform .25s ease, box-shadow .25s ease;
          overflow: hidden;
          isolation: isolate;
        }
        .zc-why::after {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%),
            color-mix(in oklab, var(--accent) 16%, transparent), transparent 50%);
          opacity: 0;
          transition: opacity .25s ease;
          pointer-events: none;
          z-index: 0;
        }
        .zc-why:hover { border-color: color-mix(in oklab, var(--accent) 35%, var(--line-2)); transform: translateY(-3px); box-shadow: 0 30px 60px -30px rgba(0,0,0,0.6); }
        .zc-why:hover::after { opacity: 1; }
        .zc-why > * { position: relative; z-index: 1; }
        .zc-why::before {
          content: ''; position: absolute; top: 0; left: 0; height: 1px; width: 64px;
          background: linear-gradient(90deg, var(--accent), transparent);
          z-index: 2;
        }
        .zc-why .no {
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
          letter-spacing: 0.14em; text-transform: uppercase;
          display: flex; align-items: center; gap: 10px;
        }
        .zc-why .no .lbl { color: var(--accent); }
        .zc-why h3 {
          font-family: var(--f-display); font-weight: 400;
          font-size: 36px; line-height: 1.08;
          margin: 20px 0 14px; color: var(--fg); letter-spacing: -0.014em;
        }
        .zc-why h3 .it {
          font-style: italic;
          background: linear-gradient(180deg, var(--fg-1) 0%, var(--accent) 130%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
        }
        .zc-why p { color: var(--fg-2); margin: 0 0 20px; font-size: 14.5px; line-height: 1.65; }
        .zc-why ul { list-style: none; padding: 0; margin: 0;
          font-family: var(--f-mono); font-size: 12px; color: var(--fg-1); }
        .zc-why ul li {
          display: flex; gap: 12px; padding: 9px 0;
          border-top: 1px dashed var(--line);
        }
        .zc-why ul li:first-child { border-top: 0; padding-top: 4px; }
        .zc-why ul .k { color: var(--fg-3); flex-shrink: 0; min-width: 86px; }
        .zc-why ul .v { color: var(--fg); }
        .zc-why .glyph {
          position: absolute; right: 22px; top: 22px; opacity: .9;
          transition: transform .35s ease, opacity .25s ease;
          z-index: 1;
        }
        .zc-why:hover .glyph { transform: rotate(8deg) scale(1.08); opacity: 1; }
      `}</style>
      <div className="no"><span>{no}</span><span className="lbl">/ {label}</span></div>
      <div className="glyph">{glyph}</div>
      <h3 dangerouslySetInnerHTML={{ __html: title }} />
      <p>{body}</p>
      <ul>
        {points.map((p, i) => (
          <li key={i}><span className="k">{p.k}</span><span className="v">{p.v}</span></li>
        ))}
      </ul>
    </article>
  );
}

function WhyThreeUp() {
  const items = [
    {
      no: '01', label: 'security',
      title: 'Defense, <span class="it">in depth.</span>',
      body: 'Every submission runs through eight kernel-enforced isolation layers — user namespaces, pivot_root, landlock LSM, seccomp BPF, cgroup v2 quotas, dropped capabilities, NO_NEW_PRIVS. An escape lands in a credential-less, code-less environment.',
      points: [
        { k: 'CVE history', v: '0 known' },
        { k: 'image base', v: 'distroless · read-only' },
        { k: 'audit', v: 'STRIDE · 71 tests' },
      ],
      glyph: <ShieldGlyph />,
    },
    {
      no: '02', label: 'speed',
      title: 'Sub-5 ms <span class="it">job pickup.</span>',
      body: 'Workers wake on Postgres LISTEN/NOTIFY — no polling. Moka in-memory caches for results and compile artifacts. HTTP/2 + SSE streams output as it happens; gRPC available on the same state machine.',
      points: [
        { k: 'dispatch', v: '< 5 ms (p99)' },
        { k: 'streaming', v: 'sse · grpc h2c' },
        { k: 'cache', v: 'moka · compile + result' },
      ],
      glyph: <BoltGlyph />,
    },
    {
      no: '03', label: 'compatibility',
      title: 'A <span class="it">drop-in</span> replacement.',
      body: 'Same language IDs as Judge0, same base64 mode, same callbacks, same ?wait=true. Bring an existing client and point it at zerocode. Then opt into the modern surface: gRPC, SSE, structured errors, OpenAPI 3.1.',
      points: [
        { k: 'api shape', v: 'judge0-compatible' },
        { k: 'new surface', v: 'rest + grpc + sse' },
        { k: 'spec', v: 'openapi 3.1 · .proto' },
      ],
      glyph: <PlugGlyph />,
    },
  ];
  return (
    <section className="zc-why-sec">
      <style>{`
        .zc-why-sec .shell { padding-bottom: 24px; }
        .zc-why-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        @media (max-width: 980px) { .zc-why-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div className="shell" id="features">
        <SectionHeader
          kicker="why zerocode"
          title='Three things <span class="it">we obsess over.</span>'
          sub="Security, speed, and a familiar API shape. The rest is plumbing."
        />
        <div className="zc-why-grid">
          {items.map((it, i) => <WhyCard key={i} {...it} />)}
        </div>
      </div>
    </section>
  );
}

function ShieldGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      {[0,1,2,3].map(i => (
        <path key={i}
          d={`M20 ${4 + i*2} L${34 - i*2} ${10 + i*2} L${34 - i*2} ${22 + i*1} Q${34-i*2} ${30+i*0.5} 20 ${36 - i*1.5} Q${6+i*2} ${30+i*0.5} ${6+i*2} ${22 + i*1} L${6+i*2} ${10 + i*2} Z`}
          stroke={i === 0 ? 'var(--accent)' : 'var(--line-2)'}
          strokeWidth={i === 0 ? '1.5' : '1'}
          fill="none"
        />
      ))}
    </svg>
  );
}
function BoltGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M22 4 L8 22 L18 22 L16 36 L32 16 L22 16 Z" stroke="var(--accent)" strokeWidth="1.5" fill="none"/>
      <path d="M22 4 L8 22 L18 22 L16 36 L32 16 L22 16 Z" stroke="var(--accent)" strokeWidth="1.5" fill="var(--accent)" opacity="0.08"/>
      <line x1="2" y1="20" x2="6" y2="20" stroke="var(--line-2)" strokeWidth="1"/>
      <line x1="34" y1="20" x2="38" y2="20" stroke="var(--line-2)" strokeWidth="1"/>
    </svg>
  );
}
function PlugGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="6" y="14" width="14" height="12" rx="1" stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="20" y="16" width="14" height="8" rx="1" stroke="var(--accent)" strokeWidth="1.5"/>
      <line x1="3" y1="17" x2="6" y2="17" stroke="var(--line-2)" strokeWidth="1"/>
      <line x1="3" y1="23" x2="6" y2="23" stroke="var(--line-2)" strokeWidth="1"/>
      <line x1="14" y1="20" x2="20" y2="20" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2 2"/>
    </svg>
  );
}

/* ───────────── Deploy section ───────────── */
function DeploySection() {
  const [tab, setTab] = React.useState('compose');
  const [copied, setCopied] = React.useState(false);
  const blocks = {
    compose: [
      { html: '<span class="dim"># clone, configure, run — 60 seconds to first /v1/submissions</span>' },
      { html: '<span class="pr">$</span> <span class="cmd">git clone</span> https://github.com/zerocode-rs/zerocode' },
      { html: '<span class="pr">$</span> <span class="cmd">cd</span> zerocode && cp .env.example .env' },
      { html: '<span class="pr">$</span> <span class="cmd">docker compose</span> up <span class="flag">-d</span>' },
      { html: '<span class="pr">$</span> <span class="cmd">curl</span> localhost:8080/v1/health' },
      null,
      { html: '<span class="out">{"status":"ok","worker":"zc-worker-1","ready":true}</span>' },
    ],
    helm: [
      { html: '<span class="dim"># helm chart — coming v0.2, beta available now</span>' },
      { html: '<span class="pr">$</span> <span class="cmd">helm repo add</span> zerocode https://charts.zerocode.run' },
      { html: '<span class="pr">$</span> <span class="cmd">helm install</span> zc zerocode/zerocode \\' },
      { html: '    <span class="flag">--set</span> postgres.persistence.size=20Gi \\' },
      { html: '    <span class="flag">--set</span> worker.replicas=4' },
    ],
    binary: [
      { html: '<span class="dim"># build from source — requires rust 1.85+, postgres 14+</span>' },
      { html: '<span class="pr">$</span> <span class="cmd">cargo install</span> zerocode-service zerocode-worker' },
      { html: '<span class="pr">$</span> <span class="cmd">zerocode-service</span> <span class="flag">--config</span> zerocode.toml' },
      { html: '<span class="pr">$</span> <span class="cmd">zerocode-worker</span> <span class="flag">--runner-image</span> ghcr.io/zerocode/runner:0.1.4' },
    ],
  };
  const plain = {
    compose: 'git clone https://github.com/zerocode-rs/zerocode\ncd zerocode && cp .env.example .env\ndocker compose up -d\ncurl localhost:8080/v1/health',
    helm:    'helm repo add zerocode https://charts.zerocode.run\nhelm install zc zerocode/zerocode \\\n    --set postgres.persistence.size=20Gi \\\n    --set worker.replicas=4',
    binary:  'cargo install zerocode-service zerocode-worker\nzerocode-service --config zerocode.toml\nzerocode-worker --runner-image ghcr.io/zerocode/runner:0.1.4',
  };
  function copy() {
    try { navigator.clipboard.writeText(plain[tab]); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch (_) {}
  }
  const tabs = [
    { id: 'compose', name: 'docker compose', sub: 'recommended · single host' },
    { id: 'helm',    name: 'helm / k8s',     sub: 'beta · multi-node' },
    { id: 'binary',  name: 'from source',    sub: 'rust 1.85+ · postgres 14+' },
  ];
  return (
    <section className="zc-deploy">
      <style>{`
        .zc-deploy { background:
          radial-gradient(60% 80% at 20% 0%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 60%),
          radial-gradient(40% 60% at 90% 30%, color-mix(in oklab, var(--blue) 8%, transparent), transparent 60%),
          var(--bg);
          border-top: 1px solid var(--line);
        }
        .zc-deploy-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 60px; align-items: start; padding-bottom: 96px; }
        @media (max-width: 1000px) { .zc-deploy-grid { grid-template-columns: 1fr; } }
        .zc-deploy-tabs {
          display: flex; flex-direction: column;
          border: 1px solid var(--line); border-radius: 12px;
          overflow: hidden;
          background: color-mix(in oklab, var(--bg-1) 60%, transparent);
          backdrop-filter: blur(8px);
        }
        .zc-deploy-tab {
          appearance: none; background: transparent; border: 0; text-align: left;
          padding: 16px 18px; cursor: pointer; color: var(--fg-2);
          border-bottom: 1px solid var(--line); transition: background .15s ease, color .15s ease, padding-left .2s ease;
          position: relative;
        }
        .zc-deploy-tab:last-child { border-bottom: 0; }
        .zc-deploy-tab:hover { background: var(--bg-1); color: var(--fg-1); padding-left: 22px; }
        .zc-deploy-tab.active {
          background: color-mix(in oklab, var(--accent) 8%, var(--bg-1));
          color: var(--fg);
        }
        .zc-deploy-tab.active::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
          background: var(--accent);
          box-shadow: 0 0 14px var(--accent);
        }
        .zc-deploy-tab .n { font-family: var(--f-mono); font-size: 13px; }
        .zc-deploy-tab .s { font-size: 11.5px; color: var(--fg-3); margin-top: 2px; }
        .zc-deploy-code {
          border: 1px solid var(--line-2); border-radius: 12px;
          background: var(--bg-1); overflow: hidden;
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6);
        }
        .zc-deploy-code-hd {
          padding: 11px 14px; border-bottom: 1px solid var(--line);
          display: flex; align-items: center; gap: 10px;
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .zc-deploy-code-hd .dots { display: flex; gap: 6px; margin-right: 4px; }
        .zc-deploy-code-hd .dots span { width: 9px; height: 9px; border-radius: 50%; border: 1px solid var(--line-2); }
        .zc-deploy-code-hd .copy {
          margin-left: auto; cursor: pointer; color: var(--fg-2);
          padding: 3px 8px; border: 1px solid var(--line-2); border-radius: 4px;
          transition: color .15s ease, border-color .15s ease, background .15s ease;
          background: transparent; font-family: var(--f-mono); font-size: 10px; letter-spacing: 0.08em;
        }
        .zc-deploy-code-hd .copy:hover { color: var(--accent); border-color: var(--accent); background: color-mix(in oklab, var(--accent) 8%, transparent); }
        .zc-deploy-code-hd .copy.copied { color: var(--st-accepted); border-color: var(--st-accepted); background: color-mix(in oklab, var(--st-accepted) 10%, transparent); }
        .zc-deploy-code-bd { padding: 16px 20px 18px; font-family: var(--f-mono); font-size: 12.5px; line-height: 1.8; }
        .zc-deploy-code-bd .ln { color: var(--fg-1); white-space: pre-wrap; word-break: break-all; }
        .zc-deploy-code-bd .pr { color: var(--accent); }
        .zc-deploy-code-bd .cmd { color: var(--fg); }
        .zc-deploy-code-bd .flag { color: var(--blue-1); }
        .zc-deploy-code-bd .dim { color: var(--fg-3); font-style: italic; }
        .zc-deploy-code-bd .out { color: var(--st-accepted); }
      `}</style>
      <div className="shell" id="deploy">
        <SectionHeader
          kicker="deploy"
          title='Production in <span class="it">sixty seconds.</span>'
          sub="Two distroless images, one Postgres. Bring your own kernel ≥ 5.14 with cgroup v2."
        />
        <div className="zc-deploy-grid">
          <div className="zc-deploy-tabs">
            {tabs.map(t => (
              <button key={t.id}
                className={`zc-deploy-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}>
                <div className="n">{t.name}</div>
                <div className="s">{t.sub}</div>
              </button>
            ))}
          </div>
          <div className="zc-deploy-code">
            <div className="zc-deploy-code-hd">
              <div className="dots"><span/><span/><span/></div>
              <span>~/zerocode · {tab}</span>
              <button className={`copy ${copied ? 'copied' : ''}`} onClick={copy}>{copied ? '✓ copied' : 'copy'}</button>
            </div>
            <div className="zc-deploy-code-bd">
              {blocks[tab].map((ln, i) => ln === null
                ? <div key={i} style={{height: 8}} />
                : <div key={i} className="ln" dangerouslySetInnerHTML={{ __html: ln.html }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Footer ───────────── */
function Footer() {
  const cols = [
    { h: 'product', links: ['features', 'languages', 'playground', 'pricing', 'roadmap'] },
    { h: 'developers', links: ['quickstart', 'rest api', 'grpc api', 'openapi spec', 'webhooks'] },
    { h: 'company', links: ['github', 'security policy', 'changelog', 'discord', 'license'] },
  ];
  return (
    <footer className="zc-footer">
      <style>{`
        .zc-footer {
          border-top: 1px solid var(--line); margin-top: 0;
          background: linear-gradient(180deg, var(--bg-1), var(--bg));
          position: relative; overflow: hidden;
        }
        .zc-footer::before {
          content: 'zerocode';
          position: absolute;
          left: 50%; bottom: -60px;
          transform: translateX(-50%);
          font-family: var(--f-display); font-style: italic;
          font-size: clamp(180px, 28vw, 380px);
          line-height: 0.9; letter-spacing: -0.04em;
          background: linear-gradient(180deg, color-mix(in oklab, var(--fg) 8%, transparent), transparent 70%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          pointer-events: none; user-select: none;
          white-space: nowrap;
        }
        .zc-footer-grid {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 48px; padding: 72px var(--pad-x) 32px; max-width: var(--max-w); margin: 0 auto;
          position: relative; z-index: 1;
        }
        @media (max-width: 880px) { .zc-footer-grid { grid-template-columns: 1fr 1fr; } }
        .zc-footer .mark {
          font-family: var(--f-mono); font-size: 18px; font-weight: 500;
          letter-spacing: -0.01em; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
        }
        .zc-footer .mark .g {
          width: 20px; height: 20px; position: relative;
        }
        .zc-footer .mark .g::before, .zc-footer .mark .g::after {
          content: ''; position: absolute; inset: 0; border: 1.5px solid currentColor;
        }
        .zc-footer .mark .g::before { opacity: .35; }
        .zc-footer .mark .g::after { transform: rotate(20deg) scale(.7); color: var(--accent); }
        .zc-footer .blurb { color: var(--fg-2); max-width: 320px; font-size: 13.5px; line-height: 1.6; }
        .zc-footer h5 {
          font-family: var(--f-mono); font-size: 11px; color: var(--fg-3);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin: 0 0 14px;
        }
        .zc-footer ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
        .zc-footer ul a {
          color: var(--fg-1); font-size: 13.5px;
          transition: color .15s ease, padding-left .15s ease;
          display: inline-block;
        }
        .zc-footer ul a:hover { color: var(--accent); padding-left: 4px; }
        .zc-footer-bottom {
          border-top: 1px solid var(--line);
          padding: 18px var(--pad-x);
          max-width: var(--max-w); margin: 0 auto;
          display: flex; justify-content: space-between; align-items: center;
          font-family: var(--f-mono); font-size: 11.5px; color: var(--fg-3);
          letter-spacing: 0.04em; flex-wrap: wrap; gap: 12px;
          position: relative; z-index: 1;
        }
        .zc-footer-bottom .right { display: flex; gap: 14px; }
      `}</style>
      <div className="zc-footer-grid">
        <div>
          <div className="mark"><span className="g"/>zerocode</div>
          <p className="blurb">Open-source code execution sandbox. Engineered in Rust to be auditable, reproducible, and one curl away. Dual-licensed MIT / Apache-2.0.</p>
        </div>
        {cols.map((c, i) => (
          <div key={i}>
            <h5>{c.h}</h5>
            <ul>{c.links.map((l, j) => <li key={j}><a href="#">{l}</a></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="zc-footer-bottom">
        <span>© 2026 zerocode contributors · mit / apache-2.0</span>
        <span className="right">
          <span>kernel ≥ 5.14</span>
          <span>·</span>
          <span>rust 1.85 / edition 2024</span>
          <span>·</span>
          <span>v0.1.4</span>
        </span>
      </div>
    </footer>
  );
}

Object.assign(window, { SectionHeader, TrustStrip, WhyThreeUp, DeploySection, Footer });

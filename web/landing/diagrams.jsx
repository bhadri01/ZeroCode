// landing/diagrams.jsx
// Architecture diagram + Judge0 comparison table.

/* ───────────── Architecture ─────────────
 * Layout grid (1280×560), arranged so every edge label sits in
 * empty whitespace between nodes — never on top of a node, never
 * across a sibling label. The two callouts are inside the SVG so
 * they scale and never collide with nodes on resize.
 */
function ArchitectureDiagram() {
  const W = 1320, H = 580;
  // Wide gaps between nodes so every edge label fits in empty whitespace.
  const N = {
    client:   { x: 60,   y: 286, w: 170, h: 88, l: 'Client',   s: 'http · curl · agent' },
    api:      { x: 470,  y: 286, w: 210, h: 88, l: 'API',      s: 'axum · tonic · openapi 3.1' },
    pg:       { x: 770,  y: 70,  w: 220, h: 88, l: 'Postgres', s: 'submissions · listen/notify' },
    worker:   { x: 770,  y: 492, w: 220, h: 88, l: 'Worker',   s: 'sqlx · moka cache · otlp' },
    sandbox:  { x: 1040, y: 286, w: 200, h: 88, l: 'Sandbox',  s: '8 isolation layers' },
    runtime:  { x: 1080, y: 70,  w: 140, h: 88, l: 'Runtime',  s: '41 languages' },
  };
  const cx = (n) => n.x + n.w/2;
  const cy = (n) => n.y + n.h/2;

  // Edge label with a paint-order halo so the text stays readable over the
  // grid and node fills — no JS measurement required.
  const EdgeLabel = ({ x, y, anchor = 'middle', children, color = 'var(--accent)' }) => (
    <text
      className="arch-edge-lbl"
      x={x} y={y}
      textAnchor={anchor}
      fill={color}
      style={{
        paintOrder: 'stroke fill',
        stroke: 'var(--bg-1)',
        strokeWidth: 4,
        strokeLinejoin: 'round',
      }}
    >
      {children}
    </text>
  );

  return (
    <section className="zc-arch">
      <style>{`
        .zc-arch .shell { padding-bottom: 96px; }
        .zc-arch-wrap {
          border: 1px solid var(--line-2);
          border-radius: 16px;
          background:
            radial-gradient(80% 60% at 50% 50%, color-mix(in oklab, var(--accent) 7%, transparent), transparent 70%),
            linear-gradient(180deg, var(--bg-1) 0%, var(--bg) 100%);
          padding: 40px 36px 32px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 40px 100px -40px rgba(0,0,0,0.7),
                      0 1px 0 rgba(255,255,255,0.04) inset;
        }
        .zc-arch-wrap::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(var(--line) 1px, transparent 1px),
            linear-gradient(90deg, var(--line) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(60% 50% at 50% 50%, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(60% 50% at 50% 50%, black 30%, transparent 80%);
          opacity: 0.5; pointer-events: none;
        }
        .zc-arch-wrap::after {
          content: ''; position: absolute; inset: -1px;
          border-radius: 16px;
          background: linear-gradient(120deg, transparent 30%, color-mix(in oklab, var(--accent) 30%, transparent) 50%, transparent 70%);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          padding: 1px;
          opacity: 0.5;
          pointer-events: none;
        }
        .zc-arch-svg-wrap { position: relative; }
        .zc-arch-svg {
          width: 100%; height: auto;
          font-family: var(--f-mono);
        }
        .arch-node-rect {
          fill: var(--bg-2);
          stroke: var(--line-2);
          stroke-width: 1;
        }
        .arch-node-rect.api { stroke: var(--accent); stroke-width: 1.5; }
        .arch-node-rect.sandbox { stroke: var(--accent); stroke-width: 1.5; }
        .arch-node-label {
          font-family: var(--f-sans);
          font-size: 14px; font-weight: 500;
          fill: var(--fg);
        }
        .arch-node-sub {
          font-family: var(--f-mono);
          font-size: 10.5px;
          fill: var(--fg-3);
          letter-spacing: 0.04em;
        }
        .arch-edge { stroke: var(--line-strong); stroke-width: 1; fill: none; }
        .arch-edge.primary { stroke: var(--accent); }
        .arch-edge.dim { stroke: var(--line-2); stroke-dasharray: 4 4; }
        .arch-edge-lbl {
          font-family: var(--f-mono); font-size: 10.5px;
          fill: var(--fg-2); letter-spacing: 0.04em;
        }
        .arch-edge-lbl.accent { fill: var(--accent); }
        .arch-flow {
          stroke-dasharray: 4 8; stroke-dashoffset: 0;
          animation: arch-march 1.6s linear infinite;
        }
        @keyframes arch-march { to { stroke-dashoffset: -12; } }
        .arch-pill {
          font-family: var(--f-mono); font-size: 10px;
          fill: var(--fg-1);
          letter-spacing: 0.06em;
        }

        .zc-arch-legend {
          display: flex; gap: 24px; flex-wrap: wrap;
          padding-top: 18px; margin-top: 24px;
          border-top: 1px dashed var(--line);
          font-family: var(--f-mono); font-size: 11px;
          color: var(--fg-3); letter-spacing: 0.06em;
        }
        .zc-arch-legend .it { display: inline-flex; align-items: center; gap: 8px; }
        .zc-arch-legend .it::before {
          content: ''; width: 22px; height: 1px; background: var(--accent);
        }
        .zc-arch-legend .it.dim::before { background: var(--line-2); }
        .zc-arch-legend .it.return::before { background: var(--blue-1); }

        /* SVG callouts — scale with the diagram, never drift over nodes */
        .arch-callout-bg {
          fill: color-mix(in oklab, var(--bg) 92%, transparent);
          stroke: var(--line-2);
          stroke-width: 1;
        }
        .arch-callout-num {
          font-family: var(--f-mono); font-size: 11px;
          fill: var(--accent); font-weight: 500; letter-spacing: 0.08em;
        }
        .arch-callout-tx {
          font-family: var(--f-mono); font-size: 11px;
          fill: var(--fg-1); letter-spacing: 0.02em;
        }
        .arch-callout-tx tspan.b { fill: var(--accent); font-weight: 500; }
      `}</style>
      <div className="shell" id="architecture">
        <SectionHeader
          kicker="architecture"
          title='Two binaries. <span class="it">One Postgres.</span>'
          sub="Same axum + tonic state on REST and gRPC. Workers wake on LISTEN/NOTIFY — no polling, no queue daemon. Submissions are the queue."
        />
        <div className="zc-arch-wrap">
          <div className="zc-arch-svg-wrap">
            <svg className="zc-arch-svg" viewBox={`0 0 ${W} ${H}`}>
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
                </marker>
                <marker id="ahd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--line-strong)" />
                </marker>
                <marker id="ahb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--blue-1)" />
                </marker>
              </defs>

              {/* ── 1) forward + return EDGES (lines only) ── */}

              {/* Client → API forward (top track) */}
              <line
                className="arch-edge primary arch-flow"
                x1={N.client.x + N.client.w} y1={cy(N.client) - 12}
                x2={N.api.x}                  y2={cy(N.api) - 12}
                markerEnd="url(#ah)"
              />
              {/* API → Client SSE return (bottom track) */}
              <path
                className="arch-edge dim"
                stroke="var(--blue-1)"
                d={`M ${N.api.x} ${cy(N.api) + 14} L ${N.client.x + N.client.w + 6} ${cy(N.client) + 14}`}
                markerEnd="url(#ahb)"
              />
              {/* API → Postgres curve */}
              <path
                className="arch-edge primary"
                d={`M ${cx(N.api)} ${N.api.y} C ${cx(N.api)} ${N.api.y - 80}, ${cx(N.pg)} ${N.pg.y + N.pg.h + 80}, ${cx(N.pg)} ${N.pg.y + N.pg.h}`}
                markerEnd="url(#ah)"
              />
              {/* Postgres → Worker NOTIFY (vertical) */}
              <line
                className="arch-edge primary arch-flow"
                x1={cx(N.pg) - 24} y1={N.pg.y + N.pg.h}
                x2={cx(N.worker) - 24} y2={N.worker.y}
                markerEnd="url(#ah)"
              />
              {/* Worker → Sandbox forward curve */}
              <path
                className="arch-edge primary arch-flow"
                d={`M ${N.worker.x + N.worker.w} ${cy(N.worker) - 8} C ${N.worker.x + N.worker.w + 100} ${cy(N.worker) - 8}, ${N.sandbox.x - 80} ${cy(N.sandbox) + 80}, ${N.sandbox.x} ${cy(N.sandbox) + 18}`}
                markerEnd="url(#ah)"
              />
              {/* Sandbox → Worker return curve (blue) */}
              <path
                className="arch-edge dim"
                stroke="var(--blue-1)"
                d={`M ${N.sandbox.x + 4} ${cy(N.sandbox) - 16} C ${N.sandbox.x - 120} ${cy(N.sandbox) - 70}, ${N.worker.x + N.worker.w + 120} ${cy(N.worker) - 70}, ${N.worker.x + N.worker.w} ${cy(N.worker) - 22}`}
                markerEnd="url(#ahb)"
              />
              {/* Sandbox → Runtime exec (vertical dim) */}
              <path
                className="arch-edge dim"
                d={`M ${cx(N.sandbox)} ${N.sandbox.y} L ${cx(N.runtime)} ${N.runtime.y + N.runtime.h}`}
                markerEnd="url(#ahd)"
              />

              {/* ── 2) NODES ── */}
              {Object.entries(N).map(([k, n]) => {
                const cls = (k === 'api' || k === 'sandbox') ? `arch-node-rect ${k}` : 'arch-node-rect';
                return (
                  <g key={k}>
                    <rect className={cls} x={n.x} y={n.y} width={n.w} height={n.h} rx="10" />
                    <text className="arch-node-label" x={cx(n)} y={cy(n) - 6} textAnchor="middle">{n.l}</text>
                    <text className="arch-node-sub" x={cx(n)} y={cy(n) + 16} textAnchor="middle">{n.s}</text>
                  </g>
                );
              })}

              {/* ── 3) EDGE LABELS (drawn LAST so they sit on top of nodes / grid) ── */}
              <EdgeLabel
                x={(N.client.x + N.client.w + N.api.x) / 2}
                y={cy(N.api) - 22}
              >POST /v1/submissions</EdgeLabel>
              <EdgeLabel
                x={(N.client.x + N.client.w + N.api.x) / 2}
                y={cy(N.api) + 32}
                color="var(--blue-1)"
              >SSE · grpc stream</EdgeLabel>
              <EdgeLabel
                x={(cx(N.api) + cx(N.pg)) / 2 - 6}
                y={N.pg.y + N.pg.h + 48}
              >insert · row</EdgeLabel>
              <EdgeLabel
                x={cx(N.pg) - 24}
                y={(N.pg.y + N.pg.h + N.worker.y) / 2}
              >NOTIFY · &lt; 5 ms</EdgeLabel>
              <EdgeLabel
                x={(N.worker.x + N.worker.w + N.sandbox.x) / 2 + 40}
                y={cy(N.worker) + 24}
              >clone() · 8 layers</EdgeLabel>
              <EdgeLabel
                x={(N.worker.x + N.worker.w + N.sandbox.x) / 2 + 40}
                y={cy(N.worker) - 82}
                color="var(--blue-1)"
              >stdout · stderr · exit</EdgeLabel>
              <EdgeLabel
                x={(cx(N.sandbox) + cx(N.runtime)) / 2 + 18}
                y={(N.sandbox.y + N.runtime.y + N.runtime.h) / 2}
                color="var(--fg-2)"
              >exec</EdgeLabel>

              {/* ── 4) callouts (SVG, parked in the empty top band above
                  all nodes — Postgres starts at y=70, so y=20–54 is clear) ── */}
              {/* 01: top-left */}
              <g transform={`translate(40, 20)`}>
                <rect className="arch-callout-bg" x="0" y="0" width="298" height="34" rx="6" />
                <text className="arch-callout-num" x="14" y="22">01</text>
                <text className="arch-callout-tx" x="44" y="22">
                  queue lives in the database — <tspan className="b">no broker</tspan>
                </text>
              </g>
              {/* 02: top-right */}
              <g transform={`translate(${W - 320}, 20)`}>
                <rect className="arch-callout-bg" x="0" y="0" width="280" height="34" rx="6" />
                <text className="arch-callout-num" x="14" y="22">02</text>
                <text className="arch-callout-tx" x="44" y="22">
                  escape lands in a <tspan className="b">credential-less</tspan> runner
                </text>
              </g>
            </svg>
          </div>
          <div className="zc-arch-legend">
            <span className="it">forward · primary path</span>
            <span className="it return">return · SSE / gRPC stream</span>
            <span className="it dim">internal · exec</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Comparison vs Judge0 ───────────── */
function ComparisonTable() {
  const rows = [
    { l: 'isolation layers',         zc: '8 (userns, pivot_root, landlock, seccomp BPF, cgroup v2, capdrop, NNP, namespaces)', j: '2 (isolate + chroot)', win: 'zc' },
    { l: 'known CVEs',               zc: '0', j: 'CVE-2023-28599 · CVE-2024-28185 · CVE-2024-28189', win: 'zc' },
    { l: 'job pickup',               zc: '< 5 ms (LISTEN/NOTIFY)', j: '~500 ms (poll loop)', win: 'zc' },
    { l: 'streaming output',         zc: 'SSE + gRPC stream', j: '— polling only', win: 'zc' },
    { l: 'transports',               zc: 'REST + gRPC (same state)', j: 'REST only', win: 'zc' },
    { l: 'cgroup',                   zc: 'v2 (unified)', j: 'v1 / v2 mixed', win: 'zc' },
    { l: 'image base',               zc: 'distroless · 41 MB', j: 'ubuntu · 1.2 GB', win: 'zc' },
    { l: 'spec',                     zc: 'OpenAPI 3.1 + .proto', j: 'OpenAPI 3.0', win: 'zc' },
    { l: 'language count',           zc: '41', j: '60+', win: 'j' },
    { l: 'judge0 api compatibility', zc: '✓ same IDs, same shape', j: 'native', win: '—' },
    { l: 'license',                  zc: 'MIT / Apache-2.0', j: 'GPL-3.0', win: '—' },
    { l: 'kernel',                   zc: '≥ 5.14', j: '≥ 4.9', win: 'j' },
  ];
  const zcWins = rows.filter(r => r.win === 'zc').length;
  const jWins  = rows.filter(r => r.win === 'j').length;
  const ties   = rows.filter(r => r.win === '—').length;
  return (
    <section className="zc-compare">
      <style>{`
        .zc-compare .shell { padding-bottom: 96px; }
        .zc-compare-tally {
          display: flex; gap: 14px; flex-wrap: wrap;
          margin-bottom: 22px;
          font-family: var(--f-mono); font-size: 11.5px;
          letter-spacing: 0.06em;
          color: var(--fg-3);
        }
        .zc-compare-tally .b {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 999px;
          border: 1px solid var(--line-2);
          background: color-mix(in oklab, var(--bg-1) 60%, transparent);
        }
        .zc-compare-tally .b .v { font-family: var(--f-display); font-size: 18px; line-height: 1; }
        .zc-compare-tally .zc { color: var(--accent); border-color: color-mix(in oklab, var(--accent) 40%, transparent); }
        .zc-compare-tally .j  { color: var(--fg-1); }
        .zc-compare-tally .eq { color: var(--fg-2); }
        .zc-compare-wrap {
          border: 1px solid var(--line-2);
          border-radius: 14px;
          overflow: hidden;
          background: color-mix(in oklab, var(--bg-1) 40%, transparent);
          backdrop-filter: blur(8px);
          box-shadow: 0 40px 100px -40px rgba(0,0,0,0.6);
        }
        .zc-compare-hd, .zc-compare-row {
          display: grid;
          grid-template-columns: 220px 1fr 1fr 80px;
          align-items: center;
        }
        .zc-compare-hd {
          background: var(--bg-1);
          border-bottom: 1px solid var(--line-2);
          padding: 16px 20px;
          font-family: var(--f-mono);
          font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--fg-3);
        }
        .zc-compare-hd .zc { color: var(--accent); }
        .zc-compare-hd .j  { color: var(--fg-2); }
        .zc-compare-row {
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
          transition: background .2s ease, border-color .2s ease;
          position: relative;
        }
        .zc-compare-row:last-child { border-bottom: 0; }
        .zc-compare-row:hover {
          background: color-mix(in oklab, var(--bg-1) 70%, transparent);
        }
        .zc-compare-row.win-zc:hover { box-shadow: inset 2px 0 0 var(--accent); }
        .zc-compare-row.win-j:hover  { box-shadow: inset 2px 0 0 var(--blue-1); }
        .zc-compare-row .lbl {
          font-family: var(--f-mono); font-size: 12px; color: var(--fg-2);
          letter-spacing: 0.02em;
        }
        .zc-compare-row .v {
          font-family: var(--f-sans); font-size: 13.5px; color: var(--fg-1);
          padding-right: 14px;
          display: flex; align-items: center; gap: 10px;
        }
        .zc-compare-row .v .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--line-strong);
          flex-shrink: 0;
        }
        .zc-compare-row .v.zc.is-win .dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
        .zc-compare-row .v.j.is-win  .dot { background: var(--blue-1); box-shadow: 0 0 8px var(--blue-1); }
        .zc-compare-row .v.zc { color: var(--fg); }
        .zc-compare-row .v.dim { color: var(--fg-3); }
        .zc-compare-row .v.dim .dot { background: var(--line-2); }
        .zc-compare-row .win {
          font-family: var(--f-mono); font-size: 11px;
          color: var(--fg-3); text-align: right;
          padding: 3px 8px; border-radius: 4px;
          display: inline-block; justify-self: end;
          border: 1px solid var(--line-2);
          letter-spacing: 0.08em;
        }
        .zc-compare-row .win.zc { color: var(--accent); border-color: color-mix(in oklab, var(--accent) 40%, transparent); background: color-mix(in oklab, var(--accent) 8%, transparent); }
        .zc-compare-row .win.j { color: var(--blue-1); border-color: color-mix(in oklab, var(--blue-1) 40%, transparent); background: color-mix(in oklab, var(--blue-1) 8%, transparent); }
      `}</style>
      <div className="shell" id="compare">
        <SectionHeader
          kicker="vs judge0"
          title='An honest <span class="it">side-by-side.</span>'
          sub="Judge0 is great. This is what we'd change if we shipped it today."
        />
        <div className="zc-compare-tally">
          <span className="b zc"><span className="v">{zcWins}</span> zerocode wins</span>
          <span className="b j"><span className="v">{jWins}</span> judge0 wins</span>
          <span className="b eq"><span className="v">{ties}</span> even / context</span>
        </div>
        <div className="zc-compare-wrap">
          <div className="zc-compare-hd">
            <span>property</span>
            <span className="zc">zerocode</span>
            <span className="j">judge0</span>
            <span style={{textAlign:'right'}}>win</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className={`zc-compare-row win-${r.win}`}>
              <span className="lbl">{r.l}</span>
              <span className={`v zc ${r.win === 'zc' ? 'is-win' : ''}`}><span className="dot"/>{r.zc}</span>
              <span className={`v j ${r.win === 'j' ? 'is-win' : 'dim'}`}><span className="dot"/>{r.j}</span>
              <span className={`win ${r.win}`}>{r.win === 'zc' ? '→ zc' : r.win === 'j' ? '→ j' : '— even'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { ArchitectureDiagram, ComparisonTable });

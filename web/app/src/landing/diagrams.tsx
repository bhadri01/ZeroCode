import type { ReactNode } from 'react';
import { SectionHeader } from './sections';

interface ArchNode { x: number; y: number; w: number; h: number; l: string; s: string }

export function ArchitectureDiagram() {
  const W = 1320, H = 580;
  const N: Record<string, ArchNode> = {
    client:   { x: 60,   y: 286, w: 170, h: 88, l: 'Client',   s: 'http · curl · agent' },
    api:      { x: 470,  y: 286, w: 210, h: 88, l: 'API',      s: 'axum · sse · openapi 3.1' },
    pg:       { x: 770,  y: 70,  w: 220, h: 88, l: 'Postgres', s: 'submissions · listen/notify' },
    worker:   { x: 770,  y: 492, w: 220, h: 88, l: 'Worker',   s: 'sqlx · moka cache' },
    sandbox:  { x: 1040, y: 286, w: 200, h: 88, l: 'Sandbox',  s: '8 isolation layers' },
    runtime:  { x: 1080, y: 70,  w: 140, h: 88, l: 'Runtime',  s: '41 languages' },
  };
  const cx = (n: ArchNode) => n.x + n.w/2;
  const cy = (n: ArchNode) => n.y + n.h/2;

  const EdgeLabel = ({ x, y, anchor = 'middle', children, color = 'var(--accent)' }: {
    x: number; y: number; anchor?: 'start' | 'middle' | 'end'; children: ReactNode; color?: string;
  }) => (
    <text
      className="arch-edge-lbl"
      x={x} y={y}
      textAnchor={anchor}
      fill={color}
      style={{ paintOrder: 'stroke fill', stroke: 'var(--bg-1)', strokeWidth: 4, strokeLinejoin: 'round' }}
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
          position: relative; overflow: hidden;
          box-shadow: 0 40px 100px -40px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.04) inset;
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
          padding: 1px; opacity: 0.5; pointer-events: none;
        }
        .zc-arch-svg-wrap { position: relative; }
        .zc-arch-svg { width: 100%; height: auto; font-family: var(--f-mono); }
        .arch-node-rect { fill: var(--bg-2); stroke: var(--line-2); stroke-width: 1; }
        .arch-node-rect.api { stroke: var(--accent); stroke-width: 1.5; }
        .arch-node-rect.sandbox { stroke: var(--accent); stroke-width: 1.5; }
        .arch-node-label { font-family: var(--f-sans); font-size: 14px; font-weight: 500; fill: var(--fg); }
        .arch-node-sub { font-family: var(--f-mono); font-size: 10.5px; fill: var(--fg-3); letter-spacing: 0.04em; }
        .arch-edge { stroke: var(--line-strong); stroke-width: 1; fill: none; }
        .arch-edge.primary { stroke: var(--accent); }
        .arch-edge.dim { stroke: var(--line-2); stroke-dasharray: 4 4; }
        .arch-edge-lbl { font-family: var(--f-mono); font-size: 10.5px; fill: var(--fg-2); letter-spacing: 0.04em; }
        .arch-edge-lbl.accent { fill: var(--accent); }
        .arch-flow { stroke-dasharray: 4 8; stroke-dashoffset: 0; animation: arch-march 1.6s linear infinite; }
        @keyframes arch-march { to { stroke-dashoffset: -12; } }
        .zc-arch-legend { display: flex; gap: 24px; flex-wrap: wrap; padding-top: 18px; margin-top: 24px; border-top: 1px dashed var(--line); font-family: var(--f-mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.06em; }
        .zc-arch-legend .it { display: inline-flex; align-items: center; gap: 8px; }
        .zc-arch-legend .it::before { content: ''; width: 22px; height: 1px; background: var(--accent); }
        .zc-arch-legend .it.dim::before { background: var(--line-2); }
        .zc-arch-legend .it.return::before { background: var(--blue-1); }
        .arch-callout-bg { fill: color-mix(in oklab, var(--bg) 92%, transparent); stroke: var(--line-2); stroke-width: 1; }
        .arch-callout-num { font-family: var(--f-mono); font-size: 11px; fill: var(--accent); font-weight: 500; letter-spacing: 0.08em; }
        .arch-callout-tx { font-family: var(--f-mono); font-size: 11px; fill: var(--fg-1); letter-spacing: 0.02em; }
        .arch-callout-tx tspan.b { fill: var(--accent); font-weight: 500; }
      `}</style>
      <div className="shell" id="architecture">
        <SectionHeader
          kicker="architecture"
          title='Two binaries. <span class="it">One Postgres.</span>'
          sub="One REST + SSE surface on axum, one Postgres queue. Workers wake on LISTEN/NOTIFY — no polling, no broker daemon. Submissions are the queue."
        />
        <div className="zc-arch-wrap">
          <div className="zc-arch-svg-wrap">
            <svg className="zc-arch-svg" viewBox={`0 0 ${W} ${H}`}>
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
                </marker>
                <marker id="ahd" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--line-strong)" />
                </marker>
                <marker id="ahb" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--blue-1)" />
                </marker>
              </defs>

              <line className="arch-edge primary arch-flow"
                x1={N.client.x + N.client.w} y1={cy(N.client) - 12}
                x2={N.api.x}                  y2={cy(N.api) - 12}
                markerEnd="url(#ah)"
              />
              <path className="arch-edge dim" stroke="var(--blue-1)"
                d={`M ${N.api.x} ${cy(N.api) + 14} L ${N.client.x + N.client.w + 6} ${cy(N.client) + 14}`}
                markerEnd="url(#ahb)"
              />
              <path className="arch-edge primary"
                d={`M ${cx(N.api)} ${N.api.y} C ${cx(N.api)} ${N.api.y - 80}, ${cx(N.pg)} ${N.pg.y + N.pg.h + 80}, ${cx(N.pg)} ${N.pg.y + N.pg.h}`}
                markerEnd="url(#ah)"
              />
              <line className="arch-edge primary arch-flow"
                x1={cx(N.pg) - 24} y1={N.pg.y + N.pg.h}
                x2={cx(N.worker) - 24} y2={N.worker.y}
                markerEnd="url(#ah)"
              />
              <path className="arch-edge primary arch-flow"
                d={`M ${N.worker.x + N.worker.w} ${cy(N.worker) - 8} C ${N.worker.x + N.worker.w + 100} ${cy(N.worker) - 8}, ${N.sandbox.x - 80} ${cy(N.sandbox) + 80}, ${N.sandbox.x} ${cy(N.sandbox) + 18}`}
                markerEnd="url(#ah)"
              />
              <path className="arch-edge dim" stroke="var(--blue-1)"
                d={`M ${N.sandbox.x + 4} ${cy(N.sandbox) - 16} C ${N.sandbox.x - 120} ${cy(N.sandbox) - 70}, ${N.worker.x + N.worker.w + 120} ${cy(N.worker) - 70}, ${N.worker.x + N.worker.w} ${cy(N.worker) - 22}`}
                markerEnd="url(#ahb)"
              />
              <path className="arch-edge dim"
                d={`M ${cx(N.sandbox)} ${N.sandbox.y} L ${cx(N.runtime)} ${N.runtime.y + N.runtime.h}`}
                markerEnd="url(#ahd)"
              />

              {Object.entries(N).map(([k, n]) => {
                const cls = (k === 'api' || k === 'sandbox') ? `arch-node-rect ${k}` : 'arch-node-rect';
                return (
                  <g key={k}>
                    <rect className={cls} x={n.x} y={n.y} width={n.w} height={n.h} rx={10} />
                    <text className="arch-node-label" x={cx(n)} y={cy(n) - 6} textAnchor="middle">{n.l}</text>
                    <text className="arch-node-sub" x={cx(n)} y={cy(n) + 16} textAnchor="middle">{n.s}</text>
                  </g>
                );
              })}

              <EdgeLabel x={(N.client.x + N.client.w + N.api.x) / 2} y={cy(N.api) - 22}>POST /v1/submissions</EdgeLabel>
              <EdgeLabel x={(N.client.x + N.client.w + N.api.x) / 2} y={cy(N.api) + 32} color="var(--blue-1)">SSE · live stdout/stderr</EdgeLabel>
              <EdgeLabel x={(cx(N.api) + cx(N.pg)) / 2 - 6} y={N.pg.y + N.pg.h + 48}>insert · row</EdgeLabel>
              <EdgeLabel x={cx(N.pg) - 24} y={(N.pg.y + N.pg.h + N.worker.y) / 2}>NOTIFY · &lt; 5 ms</EdgeLabel>
              <EdgeLabel x={(N.worker.x + N.worker.w + N.sandbox.x) / 2 + 40} y={cy(N.worker) + 24}>clone() · 8 layers</EdgeLabel>
              <EdgeLabel x={(N.worker.x + N.worker.w + N.sandbox.x) / 2 + 40} y={cy(N.worker) - 82} color="var(--blue-1)">stdout · stderr · exit</EdgeLabel>
              <EdgeLabel x={(cx(N.sandbox) + cx(N.runtime)) / 2 + 18} y={(N.sandbox.y + N.runtime.y + N.runtime.h) / 2} color="var(--fg-2)">exec</EdgeLabel>

              <g transform="translate(40, 20)">
                <rect className="arch-callout-bg" x={0} y={0} width={298} height={34} rx={6} />
                <text className="arch-callout-num" x={14} y={22}>01</text>
                <text className="arch-callout-tx" x={44} y={22}>
                  queue lives in the database — <tspan className="b">no broker</tspan>
                </text>
              </g>
              <g transform={`translate(${W - 320}, 20)`}>
                <rect className="arch-callout-bg" x={0} y={0} width={280} height={34} rx={6} />
                <text className="arch-callout-num" x={14} y={22}>02</text>
                <text className="arch-callout-tx" x={44} y={22}>
                  escape lands in a <tspan className="b">credential-less</tspan> runner
                </text>
              </g>
            </svg>
          </div>
          <div className="zc-arch-legend">
            <span className="it">forward · primary path</span>
            <span className="it return">return · SSE stream</span>
            <span className="it dim">internal · exec</span>
          </div>
        </div>
      </div>
    </section>
  );
}


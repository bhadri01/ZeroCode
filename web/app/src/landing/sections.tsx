/*
 * Landing sections (post-redesign).
 *
 * The previous TrustStrip / WhyThreeUp / DeploySection were dropped — every
 * section followed the same header-then-3-cards rhythm which was the
 * strongest "AI-generated" tell. This file now exports four leaner sections
 * plus the footer:
 *
 *   IsolationSection  — full-width canvas around the 8-layer ring diagram
 *   HowItWorks        — 3-step lifecycle, horizontal on desktop, stacked on mobile
 *   SpeedSection      — one big stat + a latency budget breakdown
 *   GetStartedSection — three terminal commands + CTA
 *   Footer            — minimal columns
 *
 * Mobile-first throughout: every grid collapses to a single column under
 * 720 px, font sizes clamp, touch targets stay ≥ 44 px.
 */

import { useState } from 'react';
import { LayerDiagram, LAYERS } from './layer-diagram';

const GITHUB_REPO = 'bhadri01/ZeroCode';

/* ─── Shared section header ────────────────────────────────────────────── */
interface SectionHeaderProps {
  kicker: string;
  title: string;        // may contain <span class="it">…</span>
  sub?: string;
  anchor?: string;
}
export function SectionHeader({ kicker, title, sub, anchor }: SectionHeaderProps) {
  return (
    <header className="zc-sh" id={anchor}>
      <style>{`
        .zc-sh {
          max-width: 720px;
          margin: 0 0 clamp(36px, 6vw, 56px);
        }
        .zc-sh .k {
          display: inline-block;
          font: 500 11.5px var(--f-mono); color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 16px;
        }
        .zc-sh h2 {
          margin: 0;
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(28px, 4.8vw, 48px);
          line-height: 1.08; letter-spacing: -0.018em;
          color: var(--fg); text-wrap: balance;
        }
        .zc-sh h2 .it { font-style: italic; color: var(--accent); }
        .zc-sh p {
          margin: 14px 0 0;
          font-size: clamp(15px, 1.6vw, 17px);
          line-height: 1.6; color: var(--fg-1);
          max-width: 60ch;
        }
      `}</style>
      <span className="k">{kicker}</span>
      <h2 dangerouslySetInnerHTML={{ __html: title }} />
      {sub && <p>{sub}</p>}
    </header>
  );
}

/* ─── 8 layers (uses the existing LayerDiagram) ────────────────────────── */
export function IsolationSection() {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? 0;
  const layer = LAYERS[active];

  return (
    <section className="zc-iso" id="isolation">
      <style>{`
        .zc-iso {
          padding: clamp(72px, 11vw, 140px) clamp(20px, 5vw, 64px);
          background: var(--bg);
          border-top: 1px solid var(--line);
        }
        .zc-iso-inner { max-width: 1180px; margin: 0 auto; }
        .zc-iso-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(280px, 380px);
          gap: clamp(32px, 6vw, 72px);
          align-items: center;
        }
        .zc-iso-stage {
          position: relative;
          background:
            radial-gradient(420px 360px at 50% 50%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%);
          padding: clamp(16px, 3vw, 36px);
          border-radius: 16px;
        }
        .zc-iso-info {
          display: flex; flex-direction: column; gap: 18px;
        }
        .zc-iso-info .layer-card {
          padding: 22px 24px;
          border: 1px solid var(--line-2);
          border-radius: 12px;
          background: var(--bg-1);
        }
        .zc-iso-info .layer-card .num {
          font: 500 11.5px var(--f-mono); color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 8px; display: block;
        }
        .zc-iso-info .layer-card .name {
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(22px, 2.6vw, 28px); line-height: 1.15;
          color: var(--fg); margin: 0 0 8px;
        }
        .zc-iso-info .layer-card .desc {
          font-size: 14.5px; line-height: 1.6; color: var(--fg-1);
          margin: 0;
        }
        .zc-iso-info .layer-list {
          display: flex; flex-wrap: wrap; gap: 8px;
        }
        .zc-iso-info .layer-list button {
          appearance: none;
          border: 1px solid var(--line-2);
          background: transparent;
          color: var(--fg-2);
          padding: 7px 11px; border-radius: 6px;
          font: 11.5px var(--f-mono); letter-spacing: 0.04em;
          cursor: pointer;
          transition: border-color .15s ease, color .15s ease, background .15s ease;
          min-height: 32px;
        }
        .zc-iso-info .layer-list button:hover { color: var(--fg); border-color: var(--line-strong); }
        .zc-iso-info .layer-list button.active {
          color: var(--accent);
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 10%, transparent);
        }
        @media (max-width: 880px) {
          .zc-iso-grid { grid-template-columns: 1fr; gap: 40px; }
          .zc-iso-stage { order: 2; }
          .zc-iso-info  { order: 1; }
        }
      `}</style>
      <div className="zc-iso-inner">
        <SectionHeader
          kicker="isolation"
          title='Eight layers between attacker <span class="it">and host.</span>'
          sub="Every submission runs in its own user namespace, behind seccomp, landlock, and a pivot_rooted runner rootfs. The same primitives Linux production containers rely on — wired straight into the sandbox."
        />
        <div className="zc-iso-grid">
          <div className="zc-iso-stage">
            <LayerDiagram variant="hero" />
          </div>
          <div className="zc-iso-info">
            <div className="layer-card">
              <span className="num">layer {String(active + 1).padStart(2, '0')}</span>
              <h3 className="name">{layer.name}</h3>
              <p className="desc">{layer.note}</p>
            </div>
            <div className="layer-list">
              {LAYERS.map((l, i) => (
                <button key={i}
                  className={i === active ? 'active' : ''}
                  onMouseEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  onClick={() => setHovered(i)}
                  aria-label={`Show layer ${i + 1}: ${l.name}`}
                >
                  {l.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── How it works (3 steps) ───────────────────────────────────────────── */
const STEPS = [
  {
    n: '01',
    title: 'Submit',
    body: 'POST source code + language ID. The API writes a row to Postgres, fires NOTIFY, and returns a token in single-digit milliseconds.',
    code: `POST /v1/submissions
{ "language_id": 71,
  "source_code": "print(\\"hi\\")" }`,
  },
  {
    n: '02',
    title: 'Sandbox',
    body: 'A worker wakes on LISTEN, claims the row, forks into a fresh user-namespace with 8 isolation layers, execs the runtime.',
    code: `clone3(unshare USER|PID|NET|...);
landlock + seccomp + cgroup;
pivot_root → run`,
  },
  {
    n: '03',
    title: 'Stream',
    body: 'stdout / stderr flow back over SSE byte-by-byte. On exit the verdict (Accepted / TLE / MLE / RE / …) plus metrics persist for 24 h.',
    code: `GET /v1/submissions/{tok}/stream
event: stdout · data: "hi\\n"
event: finished · accepted`,
  },
];

export function HowItWorks() {
  return (
    <section className="zc-how" id="how">
      <style>{`
        .zc-how {
          padding: clamp(72px, 11vw, 140px) clamp(20px, 5vw, 64px);
          background: var(--bg-1);
          border-top: 1px solid var(--line);
        }
        .zc-how-inner { max-width: 1180px; margin: 0 auto; }
        .zc-how-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: clamp(20px, 3vw, 32px);
          counter-reset: step;
        }
        .zc-how-step {
          position: relative;
          padding: clamp(24px, 3vw, 32px);
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--bg);
          display: flex; flex-direction: column; gap: 16px;
          transition: border-color 200ms ease, transform 200ms ease;
        }
        .zc-how-step:hover {
          border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
          transform: translateY(-2px);
        }
        .zc-how-step .num {
          font: 500 11.5px var(--f-mono); color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        .zc-how-step h3 {
          margin: 0;
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(24px, 2.8vw, 30px); line-height: 1.15;
          color: var(--fg);
        }
        .zc-how-step .body {
          font-size: 14.5px; line-height: 1.6; color: var(--fg-1);
          margin: 0;
        }
        .zc-how-step pre {
          margin: auto 0 0; padding: 14px 16px;
          background: var(--bg-2); border: 1px solid var(--line);
          border-radius: 8px;
          font: 11.5px/1.65 var(--f-mono); color: var(--fg-1);
          overflow-x: auto;
        }
        @media (max-width: 880px) {
          .zc-how-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="zc-how-inner">
        <SectionHeader
          kicker="how it works"
          title='Three steps. <span class="it">No broker. No queue daemon.</span>'
          sub="The queue lives in Postgres. Workers wake on LISTEN/NOTIFY — no Redis, no RabbitMQ, no separate orchestrator process to babysit."
        />
        <div className="zc-how-grid">
          {STEPS.map((s) => (
            <article key={s.n} className="zc-how-step">
              <span className="num">step {s.n}</span>
              <h3>{s.title}</h3>
              <p className="body">{s.body}</p>
              <pre>{s.code}</pre>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Speed (single big stat + budget breakdown) ───────────────────────── */
export function SpeedSection() {
  const budget = [
    { lbl: 'POST → INSERT',           v: '~1.2 ms', c: 'var(--accent)' },
    { lbl: 'NOTIFY → worker wake',    v: '~0.8 ms', c: 'var(--blue-1)' },
    { lbl: 'claim + spawn sandbox',   v: '~2.4 ms', c: 'var(--green-1)' },
    { lbl: 'first stdout byte',       v: 'sandbox-bound', c: 'var(--fg-2)' },
  ];
  return (
    <section className="zc-spd" id="speed">
      <style>{`
        .zc-spd {
          padding: clamp(72px, 11vw, 140px) clamp(20px, 5vw, 64px);
          background: var(--bg);
          border-top: 1px solid var(--line);
        }
        .zc-spd-inner { max-width: 1180px; margin: 0 auto; }
        .zc-spd-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(32px, 6vw, 72px);
          align-items: center;
        }
        .zc-spd-stat {
          display: flex; flex-direction: column; gap: 10px;
        }
        .zc-spd-stat .big {
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(72px, 13vw, 160px);
          line-height: 0.92; letter-spacing: -0.04em;
          color: var(--accent);
          font-feature-settings: "tnum" 1;
        }
        .zc-spd-stat .unit { font-family: var(--f-display); color: var(--fg-2); }
        .zc-spd-stat .lbl {
          font: 500 12px var(--f-mono); color: var(--fg-2);
          letter-spacing: 0.14em; text-transform: uppercase;
        }
        .zc-spd-budget {
          display: flex; flex-direction: column; gap: 18px;
        }
        .zc-spd-budget .item {
          display: grid; grid-template-columns: 8px 1fr auto; gap: 16px;
          align-items: center;
          padding-bottom: 18px;
          border-bottom: 1px dashed var(--line);
        }
        .zc-spd-budget .item:last-child { border-bottom: 0; padding-bottom: 0; }
        .zc-spd-budget .dot { width: 8px; height: 8px; border-radius: 50%; }
        .zc-spd-budget .lbl { color: var(--fg-1); font-size: 14.5px; }
        .zc-spd-budget .v {
          font: 13px var(--f-mono); color: var(--fg); letter-spacing: 0.04em;
        }
        @media (max-width: 880px) {
          .zc-spd-row { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="zc-spd-inner">
        <SectionHeader
          kicker="speed"
          title='Sub-5 ms <span class="it">job pickup.</span>'
          sub="No polling, no broker hop, no queue-daemon round-trip. Postgres LISTEN/NOTIFY wakes the worker on the same SQL transaction the API just committed."
        />
        <div className="zc-spd-row">
          <div className="zc-spd-stat">
            <div className="big">&lt; 5<span className="unit"> ms</span></div>
            <div className="lbl">dispatch latency · p99</div>
          </div>
          <div className="zc-spd-budget">
            {budget.map((b, i) => (
              <div key={i} className="item">
                <span className="dot" style={{ background: b.c }} />
                <span className="lbl">{b.lbl}</span>
                <span className="v">{b.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Get started (CTA + terminal) ────────────────────────────────────── */
export function GetStartedSection() {
  return (
    <section className="zc-gs" id="get-started">
      <style>{`
        .zc-gs {
          padding: clamp(72px, 11vw, 140px) clamp(20px, 5vw, 64px);
          background:
            radial-gradient(900px 600px at 88% 110%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 65%),
            var(--bg-1);
          border-top: 1px solid var(--line);
        }
        .zc-gs-inner { max-width: 1180px; margin: 0 auto; }
        .zc-gs-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 560px);
          gap: clamp(28px, 5vw, 60px);
          align-items: start;
        }
        .zc-gs-cta {
          display: flex; gap: 12px; flex-wrap: wrap;
          margin-top: clamp(20px, 3vw, 28px);
        }
        .zc-gs-cta a {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 20px; border-radius: 8px;
          font: 500 14px var(--f-sans); text-decoration: none;
          min-height: 44px;
          transition: transform .12s ease, filter .12s ease, border-color .12s ease, color .12s ease, background .12s ease;
        }
        .zc-gs-cta .primary {
          background: var(--accent); color: var(--bg);
          border: 1px solid var(--accent);
          box-shadow: 0 4px 24px -8px color-mix(in oklab, var(--accent) 60%, transparent);
        }
        .zc-gs-cta .primary:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .zc-gs-cta .ghost {
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          background: color-mix(in oklab, var(--bg) 60%, transparent);
        }
        .zc-gs-cta .ghost:hover { color: var(--fg); border-color: var(--line-strong); background: var(--bg); }

        .zc-gs-cmds {
          background: var(--bg-2);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 0; overflow: hidden;
          box-shadow: 0 20px 60px -30px rgba(0,0,0,0.45);
        }
        .zc-gs-cmds .row {
          display: flex; align-items: baseline; gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--line);
          font: 13px var(--f-mono); color: var(--fg-1);
          line-height: 1.5;
          overflow-x: auto;
          white-space: nowrap;
        }
        .zc-gs-cmds .row:last-child { border-bottom: 0; }
        .zc-gs-cmds .pr { color: var(--accent); user-select: none; flex-shrink: 0; }
        .zc-gs-cmds .com { color: var(--fg-3); font-style: italic; }
        @media (max-width: 880px) {
          .zc-gs-grid { grid-template-columns: 1fr; }
          .zc-gs-cta a { flex: 1; justify-content: center; }
        }
      `}</style>
      <div className="zc-gs-inner">
        <div className="zc-gs-grid">
          <div>
            <SectionHeader
              kicker="ship it"
              title='Clone. Compose up. <span class="it">Submit.</span>'
              sub="Everything runs in Docker — no system-wide installs, no language-toolchain juggling on the host. The runner image bundles every Core 7 toolchain so first submissions work the moment compose finishes pulling."
            />
            <div className="zc-gs-cta">
              <a className="primary" href="/docs/quickstart">
                Read the quickstart →
              </a>
              <a className="ghost" href={`https://github.com/${GITHUB_REPO}`} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
          </div>
          <div className="zc-gs-cmds" aria-hidden="true">
            <div className="row"><span className="com"># clone the repo</span></div>
            <div className="row"><span className="pr">$</span>git clone https://github.com/{GITHUB_REPO}</div>
            <div className="row"><span className="com"># bring up the stack</span></div>
            <div className="row"><span className="pr">$</span>docker compose -f deploy/docker-compose.yml up -d</div>
            <div className="row"><span className="com"># submit your first program</span></div>
            <div className="row"><span className="pr">$</span>curl -X POST localhost:8080/v1/submissions?wait=true \</div>
            <div className="row" style={{ paddingLeft: 36 }}>-H 'authorization: Bearer dev-only-replace-me' \</div>
            <div className="row" style={{ paddingLeft: 36 }}>-d '{`{"language_id":71,"source_code":"print(123)"}`}'</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer (minimal) ────────────────────────────────────────────────── */
export function Footer() {
  return (
    <footer className="zc-foot">
      <style>{`
        .zc-foot {
          padding: clamp(48px, 7vw, 80px) clamp(20px, 5vw, 64px) 36px;
          background: var(--bg);
          border-top: 1px solid var(--line);
        }
        .zc-foot-inner {
          max-width: 1180px; margin: 0 auto;
          display: grid;
          grid-template-columns: 1.4fr repeat(3, 1fr);
          gap: clamp(24px, 4vw, 48px);
        }
        .zc-foot-brand {
          display: flex; flex-direction: column; gap: 12px;
        }
        .zc-foot-brand .mark {
          display: flex; align-items: center; gap: 10px;
          font: 500 14px var(--f-mono); color: var(--fg);
        }
        .zc-foot-brand .mark .g {
          width: 18px; height: 18px; position: relative;
        }
        .zc-foot-brand .mark .g::before, .zc-foot-brand .mark .g::after {
          content: ''; position: absolute; inset: 0; border: 1.5px solid currentColor;
        }
        .zc-foot-brand .mark .g::before { opacity: .35; }
        .zc-foot-brand .mark .g::after { transform: rotate(20deg) scale(.7); color: var(--accent); }
        .zc-foot-brand p {
          margin: 0; font-size: 13px; color: var(--fg-2); line-height: 1.55; max-width: 32ch;
        }
        .zc-foot-col h4 {
          margin: 0 0 14px;
          font: 500 11px var(--f-mono); letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--fg-3);
        }
        .zc-foot-col ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .zc-foot-col a {
          font-size: 13.5px; color: var(--fg-1); text-decoration: none;
          transition: color 120ms ease;
        }
        .zc-foot-col a:hover { color: var(--accent); }
        .zc-foot-bottom {
          max-width: 1180px; margin: clamp(40px, 5vw, 56px) auto 0;
          padding-top: 24px; border-top: 1px solid var(--line);
          display: flex; flex-wrap: wrap; gap: 14px;
          align-items: center; justify-content: space-between;
          font: 12px var(--f-mono); color: var(--fg-3); letter-spacing: 0.04em;
        }
        @media (max-width: 720px) {
          .zc-foot-inner { grid-template-columns: 1fr 1fr; gap: 32px 24px; }
          .zc-foot-brand { grid-column: 1 / -1; }
        }
        @media (max-width: 420px) {
          .zc-foot-inner { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="zc-foot-inner">
        <div className="zc-foot-brand">
          <div className="mark"><span className="g" />zerocode</div>
          <p>A self-hosted sandbox for running untrusted code. MIT / Apache 2.0 dual-licensed.</p>
        </div>
        <div className="zc-foot-col">
          <h4>Product</h4>
          <ul>
            <li><a href="/docs/quickstart">Quickstart</a></li>
            <li><a href="/playground.html">Playground</a></li>
            <li><a href="/docs/languages">Languages</a></li>
            <li><a href="/docs/security">Security</a></li>
          </ul>
        </div>
        <div className="zc-foot-col">
          <h4>Developers</h4>
          <ul>
            <li><a href="/docs/api">REST API</a></li>
            <li><a href="/v1/openapi.json">OpenAPI 3.1</a></li>
            <li><a href="/docs/sdks">Clients & SDKs</a></li>
            <li><a href="/docs/observability">Observability</a></li>
          </ul>
        </div>
        <div className="zc-foot-col">
          <h4>Project</h4>
          <ul>
            <li><a href={`https://github.com/${GITHUB_REPO}`} target="_blank" rel="noreferrer">GitHub</a></li>
            <li><a href={`https://github.com/${GITHUB_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">Changelog</a></li>
            <li><a href={`https://github.com/${GITHUB_REPO}/issues`} target="_blank" rel="noreferrer">Issues</a></li>
            <li><a href="/docs/deployment">Deployment</a></li>
          </ul>
        </div>
      </div>
      <div className="zc-foot-bottom">
        <span>© 2026 ZeroCode contributors</span>
        <span>v0.1.4 · rust 1.85 · kernel ≥ 5.14</span>
      </div>
    </footer>
  );
}

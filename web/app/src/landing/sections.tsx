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
 *   Footer            — minimal columns
 *
 * Mobile-first throughout: every grid collapses to a single column under
 * 720 px, font sizes clamp, touch targets stay ≥ 44 px.
 */

import { useEffect, useRef, useState } from 'react';
import { LayerDiagram, LAYERS } from './layer-diagram';
import { HIDE_DOCS } from '../shared/flags';
import {
  EASE_OUT, Parallax, Reveal, Stagger, StaggerItem,
  motion, useReducedMotion,
} from './motion';
import {
  animate, useInView, useMotionValue, useTransform,
} from 'motion/react';

/* ─── Shared section header ────────────────────────────────────────────── */
interface SectionHeaderProps {
  kicker: string;
  title: string;        // may contain <span class="it">…</span>
  sub?: string;
  anchor?: string;
}
const headerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.02 } },
};
const headerChild = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
};
export function SectionHeader({ kicker, title, sub, anchor }: SectionHeaderProps) {
  return (
    <motion.header
      className="zc-sh"
      id={anchor}
      variants={headerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-12% 0px -12% 0px' }}
    >
      <style>{`
        .zc-sh {
          max-width: 720px;
          margin: 0 0 clamp(36px, 6vw, 56px);
        }
        .zc-sh .k {
          display: inline-flex; align-items: center; gap: 8px;
          font: 500 11.5px var(--f-mono); color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 16px;
        }
        .zc-sh .k::before {
          content: ''; width: 18px; height: 1px;
          background: linear-gradient(90deg, var(--accent), transparent);
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
      <motion.span className="k" variants={headerChild}>{kicker}</motion.span>
      <motion.h2 variants={headerChild} dangerouslySetInnerHTML={{ __html: title }} />
      {sub && <motion.p variants={headerChild}>{sub}</motion.p>}
    </motion.header>
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
          position: relative;
          padding: 24px 26px;
          border: 1px solid var(--line-2);
          border-radius: 14px;
          background:
            linear-gradient(180deg, color-mix(in oklab, var(--accent) 4%, transparent), transparent 60%),
            var(--bg-1);
          overflow: hidden;
          transition: border-color 280ms ease;
        }
        .zc-iso-info .layer-card::before {
          content: '';
          position: absolute; inset: 0 auto 0 0; width: 2px;
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--accent) 80%, transparent),
            color-mix(in oklab, var(--accent) 20%, transparent));
        }
        .zc-iso-info .layer-card-inner {
          animation: zc-card-fade 320ms cubic-bezier(.22,.61,.36,1);
        }
        @keyframes zc-card-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .zc-iso-info .layer-card-inner { animation: none; }
        }
        .zc-iso-info .layer-card .num {
          font: 500 11.5px var(--f-mono); color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 10px; display: block;
        }
        .zc-iso-info .layer-card .name {
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(22px, 2.6vw, 28px); line-height: 1.15;
          color: var(--fg); margin: 0 0 10px;
        }
        .zc-iso-info .layer-card .desc {
          font-size: 14.5px; line-height: 1.6; color: var(--fg-1);
          margin: 0 0 14px;
        }
        .zc-iso-info .layer-card .call {
          display: block;
          padding: 10px 12px;
          font: 400 11.5px/1.5 var(--f-mono);
          color: var(--fg-1);
          background: var(--bg-2);
          border: 1px solid var(--line);
          border-radius: 8px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .zc-iso-info .layer-card .call .tok { color: var(--accent); }
        .zc-iso-info .layer-list {
          display: flex; flex-wrap: wrap; gap: 8px;
        }
        .zc-iso-info .layer-list button {
          appearance: none;
          position: relative;
          border: 1px solid var(--line-2);
          background: transparent;
          color: var(--fg-2);
          padding: 7px 12px; border-radius: 999px;
          font: 11.5px var(--f-mono); letter-spacing: 0.04em;
          cursor: pointer;
          transition:
            border-color 200ms ease,
            color 200ms ease,
            background 200ms ease,
            transform 200ms cubic-bezier(.22,.61,.36,1);
          min-height: 32px;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .zc-iso-info .layer-list button::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: var(--line-strong);
          transition: background 200ms ease, box-shadow 200ms ease;
        }
        .zc-iso-info .layer-list button:hover { color: var(--fg); border-color: var(--line-strong); transform: translateY(-1px); }
        .zc-iso-info .layer-list button.active {
          color: var(--accent);
          border-color: color-mix(in oklab, var(--accent) 70%, var(--line-2));
          background: color-mix(in oklab, var(--accent) 10%, transparent);
        }
        .zc-iso-info .layer-list button.active::before {
          background: var(--accent);
          box-shadow: 0 0 8px color-mix(in oklab, var(--accent) 80%, transparent);
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
          <Reveal className="zc-iso-stage" y={0} duration={0.9}>
            <Parallax distance={24}>
              <LayerDiagram variant="hero" />
            </Parallax>
          </Reveal>
          <Reveal className="zc-iso-info" delay={0.1}>
            <div className="layer-card">
              <div className="layer-card-inner" key={active}>
                <span className="num">layer {String(active + 1).padStart(2, '0')}</span>
                <h3 className="name">{layer.name}</h3>
                <p className="desc">{layer.note}</p>
                <code className="call">
                  <span className="tok">syscall</span> · {layer.call}
                </code>
              </div>
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
          </Reveal>
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
        <Stagger className="zc-how-grid">
          {STEPS.map((s) => (
            <StaggerItem key={s.n} as="article" className="zc-how-step" hoverLift>
              <span className="num">step {s.n}</span>
              <h3>{s.title}</h3>
              <p className="body">{s.body}</p>
              <pre>{s.code}</pre>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ─── Test cases (batch submissions) ───────────────────────────────────── */
const BATCH_CASES: { stdin: string; out: string; verdict: 'pass' | 'fail' }[] = [
  { stdin: '3',    out: '9',     verdict: 'pass' },
  { stdin: '7',    out: '49',    verdict: 'pass' },
  { stdin: '12',   out: '144',   verdict: 'pass' },
  { stdin: '-5',   out: '25',    verdict: 'pass' },
  { stdin: '9999', out: '99980001', verdict: 'pass' },
];

export function TestCasesSection() {
  return (
    <section className="zc-tc" id="batch">
      <style>{`
        .zc-tc {
          padding: clamp(72px, 11vw, 140px) clamp(20px, 5vw, 64px);
          background: var(--bg-1);
          border-top: 1px solid var(--line);
        }
        .zc-tc-inner { max-width: 1180px; margin: 0 auto; }
        .zc-tc-row {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: clamp(32px, 6vw, 72px); align-items: center;
        }
        .zc-tc-cta { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
        .zc-tc-cta a {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 18px; border-radius: 8px; font: 500 14px var(--f-sans);
          text-decoration: none; min-height: 44px;
          transition: transform 120ms ease, filter 120ms ease, border-color 120ms ease, color 120ms ease;
        }
        .zc-tc-cta .primary { background: var(--accent); color: var(--bg); border: 1px solid var(--accent); }
        .zc-tc-cta .primary:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .zc-tc-cta .ghost { color: var(--fg-1); border: 1px solid var(--line-2); }
        .zc-tc-cta .ghost:hover { color: var(--fg); border-color: var(--line-strong); }

        /* Runner card mockup */
        .zc-tc-card {
          border: 1px solid var(--line); border-radius: 14px;
          background: var(--bg); overflow: hidden;
          box-shadow: 0 32px 80px -44px rgba(0,0,0,0.4);
        }
        .zc-tc-card-hd {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-bottom: 1px solid var(--line);
          background: color-mix(in oklab, var(--bg-2) 60%, transparent);
          font: 11.5px var(--f-mono); color: var(--fg-3); letter-spacing: 0.04em;
        }
        .zc-tc-card-hd .pill {
          margin-left: auto; padding: 2px 9px; border-radius: 99px;
          background: color-mix(in oklab, var(--st-accepted) 18%, transparent);
          color: var(--st-accepted); font-size: 10.5px; letter-spacing: 0.06em;
        }
        .zc-tc-case {
          display: grid; grid-template-columns: 22px 1fr auto auto; gap: 12px;
          align-items: center; padding: 11px 16px;
          border-bottom: 1px dashed var(--line);
          font: 12.5px var(--f-mono);
        }
        .zc-tc-case:last-child { border-bottom: 0; }
        .zc-tc-case .n { color: var(--fg-4); }
        .zc-tc-case .io { color: var(--fg-1); }
        .zc-tc-case .io .arrow { color: var(--fg-4); margin: 0 6px; }
        .zc-tc-case .io .out { color: var(--fg); }
        .zc-tc-case .ms { color: var(--fg-4); font-size: 11px; }
        .zc-tc-case .v {
          color: var(--st-accepted); font-size: 11px; letter-spacing: 0.04em;
          display: inline-flex; align-items: center; gap: 4px;
        }
        @media (max-width: 880px) {
          .zc-tc-row { grid-template-columns: 1fr; }
          .zc-tc-case .ms { display: none; }
        }
      `}</style>
      <div className="zc-tc-inner">
        <div className="zc-tc-row">
          <div>
            <SectionHeader
              kicker="test cases"
              title='One program. <span class="it">Many inputs.</span> One request.'
              sub="POST a single source plus up to 100 stdin cases to /v1/submissions/batch. Compiled languages compile once and run N times — the compile cache makes every case after the first near-instant. In the playground, switch to the Tests tab to define cases, set expected output, and get per-case pass/fail with an inline diff."
            />
            <div className="zc-tc-cta">
              <a className="primary" href="/playground.html">Open the playground →</a>
              {!HIDE_DOCS && <a className="ghost" href="/docs/api">Batch API docs</a>}
            </div>
          </div>
          <Parallax distance={28}>
            <Stagger className="zc-tc-card" aria-hidden="true">
              <div className="zc-tc-card-hd">
                <span>squared.cpp · 5 cases</span>
                <span className="pill">5 / 5 pass</span>
              </div>
              {BATCH_CASES.map((c, i) => (
                <StaggerItem key={i} className="zc-tc-case">
                  <span className="n">#{i + 1}</span>
                  <span className="io">
                    {c.stdin}<span className="arrow">→</span><span className="out">{c.out}</span>
                  </span>
                  <span className="ms">{i === 0 ? '410ms' : '24ms'}</span>
                  <span className="v">✓ pass</span>
                </StaggerItem>
              ))}
            </Stagger>
          </Parallax>
        </div>
      </div>
    </section>
  );
}

/* ─── CountUp — animate a number from 0 → target when scrolled into view ── */
function CountUp({ to, duration = 1.1 }: { to: number; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => String(Math.round(v)));
  useEffect(() => {
    if (!inView) return;
    if (reduce) { mv.set(to); return; }
    const controls = animate(mv, to, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [inView, to, duration, reduce, mv]);
  return <motion.span ref={ref}>{rounded}</motion.span>;
}

/* ─── Speed (single big stat + budget breakdown) ───────────────────────── */
export function SpeedSection() {
  const budget = [
    { lbl: 'POST → INSERT',           v: '~1.2 ms', c: 'var(--accent)' },
    { lbl: 'NOTIFY → worker wake',    v: '~0.8 ms', c: 'var(--blue-1)' },
    { lbl: 'claim + spawn sandbox',   v: '~2.4 ms', c: 'var(--green-1)' },
    { lbl: 'repeat compile (cached)', v: 'skipped',  c: 'var(--fg-2)' },
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
          sub="No polling, no broker hop, no queue-daemon round-trip. Postgres LISTEN/NOTIFY wakes the worker on the same SQL transaction the API just committed. Identical submissions short-circuit through an in-process result cache, and recompiles of the same source skip straight to the run phase via the compile cache."
        />
        <div className="zc-spd-row">
          <Reveal className="zc-spd-stat" y={28}>
            <div className="big">&lt; <CountUp to={5} /><span className="unit"> ms</span></div>
            <div className="lbl">dispatch latency · p99</div>
          </Reveal>
          <Stagger className="zc-spd-budget">
            {budget.map((b, i) => (
              <StaggerItem key={i} className="item">
                <span className="dot" style={{ background: b.c }} />
                <span className="lbl">{b.lbl}</span>
                <span className="v">{b.v}</span>
              </StaggerItem>
            ))}
          </Stagger>
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
          grid-template-columns: 1.4fr repeat(2, 1fr);
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
            {!HIDE_DOCS && <li><a href="/docs/quickstart">Quickstart</a></li>}
            <li><a href="/playground.html">Playground</a></li>
            {!HIDE_DOCS && <li><a href="/docs/languages">Languages</a></li>}
            {!HIDE_DOCS && <li><a href="/docs/security">Security</a></li>}
          </ul>
        </div>
        <div className="zc-foot-col">
          <h4>Developers</h4>
          <ul>
            {!HIDE_DOCS && <li><a href="/docs/api">REST API</a></li>}
            <li><a href="/v1/openapi.json">OpenAPI 3.1</a></li>
            {!HIDE_DOCS && <li><a href="/docs/sdks">Clients & SDKs</a></li>}
            {!HIDE_DOCS && <li><a href="/docs/observability">Observability</a></li>}
            {!HIDE_DOCS && <li><a href="/docs/deployment">Deployment</a></li>}
          </ul>
        </div>
      </div>
      <div className="zc-foot-bottom">
        <span>© 2026 ZeroCode contributors</span>
        <span>rust 1.85 · kernel ≥ 5.14</span>
      </div>
    </footer>
  );
}

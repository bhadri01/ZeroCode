/*
 * Hero — calmer redesign.
 *
 * Single confident statement, type-on curl demo with a streaming response,
 * two CTAs. The dense kicker line / stat grid / animated 8-layer wheel
 * from the old hero moved out of the hero (the 8-layer wheel now lives in
 * its own section below).
 *
 * Mobile-first sizing:
 *   - h1 clamps 36 → 72 px between 360 px and 1200 px viewport
 *   - body clamp 16 → 19 px
 *   - CTAs stack below 640 px
 *   - terminal width fluid; min-height grows on mobile so the typed-out
 *     line stays readable
 */

import { useEffect, useRef, useState } from 'react';

const CURL = `curl -X POST https://api.example.com/v1/submissions?wait=true \\
  -H "authorization: Bearer $ZC_KEY" \\
  -d '{"language_id":71,"source_code":"print(\\"hello, sandbox\\")"}'`;

const OUTPUT_LINES: { c: string; text: string }[] = [
  { c: 'st-queued',   text: '⟶ queued · token zc_a3f29c8b'         },
  { c: 'st-queued',   text: '⟶ processing · worker-1 claimed'        },
  { c: 'fg-1',        text: 'hello, sandbox'                          },
  { c: 'st-accepted', text: '✓ accepted · 47 ms wall · 8.2 MB mem'   },
];

export function Hero() {
  const [typed, setTyped] = useState('');
  const [showOut, setShowOut] = useState<number>(-1);
  const [restart, setRestart] = useState(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setTyped(CURL);
      setShowOut(OUTPUT_LINES.length - 1);
      return;
    }

    const t = timersRef.current;
    t.forEach(clearTimeout); t.length = 0;
    setTyped('');
    setShowOut(-1);

    // Type the curl command character by character, then stream the
    // response one line per ~480 ms.
    const CHAR_MS = 14;
    for (let i = 1; i <= CURL.length; i++) {
      t.push(window.setTimeout(() => setTyped(CURL.slice(0, i)), i * CHAR_MS));
    }
    const afterType = CURL.length * CHAR_MS + 320;
    OUTPUT_LINES.forEach((_, i) => {
      t.push(window.setTimeout(() => setShowOut(i), afterType + i * 480));
    });
    // Loop the whole cycle.
    t.push(window.setTimeout(() => setRestart((n) => n + 1),
      afterType + OUTPUT_LINES.length * 480 + 3600));

    return () => { t.forEach(clearTimeout); t.length = 0; };
  }, [restart]);

  return (
    <section className="zc-hero">
      <style>{`
        .zc-hero {
          position: relative;
          padding: clamp(56px, 12vw, 140px) clamp(20px, 5vw, 64px) clamp(48px, 10vw, 120px);
          overflow: hidden;
          /* Subtle radial spotlight from the top-left. Sits behind everything. */
          background:
            radial-gradient(900px 600px at 12% -10%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%),
            radial-gradient(600px 400px at 92% 4%,   color-mix(in oklab, var(--blue-1) 10%, transparent), transparent 65%);
        }
        .zc-hero-inner { max-width: 1180px; margin: 0 auto; }

        .zc-hero h1 {
          margin: 0;
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(36px, 6.4vw, 76px);
          line-height: 1.04; letter-spacing: -0.02em; color: var(--fg);
          max-width: 22ch;
          text-wrap: balance;
        }
        .zc-hero h1 .it { font-style: italic; color: var(--accent); }

        .zc-hero p.sub {
          margin: clamp(16px, 3vw, 28px) 0 0;
          font-size: clamp(16px, 1.8vw, 19px);
          line-height: 1.55; color: var(--fg-1);
          max-width: 56ch;
          text-wrap: pretty;
        }

        .zc-hero-cta {
          display: flex; gap: 12px; flex-wrap: wrap;
          margin-top: clamp(28px, 5vw, 44px);
        }
        .zc-hero-cta a {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 20px; border-radius: 8px;
          font: 500 14px var(--f-sans);
          text-decoration: none;
          transition: transform 120ms ease, box-shadow 200ms ease, background 120ms ease, border-color 120ms ease;
          min-height: 44px;  /* iOS touch target */
        }
        .zc-hero-cta .primary {
          background: var(--accent); color: var(--bg);
          border: 1px solid var(--accent);
          box-shadow: 0 4px 24px -8px color-mix(in oklab, var(--accent) 60%, transparent);
        }
        .zc-hero-cta .primary:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .zc-hero-cta .ghost {
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          background: color-mix(in oklab, var(--bg-1) 50%, transparent);
        }
        .zc-hero-cta .ghost:hover { color: var(--fg); border-color: var(--line-strong); background: var(--bg-1); }
        .zc-hero-cta .arrow { transition: transform 200ms ease; }
        .zc-hero-cta a:hover .arrow { transform: translateX(2px); }

        .zc-hero-meta {
          margin-top: clamp(24px, 4vw, 36px);
          display: flex; flex-wrap: wrap; gap: 18px 28px;
          font: 12px var(--f-mono); color: var(--fg-3); letter-spacing: 0.04em;
        }
        .zc-hero-meta b { color: var(--fg-1); font-weight: 500; }

        /* Terminal demo --------------------------------------------------- */
        .zc-term {
          margin-top: clamp(40px, 7vw, 64px);
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--bg-1);
          overflow: hidden;
          box-shadow:
            0 32px 80px -40px rgba(0,0,0,0.45),
            0 0 0 1px color-mix(in oklab, var(--fg) 4%, transparent);
        }
        .zc-term-hd {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-bottom: 1px solid var(--line);
          background: color-mix(in oklab, var(--bg-2) 60%, transparent);
        }
        .zc-term-hd .light { width: 11px; height: 11px; border-radius: 50%; background: var(--bg-3); }
        .zc-term-hd .light:nth-child(1) { background: #ff5f57; }
        .zc-term-hd .light:nth-child(2) { background: #febc2e; }
        .zc-term-hd .light:nth-child(3) { background: #28c840; }
        .zc-term-hd .label {
          margin-left: 8px;
          font: 11.5px var(--f-mono); color: var(--fg-3);
          letter-spacing: 0.04em;
        }
        .zc-term-bd {
          padding: clamp(14px, 2.4vw, 22px) clamp(14px, 2.6vw, 24px);
          font-family: var(--f-mono);
          font-size: clamp(11.5px, 1.3vw, 13.5px);
          line-height: 1.7;
          color: var(--fg-1);
          min-height: clamp(196px, 22vw, 240px);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .zc-term-bd .pr { color: var(--accent); user-select: none; margin-right: 8px; }
        .zc-term-bd .caret {
          display: inline-block; width: 8px; height: 1.1em; background: var(--accent);
          margin-left: 2px; vertical-align: -3px; animation: blink 1s steps(1) infinite;
        }
        .zc-term-bd .out { margin-top: 6px; }
        .zc-term-bd .out .ln { white-space: pre-wrap; }
        .zc-term-bd .out .st-queued   { color: var(--st-queued); }
        .zc-term-bd .out .st-accepted { color: var(--st-accepted); }
        .zc-term-bd .out .fg-1        { color: var(--fg); }
        @keyframes blink { 50% { opacity: 0; } }

        /* Mobile breakpoints ----------------------------------------------- */
        @media (max-width: 640px) {
          .zc-hero-cta { flex-direction: column; align-items: stretch; }
          .zc-hero-cta a { justify-content: center; }
          .zc-term-hd .label { display: none; }
          .zc-hero-meta { gap: 10px 18px; }
        }
      `}</style>
      <div className="zc-hero-inner">
        <h1>
          Run untrusted code.<br />
          <span className="it">Without the prayer.</span>
        </h1>

        <p className="sub">
          A self-hosted code-execution sandbox in Rust. Eight kernel-enforced
          isolation layers, sub-5 ms job pickup, REST + SSE. Seven languages
          wired up out of the box — Python, Node, Rust, Go, C, C++, Java.
        </p>

        <div className="zc-hero-cta">
          <a className="primary" href="/docs/quickstart">
            Get started <span className="arrow">→</span>
          </a>
          <a className="ghost" href="/playground.html">
            Try the playground
          </a>
        </div>

        <div className="zc-hero-meta">
          <span><b>8</b> isolation layers</span>
          <span><b>7</b> languages</span>
          <span><b>&lt; 5 ms</b> dispatch p99</span>
          <span><b>71</b> tests · <b>0</b> CVEs</span>
        </div>

        <div className="zc-term" aria-hidden="true">
          <div className="zc-term-hd">
            <span className="light" /><span className="light" /><span className="light" />
            <span className="label">~/zerocode · zsh</span>
          </div>
          <div className="zc-term-bd">
            <span className="pr">$</span>
            {typed}
            {typed.length < CURL.length && <span className="caret" />}
            {showOut >= 0 && (
              <div className="out">
                {OUTPUT_LINES.slice(0, showOut + 1).map((l, i) => (
                  <div key={i} className={`ln ${l.c}`}>{l.text}</div>
                ))}
                {showOut >= OUTPUT_LINES.length - 1 && (
                  <div className="ln" style={{ marginTop: 6 }}>
                    <span className="pr">$</span><span className="caret" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

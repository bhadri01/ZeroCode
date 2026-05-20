/*
 * Languages section (post-redesign).
 *
 * Replaces the old Core 7 detail-cards + 34 chip wall (which referenced
 * languages we don't ship today) with a clean 7-card grid for what's
 * actually wired up in runners/languages.toml. Mobile-first: 1 col on
 * small screens, 2 col tablets, 3 col laptops, 4 col wide.
 */

import type { CSSProperties } from 'react';
import { LangIcon, type LangKey } from '../shared/lang-icons';
import { Reveal, Stagger, StaggerItem } from './motion';

interface CoreLang {
  id: number; name: string; version: string;
  key: LangKey;
  accent: string;
  kind: 'interpreted' | 'compiled' | 'jvm';
}

const CORE7: CoreLang[] = [
  { id: 71, name: 'Python',  version: '3.13',    key: 'python', accent: '#3776AB', kind: 'interpreted' },
  { id: 63, name: 'Node.js', version: '22 LTS',  key: 'node',   accent: '#5FA04E', kind: 'interpreted' },
  { id: 73, name: 'Rust',    version: 'stable',  key: 'rust',   accent: '#CE412B', kind: 'compiled'    },
  { id: 60, name: 'Go',      version: '1.x',     key: 'go',     accent: '#00ADD8', kind: 'compiled'    },
  { id: 48, name: 'C',       version: 'gcc-14',  key: 'c',      accent: '#A8B9CC', kind: 'compiled'    },
  { id: 52, name: 'C++',     version: 'g++-14',  key: 'cpp',    accent: '#00599C', kind: 'compiled'    },
  { id: 62, name: 'Java',    version: 'JDK 21',  key: 'java',   accent: '#ED8B00', kind: 'jvm'         },
];

const KIND_LABEL: Record<CoreLang['kind'], string> = {
  interpreted: 'interpreted',
  compiled:    'compile · run',
  jvm:         'javac · java',
};

export function LanguageMatrix() {
  return (
    <section className="zc-langs" id="languages">
      <style>{`
        .zc-langs {
          padding: clamp(72px, 11vw, 140px) clamp(20px, 5vw, 64px);
          background: var(--bg-1);
          border-top: 1px solid var(--line);
        }
        .zc-langs-inner { max-width: 1180px; margin: 0 auto; }
        .zc-langs-hd {
          display: flex; align-items: end; gap: 24px;
          justify-content: space-between; flex-wrap: wrap;
          margin-bottom: clamp(32px, 5vw, 48px);
        }
        .zc-langs-hd .copy {
          max-width: 560px;
        }
        .zc-langs-hd .k {
          display: inline-block; margin-bottom: 14px;
          font: 500 11.5px var(--f-mono); color: var(--accent);
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        .zc-langs-hd h2 {
          margin: 0;
          font-family: var(--f-display); font-weight: 400;
          font-size: clamp(28px, 4.8vw, 48px); line-height: 1.08;
          letter-spacing: -0.018em; color: var(--fg); text-wrap: balance;
        }
        .zc-langs-hd h2 .it { font-style: italic; color: var(--accent); }
        .zc-langs-hd p {
          margin: 14px 0 0;
          font-size: clamp(15px, 1.6vw, 17px); line-height: 1.6; color: var(--fg-1);
          max-width: 60ch;
        }
        .zc-langs-hd .count {
          font: 500 13px var(--f-mono); color: var(--fg-2);
          padding: 6px 12px; border: 1px solid var(--line-2); border-radius: 99px;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .zc-langs-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: clamp(14px, 2vw, 20px);
        }
        @media (max-width: 1080px) { .zc-langs-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 800px)  { .zc-langs-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px)  { .zc-langs-grid { grid-template-columns: 1fr; } }

        .zc-lang-card {
          --g: var(--accent);
          padding: 22px 22px 20px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--bg);
          display: flex; flex-direction: column; gap: 14px;
          transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
          position: relative; overflow: hidden;
        }
        .zc-lang-card::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, color-mix(in oklab, var(--g) 14%, transparent) 0%, transparent 38%);
          opacity: 0; transition: opacity 200ms ease;
          pointer-events: none;
        }
        .zc-lang-card:hover {
          border-color: color-mix(in oklab, var(--g) 60%, var(--line));
          transform: translateY(-2px);
          box-shadow: 0 18px 50px -30px color-mix(in oklab, var(--g) 60%, transparent);
        }
        .zc-lang-card:hover::before { opacity: 1; }

        .zc-lang-card .head {
          display: flex; align-items: center; gap: 12px; position: relative;
        }
        .zc-lang-card .glyph {
          width: 44px; height: 44px; border-radius: 10px;
          display: inline-flex; align-items: center; justify-content: center;
          background: color-mix(in oklab, var(--g) 12%, transparent);
          border: 1px solid color-mix(in oklab, var(--g) 25%, transparent);
        }
        .zc-lang-card .glyph svg { display: block; }
        .zc-lang-card .head .name {
          font-family: var(--f-display); font-weight: 400;
          font-size: 22px; line-height: 1.1; color: var(--fg);
        }
        .zc-lang-card .head .id {
          margin-left: auto;
          font: 500 11px var(--f-mono); color: var(--fg-3);
          padding: 3px 8px; border: 1px solid var(--line-2); border-radius: 4px;
          letter-spacing: 0.06em;
        }
        .zc-lang-card .meta {
          display: flex; gap: 10px; flex-wrap: wrap; position: relative;
          font: 12px var(--f-mono); color: var(--fg-2); letter-spacing: 0.02em;
        }
        .zc-lang-card .meta b { color: var(--fg-1); font-weight: 500; }
        .zc-lang-card .meta .sep { color: var(--fg-4); }
      `}</style>
      <div className="zc-langs-inner">
        <Reveal className="zc-langs-hd">
          <div className="copy">
            <span className="k">languages</span>
            <h2>The Core 7. <span className="it">Versioned. Sandboxed.</span></h2>
            <p>
              Every toolchain bundled into the runner image — no language
              setup on the host, no per-submission package install. Each
              language has a stable numeric ID, brand-accurate icon, and a
              tested edge-case suite.
            </p>
          </div>
          <span className="count">7 shipped today</span>
        </Reveal>
        <Stagger className="zc-langs-grid">
          {CORE7.map((l) => (
            <StaggerItem key={l.id} as="article" className="zc-lang-card" hoverLift style={{ '--g': l.accent } as CSSProperties}>
              <div className="head">
                <span className="glyph"><LangIcon lang={l.key} size={26} /></span>
                <span className="name">{l.name}</span>
                <span className="id">id {l.id}</span>
              </div>
              <div className="meta">
                <span><b>{l.version}</b></span>
                <span className="sep">·</span>
                <span>{KIND_LABEL[l.kind]}</span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

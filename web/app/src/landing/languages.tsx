/*
 * Languages section.
 *
 * Core 7 as detailed cards (brand icons) + a chip wall of the 34 v1.5 batch
 * languages and the v2 raw-wasm tier — every entry in runners/languages.toml
 * (41 total). Mobile-first: 1 col on small screens, 2 col tablets, 3 col
 * laptops, 4 col wide.
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

// The 34 v1.5 batch languages + the v2 raw-wasm tier, grouped by batch.
// Accents mirror runners/languages.toml / the playground catalog.
interface BatchLang { id: number; name: string; accent: string; }
const BATCHES: { label: string; langs: BatchLang[] }[] = [
  { label: 'A · interpreted', langs: [
    { id: 100, name: 'Bash',       accent: '#4EAA25' },
    { id: 101, name: 'Lua',        accent: '#2C2D72' },
    { id: 102, name: 'Perl',       accent: '#39457E' },
    { id: 103, name: 'Ruby',       accent: '#CC342D' },
    { id: 104, name: 'R',          accent: '#276DC3' },
    { id: 105, name: 'PHP',        accent: '#777BB4' },
    { id: 106, name: 'TypeScript', accent: '#3178C6' },
  ] },
  { label: 'B · compiled', langs: [
    { id: 110, name: 'Fortran',     accent: '#734F96' },
    { id: 111, name: 'Pascal',      accent: '#1A6FB5' },
    { id: 112, name: 'D',           accent: '#B03931' },
    { id: 113, name: 'Objective-C', accent: '#438EFF' },
    { id: 114, name: 'Assembly',    accent: '#6E4C13' },
    { id: 115, name: 'Ada',         accent: '#0CA14A' },
  ] },
  { label: 'C · JVM', langs: [
    { id: 120, name: 'Kotlin',  accent: '#7F52FF' },
    { id: 121, name: 'Scala',   accent: '#DC322F' },
    { id: 122, name: 'Groovy',  accent: '#4298B8' },
    { id: 123, name: 'Clojure', accent: '#5881D8' },
  ] },
  { label: 'D · functional', langs: [
    { id: 130, name: 'Haskell',     accent: '#5E5086' },
    { id: 131, name: 'OCaml',       accent: '#EC6813' },
    { id: 132, name: 'Erlang',      accent: '#A90533' },
    { id: 133, name: 'Elixir',      accent: '#4B275F' },
    { id: 134, name: 'Common Lisp', accent: '#3FB68B' },
  ] },
  { label: 'E · .NET', langs: [
    { id: 140, name: 'C#', accent: '#239120' },
    { id: 141, name: 'F#', accent: '#378BBA' },
  ] },
  { label: 'F · niche', langs: [
    { id: 150, name: 'COBOL',  accent: '#005CA5' },
    { id: 151, name: 'Prolog', accent: '#74283C' },
    { id: 152, name: 'Swift',  accent: '#F05138' },
    { id: 153, name: 'Octave', accent: '#0790C0' },
    { id: 154, name: 'SQL',    accent: '#003B57' },
  ] },
  { label: 'G · modern', langs: [
    { id: 161, name: 'Nim',     accent: '#FFC200' },
    { id: 162, name: 'Crystal', accent: '#999999' },
    { id: 163, name: 'Dart',    accent: '#0175C2' },
    { id: 164, name: 'Julia',   accent: '#9558B2' },
  ] },
  { label: 'v2 · WASM', langs: [
    { id: 200, name: 'raw-wasm', accent: '#654FF0' },
  ] },
];

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

        .zc-langs-batches {
          margin-top: clamp(28px, 4vw, 44px);
          padding-top: clamp(24px, 3.5vw, 36px);
          border-top: 1px solid var(--line);
          display: flex; flex-direction: column; gap: 18px;
        }
        .zc-batch { display: flex; gap: 16px; align-items: baseline; }
        .zc-batch .blabel {
          flex: 0 0 116px;
          font: 500 11.5px var(--f-mono); color: var(--fg-3);
          letter-spacing: 0.08em; text-transform: uppercase; padding-top: 5px;
        }
        .zc-batch .chips { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
        .zc-chip {
          --g: var(--accent);
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 11px 5px 10px;
          border: 1px solid var(--line); border-radius: 99px;
          background: var(--bg); color: var(--fg-1);
          font-size: 13px; line-height: 1;
          transition: border-color 160ms ease, transform 160ms ease;
        }
        .zc-chip:hover {
          border-color: color-mix(in oklab, var(--g) 60%, var(--line));
          transform: translateY(-1px);
        }
        .zc-chip .cdot { width: 9px; height: 9px; border-radius: 50%; background: var(--g); flex-shrink: 0; }
        .zc-chip .cid { font: 500 10.5px var(--f-mono); color: var(--fg-3); }
        @media (max-width: 640px) {
          .zc-batch { flex-direction: column; gap: 8px; }
          .zc-batch .blabel { flex: none; padding-top: 0; }
        }
      `}</style>
      <div className="zc-langs-inner">
        <Reveal className="zc-langs-hd">
          <div className="copy">
            <span className="k">languages</span>
            <h2>The Core 7, plus 34 more. <span className="it">Versioned. Sandboxed.</span></h2>
            <p>
              Every toolchain bundled into the runner image — no language
              setup on the host, no per-submission package install. Each
              language has a stable numeric ID, a tested edge-case suite, and
              runs in the same cgroups + landlock + seccomp sandbox.
            </p>
          </div>
          <span className="count">41 shipped today</span>
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
        <Reveal className="zc-langs-batches">
          {BATCHES.map((b) => (
            <div key={b.label} className="zc-batch">
              <span className="blabel">{b.label}</span>
              <div className="chips">
                {b.langs.map((l) => (
                  <span key={l.id} className="zc-chip" style={{ '--g': l.accent } as CSSProperties}>
                    <span className="cdot" aria-hidden="true" />
                    {l.name}
                    <span className="cid">{l.id}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

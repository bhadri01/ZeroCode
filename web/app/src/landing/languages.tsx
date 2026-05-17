import { useState, type CSSProperties } from 'react';
import { SectionHeader } from './sections';

interface CoreLang {
  id: number; name: string; version: string; glyph: string; tone: string; accent: string;
}
interface RestLang { id: number; name: string; version: string }

const CORE7: CoreLang[] = [
  { id: 71, name: 'Python',     version: '3.12.4',  glyph: 'py', tone: 'interpreted', accent: '#3776ab' },
  { id: 93, name: 'JavaScript', version: 'node 22', glyph: 'js', tone: 'interpreted', accent: '#f7df1e' },
  { id: 73, name: 'Rust',       version: '1.85.0',  glyph: 'rs', tone: 'compiled',    accent: '#D17B49' },
  { id: 95, name: 'Go',         version: '1.23.4',  glyph: 'go', tone: 'compiled',    accent: '#00add8' },
  { id: 50, name: 'C',          version: 'gcc 14',  glyph: 'c',  tone: 'compiled',    accent: '#a8b9cc' },
  { id: 54, name: 'C++',        version: 'gcc 14',  glyph: 'cc', tone: 'compiled',    accent: '#9c6eb8' },
  { id: 91, name: 'Java',       version: 'jdk 21',  glyph: 'jv', tone: 'jvm',         accent: '#d97757' },
];

const REST34: RestLang[] = [
  { id: 101, name: 'TypeScript',   version: '5.6.3'      },
  { id: 46,  name: 'Bash',         version: '5.2'        },
  { id: 72,  name: 'Ruby',         version: '3.3.4'      },
  { id: 68,  name: 'PHP',          version: '8.3.10'     },
  { id: 78,  name: 'Kotlin',       version: '2.0.20'     },
  { id: 83,  name: 'Swift',        version: '5.10'       },
  { id: 81,  name: 'Scala',        version: '3.5.0'      },
  { id: 57,  name: 'Elixir',       version: '1.17.2'     },
  { id: 58,  name: 'Erlang/OTP',   version: '27.0'       },
  { id: 61,  name: 'Haskell',      version: 'ghc 9.10'   },
  { id: 65,  name: 'OCaml',        version: '5.2.0'      },
  { id: 86,  name: 'Clojure',      version: '1.12'       },
  { id: 85,  name: 'Perl',         version: '5.40'       },
  { id: 64,  name: 'Lua',          version: '5.4.7'      },
  { id: 80,  name: 'R',            version: '4.4.1'      },
  { id: 87,  name: 'Julia',        version: '1.10.4'     },
  { id: 51,  name: 'C#',           version: '.net 8'     },
  { id: 87,  name: 'F#',           version: '8.0'        },
  { id: 90,  name: 'Dart',         version: '3.5.0'      },
  { id: 88,  name: 'Crystal',      version: '1.14'       },
  { id: 96,  name: 'Nim',          version: '2.2.0'      },
  { id: 97,  name: 'Zig',          version: '0.13.0'     },
  { id: 56,  name: 'D',            version: 'dmd 2.110'  },
  { id: 67,  name: 'Pascal',       version: 'fpc 3.2'    },
  { id: 59,  name: 'Fortran',      version: 'gfortran 14'},
  { id: 77,  name: 'COBOL',        version: 'gnucobol 3.2'},
  { id: 69,  name: 'Prolog',       version: 'swi 9.2'    },
  { id: 55,  name: 'Common Lisp',  version: 'sbcl 2.4'   },
  { id: 89,  name: 'Scheme',       version: 'chez 10'    },
  { id: 92,  name: 'Racket',       version: '8.14'       },
  { id: 88,  name: 'Groovy',       version: '4.0.23'     },
  { id: 99,  name: 'V',            version: '0.4.8'      },
  { id: 48,  name: 'AWK',          version: 'gawk 5.3'   },
  { id: 49,  name: 'NASM',         version: '2.16'       },
];

function LangGlyph({ ch, accent }: { ch: string; accent: string }) {
  return (
    <div className="lg-glyph" style={{ '--g': accent } as CSSProperties}>
      <style>{`
        .lg-glyph {
          width: 36px; height: 36px; flex-shrink: 0;
          border: 1px solid color-mix(in oklab, var(--g) 35%, var(--line-2));
          background: color-mix(in oklab, var(--g) 8%, var(--bg-2));
          color: var(--g);
          display: grid; place-items: center;
          font-family: var(--f-mono); font-size: 12px; font-weight: 500;
          letter-spacing: -0.02em; border-radius: 6px;
        }
      `}</style>
      {ch}
    </div>
  );
}

function CoreCard({ lang }: { lang: CoreLang }) {
  return (
    <article className="lg-core" style={{ '--a': lang.accent } as CSSProperties}>
      <style>{`
        .lg-core {
          position: relative;
          border: 1px solid var(--line-2);
          border-radius: 10px;
          padding: 16px 14px 14px;
          background: linear-gradient(180deg, var(--bg-1), var(--bg));
          display: flex; flex-direction: column; gap: 14px;
          min-height: 132px;
          transition: border-color .2s ease, transform .2s ease;
        }
        .lg-core:hover { border-color: color-mix(in oklab, var(--a) 60%, transparent); transform: translateY(-2px); }
        .lg-core::before { content: ''; position: absolute; left: 0; top: 14px; height: 24px; width: 3px; background: var(--a); border-radius: 0 2px 2px 0; }
        .lg-core .row1 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .lg-core .name { font-family: var(--f-sans); font-size: 16px; font-weight: 500; color: var(--fg); }
        .lg-core .id { font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.04em; padding: 2px 6px; border: 1px solid var(--line); border-radius: 3px; }
        .lg-core .meta { font-family: var(--f-mono); font-size: 11.5px; color: var(--fg-2); letter-spacing: 0.02em; display: flex; gap: 8px; align-items: center; }
        .lg-core .meta .tone { color: var(--a); padding: 1px 6px; border-radius: 3px; background: color-mix(in oklab, var(--a) 12%, transparent); }
        .lg-core .ver { color: var(--fg-1); }
      `}</style>
      <div className="row1">
        <LangGlyph ch={lang.glyph} accent={lang.accent} />
        <span className="id">id:{lang.id}</span>
      </div>
      <div>
        <div className="name">{lang.name}</div>
        <div className="meta">
          <span className="ver">{lang.version}</span>
          <span>·</span>
          <span className="tone">{lang.tone}</span>
        </div>
      </div>
    </article>
  );
}

function MiniChip({ lang }: { lang: RestLang }) {
  return (
    <div className="lg-chip">
      <style>{`
        .lg-chip {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 10px 12px;
          background: var(--bg-1);
          display: flex; flex-direction: column; gap: 2px;
          transition: border-color .15s ease, background .15s ease;
          cursor: default;
        }
        .lg-chip:hover { border-color: var(--line-2); background: var(--bg-2); }
        .lg-chip .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .lg-chip .nm { font-size: 13.5px; color: var(--fg); font-weight: 500; }
        .lg-chip .id { font-family: var(--f-mono); font-size: 10px; color: var(--fg-3); letter-spacing: 0.04em; }
        .lg-chip .vr { font-family: var(--f-mono); font-size: 11px; color: var(--fg-2); }
      `}</style>
      <div className="top">
        <span className="nm">{lang.name}</span>
        <span className="id">id:{lang.id}</span>
      </div>
      <span className="vr">{lang.version}</span>
    </div>
  );
}

export function LanguageMatrix() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (l: CoreLang | RestLang) => {
    if (!q) return true;
    const lang = l as Partial<CoreLang>;
    return l.name.toLowerCase().includes(q) ||
      String(l.id).includes(q) ||
      (l.version || '').toLowerCase().includes(q) ||
      (lang.tone || '').toLowerCase().includes(q);
  };
  const filteredCore = CORE7.filter(matches);
  const filteredRest = REST34.filter(matches);
  const total = filteredCore.length + filteredRest.length;
  return (
    <section className="zc-langs">
      <style>{`
        .zc-langs .shell { padding-bottom: 88px; }
        .zc-langs-meta { display: flex; justify-content: space-between; align-items: end; margin-bottom: 18px; gap: 24px; flex-wrap: wrap; font-family: var(--f-mono); font-size: 11.5px; color: var(--fg-3); letter-spacing: 0.06em; }
        .zc-langs-meta b { color: var(--accent); font-weight: 500; }
        .zc-langs-search { display: flex; align-items: center; gap: 10px; margin: 0 0 22px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg-1); transition: border-color .15s ease, background .15s ease; }
        .zc-langs-search:focus-within { border-color: var(--accent); background: var(--bg-2); }
        .zc-langs-search svg { color: var(--fg-3); flex-shrink: 0; }
        .zc-langs-search input { flex: 1; appearance: none; border: 0; background: transparent; color: var(--fg); font-family: var(--f-mono); font-size: 13px; outline: none; min-width: 0; }
        .zc-langs-search input::placeholder { color: var(--fg-3); }
        .zc-langs-search .count { font-family: var(--f-mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; white-space: nowrap; }
        .zc-langs-search .count b { color: var(--accent); font-weight: 500; }
        .zc-langs-search .clear { appearance: none; background: transparent; border: 0; color: var(--fg-3); cursor: pointer; padding: 2px 6px; font-family: var(--f-mono); font-size: 11px; }
        .zc-langs-search .clear:hover { color: var(--accent); }
        .zc-langs-empty { padding: 32px 18px; text-align: center; border: 1px dashed var(--line); border-radius: 8px; color: var(--fg-3); font-family: var(--f-mono); font-size: 12.5px; }
        .zc-langs-core { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin-bottom: 32px; }
        @media (max-width: 980px) { .zc-langs-core { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 600px) { .zc-langs-core { grid-template-columns: repeat(2, 1fr); } }
        .zc-langs-divider { display: flex; align-items: center; gap: 14px; margin: 14px 0 18px; font-family: var(--f-mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.14em; text-transform: uppercase; }
        .zc-langs-divider::before, .zc-langs-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
        .zc-langs-rest { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
        @media (max-width: 980px) { .zc-langs-rest { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .zc-langs-rest { grid-template-columns: repeat(2, 1fr); } }
        .zc-langs-foot { margin-top: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; font-family: var(--f-mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; }
        .zc-langs-foot a { color: var(--fg-1); border-bottom: 1px solid var(--line-2); padding-bottom: 1px; }
        .zc-langs-foot a:hover { color: var(--accent); border-color: var(--accent); }
      `}</style>
      <div className="shell" id="languages">
        <SectionHeader
          kicker="languages"
          title='Forty-one runtimes. <span class="it">Core seven first.</span>'
          sub="Same language IDs as Judge0. Versions tracked by Renovate and rebuilt nightly. Toolchains live in zerocode-runner; the API never touches them."
        />
        <div className="zc-langs-meta">
          <span><b>core 7</b> · pinned, benchmarked, supported with extra care</span>
          <span>runner image · <b>zerocode-runner:0.1.4</b></span>
        </div>
        <div className="zc-langs-search">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5"/><path d="m9.5 9.5 3 3"/>
          </svg>
          <input
            type="search"
            placeholder="filter 41 languages by name, id, version, or kind…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="count">
            {q ? <><b>{total}</b> of 41</> : <>41 total</>}
          </span>
          {q && <button className="clear" onClick={() => setQuery('')}>clear ✕</button>}
        </div>
        {total === 0 ? (
          <div className="zc-langs-empty">no language matches “{query}” — try “rust”, “73”, “jvm”, or “interpreted”</div>
        ) : (
          <>
            {filteredCore.length > 0 && (
              <div className="zc-langs-core">
                {filteredCore.map((l, i) => <CoreCard key={i} lang={l} />)}
              </div>
            )}
            {filteredCore.length > 0 && filteredRest.length > 0 && (
              <div className="zc-langs-divider">+ {filteredRest.length} more</div>
            )}
            {filteredRest.length > 0 && (
              <div className="zc-langs-rest">
                {filteredRest.map((l, i) => <MiniChip key={i} lang={l} />)}
              </div>
            )}
          </>
        )}
        <div className="zc-langs-foot">
          <span>fetch the catalog: <a href="/docs/api">GET /v1/languages</a> · returns 41 entries</span>
          <span>need another? <a href="https://github.com/bhadri01/ZeroCode/issues/new" target="_blank" rel="noreferrer">open an issue</a></span>
        </div>
      </div>
    </section>
  );
}

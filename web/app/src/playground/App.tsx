/*
 * ZeroCode playground — Code Space.
 *
 * Ported from web/playground/app.jsx (Monaco/CDN) to a Vite/React/TS module
 * with a CodeMirror 6 editor. Behavior preserved:
 *   - real submission via shared/api → SSE stream → polling fallback,
 *   - offline simulation when the API is unreachable,
 *   - ⌘↵ run · ⌘. cancel, share-link via URL hash, localStorage history,
 *   - Settings dialog (API base URL + bearer key).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Editor, type EditorHandle } from './Editor';
import { LANGS, VERDICT_COLOR, VERDICT_LABEL, type Lang, type Verdict } from './data';
import { TestsPanel } from './TestsPanel';
import { getTheme, toggleTheme, type Theme } from '../shared/theme';
import { LangIcon, langKeyFromId } from '../shared/lang-icons';
import { HIDE_DOCS } from '../shared/flags';
import {
  decode, encode, get as apiGet, getBaseSource,
  idemKey, languages, poll, probe, resetProbe,
  statusDetail as apiStatusDetail,
  statusKind as apiStatusKind, stream, submit,
  type LanguageSpec, type SubmissionView,
} from '../shared/api';

void encode; // imported for completeness; the SDK uses it internally
void decode;

interface RunMetrics {
  time: number | null;
  memory: number | null;
  exitCode: number | null;
  signal: string | null;
}

interface RunLimits { memoryMb: number; timeS: number }
interface Ceilings { memoryMb: number; timeS: number }
interface HistoryEntry {
  name: string;
  verdict: Verdict;
  time: number | null;
  token: string;
  when: number;
}

const HISTORY_KEY = 'zerocode.playground.history';
const STATE_KEY = 'zerocode.playground.state';

function loadHistory(): HistoryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 20) : [];
  } catch { return []; }
}
function saveHistory(h: HistoryEntry[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20))); } catch { /* noop */ }
}
interface Draft { langId: number; code: string; stdin: string; limits: RunLimits }
function loadDraft(): Draft | null {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; }
}
function saveDraft(s: Draft): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

// Layout v3 — adds historyH so the rail's languages list and history block
// can be resized against each other. Three earlier axes (rail, editor,
// stdinW) keep their meaning from v2. Key bumped so users with a v2 payload
// get the v3 default once.
const LAYOUT_KEY = 'zerocode:pg:layout-v3';
interface Layout { rail: number; editor: number; stdinW: number; historyH: number }
const LAYOUT_DEFAULT: Layout = { rail: 240, editor: 420, stdinW: 360, historyH: 200 };
function loadLayout(): Layout {
  try {
    const j = localStorage.getItem(LAYOUT_KEY);
    if (!j) return LAYOUT_DEFAULT;
    const v = JSON.parse(j) as Partial<Layout>;
    return {
      rail:     typeof v.rail     === 'number' ? v.rail     : LAYOUT_DEFAULT.rail,
      editor:   typeof v.editor   === 'number' ? v.editor   : LAYOUT_DEFAULT.editor,
      stdinW:   typeof v.stdinW   === 'number' ? v.stdinW   : LAYOUT_DEFAULT.stdinW,
      historyH: typeof v.historyH === 'number' ? v.historyH : LAYOUT_DEFAULT.historyH,
    };
  } catch { return LAYOUT_DEFAULT; }
}
function saveLayout(l: Layout): void {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* noop */ }
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Memory is stored internally in MB (the API reports KiB, we divide by 1024).
// Pick a readable unit so tiny programs don't all read "0.0 MB".
function formatMem(mb: number | null): string {
  if (mb == null) return '—';
  const kib = mb * 1024;
  if (kib < 1) return `${Math.round(kib * 1024)} B`;
  if (kib < 1024) return kib < 10 ? `${kib.toFixed(1)} KB` : `${Math.round(kib)} KB`;
  return mb < 100 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

interface ShareHash { lang: string | null; token: string | null; code: string | null; stdin: string }
function readShareHash(): ShareHash | null {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const p = new URLSearchParams(h);
  const codeParam = p.get('code');
  const stdinParam = p.get('stdin');
  const code = codeParam ? decodeURIComponent(escape(atob(codeParam))) : null;
  return {
    lang: p.get('lang'),
    token: p.get('token'),
    code,
    stdin: stdinParam ? decodeURIComponent(escape(atob(stdinParam))) : '',
  };
}

function writeShareHash(s: { langId?: number; code?: string; stdin?: string; token?: string }): void {
  const p = new URLSearchParams();
  if (s.langId != null) p.set('lang', String(s.langId));
  if (s.code) p.set('code', btoa(unescape(encodeURIComponent(s.code))));
  if (s.stdin) p.set('stdin', btoa(unescape(encodeURIComponent(s.stdin))));
  if (s.token) p.set('token', s.token);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '#' + qs : location.pathname);
}

/* ─── ThemeToggle ─────────────────────────────────────────────────
 * Sun/moon button in the top-right of the playground nav. Listens to the
 * shared `zerocode:theme` event so the icon flips whether the click came
 * from this button, the landing nav, or the user's OS preference change.
 * Toggle path goes through ../shared/theme so localStorage persistence +
 * data-theme attribute sync stay consistent across all three surfaces. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('zerocode:theme', onChange as EventListener);
    return () => window.removeEventListener('zerocode:theme', onChange as EventListener);
  }, []);
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      className="pg-theme"
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      onClick={() => toggleTheme()}
    >
      <style>{`
        .pg-theme {
          appearance: none; border: 1px solid var(--line-2); background: transparent;
          color: var(--fg-1); width: 28px; height: 28px; border-radius: 6px;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease;
        }
        .pg-theme:hover { border-color: var(--accent); color: var(--accent); background: color-mix(in oklab, var(--accent) 8%, transparent); }
        .pg-theme:active { transform: translateY(1px); }
        .pg-theme svg { display: block; }
      `}</style>
      {isLight ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13.5 10.3A6 6 0 0 1 5.7 2.5a6 6 0 1 0 7.8 7.8z"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3"/>
          <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5l-1.1-1.1"/>
        </svg>
      )}
    </button>
  );
}

/* ─── TopNav ──────────────────────────────────────────────────────── */
function TopNav({ token }: { token: string }) {
  return (
    <nav className="pg-nav">
      <style>{`
        .pg-nav { display: flex; align-items: center; gap: 18px; padding: 10px 18px; border-bottom: 1px solid var(--line); background: var(--bg-1); flex-shrink: 0; }
        .pg-mark { display: flex; align-items: center; gap: 10px; font-family: var(--f-mono); font-size: 13px; font-weight: 500; color: var(--fg); transition: opacity .15s ease; }
        .pg-mark:hover { opacity: .85; }
        .pg-mark .g {
          width: 20px; height: 20px; display: inline-flex;
          transition: transform .35s cubic-bezier(.22,.61,.36,1);
        }
        .pg-mark:hover .g { transform: rotate(-22.5deg); }
        .pg-mark .g svg { width: 100%; height: 100%; display: block; }
        .pg-mark .g .frame { stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
        .pg-mark .g .core  { fill: var(--accent); }
        .pg-nav-right { margin-left: auto; display: flex; gap: 12px; align-items: center; font-family: var(--f-mono); font-size: 11.5px; color: var(--fg-3); }
        .pg-nav-right a { color: var(--fg-2); }
        .pg-nav-right a:hover { color: var(--fg); }
        .pg-tok { padding: 3px 8px; border: 1px solid var(--line-2); border-radius: 4px; color: var(--fg-1); letter-spacing: 0.04em; white-space: nowrap; }
        .pg-nav-right > * { white-space: nowrap; }
        @media (max-width: 880px) {
          /* Single-line nav on mobile: brand left, theme toggle + compact token right.
             Drop the inline "home · docs" links — those move into the language drawer
             header instead so the nav strip stays tight on a 360px viewport. */
          .pg-nav { padding: 10px 12px; gap: 10px; }
          .pg-nav-right { gap: 8px; }
          .pg-nav-right .pg-nav-link, .pg-nav-right .pg-nav-sep { display: none; }
          .pg-tok { font-size: 10.5px; padding: 3px 7px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
        }
      `}</style>
      <a className="pg-mark" href="/" aria-label="ZeroCode home">
        <span className="g" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <path className="frame" d="M9 3 H15 L21 9 V15 L15 21 H9 L3 15 V9 Z"/>
            <circle className="core" cx="12" cy="12" r="2.4"/>
          </svg>
        </span>
        zerocode
      </a>
      <div className="pg-nav-right">
        <a className="pg-nav-link" href="/">home</a>
        <span className="pg-nav-sep">·</span>
        {!HIDE_DOCS && (
          <>
            <a className="pg-nav-link" href="/docs/">docs</a>
            <span className="pg-nav-sep">·</span>
          </>
        )}
        <span className="pg-tok" title={`token · ${token}`}>token · {token}</span>
        <ThemeToggle />
      </div>
    </nav>
  );
}

/* ─── LanguagePicker ─────────────────────────────────────────────── */
function LanguagePicker({ selected, onSelect, history, historyH, onResizeHistory, mobileOpen, onClose }: {
  selected: Lang; onSelect: (l: Lang) => void; history: HistoryEntry[];
  historyH: number; onResizeHistory: (deltaPx: number) => void;
  mobileOpen: boolean; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = LANGS.filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || String(l.id).includes(q));
  // Close-on-Escape and lock body scroll while the drawer is open. Both apply
  // only on mobile where the rail is overlay-positioned; on desktop the rail
  // is always inline and these handlers are no-ops because `mobileOpen` is true.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [mobileOpen, onClose]);
  function selectAndClose(l: Lang) { onSelect(l); onClose(); }
  return (
    <aside className={`pg-rail ${mobileOpen ? 'is-open' : ''}`}>
      <style>{`
        .pg-rail { width: 100%; flex: 1; border-right: 1px solid var(--line); background: var(--bg); display: flex; flex-direction: column; min-height: 0; }
        @media (max-width: 880px) {
          /* On mobile the rail becomes a slide-in drawer from the left.
             Outside the flow so the editor below gets full viewport height,
             and reachable from the workspace bar's language chip. */
          .pg-rail {
            position: fixed; top: 0; bottom: 0; left: 0;
            width: min(86vw, 360px); max-width: none; max-height: none;
            z-index: 60;
            border-right: 1px solid var(--line); border-bottom: 0;
            transform: translateX(-100%);
            transition: transform .22s cubic-bezier(.22,.61,.36,1);
            box-shadow: 8px 0 32px -16px rgba(0,0,0,0.5);
          }
          .pg-rail.is-open { transform: translateX(0); }
          .pg-rail-close { display: inline-flex !important; }
        }
        .pg-rail-close { display: none; appearance: none; background: transparent; border: 1px solid var(--line-2); color: var(--fg-2); width: 28px; height: 28px; border-radius: 6px; align-items: center; justify-content: center; cursor: pointer; }
        .pg-rail-close:hover { color: var(--fg); border-color: var(--line-strong); }
        .pg-rail-hd { padding: 14px 16px 8px; font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.14em; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .pg-rail-hd .count { color: var(--accent); background: color-mix(in oklab, var(--accent) 14%, transparent); border: 1px solid color-mix(in oklab, var(--accent) 40%, var(--line)); padding: 1px 7px; border-radius: 99px; letter-spacing: 0.08em; }
        .pg-rail-search { margin: 0 12px 8px; position: relative; }
        .pg-rail-search input { width: 100%; appearance: none; border: 1px solid var(--line-2); background: var(--bg-1); color: var(--fg); padding: 7px 10px 7px 28px; border-radius: 6px; font: 12.5px var(--f-mono); outline: none; }
        .pg-rail-search input::placeholder { color: var(--fg-3); }
        .pg-rail-search input:focus { border-color: var(--line-strong); }
        .pg-rail-search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--fg-3); }
        .pg-rail-list { flex: 1 1 0; overflow-y: auto; padding: 0 8px 16px; min-height: 0; }
        .pg-row { appearance: none; border: 0; width: 100%; text-align: left; padding: 9px 10px; border-radius: 6px; background: transparent; display: flex; align-items: center; gap: 10px; color: var(--fg-1); cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; position: relative; }
        .pg-row:hover { background: var(--bg-1); }
        .pg-row.active { background: color-mix(in oklab, var(--row-accent, var(--accent)) 14%, var(--bg-1)); color: var(--fg); }
        .pg-row.active::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; background: var(--row-accent, var(--accent)); border-radius: 0 2px 2px 0; }
        .pg-row.active .id { color: var(--row-accent, var(--accent)); }
        .pg-row .name { font-size: 13px; flex: 1; }
        .pg-row .v { font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.02em; }
        .pg-row .id { font-family: var(--f-mono); font-size: 10px; color: var(--fg-4); padding: 1px 4px; border-radius: 3px; }
        .pg-row .dot { width: 9px; height: 9px; border-radius: 2px; background: var(--row-accent, var(--fg-3)); box-shadow: 0 0 0 1px color-mix(in oklab, var(--row-accent, var(--fg-3)) 35%, transparent); }
        .pg-rail-empty { padding: 16px; font: 11.5px var(--f-mono); color: var(--fg-3); text-align: center; }
        /* Height comes from the layout state below; max-height removed so the
           user-set value is authoritative. The splitter just above this block
           is the resize handle between languages list and history. */
        .pg-rail-hist { flex: 0 0 auto; padding: 12px 16px; font-family: var(--f-mono); font-size: 11px; color: var(--fg-2); overflow-y: auto; }
        .pg-rail-hist .h { font-size: 10px; color: var(--fg-3); letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 6px; }
        .pg-rail-hist .hr { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; color: var(--fg-1); border-top: 1px dashed var(--line); }
        .pg-rail-hist .hr:first-child { border-top: 0; }
        .pg-rail-hist .hr .t { color: var(--fg-3); }
        .pg-rail-hist .hr .ok { color: var(--st-accepted); }
        .pg-rail-hist .hr .tle { color: var(--st-tle); }
        .pg-rail-hist .hr .re { color: var(--st-re); }
        @media (max-width: 880px) {
          /* On the stacked mobile rail, hand height back to the browser
             instead of honoring the desktop drag value. */
          .pg-rail-hist { height: auto !important; max-height: 38vh; }
        }
      `}</style>
      <div className="pg-rail-hd">
        <span>core languages</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="count">{LANGS.length}</span>
          <button type="button" className="pg-rail-close" aria-label="Close languages" onClick={onClose}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6"/>
            </svg>
          </button>
        </span>
      </div>
      <div className="pg-rail-search">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="5" cy="5" r="3.5"/><path d="M8 8l3 3"/>
        </svg>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search by name or id" />
      </div>
      <div className="pg-rail-list">
        {filtered.length === 0 && <div className="pg-rail-empty">no match · try clearing the search</div>}
        {filtered.map(l => {
          const lk = langKeyFromId(l.id);
          return (
            <button key={l.id}
              className={`pg-row ${selected.id === l.id ? 'active' : ''}`}
              onClick={() => selectAndClose(l)}
              style={{ '--row-accent': l.accent } as CSSProperties}>
              {lk
                ? <LangIcon lang={lk} size={16} className="lico" />
                : <span className="dot" aria-hidden="true" />}
              <span className="name">{l.name}</span>
              <span className="v">{l.version}</span>
              <span className="id">{l.id}</span>
            </button>
          );
        })}
      </div>
      {/* Drag delta is INVERTED: dragging down (positive delta) shrinks
          history, dragging up grows it — matches user expectation when the
          handle sits on top of the history block. */}
      <Splitter direction="horizontal" onDrag={(d) => onResizeHistory(-d)} />
      <div className="pg-rail-hist" style={{ height: historyH, borderTop: '1px solid var(--line)' }}>
        <div className="h">history · session</div>
        {history.length === 0 && <div className="hr"><span className="t">no runs yet</span></div>}
        {history.map((h, i) => (
          <div key={i} className="hr">
            <span>{h.name}</span>
            <span className={h.verdict === 'accepted' ? 'ok' : h.verdict === 'tle' ? 'tle' : 're'}>
              {h.verdict} · {typeof h.time === 'number' ? `${h.time.toFixed(3)}s` : 'pending'}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ─── WorkspaceBar ──────────────────────────────────────────────── */
type RunMode = 'single' | 'tests';
interface WorkspaceBarProps {
  lang: Lang; status: Verdict;
  onRun: () => void; onRunDemo: () => void; onCancel: () => void; onReset: () => void; onFormat: () => void;
  limits: RunLimits; setLimits: (l: RunLimits) => void;
  ceilings: Ceilings | null;
  apiOnline: boolean;
  onShare: () => void;
  onOpenPicker: () => void;
  mode: RunMode; setMode: (m: RunMode) => void;
}
function WorkspaceBar(p: WorkspaceBarProps) {
  const [showLimits, setShowLimits] = useState(false);
  const [copied, setCopied] = useState(false);
  const isRunning = p.status === 'queued' || p.status === 'processing';
  const max: Ceilings = p.ceilings || { memoryMb: 2048, timeS: 60 };
  const handleShare = () => { p.onShare(); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const runLabel = p.apiOnline ? 'run · ⌘↵' : 'connect api';
  const langKey = langKeyFromId(p.lang.id);
  return (
    <div className="pg-wbar">
      <style>{`
        .pg-wbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--bg-1); font-family: var(--f-mono); flex-shrink: 0; position: relative; overflow: hidden; min-width: 0; }
        .pg-wbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
        .pg-btn { appearance: none; border: 1px solid var(--line-2); background: var(--bg); color: var(--fg-1); padding: 6px 10px; border-radius: 6px; font: 12px var(--f-mono); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: border-color .12s ease, color .12s ease, background .12s ease; }
        .pg-btn:hover { border-color: var(--line-strong); color: var(--fg); }
        .pg-btn.primary { background: var(--accent); color: #0a0a0a; border-color: var(--accent); font-weight: 500; }
        .pg-btn.primary:hover { filter: brightness(1.08); }
        .pg-btn.primary:disabled { opacity: .55; cursor: not-allowed; }
        .pg-btn.cancel { background: color-mix(in oklab, var(--st-re) 14%, var(--bg-1)); color: var(--st-re); border-color: color-mix(in oklab, var(--st-re) 55%, var(--line-2)); font-weight: 500; }
        .pg-btn.cancel:hover { border-color: var(--st-re); filter: brightness(1.05); }
        .pg-btn:disabled { opacity: .5; cursor: not-allowed; }
        .pg-btn.ghost { background: transparent; }

        /* Language chip: shown on both desktop and mobile now that the file tab and
           lang-text spans are gone. Tap to focus/open the language drawer (on mobile)
           or to re-confirm the active language (desktop — drawer is in-flow there). */
        .pg-wbar-lang { display: inline-flex; align-items: center; gap: 8px; appearance: none; cursor: pointer; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--bg); color: var(--fg-1); font: 12.5px var(--f-mono); white-space: nowrap; min-height: 36px; }
        .pg-wbar-lang:hover { border-color: var(--line-strong); }
        .pg-wbar-lang .name { color: var(--fg); }
        .pg-wbar-lang .id { color: var(--fg-3); font-size: 11px; }
        .pg-wbar-lang .chev { color: var(--fg-3); }

        @media (max-width: 880px) {
          /* Mobile: chip stays on the first row, controls wrap onto a second row.
             Pushes the primary "run" button to fill its row for a fat-finger target. */
          .pg-wbar { flex-wrap: wrap; padding: 8px 12px; row-gap: 8px; overflow: visible; }
          .pg-wbar .pg-wbar-right { width: 100%; margin-left: 0; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
          .pg-wbar .pg-btn { padding: 9px 12px; min-height: 36px; }
          .pg-wbar .pg-btn.primary { padding: 10px 14px; flex: 1 1 auto; justify-content: center; }
          .pg-wbar .pg-btn-format, .pg-wbar .pg-btn-reset { padding: 9px 10px; }
        }

        /* Limits popover: desktop anchors top-right of the bar, mobile lifts to a
           bottom sheet so the slider has room and isn't clipped off-screen. */
        .pg-limits-popover { position: absolute; right: 14px; top: calc(100% + 8px); z-index: 30; width: 280px; border: 1px solid var(--line-2); background: var(--bg-1); border-radius: 8px; padding: 14px; box-shadow: 0 30px 80px -30px rgba(0,0,0,0.65); }
        .pg-limits-popover h4 { font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.16em; text-transform: uppercase; margin: 0 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .pg-limits-popover .x-close { appearance: none; background: transparent; border: 1px solid var(--line-2); color: var(--fg-2); width: 24px; height: 24px; border-radius: 5px; display: none; align-items: center; justify-content: center; cursor: pointer; }
        .pg-lim-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .pg-lim-row:last-child { margin-bottom: 0; }
        .pg-lim-row .lbl { display: flex; justify-content: space-between; font-family: var(--f-mono); font-size: 11px; color: var(--fg-2); }
        .pg-lim-row .v { color: var(--accent); }
        .pg-lim-row input[type="range"] { appearance: none; -webkit-appearance: none; height: 6px; background: var(--line-2); border-radius: 999px; outline: none; }
        .pg-lim-row input[type="range"]::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 18px; height: 18px; background: var(--accent); border: 0; border-radius: 50%; cursor: pointer; }
        .pg-lim-row input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; background: var(--accent); border: 0; border-radius: 50%; cursor: pointer; }
        @media (max-width: 760px) {
          .pg-limits-popover {
            position: fixed; right: 0; left: 0; bottom: 0; top: auto;
            width: auto; border-radius: 14px 14px 0 0;
            padding: 18px 18px 24px;
            border: 1px solid var(--line-2); border-bottom: 0;
            animation: pg-sheet-up .22s cubic-bezier(.22,.61,.36,1);
          }
          .pg-limits-popover .x-close { display: inline-flex; }
          /* Grab handle suggests it can be dismissed. */
          .pg-limits-popover::before { content: ''; position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 36px; height: 4px; border-radius: 999px; background: var(--line-2); }
        }
        @keyframes pg-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .pg-sheet-backdrop { display: none; position: fixed; inset: 0; background: color-mix(in oklab, #000 55%, transparent); z-index: 29; animation: pg-fade-in .18s ease; }
        @keyframes pg-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (max-width: 760px) { .pg-sheet-backdrop.is-on { display: block; } }
      `}</style>
      <button type="button" className="pg-wbar-lang" onClick={p.onOpenPicker} aria-label="Choose language">
        {langKey ? <LangIcon lang={langKey} size={16} /> : <span style={{ width: 9, height: 9, borderRadius: 2, background: p.lang.accent }} />}
        <span className="name">{p.lang.name}</span>
        <span className="id">· {p.lang.version}</span>
        <svg className="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4l3 3 3-3"/></svg>
      </button>

      {/* Single ↔ tests mode toggle. In tests mode the io-row swaps in
          TestsPanel, which owns its own Run All button — so the right-side
          run/cancel/demo buttons hide. */}
      <div className="pg-wbar-mode" role="tablist" aria-label="Run mode">
        <style>{`
          .pg-wbar-mode { display: inline-flex; border: 1px solid var(--line-2); border-radius: 6px; overflow: hidden; }
          .pg-wbar-mode button {
            appearance: none; background: transparent; color: var(--fg-2);
            padding: 6px 10px; font: 11.5px var(--f-mono); cursor: pointer;
            border: 0; letter-spacing: 0.04em;
          }
          .pg-wbar-mode button + button { border-left: 1px solid var(--line-2); }
          .pg-wbar-mode button:hover { color: var(--fg); }
          .pg-wbar-mode button.active { background: var(--accent); color: var(--bg); font-weight: 500; }
        `}</style>
        <button type="button" role="tab" aria-selected={p.mode === 'single'}
          className={p.mode === 'single' ? 'active' : ''}
          onClick={() => p.setMode('single')}>single</button>
        <button type="button" role="tab" aria-selected={p.mode === 'tests'}
          className={p.mode === 'tests' ? 'active' : ''}
          onClick={() => p.setMode('tests')}>tests</button>
      </div>

      <div className="pg-wbar-right">
        <button className="pg-btn ghost" onClick={() => setShowLimits(s => !s)}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="4.5"/><path d="M6 2v4l2.5 1.5"/></svg>
          {p.limits.memoryMb}mb · {p.limits.timeS}s
        </button>
        <button className="pg-btn ghost" onClick={handleShare} title="Copy share link">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="3.5" cy="7" r="1.6"/><circle cx="10.5" cy="3.6" r="1.6"/><circle cx="10.5" cy="10.4" r="1.6"/><path d="m5 6.3 4-2M5 7.7l4 2"/></svg>
          {copied ? 'copied!' : 'share'}
        </button>
        <button className="pg-btn ghost pg-btn-format" onClick={p.onFormat} disabled={isRunning} title="Format selection (⇧⌥F)">
          format
        </button>
        <button className="pg-btn ghost pg-btn-reset" onClick={p.onReset} disabled={isRunning}>reset</button>
        {p.mode === 'single' && (
          isRunning ? (
            <button className="pg-btn cancel" onClick={p.onCancel} title="Cancel run (⌘.)">cancel</button>
          ) : (
            <>
              {!p.apiOnline && <button className="pg-btn ghost" onClick={p.onRunDemo} title="Run the built-in sample stream">demo run</button>}
              <button className="pg-btn primary" onClick={p.onRun}>
                <svg width="9" height="9" viewBox="0 0 8 8" fill="currentColor"><path d="M1 0 L7 4 L1 8 Z"/></svg>
                {runLabel}
              </button>
            </>
          )
        )}
      </div>
      {showLimits && (
        <>
          <div className={`pg-sheet-backdrop is-on`} onClick={() => setShowLimits(false)} />
          <div className="pg-limits-popover" onMouseLeave={() => setShowLimits(false)}>
            <h4>
              <span>execution limits {p.apiOnline && p.ceilings ? '· server ceilings' : '· client defaults'}</span>
              <button type="button" className="x-close" aria-label="Close limits" onClick={() => setShowLimits(false)}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>
              </button>
            </h4>
            <div className="pg-lim-row">
              <div className="lbl"><span>memory</span><span className="v">{p.limits.memoryMb} MB</span></div>
              <input type="range" min={16} max={max.memoryMb} step={16}
                value={Math.min(p.limits.memoryMb, max.memoryMb)}
                onChange={e => p.setLimits({ ...p.limits, memoryMb: +e.target.value })} />
            </div>
            <div className="pg-lim-row">
              <div className="lbl"><span>wall time</span><span className="v">{p.limits.timeS} s</span></div>
              <input type="range" min={1} max={max.timeS} step={1}
                value={Math.min(p.limits.timeS, max.timeS)}
                onChange={e => p.setLimits({ ...p.limits, timeS: +e.target.value })} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── StdinPanel ────────────────────────────────────────────────── */
// Separate, always-visible stdin pane (no collapse toggle). Lives below the
// editor in its own resizable split.
function StdinPanel({ stdin, setStdin }: { stdin: string; setStdin: (s: string) => void }) {
  return (
    <section className="pg-stdin">
      <style>{`
        .pg-stdin { flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--bg-1); border-top: 1px solid var(--line); }
        .pg-stdin-hd { padding: 8px 14px; font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
        .pg-stdin-hd .label { color: var(--fg-2); }
        .pg-stdin-hd .meta { color: var(--fg-4); letter-spacing: 0.02em; text-transform: none; font-size: 11px; }
        .pg-stdin-hd .meta b { color: var(--fg-2); font-weight: 500; }
        .pg-stdin-hd button { margin-left: auto; appearance: none; background: transparent; border: 1px solid var(--line-2); color: var(--fg-3); padding: 2px 8px; border-radius: 4px; font: 10.5px var(--f-mono); letter-spacing: 0.06em; cursor: pointer; }
        .pg-stdin-hd button:hover { color: var(--fg); border-color: var(--line-strong); }
        .pg-stdin-hd button:disabled { opacity: .45; cursor: not-allowed; }
        .pg-stdin-bd { flex: 1; min-height: 0; padding: 10px 14px 14px; display: flex; }
        .pg-stdin-bd textarea {
          width: 100%; flex: 1; resize: none;
          background: var(--bg); color: var(--fg);
          border: 1px solid var(--line-2); border-radius: 6px;
          padding: 9px 11px; font: 12px var(--f-mono); line-height: 1.55; outline: none;
        }
        .pg-stdin-bd textarea:focus { border-color: var(--line-strong); }
        .pg-stdin-bd textarea::placeholder { color: var(--fg-4); }
      `}</style>
      <div className="pg-stdin-hd">
        <span className="label">stdin</span>
        <span className="meta">{stdin.length > 0 ? <><b>{stdin.length}</b> chars</> : 'empty'}</span>
        <button type="button" onClick={() => setStdin('')} disabled={!stdin.length}>clear</button>
      </div>
      <div className="pg-stdin-bd">
        <textarea value={stdin} onChange={e => setStdin(e.target.value)}
          spellCheck={false} autoComplete="off"
          placeholder="input · piped to stdin" />
      </div>
    </section>
  );
}

/* ─── Splitter ──────────────────────────────────────────────────── */
// Draggable resize handle. Direction = 'vertical' for column splits
// (drag left/right), 'horizontal' for row splits (drag up/down).
// onDrag receives the incremental delta in px per mousemove tick.
interface SplitterProps { direction: 'vertical' | 'horizontal'; onDrag: (deltaPx: number) => void }
function Splitter({ direction, onDrag }: SplitterProps) {
  const dragRef = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    let prev = direction === 'vertical' ? e.clientX : e.clientY;
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const curr = direction === 'vertical' ? ev.clientX : ev.clientY;
      const delta = curr - prev;
      if (delta !== 0) { onDrag(delta); prev = curr; }
    };
    const onUp = () => {
      dragRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className={`pg-split pg-split-${direction}`} onMouseDown={onMouseDown}
      role="separator" aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}>
      <style>{`
        .pg-split { background: transparent; position: relative; flex-shrink: 0; z-index: 5; }
        .pg-split::after { content: ''; position: absolute; inset: 0; background: var(--line); opacity: 0; transition: opacity .14s ease; }
        .pg-split:hover::after, .pg-split:active::after { opacity: 1; background: var(--accent); }
        .pg-split-vertical   { width: 4px; cursor: col-resize; align-self: stretch; }
        .pg-split-vertical::before { content: ''; position: absolute; top: 0; bottom: 0; left: 1.5px; width: 1px; background: var(--line); }
        .pg-split-horizontal { height: 4px; cursor: row-resize; }
        .pg-split-horizontal::before { content: ''; position: absolute; left: 0; right: 0; top: 1.5px; height: 1px; background: var(--line); }
        @media (max-width: 880px) { .pg-split { display: none; } }
      `}</style>
    </div>
  );
}

/* ─── OutputPane ────────────────────────────────────────────────── */
interface OutputPaneProps {
  status: Verdict; statusDetail: string | null;
  output: string[]; stderr: string[]; compileOutput: string;
  lang: Lang; metrics: RunMetrics; token: string;
}
type OutputTab = 'stdout' | 'stderr' | 'compile' | 'meta';

function OutputPane(p: OutputPaneProps) {
  const [tab, setTab] = useState<OutputTab>('stdout');
  const outRef = useRef<HTMLDivElement | null>(null);

  // Tracks whether the USER explicitly clicked a tab during the current run.
  // While true, the auto-switch logic stands down so we never yank focus
  // away from what they're reading. Reset on every new run (status →
  // queued) so the next run starts fresh.
  const userPickedRef = useRef(false);
  const prevStatusRef = useRef<Verdict>('idle');
  const prevStderrLenRef = useRef(0);
  const prevCompileLenRef = useRef(0);

  // Tracks which tabs have unviewed content since the user last viewed them.
  // Drives the dot indicator on the tab strip — even when auto-switch is
  // suppressed by a manual pick, the dot makes "something happened here"
  // visible without stealing focus.
  const [unseen, setUnseen] = useState<Record<OutputTab, boolean>>({
    stdout: false, stderr: false, compile: false, meta: false,
  });

  // New-run reset: clear manual-pick + unseen state, default to stdout.
  useEffect(() => {
    if (p.status === 'queued' && prevStatusRef.current !== 'queued') {
      userPickedRef.current = false;
      prevStderrLenRef.current = 0;
      prevCompileLenRef.current = 0;
      setUnseen({ stdout: false, stderr: false, compile: false, meta: false });
      setTab('stdout');
    }
    prevStatusRef.current = p.status;
  }, [p.status]);

  // Compile output appearing — switch immediately. Compile output is rare
  // (only on compile-then-run languages) and always blocks subsequent run
  // output, so promoting it is unambiguous. When the next run clears
  // compileOutput, also fall back off the now-hidden compile tab.
  useEffect(() => {
    const len = p.compileOutput.length;
    if (len > prevCompileLenRef.current) {
      if (!userPickedRef.current) setTab('compile');
      else if (tab !== 'compile') setUnseen(u => ({ ...u, compile: true }));
    } else if (len === 0 && tab === 'compile') {
      setTab('stdout');
    }
    prevCompileLenRef.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.compileOutput]);

  // First stderr chunk during a live run — surface it. Subsequent chunks
  // don't trigger another switch; if the user moved away, just mark unseen.
  useEffect(() => {
    const len = p.stderr.length;
    if (len > prevStderrLenRef.current && prevStderrLenRef.current === 0) {
      if (!userPickedRef.current) setTab('stderr');
      else if (tab !== 'stderr') setUnseen(u => ({ ...u, stderr: true }));
    }
    prevStderrLenRef.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.stderr.length]);

  // Terminal-status routing — simple rule per user spec:
  //   accepted          → stdout  (success: show the program's output)
  //   any error/failure → stderr  (with two exceptions below)
  // Exceptions:
  //   compile_error with compile_output present → compile (the actual error
  //     message lives there, not in stderr)
  //   tle/mle/se with empty stderr → meta (those rarely carry stderr; meta
  //     shows the wall time / memory peak / signal that explains the verdict)
  useEffect(() => {
    if (userPickedRef.current) return;
    if (p.status === 'accepted') {
      setTab('stdout');
    } else if (p.status === 'ce') {
      setTab(p.compileOutput ? 'compile' : (p.stderr.length ? 'stderr' : 'meta'));
    } else if (p.status === 're' || p.status === 'nze') {
      setTab(p.stderr.length ? 'stderr' : 'meta');
    } else if (p.status === 'tle' || p.status === 'mle' || p.status === 'se' || p.status === 'ole') {
      setTab(p.stderr.length ? 'stderr' : 'meta');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status]);

  // Clear the "unseen" badge whenever the user lands on a tab.
  useEffect(() => {
    if (unseen[tab]) setUnseen(u => ({ ...u, [tab]: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function pickTab(t: OutputTab) {
    userPickedRef.current = true;
    setTab(t);
  }

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [p.output, p.stderr, p.status, tab]);

  // The `compile` tab is hidden until there's actually compile output — for
  // interpreted languages and clean compiles it's just clutter. The
  // auto-switch effect above promotes it to visible + active as soon as a
  // compile error or compiler warning arrives.
  const tabs: { id: OutputTab; name: string; count: number }[] = [
    { id: 'stdout', name: 'stdout', count: p.output.length },
    { id: 'stderr', name: 'stderr', count: p.stderr.length },
    ...(p.compileOutput ? [{ id: 'compile' as OutputTab, name: 'compile', count: 1 }] : []),
    { id: 'meta', name: 'meta', count: 0 },
  ];

  return (
    <section className="pg-output">
      <style>{`
        .pg-output { flex: 1 1 0; min-height: 120px; border-top: 1px solid var(--line); background: var(--bg); display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        @media (max-width: 880px) { .pg-output { width: 100%; border-left: 0; min-height: 320px; } }
        .pg-output-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--line); background: var(--bg-1); flex-shrink: 0; }
        .pg-output-tab { appearance: none; border: 0; background: transparent; padding: 12px 16px; cursor: pointer; font: 11.5px var(--f-mono); color: var(--fg-3); letter-spacing: 0.06em; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .12s ease, border-color .12s ease; display: flex; align-items: center; gap: 6px; }
        .pg-output-tab:hover { color: var(--fg-1); }
        .pg-output-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        .pg-output-tab .pill { background: var(--bg-2); color: var(--fg-3); padding: 0 5px; border-radius: 99px; font-size: 10px; min-width: 14px; text-align: center; }
        .pg-output-tab.active .pill { background: color-mix(in oklab, var(--accent) 18%, var(--bg-2)); color: var(--accent); }
        .pg-output-tab.unseen { color: var(--fg-1); }
        .pg-output-tab.unseen .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 6px color-mix(in oklab, var(--accent) 70%, transparent); animation: pg-pulse 1.4s ease-in-out infinite; }
        @keyframes pg-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        .pg-output-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px; font-family: var(--f-mono); font-size: 12.5px; line-height: 1.7; color: var(--st-accepted); white-space: pre-wrap; word-break: break-all; }
        .pg-output-body.empty { color: var(--fg-3); font-style: italic; padding-top: 24px; }
        .pg-output-body .ln { white-space: pre; }
        .pg-output-body .caret { display: inline-block; width: 7px; height: 13px; background: var(--accent); vertical-align: -2px; margin-left: 1px; animation: pg-blink 1s steps(1) infinite; }
        @keyframes pg-blink { 50% { opacity: 0; } }
        .pg-output-meta dt { font-family: var(--f-mono); font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.12em; text-transform: uppercase; margin-top: 14px; }
        .pg-output-meta dt:first-child { margin-top: 0; }
        .pg-output-meta dd { margin: 4px 0 0; color: var(--fg-1); font-family: var(--f-mono); font-size: 13px; }
        .pg-output-meta dd b { color: var(--accent); font-weight: 500; }
        .pg-output-stderr, .pg-output-compile { color: var(--fg-3); }
      `}</style>
      <div className="pg-output-tabs">
        {tabs.map(t => (
          <button key={t.id}
            className={`pg-output-tab ${tab === t.id ? 'active' : ''} ${unseen[t.id] && tab !== t.id ? 'unseen' : ''}`}
            onClick={() => pickTab(t.id)}>
            {unseen[t.id] && tab !== t.id && <span className="dot" aria-label="new content"/>}
            {t.name}
            {t.count > 0 && <span className="pill">{t.count}</span>}
          </button>
        ))}
      </div>
      <div ref={outRef} className={`pg-output-body ${p.output.length === 0 && p.status === 'idle' ? 'empty' : ''}`}>
        {tab === 'stdout' && (
          <>
            {p.output.length === 0 && p.status === 'idle' && <div>awaiting first run · click <b style={{color:'var(--accent)',fontStyle:'normal'}}>run</b> to begin</div>}
            {p.status === 'queued' && <div style={{ color: 'var(--st-queued)' }}>queued · waiting for worker NOTIFY ...</div>}
            {p.output.map((l, i) => <div key={i} className="ln">{l}</div>)}
            {p.status === 'processing' && <span className="caret"/>}
            {p.output.length === 0 && p.status !== 'idle' && p.status !== 'queued' && p.status !== 'processing' && (
              <div className="pg-output-stderr">— stdout empty —</div>
            )}
          </>
        )}
        {tab === 'stderr' && (
          p.stderr.length > 0
            ? <div style={{ color: 'var(--st-re)' }}>{p.stderr.map((l, i) => <div key={i} className="ln">{l}</div>)}</div>
            : <div className="pg-output-stderr">— no bytes on stderr —</div>
        )}
        {tab === 'compile' && (
          p.compileOutput
            ? <div style={{ color: 'var(--st-ce)' }}>{p.compileOutput.split('\n').map((l, i) => <div key={i} className="ln">{l || ' '}</div>)}</div>
            : <div className="pg-output-compile">— no compile step or compile output —</div>
        )}
        {tab === 'meta' && (
          <dl className="pg-output-meta">
            <dt>token</dt><dd><b style={{userSelect:'all'}}>{p.token}</b></dd>
            <dt>verdict</dt><dd>
              <b style={{color: VERDICT_COLOR[p.status] || 'var(--fg-1)'}}>{VERDICT_LABEL[p.status] || p.status}</b>
              {p.statusDetail ? <> · <span style={{color:'var(--fg-2)'}}>{p.statusDetail}</span></> : null}
              {p.metrics.exitCode != null && <> · exit {p.metrics.exitCode}</>}
              {p.metrics.signal && <> · signal {p.metrics.signal}</>}
            </dd>
            <dt>wall time</dt><dd>{p.metrics.time != null ? p.metrics.time.toFixed(3) + ' s' : '—'}</dd>
            <dt>memory peak</dt><dd>{formatMem(p.metrics.memory)}</dd>
            <dt>language</dt><dd>{p.lang.name} · {p.lang.version} · id {p.lang.id}</dd>
            <dt>runner</dt><dd>zerocode-runner</dd>
            <dt>sandbox</dt><dd>8 layers · cgroup v2 · landlock</dd>
          </dl>
        )}
      </div>
    </section>
  );
}

/* ─── StatusStrip ───────────────────────────────────────────────── */
function StatusStrip({ status, statusDetail, metrics, apiOnline, cursor, themeMode }: {
  status: Verdict; statusDetail: string | null; metrics: RunMetrics;
  apiOnline: boolean; cursor: { line: number; col: number };
  themeMode: 'light' | 'dark';
}) {
  const phases: Verdict[] = ['queued', 'processing', 'accepted'];
  const isTerminal = !['idle', 'queued', 'processing'].includes(status);
  const phaseIdx = status === 'idle' ? -1
    : isTerminal ? phases.length - 1
    : phases.indexOf(status);
  const verdictColor = VERDICT_COLOR[status] || 'var(--fg-3)';
  const verdictLabel = VERDICT_LABEL[status] || status;
  return (
    <footer className="pg-strip">
      <style>{`
        .pg-strip { display: flex; align-items: center; gap: 18px; padding: 8px 18px; border-top: 1px solid var(--line); background: var(--bg-1); font-family: var(--f-mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; flex-shrink: 0; }
        @media (max-width: 880px) {
          /* Compact strip: keep the run flow + verdict prominent, drop noise like
             cursor coords, theme indicator, and the duplicated "live/offline" tag
             (the verdict pill already implies the connection state at a glance). */
          .pg-strip { flex-wrap: wrap; row-gap: 6px; padding: 8px 12px; gap: 10px; }
          .pg-strip .right { margin-left: auto; gap: 10px; }
          .pg-strip .metrics { gap: 10px; flex-wrap: wrap; }
          .pg-strip .strip-cursor, .pg-strip .strip-theme, .pg-strip .strip-net { display: none; }
        }
        @media (max-width: 420px) {
          /* On the narrowest phones, exit code is rarely interesting next to the verdict pill. */
          .pg-strip .strip-exit { display: none; }
        }
        .pg-flow { display: flex; align-items: center; gap: 8px; }
        .pg-flow .step { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--fg-4); background: var(--bg); letter-spacing: 0.12em; text-transform: uppercase; font-size: 10px; }
        .pg-flow .step.done { color: var(--fg-2); border-color: var(--line-2); }
        .pg-flow .step.active { color: var(--accent); border-color: var(--accent); background: color-mix(in oklab, var(--accent) 10%, transparent); }
        .pg-flow .step .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
        .pg-flow .arr { color: var(--fg-4); }
        .pg-strip .metrics { display: flex; gap: 14px; }
        .pg-strip .metrics span b { color: var(--fg-1); font-weight: 500; }
        .pg-strip .right { margin-left: auto; display: flex; gap: 14px; align-items: center; }
        .pg-strip .verdict { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--st-accepted); color: var(--st-accepted); background: color-mix(in oklab, var(--st-accepted) 10%, transparent); letter-spacing: 0.12em; text-transform: uppercase; font-size: 10px; }
        .pg-strip .verdict.idle { border-color: var(--line); color: var(--fg-3); background: transparent; }
      `}</style>
      <div className="pg-flow">
        {phases.map((ph, i) => (
          <Fragment key={ph}>
            <span className={`step ${i < phaseIdx ? 'done' : i === phaseIdx ? 'active' : ''}`}>
              <span className="dot"/> {ph}
            </span>
            {i < phases.length - 1 && <span className="arr">→</span>}
          </Fragment>
        ))}
      </div>
      <div className="metrics">
        <span>wall · <b>{metrics.time != null ? metrics.time.toFixed(3) + 's' : '—'}</b></span>
        <span>mem · <b>{formatMem(metrics.memory)}</b></span>
        <span className="strip-exit">exit · <b>{metrics.exitCode != null ? metrics.exitCode : (status === 'accepted' ? '0' : '—')}</b></span>
        <span className="strip-cursor">Ln <b style={{color:'var(--fg-1)',fontWeight:500}}>{cursor.line}</b>, Col <b style={{color:'var(--fg-1)',fontWeight:500}}>{cursor.col}</b></span>
      </div>
      <div className="right">
        <span className="strip-theme">theme · <b style={{color:'var(--fg-1)',fontWeight:500}}>{themeMode}</b></span>
        <span className="strip-net"><b style={{ color: apiOnline ? 'var(--st-accepted)' : 'var(--st-re)', fontWeight: 500 }}>{apiOnline ? 'live' : 'offline'}</b></span>
        <span className="verdict" style={{
          color: verdictColor,
          borderColor: status === 'idle' ? 'var(--line)' : verdictColor,
          background: status === 'idle' ? 'transparent' : `color-mix(in oklab, ${verdictColor} 10%, transparent)`,
        }}>
          {status === 'idle' ? 'ready' : verdictLabel}
          {statusDetail ? ` · ${statusDetail}` : ''}
        </span>
      </div>
    </footer>
  );
}

/* ─── App ────────────────────────────────────────────────────────── */
function pickInitialLang(share: ShareHash | null, draft: Draft | null): Lang {
  if (share?.lang) {
    const found = LANGS.find(l => String(l.id) === share.lang);
    if (found) return found;
  }
  if (draft?.langId != null) {
    const found = LANGS.find(l => l.id === draft.langId);
    if (found) return found;
  }
  return LANGS.find(l => l.name === 'Rust') ?? LANGS[0];
}

export function App() {
  const share = useMemo(() => readShareHash(), []);
  const draft = useMemo(() => (!share ? loadDraft() : null), [share]);
  const initialLang = useMemo(() => pickInitialLang(share, draft), [share, draft]);

  const [lang, setLang] = useState<Lang>(initialLang);
  const [code, setCode] = useState<string>(share?.code ?? draft?.code ?? initialLang.snippet);
  // Pre-fill stdin from share URL → saved draft → the language's sample
  // input. The sample makes the default snippet runnable on first click.
  const [stdin, setStdin] = useState<string>(share?.stdin ?? draft?.stdin ?? initialLang.sampleStdin);
  const [status, setStatus] = useState<Verdict>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [stderr, setStderr] = useState<string[]>([]);
  const [compileOutput, setCompileOutput] = useState('');
  const [metrics, setMetrics] = useState<RunMetrics>({ time: null, memory: null, exitCode: null, signal: null });
  const [limits, setLimits] = useState<RunLimits>(() => {
    const d = draft?.limits;
    return { memoryMb: d?.memoryMb ?? 256, timeS: d?.timeS ?? 5 };
  });
  const [token, setToken] = useState<string>(share?.token || ('zc_' + Math.random().toString(36).slice(2, 10)));
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  // single = original UI (one stdin + one output pane); tests = TestsPanel
  // covers the io row instead. Persisted in localStorage so reload keeps it.
  const [runMode, setRunMode] = useState<RunMode>(() => {
    try { return (localStorage.getItem('zerocode.playground.mode') as RunMode) || 'single'; }
    catch { return 'single'; }
  });
  useEffect(() => {
    try { localStorage.setItem('zerocode.playground.mode', runMode); } catch { /* noop */ }
  }, [runMode]);
  const [layout, setLayout] = useState<Layout>(() => loadLayout());
  useEffect(() => { saveLayout(layout); }, [layout]);
  const [error, setError] = useState<{ message: string; retry?: boolean } | null>(null);
  // Language drawer state — mobile only. The drawer's CSS keeps it hidden on
  // desktop (transform/positioning short-circuits via the same `.is-open` class
  // which is a no-op there since the rail is in-flow above 880px).
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    // Lock body scroll while the drawer is open so background content doesn't
    // jitter under a touch-drag. The mobile media query already opts the body
    // into natural scrolling; we just want it paused while the sheet is up.
    if (!pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [pickerOpen]);

  const [apiOnline, setApiOnline] = useState(false);
  const [apiLangs, setApiLangs] = useState<LanguageSpec[] | null>(null);
  const [apiCeilings, setApiCeilings] = useState<Ceilings | null>(null);
  void apiLangs; void getBaseSource;
  const cancelStreamRef = useRef<null | (() => void)>(null);
  const runCtlRef = useRef<AbortController | null>(null);

  const editorRef = useRef<EditorHandle | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const themeAttr = () => (typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null) || 'dark'
    : 'dark') as 'light' | 'dark';
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(themeAttr());
  useEffect(() => {
    const html = document.documentElement;
    const sync = () => setThemeMode((html.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const probeApi = useCallback(async () => {
    const r = await probe();
    setApiOnline(!!r.ok);
    if (!r.ok) { setApiLangs(null); setApiCeilings(null); return; }
    try {
      const langs = await languages();
      setApiLangs(langs);
      let mMax = 0, tMax = 0;
      for (const l of langs) {
        const lim = (l.default_limits ?? {}) as { memory_mb?: number; wall_time?: number };
        mMax = Math.max(mMax, +(lim.memory_mb ?? 0));
        tMax = Math.max(tMax, +(lim.wall_time ?? 0));
      }
      setApiCeilings({ memoryMb: mMax || 2048, timeS: tMax || 60 });
    } catch { /* anonymous probe — listing languages may fail in that case */ }
  }, []);
  useEffect(() => { probeApi(); }, [probeApi]);

  useEffect(() => {
    saveDraft({ langId: lang.id, code, stdin, limits });
  }, [lang.id, code, stdin, limits]);

  function clearResults() {
    setStatus('idle');
    setStatusDetail(null);
    setOutput([]);
    setStderr([]);
    setCompileOutput('');
    setMetrics({ time: null, memory: null, exitCode: null, signal: null });
    setError(null);
  }
  function selectLang(l: Lang) {
    cancelRun();
    setLang(l);
    setCode(l.snippet);
    // Reset stdin to the sample so the new snippet is runnable immediately.
    setStdin(l.sampleStdin);
    clearResults();
    setToken('zc_' + Math.random().toString(36).slice(2, 10));
  }
  function reset() {
    cancelRun();
    setCode(lang.snippet);
    setStdin(lang.sampleStdin);
    clearResults();
  }
  function copyShareLink() {
    writeShareHash({ langId: lang.id, code, stdin, token });
    const url = location.href;
    try { navigator.clipboard.writeText(url); } catch { /* noop */ }
    return url;
  }

  function cancelRun() {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    runCtlRef.current?.abort();
    runCtlRef.current = null;
  }

  function applySubmissionView(sub: SubmissionView) {
    const kind = apiStatusKind(sub.status) as Verdict;
    const detail = apiStatusDetail(sub.status);
    setStatus(kind);
    setStatusDetail(detail);
    if (sub.stdout) {
      const text = decode(sub.stdout);
      setOutput(text.split(/\r?\n/).filter((_, i, a) => i < a.length - 1 || a[i] !== ''));
    }
    if (sub.stderr) {
      const text = decode(sub.stderr);
      setStderr(text.split(/\r?\n/).filter((_, i, a) => i < a.length - 1 || a[i] !== ''));
    }
    if (sub.compile_output) {
      setCompileOutput(decode(sub.compile_output));
    }
    setMetrics({
      // API serializes wall_time as seconds (f64) and memory as KiB (u32).
      // See SubmissionView in crates/zerocode-api/src/routes/submissions.rs.
      time: sub.wall_time != null ? +sub.wall_time : null,
      memory: sub.memory  != null ? +sub.memory / 1024 : null,
      exitCode: sub.exit_code != null ? +sub.exit_code : null,
      signal: (sub.signal as unknown as { name?: string } | null)?.name ?? (typeof sub.signal === 'string' ? sub.signal : null),
    });
  }

  function recordHistory(kind: Verdict, t: number | null, tkn: string) {
    const h: HistoryEntry = { name: lang.name, verdict: kind, time: t, token: tkn, when: Date.now() };
    setHistory(prev => { const next = [h, ...prev].slice(0, 20); saveHistory(next); return next; });
  }

  function flushLines(buf: string, setter: (fn: (prev: string[]) => string[]) => void, remainder: (rest: string) => void) {
    let i: number; let lastEnd = 0;
    const lines: string[] = [];
    while ((i = buf.indexOf('\n', lastEnd)) !== -1) {
      lines.push(buf.slice(lastEnd, i));
      lastEnd = i + 1;
    }
    if (lines.length) setter(prev => [...prev, ...lines]);
    remainder(buf.slice(lastEnd));
  }

  async function runOnApi() {
    clearResults();
    setStatus('queued');
    const ctl = new AbortController();
    runCtlRef.current = ctl;
    let stdoutBuf = '';
    let stderrBuf = '';
    let tkn: string;

    try {
      const idem = idemKey([lang.id, code, stdin, limits.memoryMb, limits.timeS]);
      const ack = await submit({
        language_id: lang.id,
        source_code: code,
        stdin,
        limits: { cpu_time: limits.timeS, wall_time: limits.timeS, memory_mb: limits.memoryMb },
        idempotency_key: idem,
      });
      tkn = ack.token;
      if (!tkn) throw new Error('server returned no token');
      setToken(tkn);
      writeShareHash({ langId: lang.id, code, stdin, token: tkn });
      const ackKind = apiStatusKind(ack.status);
      if (ack.stdout != null || ackKind === 'accepted' || ackKind === 'ce' || ackKind === 're') {
        applySubmissionView(ack);
        recordHistory(ackKind as Verdict, ack.wall_time != null ? +ack.wall_time : null, tkn);
        runCtlRef.current = null;
        return;
      }
      setStatus('processing');
    } catch (e) {
      if (ctl.signal.aborted) return;
      setStatus('se');
      setError({ message: (e as Error).message || String(e), retry: true });
      runCtlRef.current = null;
      return;
    }

    let finished = false;
    cancelStreamRef.current = stream(tkn, {
      onEvent: ({ event, json, raw }) => {
        if (ctl.signal.aborted) return;
        if (event === 'processing') setStatus('processing');
        else if (event === 'stdout') {
          const chunk = (json as { data?: string } | null)?.data ?? raw;
          stdoutBuf += chunk;
          flushLines(stdoutBuf, setOutput, rest => { stdoutBuf = rest; });
        } else if (event === 'stderr') {
          const chunk = (json as { data?: string } | null)?.data ?? raw;
          stderrBuf += chunk;
          flushLines(stderrBuf, setStderr, rest => { stderrBuf = rest; });
        } else if (event === 'finished') {
          finished = true;
          if (stdoutBuf.length) { setOutput(p => [...p, stdoutBuf]); stdoutBuf = ''; }
          if (stderrBuf.length) { setStderr(p => [...p, stderrBuf]); stderrBuf = ''; }
          const s = (json as { status?: unknown } | null)?.status;
          const kind = apiStatusKind(s as never) as Verdict;
          setStatus(kind);
          setStatusDetail(apiStatusDetail(s as never));
          // Fetch the full row so metrics + history get the real wall_time
          // and memory. The SSE 'finished' payload only carries `status` —
          // recording history from here alone would always show "pending".
          apiGet(tkn).then(sub => {
            if (ctl.signal.aborted) return;
            applySubmissionView(sub);
            recordHistory(apiStatusKind(sub.status) as Verdict,
              sub.wall_time != null ? +sub.wall_time : null, tkn);
          }).catch(() => {
            // Last-ditch: if the row fetch fails, still record the verdict
            // (without timing) so the run isn't invisible in history.
            recordHistory(kind, null, tkn);
          });
          cancelStreamRef.current?.();
          cancelStreamRef.current = null;
        } else if (event === 'error') {
          setError({ message: 'stream error: ' + (raw || 'unknown') });
        }
      },
      onError: async () => {
        if (ctl.signal.aborted || finished) return;
        cancelStreamRef.current = null;
        try {
          const sub = await poll(tkn, { intervalMs: 400, signal: ctl.signal });
          if (ctl.signal.aborted) return;
          applySubmissionView(sub);
          recordHistory(apiStatusKind(sub.status) as Verdict, sub.wall_time != null ? +sub.wall_time : null, tkn);
        } catch (e) {
          if (!ctl.signal.aborted) {
            setStatus('se');
            setError({ message: 'stream + poll failed: ' + ((e as Error).message || e), retry: true });
          }
        }
      },
    });
    runCtlRef.current = ctl;
  }

  function runSimulated() {
    clearResults();
    setStatus('queued');
    setToken('demo_' + Math.random().toString(36).slice(2, 10));
    setTimeout(() => setStatus('processing'), 280);
  }

  useEffect(() => {
    if (apiOnline) return;
    if (status !== 'processing') return;
    const lines = lang.output;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i > lines.length) {
        clearInterval(id);
        setStatus('accepted');
        setMetrics({ time: lang.metrics.time, memory: lang.metrics.memory, exitCode: 0, signal: null });
        recordHistory('accepted', lang.metrics.time, token);
        return;
      }
      setOutput(prev => [...prev, lines[i - 1]]);
    }, 95);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lang, apiOnline]);

  // runOnApi closes over code/lang/stdin/limits, so it's a fresh function on
  // every render. We thread it through a ref so `run` (memoized for the keydown
  // listener below) always calls the LATEST closure — without this, the first
  // click after editing code submitted the previous source.
  const runOnApiRef = useRef(runOnApi);
  runOnApiRef.current = runOnApi;

  const run = useCallback(async () => {
    if (status === 'queued' || status === 'processing') return;
    if (apiOnline) { runOnApiRef.current(); return; }
    resetProbe();
    await probeApi();
    const p = await probe();
    if (p.ok) { runOnApiRef.current(); return; }
    setError({ message: 'No ZeroCode API is reachable. Make sure the service is running.' });
  }, [status, apiOnline, probeApi]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        cancelRun();
        if (status === 'queued' || status === 'processing') setStatus('cancelled');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, status]);

  useEffect(() => () => cancelRun(), []);

  return (
    <>
      <TopNav token={token} />
      <WorkspaceBar lang={lang} status={status}
        onRun={run} onRunDemo={runSimulated}
        onCancel={() => { cancelRun(); if (status === 'queued' || status === 'processing') setStatus('cancelled'); }}
        onReset={reset}
        onFormat={() => editorRef.current?.format()}
        limits={limits} setLimits={setLimits}
        ceilings={apiCeilings}
        apiOnline={apiOnline}
        onShare={copyShareLink}
        onOpenPicker={() => setPickerOpen(true)}
        mode={runMode} setMode={setRunMode} />
      {error && (
        <div className="pg-errbar">
          <style>{`
            .pg-errbar { padding: 8px 14px; background: color-mix(in oklab, var(--st-re) 12%, var(--bg-1)); border-bottom: 1px solid color-mix(in oklab, var(--st-re) 40%, var(--line)); color: var(--st-re); font: 12px var(--f-mono); display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
            .pg-errbar .x { margin-left: auto; cursor: pointer; opacity: .8; }
            .pg-errbar .x:hover { opacity: 1; }
            .pg-errbar button { appearance: none; background: transparent; border: 1px solid currentColor; color: inherit; padding: 3px 9px; border-radius: 4px; font: 11px var(--f-mono); cursor: pointer; letter-spacing: 0.04em; }
          `}</style>
          <span>✗ {error.message}</span>
          {error.retry && <button onClick={run}>retry</button>}
          <span className="x" onClick={() => setError(null)}>dismiss</span>
        </div>
      )}
      <main className="pg-main">
        <style>{`
          .pg-main { flex: 1; min-height: 0; display: flex; background: var(--bg); }
          .pg-rail-col { flex: 0 0 auto; display: flex; min-height: 0; }

          /* Center column: editor (top) above an io row (bottom).      */
          .pg-center      { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
          .pg-editor-wrap { flex: 0 0 auto; min-height: 0; display: flex; flex-direction: column; position: relative; background: #221F22; }
          .pg-io-row      { flex: 1 1 0; min-height: 0; display: flex; flex-direction: row; }
          .pg-stdin-col   { flex: 0 0 auto; min-width: 0; display: flex; flex-direction: column; }
          .pg-output-col  { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
          /* When stdin sits left of output the panel border should be on
             the right, and output's border should be on the left. */
          .pg-stdin-col .pg-stdin { border-top: 0; border-right: 1px solid var(--line); }
          .pg-output-col .pg-output { border-top: 0; border-left: 1px solid var(--line); }

          @media (max-width: 880px) {
            /* Natural document flow on mobile: each section has an explicit height,
               and the user scrolls the PAGE down to reach the next one. Block layout
               (not flex) is the safe choice here — flex's "fill remaining space"
               semantics break down when there's no fixed parent height. */
            .pg-main, .pg-center, .pg-io-row {
              display: block !important;
              flex: none !important;
              height: auto !important;
              min-height: 0 !important;
              width: 100% !important;
            }

            /* Rail-col still needs to render — the drawer (.pg-rail) is its child
               with position:fixed and must stay in the DOM tree for the slide-in to
               work. Collapse the in-flow box to zero size with visible overflow so
               the fixed drawer escapes and covers the viewport when open. */
            .pg-rail-col {
              display: block !important;
              width: 0 !important;
              height: 0 !important;
              overflow: visible !important;
              flex: none !important;
              padding: 0 !important;
            }

            /* Editor: 60vh (or at least 360 px on tiny phones) of dedicated code area.
               .pg-editor-wrap is still display:flex column from the desktop rule, which
               combined with an explicit height lets Monaco's absolute-positioned host
               fill the wrap correctly. */
            .pg-editor-wrap {
              width: 100% !important;
              height: 60vh !important;
              min-height: 360px !important;
              flex: none !important;
              position: relative;
            }

            /* Stdin: tall enough to type a few lines without cramping (180 px). */
            .pg-stdin-col { width: 100% !important; height: auto !important; }
            .pg-stdin-col .pg-stdin {
              height: 200px !important;
              flex: none !important;
              border-right: 0;
              border-bottom: 1px solid var(--line);
            }

            /* Output: roomy 380 px block — long stdout still scrolls internally. */
            .pg-output-col { width: 100% !important; height: auto !important; }
            .pg-output-col .pg-output {
              height: 380px !important;
              flex: none !important;
              border-left: 0;
              border-top: 1px solid var(--line);
            }
          }

          /* Drawer backdrop — only visible while pickerOpen on mobile. Tap to close.
             Desktop hides this entirely since the rail is always in-flow there. */
          .pg-rail-backdrop { display: none; position: fixed; inset: 0; z-index: 55; background: color-mix(in oklab, #000 55%, transparent); animation: pg-fade-in .18s ease; }
          @media (max-width: 880px) { .pg-rail-backdrop.is-on { display: block; } }
        `}</style>

        {pickerOpen && <div className="pg-rail-backdrop is-on" onClick={() => setPickerOpen(false)} />}

        <div className="pg-rail-col" style={{ width: layout.rail }}>
          <LanguagePicker selected={lang} onSelect={selectLang} history={history}
            historyH={layout.historyH}
            onResizeHistory={(d) => setLayout(l => ({ ...l, historyH: clamp(l.historyH + d, 60, window.innerHeight - 280) }))}
            mobileOpen={pickerOpen}
            onClose={() => setPickerOpen(false)} />
        </div>
        <Splitter direction="vertical" onDrag={(d) =>
          setLayout(l => ({ ...l, rail: clamp(l.rail + d, 180, 460) }))} />

        <div className="pg-center">
          <div className="pg-editor-wrap" style={{ height: layout.editor }}>
            <Editor ref={editorRef} code={code} setCode={setCode} language={lang.cm} onCursor={setCursor} />
          </div>
          <Splitter direction="horizontal" onDrag={(d) =>
            setLayout(l => ({ ...l, editor: clamp(l.editor + d, 140, window.innerHeight - 220) }))} />

          <div className="pg-io-row">
            {runMode === 'single' ? (
              <>
                <div className="pg-stdin-col" style={{ width: layout.stdinW }}>
                  <StdinPanel stdin={stdin} setStdin={setStdin} />
                </div>
                <Splitter direction="vertical" onDrag={(d) =>
                  setLayout(l => ({ ...l, stdinW: clamp(l.stdinW + d, 200, window.innerWidth - 480) }))} />
                <div className="pg-output-col">
                  <OutputPane status={status} statusDetail={statusDetail}
                    output={output} stderr={stderr} compileOutput={compileOutput}
                    lang={lang} metrics={metrics} token={token} />
                </div>
              </>
            ) : (
              /* Tests mode: TestsPanel takes the full io-row width.
                 It owns its own run-all button, polling, and result UI. */
              <div className="pg-tests-col" style={{ flex: '1 1 0', display: 'flex', minWidth: 0 }}>
                <TestsPanel lang={lang} code={code} limits={limits} apiOnline={apiOnline} />
              </div>
            )}
          </div>
        </div>
      </main>
      <StatusStrip status={status} statusDetail={statusDetail} metrics={metrics}
        apiOnline={apiOnline} cursor={cursor} themeMode={themeMode} />
    </>
  );
}

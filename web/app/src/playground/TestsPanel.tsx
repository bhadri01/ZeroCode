/*
 * Test-case panel for the playground.
 *
 * Lets the user define N (stdin, expected_output) cases for the current
 * source and run them all at once via `POST /v1/submissions/batch`.
 * Three feature tiers, all enabled:
 *   - Tier A — multi-stdin: add cases, run-all, per-case stdout + status.
 *   - Tier B — grader:      expected output per case, ✓/✗ verdict, diff.
 *   - Tier C — niceties:    comparison-mode toggle, JSON+CSV import/export,
 *                           localStorage persistence keyed on the source
 *                           hash, stop-on-first-fail.
 *
 * The panel replaces the stdin + output columns in the playground's
 * io-row when "tests" mode is active in the workspace bar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  decode, getBatch, pollBatch, statusKind as apiStatusKind, statusLabel,
  submitBatch, type SubmissionView,
} from '../shared/api';
import type { Lang, Verdict } from './data';
import { VERDICT_COLOR, VERDICT_LABEL } from './data';

/* ─── Types ─────────────────────────────────────────────────────── */

export type ComparisonMode = 'exact' | 'trim' | 'ignore-ws' | 'tokens';

export interface TestCase {
  id: string;
  stdin: string;
  expected: string;
  /* Run state — set by Run All; cleared on edit */
  status?: Verdict;
  statusDetail?: string | null;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  time?: number | null;
  memory?: number | null;
  exitCode?: number | null;
  token?: string;
  passed?: 'pass' | 'fail' | 'unchecked' | null;
}

interface RunLimits { memoryMb: number; timeS: number }

/* ─── Helpers ───────────────────────────────────────────────────── */

function newId(): string {
  return 'tc_' + Math.random().toString(36).slice(2, 10);
}

function emptyCase(): TestCase {
  return { id: newId(), stdin: '', expected: '' };
}

/** Stable-ish hash of source — keys the persistence bucket. */
function sourceHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function compare(actual: string, expected: string, mode: ComparisonMode): boolean {
  if (expected === '') return true; // no expected = no check
  switch (mode) {
    case 'exact':
      return actual === expected;
    case 'trim': {
      // Trim trailing whitespace per line, ignore trailing newline.
      const norm = (s: string) =>
        s.replace(/[ \t]+(\r?\n)/g, '$1').replace(/\r?\n$/, '');
      return norm(actual) === norm(expected);
    }
    case 'ignore-ws':
      return actual.replace(/\s+/g, '') === expected.replace(/\s+/g, '');
    case 'tokens': {
      // Split on any whitespace, compare token-by-token. Trailing/leading
      // whitespace and amount of whitespace are irrelevant.
      const a = actual.trim().split(/\s+/);
      const b = expected.trim().split(/\s+/);
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
  }
}

const MODE_LABEL: Record<ComparisonMode, string> = {
  'exact':     'exact match',
  'trim':      'trim trailing space',
  'ignore-ws': 'ignore all whitespace',
  'tokens':    'token-by-token',
};

const MODE_HINT: Record<ComparisonMode, string> = {
  'exact':     'byte-for-byte equal',
  'trim':      'strip trailing spaces + final newline',
  'ignore-ws': 'remove every space/tab/newline before compare',
  'tokens':    'split on whitespace, compare each token',
};

/* ─── Diff rendering ─────────────────────────────────────────────── */

interface DiffLine { kind: 'same' | 'add' | 'del'; text: string }

/** Simple line-level diff via LCS. Good enough for short test outputs;
 * we're not trying to be `git diff`. */
function lineDiff(a: string, b: string): DiffLine[] {
  const aL = a.split(/\r?\n/);
  const bL = b.split(/\r?\n/);
  const m = aL.length, n = bL.length;
  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    dp[i][j] = aL[i] === bL[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (aL[i] === bL[j]) { out.push({ kind: 'same', text: aL[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: aL[i] }); i++; }
    else { out.push({ kind: 'add', text: bL[j] }); j++; }
  }
  while (i < m) { out.push({ kind: 'del', text: aL[i++] }); }
  while (j < n) { out.push({ kind: 'add', text: bL[j++] }); }
  return out;
}

/* ─── Persistence ────────────────────────────────────────────────── */
/** Tests live keyed on source hash so editing the source doesn't blow
 * away your tests — but two different sources have independent buckets. */

const TESTS_KEY = 'zerocode.playground.tests';

interface PersistedBucket {
  tests: TestCase[];
  mode: ComparisonMode;
  stopOnFail: boolean;
}
type PersistedStore = Record<string, PersistedBucket>;

function loadStore(): PersistedStore {
  try {
    const v = JSON.parse(localStorage.getItem(TESTS_KEY) || '{}');
    return typeof v === 'object' && v !== null ? v as PersistedStore : {};
  } catch { return {}; }
}
function saveStore(store: PersistedStore): void {
  try { localStorage.setItem(TESTS_KEY, JSON.stringify(store)); } catch { /* noop */ }
}

function loadBucket(key: string): PersistedBucket | null {
  const all = loadStore();
  return all[key] ?? null;
}

function saveBucket(key: string, bucket: PersistedBucket): void {
  const all = loadStore();
  // Keep store bounded — max 30 source buckets, drop oldest on overflow.
  const keys = Object.keys(all);
  if (keys.length > 30 && !(key in all)) {
    for (const k of keys.slice(0, keys.length - 29)) delete all[k];
  }
  all[key] = bucket;
  saveStore(all);
}

/* ─── Import / Export ─────────────────────────────────────────────── */

/** Parse CSV with the convention: header optional. Columns: stdin, expected.
 * Quoted fields support newlines inside double quotes. Minimal — not RFC 4180. */
function parseCSV(src: string): { stdin: string; expected: string }[] {
  const rows: string[][] = [];
  let i = 0, row: string[] = [], field = '', inQuote = false;
  const push = () => { row.push(field); field = ''; };
  const flush = () => { if (row.length) rows.push(row); row = []; };
  while (i < src.length) {
    const c = src[i];
    if (inQuote) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuote = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuote = true; i++; continue; }
    if (c === ',') { push(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { push(); flush(); i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { push(); flush(); }
  if (!rows.length) return [];
  // Skip header row if first cell looks like "stdin" (case-insensitive).
  let start = 0;
  if (/^stdin$/i.test(rows[0][0] || '')) start = 1;
  const out: { stdin: string; expected: string }[] = [];
  for (let r = start; r < rows.length; r++) {
    const [stdin = '', expected = ''] = rows[r];
    if (stdin === '' && expected === '') continue;
    out.push({ stdin, expected });
  }
  return out;
}

function exportJSON(tests: TestCase[]): string {
  return JSON.stringify(
    tests.map(t => ({ stdin: t.stdin, expected: t.expected })),
    null, 2,
  );
}

function exportCSV(tests: TestCase[]): string {
  const esc = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const rows = ['stdin,expected', ...tests.map(t => `${esc(t.stdin)},${esc(t.expected)}`)];
  return rows.join('\n') + '\n';
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── DiffView ──────────────────────────────────────────────────── */

function DiffView({ expected, actual }: { expected: string; actual: string }) {
  const diff = useMemo(() => lineDiff(expected, actual), [expected, actual]);
  return (
    <div className="tp-diff">
      <style>{`
        .tp-diff {
          background: var(--bg); border: 1px solid var(--line-2); border-radius: 6px;
          padding: 8px 0; font: 11.5px var(--f-mono); max-height: 220px; overflow: auto;
        }
        .tp-diff-row { display: flex; padding: 0 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
        .tp-diff-row .gut { display: inline-block; width: 14px; opacity: .6; flex-shrink: 0; }
        .tp-diff-row.same { color: var(--fg-2); }
        .tp-diff-row.add  { color: var(--st-accepted); background: color-mix(in oklab, var(--st-accepted) 10%, transparent); }
        .tp-diff-row.del  { color: var(--st-re); background: color-mix(in oklab, var(--st-re) 10%, transparent); }
      `}</style>
      {diff.map((l, i) => (
        <div key={i} className={`tp-diff-row ${l.kind}`}>
          <span className="gut">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
          <span>{l.text || '​'}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── TestCaseRow ───────────────────────────────────────────────── */

interface TestCaseRowProps {
  index: number;
  tc: TestCase;
  mode: ComparisonMode;
  onChange: (patch: Partial<TestCase>) => void;
  onDelete: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function TestCaseRow(p: TestCaseRowProps) {
  const { index, tc, mode, onChange, onDelete, collapsed, onToggleCollapse } = p;
  const passColor: string =
    tc.passed === 'pass' ? 'var(--st-accepted)'
    : tc.passed === 'fail' ? 'var(--st-re)'
    : tc.status === 'tle' ? 'var(--st-tle)'
    : tc.status === 'mle' ? 'var(--st-mle)'
    : tc.status === 'ce' ? 'var(--st-ce)'
    : tc.status === 're' ? 'var(--st-re)'
    : 'var(--fg-3)';

  const verdictText =
    tc.passed === 'pass' ? '✓ pass'
    : tc.passed === 'fail' ? '✗ wrong'
    : tc.status ? VERDICT_LABEL[tc.status] ?? tc.status
    : '—';

  const showDiff =
    tc.passed === 'fail' && tc.expected.length > 0 && tc.stdout != null;

  return (
    <div className="tp-row" data-passed={tc.passed ?? 'none'}>
      <style>{`
        .tp-row { border: 1px solid var(--line-2); border-radius: 8px; background: var(--bg-1); margin-bottom: 10px; overflow: hidden; }
        .tp-row[data-passed="pass"] { border-left: 3px solid var(--st-accepted); }
        .tp-row[data-passed="fail"] { border-left: 3px solid var(--st-re); }

        .tp-row-hd {
          display: flex; align-items: center; gap: 12px;
          padding: 8px 12px; border-bottom: 1px solid var(--line);
          background: color-mix(in oklab, var(--bg-1) 60%, var(--bg));
          font-family: var(--f-mono); font-size: 11.5px;
          cursor: pointer;
        }
        .tp-row-hd .num   { color: var(--fg-3); letter-spacing: 0.06em; font-weight: 500; min-width: 22px; }
        .tp-row-hd .verd  { color: var(--vcolor); font-weight: 500; }
        .tp-row-hd .meta  { color: var(--fg-3); margin-left: auto; display: flex; gap: 10px; }
        .tp-row-hd .meta b { color: var(--fg-1); font-weight: 500; }
        .tp-row-hd .x {
          appearance: none; background: transparent; border: 1px solid var(--line-2);
          color: var(--fg-3); width: 22px; height: 22px; border-radius: 4px;
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .tp-row-hd .x:hover { color: var(--st-re); border-color: var(--st-re); }
        .tp-row-hd .caret { color: var(--fg-3); transition: transform .15s ease; }
        .tp-row-hd[data-collapsed="true"] .caret { transform: rotate(-90deg); }
        .tp-row-bd { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .tp-field   { display: flex; flex-direction: column; gap: 4px; }
        .tp-label   { font: 10.5px var(--f-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
        .tp-textarea {
          width: 100%; min-height: 50px; max-height: 200px; resize: vertical;
          background: var(--bg); color: var(--fg);
          border: 1px solid var(--line-2); border-radius: 6px;
          padding: 8px 10px; font: 12px var(--f-mono); line-height: 1.5; outline: none;
        }
        .tp-textarea:focus { border-color: var(--line-strong); }
        .tp-textarea::placeholder { color: var(--fg-4); }
        .tp-output {
          background: var(--bg); color: var(--fg-2);
          border: 1px solid var(--line-2); border-radius: 6px;
          padding: 8px 10px; font: 12px var(--f-mono); line-height: 1.5;
          min-height: 36px; max-height: 200px; overflow: auto;
          white-space: pre-wrap; word-break: break-all;
        }
        .tp-output.empty { color: var(--fg-4); font-style: italic; }
      `}</style>
      <div
        className="tp-row-hd"
        data-collapsed={collapsed}
        style={{ '--vcolor': passColor } as React.CSSProperties}
        onClick={onToggleCollapse}
      >
        <span className="caret">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4l3 3 3-3" />
          </svg>
        </span>
        <span className="num">#{index + 1}</span>
        <span className="verd">{verdictText}</span>
        <span className="meta">
          {tc.time != null && <span>wall · <b>{(tc.time * 1000).toFixed(0)}ms</b></span>}
          {tc.memory != null && <span>mem · <b>{tc.memory < 1024 ? `${Math.round(tc.memory)} KB` : `${(tc.memory / 1024).toFixed(1)} MB`}</b></span>}
          <button className="x" type="button" title="Delete case" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </span>
      </div>
      {!collapsed && (
        <div className="tp-row-bd">
          <div className="tp-field">
            <label className="tp-label">stdin</label>
            <textarea
              className="tp-textarea"
              value={tc.stdin}
              spellCheck={false}
              placeholder="input piped to stdin"
              onChange={(e) => onChange({ stdin: e.target.value, passed: null, stdout: undefined, stderr: undefined, status: undefined })}
            />
          </div>
          <div className="tp-field">
            <label className="tp-label">expected · optional</label>
            <textarea
              className="tp-textarea"
              value={tc.expected}
              spellCheck={false}
              placeholder="leave empty to skip verdict — just show stdout"
              onChange={(e) => onChange({ expected: e.target.value, passed: null })}
            />
          </div>
          {tc.stdout != null && (
            <div className="tp-field">
              <label className="tp-label">stdout</label>
              <div className={`tp-output${tc.stdout.length === 0 ? ' empty' : ''}`}>
                {tc.stdout.length === 0 ? '(empty)' : tc.stdout}
              </div>
            </div>
          )}
          {tc.stderr && tc.stderr.length > 0 && (
            <div className="tp-field">
              <label className="tp-label">stderr</label>
              <div className="tp-output">{tc.stderr}</div>
            </div>
          )}
          {tc.compileOutput && tc.compileOutput.length > 0 && (
            <div className="tp-field">
              <label className="tp-label">compile</label>
              <div className="tp-output">{tc.compileOutput}</div>
            </div>
          )}
          {showDiff && (
            <div className="tp-field">
              <label className="tp-label">diff (− expected, + actual) · mode: {MODE_LABEL[mode]}</label>
              <DiffView expected={tc.expected} actual={tc.stdout || ''} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── TestsPanel main ─────────────────────────────────────────────── */

export interface TestsPanelProps {
  lang: Lang;
  code: string;
  limits: RunLimits;
  apiOnline: boolean;
}

export function TestsPanel({ lang, code, limits, apiOnline }: TestsPanelProps) {
  const srcKey = useMemo(() => `${lang.id}:${sourceHash(code)}`, [lang.id, code]);

  /* ─── State ────────────────────────────────────────────────────── */
  const [tests, setTests] = useState<TestCase[]>([emptyCase()]);
  const [mode, setMode] = useState<ComparisonMode>('trim');
  const [stopOnFail, setStopOnFail] = useState(false);
  const [running, setRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const cancelRef = useRef<AbortController | null>(null);

  // Hydrate from localStorage when the source key changes.
  // We deliberately don't track tests/mode/stopOnFail in deps — the
  // bucket-save effect below handles saving; this is a one-shot per key.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedFor.current === srcKey) return;
    hydratedFor.current = srcKey;
    const b = loadBucket(srcKey);
    if (b && Array.isArray(b.tests) && b.tests.length > 0) {
      // Strip transient run state on hydrate.
      setTests(b.tests.map(t => ({
        id: t.id || newId(), stdin: t.stdin ?? '', expected: t.expected ?? '',
      })));
      setMode(b.mode || 'trim');
      setStopOnFail(!!b.stopOnFail);
    } else {
      setTests([emptyCase()]);
    }
    setCollapsed(new Set());
  }, [srcKey]);

  // Persist on changes (debounced slightly via micro-task batching).
  useEffect(() => {
    saveBucket(srcKey, {
      tests: tests.map(t => ({ id: t.id, stdin: t.stdin, expected: t.expected })),
      mode,
      stopOnFail,
    });
  }, [srcKey, tests, mode, stopOnFail]);

  /* ─── Derived ──────────────────────────────────────────────────── */

  const summary = useMemo(() => {
    let total = 0, pass = 0, fail = 0, unchecked = 0, errors = 0;
    for (const t of tests) {
      total++;
      if (t.passed === 'pass') pass++;
      else if (t.passed === 'fail') fail++;
      else if (t.passed === 'unchecked') unchecked++;
      if (t.status && t.status !== 'accepted' && t.status !== 'idle') errors++;
    }
    return { total, pass, fail, unchecked, errors };
  }, [tests]);

  const hasResults = tests.some(t => t.status != null);

  /* ─── Test-case operations ─────────────────────────────────────── */

  function addCase() {
    if (tests.length >= 100) {
      setBatchError('Maximum 100 test cases per batch.');
      return;
    }
    setTests(prev => [...prev, emptyCase()]);
  }
  function deleteCase(id: string) {
    setTests(prev => prev.length === 1 ? [emptyCase()] : prev.filter(t => t.id !== id));
  }
  function patchCase(id: string, patch: Partial<TestCase>) {
    setTests(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }
  function toggleCollapsed(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function clearResults() {
    setTests(prev => prev.map(t => ({
      id: t.id, stdin: t.stdin, expected: t.expected,
    })));
    setBatchError(null);
  }
  function clearAll() {
    if (running) return;
    if (!confirm(`Remove all ${tests.length} test cases?`)) return;
    setTests([emptyCase()]);
    setBatchError(null);
  }

  /* ─── Run all ──────────────────────────────────────────────────── */

  const applyView = useCallback((view: { items: SubmissionView[] }, tokenIds: string[]) => {
    setTests(prev => prev.map(t => {
      const idx = tokenIds.indexOf(t.token || '');
      if (idx < 0) return t;
      const sub = view.items[idx];
      if (!sub) return t;
      const kind = apiStatusKind(sub.status) as Verdict;
      const detail = typeof sub.status === 'object' && sub.status?.detail
        ? (typeof sub.status.detail === 'string' ? sub.status.detail : null)
        : null;
      const stdoutText = sub.stdout != null ? decode(sub.stdout as string) : '';
      const stderrText = sub.stderr != null ? decode(sub.stderr as string) : '';
      const compileText = sub.compile_output != null ? decode(sub.compile_output as string) : '';
      let passed: TestCase['passed'] = null;
      if (kind === 'queued' || kind === 'processing') passed = null;
      else if (t.expected.length === 0) passed = 'unchecked';
      else if (kind !== 'accepted') passed = 'fail';
      else passed = compare(stdoutText, t.expected, mode) ? 'pass' : 'fail';
      return {
        ...t,
        status: kind,
        statusDetail: detail,
        stdout: stdoutText,
        stderr: stderrText,
        compileOutput: compileText,
        time: sub.wall_time != null ? +sub.wall_time : null,
        memory: sub.memory != null ? +sub.memory / 1 : null, // KiB
        exitCode: sub.exit_code != null ? +sub.exit_code : null,
        passed,
      };
    }));
  }, [mode]);

  async function runAll() {
    if (running) return;
    if (!apiOnline) {
      setBatchError('No ZeroCode API is reachable. Start the service and reload.');
      return;
    }
    if (!code.trim()) {
      setBatchError('No source code to run. Type something in the editor first.');
      return;
    }
    const realCases = tests.filter(t => t.stdin.length > 0 || t.expected.length > 0);
    if (realCases.length === 0) {
      setBatchError('Add at least one test case with stdin or expected output.');
      return;
    }
    setBatchError(null);
    setRunning(true);

    // Reset run state on cases we're about to submit (keeps stdin/expected).
    setTests(prev => prev.map(t => ({
      id: t.id, stdin: t.stdin, expected: t.expected,
    })));

    const ctl = new AbortController();
    cancelRef.current = ctl;

    try {
      const ack = await submitBatch({
        language_id: lang.id,
        source_code: code,
        limits: { cpu_time: limits.timeS, wall_time: limits.timeS, memory_mb: limits.memoryMb },
        test_cases: realCases.map(t => ({ stdin: t.stdin })),
      });

      // Pair real cases with returned tokens by index.
      const tokenIds = ack.tokens;
      setTests(prev => {
        let realIdx = 0;
        return prev.map(t => {
          const isReal = t.stdin.length > 0 || t.expected.length > 0;
          if (!isReal) return t;
          const tok = tokenIds[realIdx++];
          return { ...t, token: tok, status: 'queued' };
        });
      });

      await pollBatch(ack.batch_id, (view) => {
        applyView(view, tokenIds);

        if (stopOnFail) {
          // If any case has finished as fail/error AND there are still pending,
          // abort the rest. (Server-side cancellation is a v2 API; this just
          // stops the UI from waiting.)
          const items = view.items;
          const anyFailedSoFar = items.some(it => {
            const k = apiStatusKind(it.status);
            return k !== 'queued' && k !== 'processing' && k !== 'accepted';
          });
          if (anyFailedSoFar) ctl.abort();
        }
      }, { signal: ctl.signal, intervalMs: 300 });

      // Final sync (in case the last poll missed a race).
      const final = await getBatch(ack.batch_id);
      applyView(final, tokenIds);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setBatchError(`Batch run failed: ${(e as Error).message || String(e)}`);
      }
    } finally {
      setRunning(false);
      cancelRef.current = null;
    }
  }

  function cancelRun() {
    cancelRef.current?.abort();
  }

  /* ─── Import / Export handlers ─────────────────────────────────── */

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  function triggerImport() { fileInputRef.current?.click(); }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-uploading same file fires onChange
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        let parsed: { stdin: string; expected: string }[] = [];
        const trimmed = text.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const j = JSON.parse(text);
          const arr = Array.isArray(j) ? j : [j];
          parsed = arr.map((row: unknown) => {
            const r = row as Record<string, unknown>;
            return {
              stdin: typeof r.stdin === 'string' ? r.stdin : '',
              expected: typeof r.expected === 'string'
                ? r.expected
                : typeof r.expected_output === 'string' ? r.expected_output : '',
            };
          });
        } else {
          parsed = parseCSV(text);
        }
        if (parsed.length === 0) {
          setBatchError('No test cases found in the imported file.');
          return;
        }
        if (parsed.length > 100) {
          setBatchError(`File has ${parsed.length} cases; capping at 100.`);
          parsed = parsed.slice(0, 100);
        }
        setTests(parsed.map(r => ({ id: newId(), stdin: r.stdin, expected: r.expected })));
        setBatchError(null);
      } catch (err) {
        setBatchError(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  function doExport(format: 'json' | 'csv') {
    const realCases = tests.filter(t => t.stdin.length > 0 || t.expected.length > 0);
    if (realCases.length === 0) {
      setBatchError('Nothing to export — add some test cases first.');
      return;
    }
    const name = `zerocode-tests-${lang.id}.${format}`;
    if (format === 'json') {
      downloadFile(name, exportJSON(realCases), 'application/json');
    } else {
      downloadFile(name, exportCSV(realCases), 'text/csv');
    }
  }

  /* ─── Render ───────────────────────────────────────────────────── */

  return (
    <section className="tp">
      <style>{`
        .tp {
          flex: 1 1 0; display: flex; flex-direction: column;
          min-height: 0; height: 100%; background: var(--bg);
        }
        .tp-tb {
          flex-shrink: 0; display: flex; align-items: center; gap: 10px;
          padding: 8px 14px; border-bottom: 1px solid var(--line);
          background: var(--bg-1); font-family: var(--f-mono); font-size: 11.5px;
          flex-wrap: wrap;
        }
        .tp-tb .label { color: var(--fg-3); letter-spacing: 0.12em; text-transform: uppercase; font-size: 10.5px; }
        .tp-tb button.btn {
          appearance: none; background: transparent; border: 1px solid var(--line-2);
          color: var(--fg-2); padding: 4px 10px; border-radius: 5px;
          font: 11.5px var(--f-mono); cursor: pointer; letter-spacing: 0.04em;
        }
        .tp-tb button.btn:hover { color: var(--fg); border-color: var(--line-strong); }
        .tp-tb button.btn:disabled { opacity: .45; cursor: not-allowed; }
        .tp-tb button.btn-primary {
          background: var(--accent); border-color: var(--accent); color: var(--bg);
          font-weight: 500;
        }
        .tp-tb button.btn-primary:hover { filter: brightness(1.08); }
        .tp-tb button.btn-stop {
          background: color-mix(in oklab, var(--st-re) 16%, transparent);
          border-color: var(--st-re); color: var(--st-re);
        }

        .tp-tb select {
          appearance: none; background: var(--bg); color: var(--fg);
          border: 1px solid var(--line-2); border-radius: 5px;
          padding: 4px 22px 4px 8px; font: 11px var(--f-mono); cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, var(--fg-3) 50%), linear-gradient(135deg, var(--fg-3) 50%, transparent 50%);
          background-position: calc(100% - 12px) 50%, calc(100% - 8px) 50%;
          background-size: 4px 4px;
          background-repeat: no-repeat;
        }
        .tp-tb label.chk { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; color: var(--fg-2); }
        .tp-tb label.chk input { accent-color: var(--accent); cursor: pointer; }
        .tp-tb .grow { flex: 1; }
        .tp-tb .summary { display: flex; gap: 8px; align-items: center; }
        .tp-tb .pill { padding: 3px 9px; border-radius: 99px; font: 10.5px var(--f-mono); letter-spacing: 0.06em; }
        .tp-tb .pill.pass { background: color-mix(in oklab, var(--st-accepted) 18%, transparent); color: var(--st-accepted); }
        .tp-tb .pill.fail { background: color-mix(in oklab, var(--st-re) 18%, transparent); color: var(--st-re); }
        .tp-tb .pill.unchecked { background: color-mix(in oklab, var(--fg-3) 18%, transparent); color: var(--fg-2); }
        .tp-tb .err { color: var(--st-re); }

        .tp-bd { flex: 1 1 0; overflow-y: auto; padding: 14px; min-height: 0; }
        .tp-empty { color: var(--fg-3); font: 12px var(--f-mono); text-align: center; padding: 32px 16px; }
        .tp-foot { display: flex; gap: 8px; padding: 4px 0 12px; }

        @media (max-width: 880px) {
          .tp-tb { padding: 10px; }
          .tp-tb .grow { width: 100%; flex: none; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="tp-tb">
        <span className="label">tests</span>
        <button className="btn" type="button" onClick={addCase} disabled={running || tests.length >= 100}>
          + add case
        </button>
        <button className="btn" type="button" onClick={triggerImport} disabled={running}>
          import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,.txt,application/json,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />
        <button className="btn" type="button" onClick={() => doExport('json')} disabled={running}>export json</button>
        <button className="btn" type="button" onClick={() => doExport('csv')} disabled={running}>export csv</button>
        <span className="grow" />

        <label className="chk" title={MODE_HINT[mode]}>
          compare
          <select value={mode} onChange={(e) => setMode(e.target.value as ComparisonMode)} disabled={running}>
            <option value="exact">{MODE_LABEL.exact}</option>
            <option value="trim">{MODE_LABEL.trim}</option>
            <option value="ignore-ws">{MODE_LABEL['ignore-ws']}</option>
            <option value="tokens">{MODE_LABEL.tokens}</option>
          </select>
        </label>

        <label className="chk" title="Stop polling once any case fails — the rest stay queued on the server but the UI stops waiting.">
          <input type="checkbox" checked={stopOnFail} onChange={(e) => setStopOnFail(e.target.checked)} disabled={running} />
          stop on fail
        </label>

        {hasResults && (
          <div className="summary">
            {summary.pass > 0 && <span className="pill pass">{summary.pass} pass</span>}
            {summary.fail > 0 && <span className="pill fail">{summary.fail} fail</span>}
            {summary.unchecked > 0 && <span className="pill unchecked">{summary.unchecked} run</span>}
          </div>
        )}

        {running
          ? <button className="btn btn-stop" type="button" onClick={cancelRun}>cancel</button>
          : <button className="btn btn-primary" type="button" onClick={runAll} disabled={!apiOnline}>
              run all
            </button>}
      </div>

      {batchError && (
        <div className="tp-tb" style={{ background: 'color-mix(in oklab, var(--st-re) 12%, var(--bg-1))', borderBottom: '1px solid color-mix(in oklab, var(--st-re) 40%, var(--line))' }}>
          <span className="err">⚠ {batchError}</span>
          <span className="grow" />
          <button className="btn" type="button" onClick={() => setBatchError(null)}>dismiss</button>
        </div>
      )}

      <div className="tp-bd">
        {tests.length === 0 ? (
          <div className="tp-empty">
            no test cases — click <b>+ add case</b> or <b>import</b> a JSON / CSV file
          </div>
        ) : (
          <>
            {tests.map((tc, i) => (
              <TestCaseRow
                key={tc.id}
                index={i}
                tc={tc}
                mode={mode}
                onChange={(patch) => patchCase(tc.id, patch)}
                onDelete={() => deleteCase(tc.id)}
                collapsed={collapsed.has(tc.id)}
                onToggleCollapse={() => toggleCollapsed(tc.id)}
              />
            ))}
            <div className="tp-foot">
              <button className="btn" type="button" onClick={addCase} disabled={running || tests.length >= 100}>
                + add case
              </button>
              {hasResults && (
                <button className="btn" type="button" onClick={clearResults} disabled={running}>
                  clear results
                </button>
              )}
              {tests.length > 1 && (
                <button className="btn" type="button" onClick={clearAll} disabled={running}>
                  clear all
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// Keep `statusLabel` import live in case TS strips unused — used implicitly
// via VERDICT_LABEL fallback display. Marking as exported keeps tree-shaking
// honest if data.ts schema changes.
void statusLabel; void VERDICT_COLOR;

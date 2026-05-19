/*
 * Browser client for the ZeroCode REST API.
 *
 * Mirrors the contract in crates/zerocode-api/src/routes/{submissions,languages,streaming,health}.rs.
 *
 * The generated TS SDK (scripts/generate-sdks.sh) will eventually replace
 * most of this for plain request/response endpoints. The SSE streaming path
 * stays hand-written because the OpenAPI generators handle SSE poorly.
 *
 * Configuration precedence — `?api=` query param > <meta name="zerocode-api">
 * > localStorage('zerocode.api') > location.origin (or http://localhost:8080
 * when loaded via file://).
 *
 * Bearer key precedence — `?key=` query param > localStorage('zerocode.key').
 */

export type StatusKind =
  | 'idle' | 'queued' | 'processing' | 'accepted'
  | 'tle' | 'mle' | 'ole' | 'ce' | 're' | 'nze' | 'se'
  | 'cancelled' | 'expired';

export interface ApiStatus {
  kind: string;
  detail?: unknown;
}

export interface SubmissionView {
  token: string;
  status: ApiStatus | string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  exit_code?: number | null;
  signal?: string | { name: string } | null;
  // The API serializes these as seconds (f64) and KiB (u32) — see
  // `SubmissionView` / `Base64SubmissionView` in
  // crates/zerocode-api/src/routes/submissions.rs. Older code referred
  // to `wall_time_ms` / `cpu_time_ms` / `memory_kb`; those fields don't
  // exist on the wire and silently returned undefined, so the playground
  // showed `mem · —` / `wall · —` for every run.
  wall_time?: number | null;   // wall-clock seconds
  time?: number | null;        // cpu seconds
  memory?: number | null;      // peak RSS in KiB
  [k: string]: unknown;
}

export interface LanguageSpec {
  id: number;
  name: string;
  version?: string;
  kind?: string;
  default_limits?: { memory_mb?: number; cpu_time?: number; wall_time?: number; max_pids?: number };
  [k: string]: unknown;
}

export interface ProbeResult {
  ok: boolean;
  base: string;
  authed?: boolean;
  hint?: string;
  error?: string;
}

export interface SubmitParams {
  language_id: number;
  source_code: string;
  stdin?: string;
  limits?: { cpu_time?: number; wall_time?: number; memory_mb?: number };
  callback_url?: string;
  idempotency_key?: string;
  wait?: boolean;
}

interface StreamHandlers {
  onEvent?: (e: { event: string; json: unknown; raw: string }) => void;
  onError?: (err: unknown) => void;
}

const STORAGE_BASE = 'zerocode.api';
const STORAGE_KEY = 'zerocode.key';

const META: string | undefined =
  typeof document === 'undefined'
    ? undefined
    : document.querySelector<HTMLMetaElement>('meta[name="zerocode-api"]')?.content;

const qs =
  typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

let _base = '';
let _key: string | null = null;
let _baseSource: 'query' | 'meta' | 'storage' | 'default' = 'default';
let _probeCache: ProbeResult | null = null;

function inferDefaultBase(): string {
  if (typeof location === 'undefined') return 'http://localhost:8080';
  if (location.protocol === 'file:') return 'http://localhost:8080';
  return location.origin;
}

function safeRead(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

function readConfig(): void {
  const fromQuery = qs.get('api');
  const fromStorage = safeRead(STORAGE_BASE);
  if (fromQuery) { _base = fromQuery.replace(/\/$/, ''); _baseSource = 'query'; }
  else if (META) { _base = META.replace(/\/$/, ''); _baseSource = 'meta'; }
  else if (fromStorage) { _base = fromStorage.replace(/\/$/, ''); _baseSource = 'storage'; }
  else { _base = inferDefaultBase().replace(/\/$/, ''); _baseSource = 'default'; }
  _key = qs.get('key') || safeRead(STORAGE_KEY);
  _probeCache = null;
}
readConfig();

export function setBase(url: string | null): void {
  try { url ? localStorage.setItem(STORAGE_BASE, url) : localStorage.removeItem(STORAGE_BASE); } catch { /* noop */ }
  readConfig();
}

export function setKey(k: string | null): void {
  try { k ? localStorage.setItem(STORAGE_KEY, k) : localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  readConfig();
}

export function getBase(): string { return _base; }
export function getKey(): string | null { return _key; }
export function getBaseSource() { return _baseSource; }

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', ...(extra ?? {}) };
  if (_key) h.Authorization = `Bearer ${_key}`;
  return h;
}

export function encode(str: string | null | undefined): string {
  return btoa(unescape(encodeURIComponent(str ?? '')));
}

export function decode(b64: string | null | undefined): string {
  if (b64 == null) return '';
  try { return decodeURIComponent(escape(atob(b64))); } catch { return b64; }
}

interface ApiError extends Error { status?: number; body?: unknown }

async function jsonFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${_base}${path}`, opts);
  const text = await r.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) {
    const detail = typeof body === 'string'
      ? body
      : (body as { error?: string; message?: string })?.error
        || (body as { error?: string; message?: string })?.message
        || JSON.stringify(body)
        || 'request failed';
    const err = new Error(`HTTP ${r.status} · ${detail}`) as ApiError;
    err.status = r.status; err.body = body;
    throw err;
  }
  return body as T;
}

export async function health(): Promise<{ status: string }> {
  return jsonFetch('/v1/health');
}

export async function ready(): Promise<{ status: string }> {
  return jsonFetch('/v1/ready');
}

export async function languages(): Promise<LanguageSpec[]> {
  return jsonFetch('/v1/languages', { headers: headers() });
}

export async function submit(params: SubmitParams): Promise<SubmissionView> {
  const body: Record<string, unknown> = {
    language_id: params.language_id,
    source_code: encode(params.source_code),
    base64_encoded: true,
  };
  if (params.stdin) body.stdin = encode(params.stdin);
  if (params.limits?.cpu_time != null) body.cpu_time_limit = +params.limits.cpu_time;
  if (params.limits?.wall_time != null) body.wall_time_limit = +params.limits.wall_time;
  if (params.limits?.memory_mb != null) body.memory_limit_mb = +params.limits.memory_mb;
  if (params.callback_url) body.callback_url = params.callback_url;

  const h = headers({ 'Content-Type': 'application/json' });
  if (params.idempotency_key) h['Idempotency-Key'] = params.idempotency_key;

  const url = `/v1/submissions${params.wait ? '?wait=true' : ''}`;
  return jsonFetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
}

export async function get(token: string): Promise<SubmissionView> {
  return jsonFetch(
    `/v1/submissions/${encodeURIComponent(token)}?base64_encoded=true`,
    { headers: headers() },
  );
}

/* ─── Batch endpoints ─────────────────────────────────────────────────
 * `POST /v1/submissions/batch` accepts one source + N test cases (1–100)
 * and returns N tokens tied by `batch_id`. The compile cache makes all
 * N cases share one compile and N runs.
 * `GET /v1/batches/{id}` returns the aggregated view + status summary.
 */

export interface BatchTestCaseInput { stdin?: string }

export interface BatchSubmitParams {
  language_id: number;
  source_code: string;
  test_cases: BatchTestCaseInput[];
  limits?: { cpu_time?: number; wall_time?: number; memory_mb?: number };
}

export interface BatchSummary {
  total: number;
  queued: number;
  processing: number;
  accepted: number;
  failed: number;
}

export interface BatchAck {
  batch_id: string;
  count: number;
  tokens: string[];
  status: string;
}

export interface BatchView {
  batch_id: string;
  items: SubmissionView[];
  summary: BatchSummary;
}

export async function submitBatch(params: BatchSubmitParams): Promise<BatchAck> {
  const body: Record<string, unknown> = {
    language_id: params.language_id,
    source_code: encode(params.source_code),
    base64_encoded: true,
    test_cases: params.test_cases.map((t) => ({
      stdin: t.stdin ? encode(t.stdin) : null,
    })),
  };
  if (params.limits?.cpu_time != null) body.cpu_time_limit = +params.limits.cpu_time;
  if (params.limits?.wall_time != null) body.wall_time_limit = +params.limits.wall_time;
  if (params.limits?.memory_mb != null) body.memory_limit_mb = +params.limits.memory_mb;

  return jsonFetch('/v1/submissions/batch', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

export async function getBatch(batchId: string): Promise<BatchView> {
  return jsonFetch(
    `/v1/batches/${encodeURIComponent(batchId)}?base64_encoded=true`,
    { headers: headers() },
  );
}

/** Polls `GET /v1/batches/{id}` every `intervalMs` until every case has
 * reached a terminal status (or the signal is aborted). The callback
 * fires after each poll so the UI can light up cases as they finish. */
export async function pollBatch(
  batchId: string,
  onUpdate: (view: BatchView) => void,
  { intervalMs = 350, signal }: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<BatchView> {
  for (;;) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const view = await getBatch(batchId);
    onUpdate(view);
    const pending = view.summary.queued + view.summary.processing;
    if (pending === 0) return view;
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, intervalMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        rej(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    });
  }
}

export function statusKind(s: ApiStatus | string | null | undefined): StatusKind {
  if (!s) return 'idle';
  if (typeof s === 'string') return s.toLowerCase() as StatusKind;
  switch (s.kind) {
    case 'accepted': return 'accepted';
    case 'queued': return 'queued';
    case 'processing': return 'processing';
    case 'time_limit_exceeded': return 'tle';
    case 'memory_limit_exceeded': return 'mle';
    case 'output_limit_exceeded': return 'ole';
    case 'compile_error': return 'ce';
    case 'runtime_error': return 're';
    case 'non_zero_exit': return 'nze';
    case 'sandbox_failure':
    case 'internal_error': return 'se';
    case 'cancelled': return 'cancelled';
    case 'expired': return 'expired';
    default: return (String(s.kind || 'idle') as StatusKind);
  }
}

const LABELS: Record<StatusKind, string> = {
  idle: 'idle', queued: 'queued', processing: 'processing', accepted: 'accepted',
  tle: 'time limit', mle: 'memory limit', ole: 'output limit',
  ce: 'compile error', re: 'runtime error', nze: 'non-zero exit',
  se: 'sandbox error', cancelled: 'cancelled', expired: 'expired',
};
export function statusLabel(s: ApiStatus | string | null | undefined): string {
  const k = statusKind(s);
  return LABELS[k] ?? k;
}

export function statusDetail(s: ApiStatus | string | null | undefined): string | null {
  if (!s || typeof s === 'string') return null;
  const d = s.detail;
  if (d == null) return null;
  if (typeof d === 'string') return d;
  if (typeof d === 'object') {
    const obj = d as { name?: string; kind?: string };
    return obj.name || obj.kind || JSON.stringify(d);
  }
  return String(d);
}

export function stream(token: string, { onEvent, onError }: StreamHandlers = {}): () => void {
  let aborted = false;
  const ctl = new AbortController();

  (async () => {
    try {
      const r = await fetch(
        `${_base}/v1/submissions/${encodeURIComponent(token)}/stream`,
        { headers: { ...headers(), Accept: 'text/event-stream' }, signal: ctl.signal },
      );
      if (!r.ok || !r.body) throw new Error(`stream HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done || aborted) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let ev = 'message', data = '';
          for (const ln of frame.split('\n')) {
            if (ln.startsWith('event:')) ev = ln.slice(6).trim();
            else if (ln.startsWith('data:')) data += (data ? '\n' : '') + ln.slice(5).trim();
          }
          if (!ev && !data) continue;
          let json: unknown = null;
          try { json = data ? JSON.parse(data) : null; } catch { /* keep raw */ }
          onEvent?.({ event: ev, json, raw: data });
        }
      }
    } catch (e) {
      if (!aborted) onError?.(e);
    }
  })();

  return () => { aborted = true; try { ctl.abort(); } catch { /* noop */ } };
}

export async function poll(
  token: string,
  { intervalMs = 350, signal }: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<SubmissionView> {
  for (;;) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const sub = await get(token);
    const kind = statusKind(sub.status);
    if (kind !== 'queued' && kind !== 'processing') return sub;
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, intervalMs);
      signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
    });
  }
}

export async function probe(): Promise<ProbeResult> {
  if (_probeCache) return _probeCache;
  const fallbackBase = (() => {
    if (_baseSource !== 'default') return null;
    if (typeof location === 'undefined') return null;
    const host = location.hostname;
    if (!host || !['localhost', '127.0.0.1'].includes(host)) return null;
    const candidate = `http://${host}:8080`;
    return candidate === _base ? null : candidate;
  })();
  try {
    await jsonFetch('/v1/health');
    let authed = false;
    try { await languages(); authed = true; } catch { /* unauthenticated probe is fine */ }
    _probeCache = { ok: true, base: _base, authed };
  } catch (e) {
    if (fallbackBase) {
      const prevBase = _base;
      try {
        _base = fallbackBase;
        await jsonFetch('/v1/health');
        let authed = false;
        try { await languages(); authed = true; } catch { /* same */ }
        _probeCache = {
          ok: true, base: _base, authed,
          hint: `defaulted to ${_base} after ${prevBase} did not respond`,
        };
        return _probeCache;
      } catch {
        _base = prevBase;
      }
    }
    _probeCache = { ok: false, base: _base, error: String((e as Error)?.message || e) };
  }
  return _probeCache;
}

export function resetProbe(): void { _probeCache = null; }

export function idemKey(parts: unknown): string {
  const s = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `zc-ui-${h.toString(36)}-${Date.now().toString(36)}`;
}

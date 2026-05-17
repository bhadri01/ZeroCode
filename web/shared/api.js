// shared/api.js
// Browser client for the ZeroCode REST API. Matches the contract in
// crates/zerocode-api/src/routes/{submissions,languages,streaming,health}.rs.
//
// Configuration (in priority order):
//   1. URL query param ?api=https://api.zerocode.run  (overrides everything)
//   2. <meta name="zerocode-api" content="...">       (set per-page)
//   3. localStorage key 'zerocode.api'                (set via Settings dialog)
//   4. window.location.origin                         (assume same-origin)
//
// Bearer key (in priority order):
//   1. URL query param ?key=...
//   2. localStorage key 'zerocode.key'                (set via Settings dialog)
//   3. null → unauthenticated (rejected by API except /v1/health, /v1/about)

(function () {
  const META = document.querySelector('meta[name="zerocode-api"]')?.content;
  const qs = new URLSearchParams(location.search);

  let _base = null;
  let _key = null;
  let _baseSource = 'default';
  // Declared up here so `readConfig()` can clear it during the initial IIFE
  // run — `let` declared later would put it in the TDZ and crash the module
  // before `window.ZeroCodeAPI` ever gets assigned.
  let probeCache = null;

  function inferDefaultBase() {
    if (location.protocol === 'file:') return 'http://localhost:8080';
    return location.origin;
  }

  function readConfig() {
    const fromQuery = qs.get('api');
    const fromStorage = (() => { try { return localStorage.getItem('zerocode.api'); } catch { return null; } })();
    if (fromQuery) {
      _base = fromQuery.replace(/\/$/, '');
      _baseSource = 'query';
    } else if (META) {
      _base = META.replace(/\/$/, '');
      _baseSource = 'meta';
    } else if (fromStorage) {
      _base = fromStorage.replace(/\/$/, '');
      _baseSource = 'storage';
    } else {
      _base = inferDefaultBase().replace(/\/$/, '');
      _baseSource = 'default';
    }
    _key =
      qs.get('key') ||
      (() => { try { return localStorage.getItem('zerocode.key'); } catch { return null; } })();
    probeCache = null; // force re-probe after a config change
  }
  readConfig();

  function setBase(url) {
    try { url ? localStorage.setItem('zerocode.api', url) : localStorage.removeItem('zerocode.api'); } catch {}
    readConfig();
  }
  function setKey(k) {
    try { k ? localStorage.setItem('zerocode.key', k) : localStorage.removeItem('zerocode.key'); } catch {}
    readConfig();
  }

  function headers(extra) {
    const h = { 'Accept': 'application/json', ...(extra || {}) };
    if (_key) h['Authorization'] = `Bearer ${_key}`;
    return h;
  }

  // base64 helpers that handle multi-byte UTF-8 correctly. The Rust API uses
  // standard base64 (no URL-safe variant) over the wire.
  function b64enc(str) {
    return btoa(unescape(encodeURIComponent(str ?? '')));
  }
  function b64dec(b64) {
    if (b64 == null) return '';
    try { return decodeURIComponent(escape(atob(b64))); }
    catch { return b64; } // malformed → return as-is
  }

  async function jsonFetch(path, opts) {
    const r = await fetch(`${_base}${path}`, opts);
    const text = await r.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) {
      const detail = typeof body === 'string'
        ? body
        : (body?.error || body?.message || JSON.stringify(body) || 'request failed');
      const err = new Error(`HTTP ${r.status} · ${detail}`);
      err.status = r.status; err.body = body;
      throw err;
    }
    return body;
  }

  async function health() {
    // /v1/health is unauthenticated; return shape: { status: "ok" }
    return jsonFetch('/v1/health');
  }

  async function ready() {
    // /v1/ready gates on DB ping + queue depth
    return jsonFetch('/v1/ready');
  }

  async function languages() {
    return jsonFetch('/v1/languages', { headers: headers() });
  }

  // Submit a job. Returns either
  //   { token, status: "queued" }                   for the async path
  //   { token, status: { kind, detail }, ... }      for ?wait=true success
  //   { token, status: { kind }, stdout, ... }      for a cache hit
  //
  //   limits: { cpu_time, wall_time, memory_mb }    seconds, seconds, MB
  async function submit({ language_id, source_code, stdin, limits, callback_url, idempotency_key, wait }) {
    const body = {
      language_id,
      source_code: b64enc(source_code),
      base64_encoded: true,
    };
    if (stdin)         body.stdin            = b64enc(stdin);
    if (limits?.cpu_time   != null) body.cpu_time_limit  = +limits.cpu_time;
    if (limits?.wall_time  != null) body.wall_time_limit = +limits.wall_time;
    if (limits?.memory_mb  != null) body.memory_limit_mb = +limits.memory_mb;
    if (callback_url)  body.callback_url     = callback_url;

    const h = headers({ 'Content-Type': 'application/json' });
    if (idempotency_key) h['Idempotency-Key'] = idempotency_key;

    const url = `/v1/submissions${wait ? '?wait=true' : ''}`;
    return jsonFetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
  }

  // Fetch a submission. Always ?base64_encoded=true so outputs round-trip
  // binary safely. Callers can decode() the stdout/stderr/compile_output.
  async function get(token) {
    return jsonFetch(
      `/v1/submissions/${encodeURIComponent(token)}?base64_encoded=true`,
      { headers: headers() },
    );
  }

  // Map the structured Status `{ kind, detail }` to a flat string the UI uses.
  function statusKind(s) {
    if (!s) return 'idle';
    if (typeof s === 'string') return s.toLowerCase();
    const k = s.kind;
    if (k === 'accepted')              return 'accepted';
    if (k === 'queued')                return 'queued';
    if (k === 'processing')            return 'processing';
    if (k === 'time_limit_exceeded')   return 'tle';
    if (k === 'memory_limit_exceeded') return 'mle';
    if (k === 'output_limit_exceeded') return 'ole';
    if (k === 'compile_error')         return 'ce';
    if (k === 'runtime_error')         return 're';
    if (k === 'non_zero_exit')         return 'nze';
    if (k === 'sandbox_failure')       return 'se';
    if (k === 'internal_error')        return 'se';
    if (k === 'cancelled')             return 'cancelled';
    if (k === 'expired')               return 'expired';
    return String(k || 'idle');
  }

  // Human label for the verdict chip.
  function statusLabel(s) {
    const k = statusKind(s);
    return {
      idle: 'idle',
      queued: 'queued',
      processing: 'processing',
      accepted: 'accepted',
      tle: 'time limit',
      mle: 'memory limit',
      ole: 'output limit',
      ce:  'compile error',
      re:  'runtime error',
      nze: 'non-zero exit',
      se:  'sandbox error',
      cancelled: 'cancelled',
      expired: 'expired',
    }[k] || k;
  }

  // Optional sub-detail: e.g. TLE distinguishes wall vs cpu; signal name for RE.
  function statusDetail(s) {
    if (!s || typeof s === 'string') return null;
    const d = s.detail;
    if (d == null) return null;
    if (typeof d === 'string') return d;
    if (typeof d === 'object') return d.name || d.kind || JSON.stringify(d);
    return String(d);
  }

  // Stream a token via SSE. Returns a cancel() function.
  //   onEvent({ event, json, raw }) — fires per parsed SSE frame.
  //     - `event` is the SSE event name ('processing','stdout','stderr','finished','error', or 'message')
  //     - `json`  is the parsed JSON payload when applicable, or null for plain text events
  //     - `raw`   is the original data string
  //   onError(err) — fires on transport-level errors.
  function stream(token, { onEvent, onError } = {}) {
    // EventSource can't carry an Authorization header → use fetch + ReadableStream
    // so the same path works for authed and dev/unauthed servers.
    let aborted = false;
    const ctl = new AbortController();

    (async () => {
      try {
        const r = await fetch(
          `${_base}/v1/submissions/${encodeURIComponent(token)}/stream`,
          { headers: { ...headers(), 'Accept': 'text/event-stream' }, signal: ctl.signal },
        );
        if (!r.ok || !r.body) throw new Error(`stream HTTP ${r.status}`);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done || aborted) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let ev = 'message', data = '';
            for (const ln of frame.split('\n')) {
              if (ln.startsWith('event:')) ev = ln.slice(6).trim();
              else if (ln.startsWith('data:')) data += (data ? '\n' : '') + ln.slice(5).trim();
            }
            if (!ev && !data) continue;
            let json = null;
            try { json = data ? JSON.parse(data) : null; } catch { /* keep raw */ }
            onEvent?.({ event: ev, json, raw: data });
          }
        }
      } catch (e) {
        if (!aborted) onError?.(e);
      }
    })();

    return () => { aborted = true; try { ctl.abort(); } catch {} };
  }

  // Poll until terminal status or `signal` aborts. Resolves with the final
  // SubmissionView. Used as the fallback when SSE isn't available.
  async function poll(token, { intervalMs = 350, signal } = {}) {
    for (;;) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const sub = await get(token);
      const kind = statusKind(sub.status);
      if (kind !== 'queued' && kind !== 'processing') return sub;
      await new Promise((res, rej) => {
        const t = setTimeout(res, intervalMs);
        signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
    }
  }

  // Probe the API once; returns { ok, base, hint? } for UI feedback.
  // `probeCache` is declared at the top of the IIFE so `readConfig()` can clear it.
  async function probe() {
    if (probeCache) return probeCache;
    const fallbackBase = (() => {
      if (_baseSource !== 'default') return null;
      const host = location.hostname;
      if (!host || !['localhost', '127.0.0.1'].includes(host)) return null;
      const candidate = `http://${host}:8080`;
      return candidate === _base ? null : candidate;
    })();
    try {
      await jsonFetch('/v1/health');
      // Also try /v1/languages so a bearer-key mistake is caught up-front.
      let authed = false;
      try { await languages(); authed = true; } catch (e) { /* unauthenticated probe is fine, just not authed */ }
      probeCache = { ok: true, base: _base, authed };
    } catch (e) {
      if (fallbackBase) {
        const prevBase = _base;
        try {
          _base = fallbackBase;
          await jsonFetch('/v1/health');
          let authed = false;
          try { await languages(); authed = true; } catch (inner) { /* same behavior */ }
          probeCache = {
            ok: true,
            base: _base,
            authed,
            hint: `defaulted to ${_base} after ${prevBase} did not respond`,
          };
          return probeCache;
        } catch (inner) {
          _base = prevBase;
        }
      }
      probeCache = { ok: false, base: _base, error: String(e?.message || e) };
    }
    return probeCache;
  }

  // Generate an idempotency key tied to a content hash of body. Cheap and
  // stable; the server's blake3 dedup is the real safety net.
  function idemKey(parts) {
    const s = JSON.stringify(parts);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return `zc-ui-${h.toString(36)}-${Date.now().toString(36)}`;
  }

  // Clear the in-memory probe cache so the next probe() actually hits the
  // network. Useful when the UI wants to retry a failed connection without
  // mutating localStorage via setBase()/setKey().
  function resetProbe() { probeCache = null; }

  window.ZeroCodeAPI = {
    get base()   { return _base; },
    get key()    { return _key; },
    get baseSource() { return _baseSource; },
    setBase, setKey,
    health, ready, languages, submit, get, stream, poll,
    statusKind, statusLabel, statusDetail,
    decode: b64dec, encode: b64enc,
    probe, resetProbe, idemKey,
  };
})();

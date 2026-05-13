// docs/content.jsx
// Article content. Each article exports a component + a TOC list.

const Articles = {};

/* ─── Reusable bits ──────────────────────────────────────────────── */
function H1({ id, children, kicker }) {
  return (
    <header className="ar-h1">
      <style>{`
        .ar-h1 { padding: 0 0 24px; margin-bottom: 32px; border-bottom: 1px solid var(--line); }
        .ar-h1 .k {
          font-family: var(--f-mono); font-size: 11px;
          color: var(--accent); letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 14px;
        }
        .ar-h1 h1 {
          margin: 0; font-family: var(--f-display); font-weight: 400;
          font-size: 48px; line-height: 1.05;
          color: var(--fg); letter-spacing: -0.014em;
          text-wrap: balance;
        }
        .ar-h1 h1 .it { font-style: italic; }
      `}</style>
      {kicker && <div className="k">{kicker}</div>}
      <h1 id={id}>{children}</h1>
    </header>
  );
}

function H2({ id, children }) {
  return (
    <h2 id={id} className="ar-h2">
      <style>{`
        .ar-h2 {
          font-family: var(--f-display); font-weight: 400;
          font-size: 30px; line-height: 1.15;
          color: var(--fg); letter-spacing: -0.012em;
          margin: 56px 0 16px;
          scroll-margin-top: 24px;
        }
        .ar-h2 .it { font-style: italic; }
      `}</style>
      {children}
    </h2>
  );
}

function H3({ id, children }) {
  return (
    <h3 id={id} className="ar-h3">
      <style>{`
        .ar-h3 {
          font-family: var(--f-mono); font-weight: 500;
          font-size: 14px; line-height: 1.4;
          color: var(--fg-1); letter-spacing: 0.04em;
          margin: 32px 0 10px;
          text-transform: uppercase;
          scroll-margin-top: 24px;
        }
        .ar-h3::before {
          content: '§'; color: var(--accent); margin-right: 8px; opacity: .7;
        }
      `}</style>
      {children}
    </h3>
  );
}

function P({ children }) {
  return (
    <p className="ar-p">
      <style>{`
        .ar-p {
          color: var(--fg-1); font-size: 15.5px; line-height: 1.7;
          margin: 0 0 16px; max-width: 720px;
        }
        .ar-p code, code.ic {
          font-family: var(--f-mono); font-size: 0.88em;
          padding: 1px 6px; border-radius: 4px;
          background: var(--bg-2); color: var(--fg);
          border: 1px solid var(--line);
        }
        .ar-p b { color: var(--fg); font-weight: 500; }
        .ar-p a { color: var(--accent); border-bottom: 1px solid color-mix(in oklab, var(--accent) 40%, transparent); padding-bottom: 1px; }
        .ar-p a:hover { border-color: var(--accent); }
      `}</style>
      {children}
    </p>
  );
}

function Code({ lang, lines, copy = true }) {
  return (
    <div className="ar-code">
      <style>{`
        .ar-code {
          margin: 16px 0 22px;
          border: 1px solid var(--line); border-radius: 8px;
          overflow: hidden; background: var(--bg-1);
          max-width: 760px;
        }
        .ar-code-hd {
          padding: 8px 14px; border-bottom: 1px solid var(--line);
          display: flex; align-items: center; gap: 10px;
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.12em; text-transform: uppercase;
        }
        .ar-code-hd .l { color: var(--fg-2); text-transform: none; letter-spacing: 0.02em; font-size: 11.5px; }
        .ar-code-hd .copy { margin-left: auto; color: var(--fg-3); cursor: pointer; }
        .ar-code-hd .copy:hover { color: var(--fg); }
        .ar-code pre { margin: 0; padding: 14px 18px; font-family: var(--f-mono); font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
        .ar-code .pr { color: var(--accent); }
        .ar-code .cmd { color: var(--fg); }
        .ar-code .flag { color: var(--blue-1); }
        .ar-code .str { color: #9be39b; }
        .ar-code .num { color: #d2a86a; }
        .ar-code .kw { color: var(--blue-1); }
        .ar-code .com { color: var(--fg-3); font-style: italic; }
        .ar-code .key { color: var(--fg-2); }
        .ar-code .punct { color: var(--fg-3); }
        .ar-code .out { color: var(--st-accepted); }
        .ar-code .fn { color: #f5d76e; }
      `}</style>
      <div className="ar-code-hd">
        <span className="l">{lang}</span>
        {copy && <span className="copy">copy</span>}
      </div>
      <pre>{lines.map((ln, i) => ln === null
        ? <div key={i} style={{ height: 8 }} />
        : <div key={i} dangerouslySetInnerHTML={{ __html: ln }} />)}</pre>
    </div>
  );
}

function Callout({ kind = 'info', title, children }) {
  const colors = {
    info: 'var(--blue-1)',
    warn: 'var(--st-tle)',
    danger: 'var(--st-re)',
    success: 'var(--st-accepted)',
  };
  return (
    <aside className="ar-callout" style={{ '--c': colors[kind] }}>
      <style>{`
        .ar-callout {
          margin: 20px 0 22px;
          border-left: 2px solid var(--c);
          padding: 12px 16px;
          background: color-mix(in oklab, var(--c) 6%, var(--bg-1));
          border-radius: 0 8px 8px 0;
          max-width: 760px;
        }
        .ar-callout .t {
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--c); letter-spacing: 0.12em; text-transform: uppercase;
          margin-bottom: 6px;
        }
        .ar-callout p { margin: 0; color: var(--fg-1); font-size: 14px; line-height: 1.6; }
        .ar-callout code { font-family: var(--f-mono); background: var(--bg-2); padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
      `}</style>
      <div className="t">{title || kind}</div>
      <p>{children}</p>
    </aside>
  );
}

function Endpoint({ method, path, name, body }) {
  const colors = { GET: '#7aaaff', POST: '#6ee7a4', DELETE: '#f06b6b', PUT: '#f5b850' };
  return (
    <div className="ar-ep">
      <style>{`
        .ar-ep {
          border: 1px solid var(--line);
          border-radius: 8px;
          margin: 12px 0;
          overflow: hidden;
          max-width: 760px;
        }
        .ar-ep-hd {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: var(--bg-1);
          border-bottom: 1px solid var(--line);
        }
        .ar-ep .m {
          font-family: var(--f-mono); font-weight: 500; font-size: 11px;
          padding: 3px 8px; border-radius: 4px; letter-spacing: 0.08em;
          color: var(--mc);
          border: 1px solid var(--mc);
          background: color-mix(in oklab, var(--mc) 10%, transparent);
        }
        .ar-ep .p {
          font-family: var(--f-mono); font-size: 13.5px; color: var(--fg);
        }
        .ar-ep .n { margin-left: auto; font-size: 12.5px; color: var(--fg-2); }
        .ar-ep-bd {
          padding: 12px 14px;
          font-size: 13.5px; color: var(--fg-1); line-height: 1.5;
        }
      `}</style>
      <div className="ar-ep-hd">
        <span className="m" style={{ '--mc': colors[method] || 'var(--fg-2)' }}>{method}</span>
        <span className="p">{path}</span>
        {name && <span className="n">{name}</span>}
      </div>
      {body && <div className="ar-ep-bd">{body}</div>}
    </div>
  );
}

function Table({ cols, rows }) {
  return (
    <div className="ar-table">
      <style>{`
        .ar-table {
          margin: 20px 0;
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          max-width: 760px;
        }
        .ar-table-row {
          display: grid;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          align-items: baseline;
          font-size: 13.5px;
        }
        .ar-table-row:last-child { border-bottom: 0; }
        .ar-table-row.hd {
          background: var(--bg-1);
          font-family: var(--f-mono); font-size: 10.5px;
          color: var(--fg-3); letter-spacing: 0.12em; text-transform: uppercase;
        }
        .ar-table-row .cell { color: var(--fg-1); padding-right: 12px; }
        .ar-table-row .cell:first-child { color: var(--fg); }
        .ar-table-row .cell.mono { font-family: var(--f-mono); font-size: 12.5px; color: var(--fg-1); }
        .ar-table-row .cell.muted { color: var(--fg-2); }
      `}</style>
      <div className="ar-table-row hd" style={{ gridTemplateColumns: cols.map(c => c.w || '1fr').join(' ') }}>
        {cols.map((c, i) => <div key={i} className="cell">{c.h}</div>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="ar-table-row" style={{ gridTemplateColumns: cols.map(c => c.w || '1fr').join(' ') }}>
          {r.map((cell, j) => (
            <div key={j} className={`cell ${cols[j].kind || ''}`} dangerouslySetInnerHTML={typeof cell === 'string' ? { __html: cell } : undefined}>
              {typeof cell === 'string' ? null : cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Quickstart ─────────────────────────────────────────────────── */
Articles.quickstart = {
  toc: [
    { id: 'prereqs',    name: 'Prerequisites' },
    { id: 'install',    name: '1. Install' },
    { id: 'first-call', name: '2. First call' },
    { id: 'stream',     name: '3. Stream output' },
    { id: 'auth',       name: '4. Authentication' },
    { id: 'whats-next', name: 'What\'s next' },
  ],
  body: () => (
    <>
      <H1 id="top" kicker="Getting started · 5 min">From zero to <span className="it">accepted</span> in under five minutes.</H1>
      <P>
        ZeroCode runs as two distroless containers next to a Postgres instance. This page walks
        you from <code className="ic">docker compose up</code> to your first <code className="ic">"description": "Accepted"</code>.
        If you've used Judge0 before, the API shape will be immediately familiar.
      </P>

      <H2 id="prereqs">Prerequisites</H2>
      <P>You'll need a Linux host with kernel ≥ 5.14 (cgroup v2 unified hierarchy), Docker 24+, and 1 GB of free disk for the runner image. macOS works for development via the WASM tier — see <a href="#">Local dev on macOS</a>.</P>
      <Callout kind="info" title="kernel check">
        Quickly confirm your host: <code>mount | grep cgroup2</code> — you should see <code>cgroup on /sys/fs/cgroup type cgroup2</code>.
      </Callout>

      <H2 id="install">1. Install with docker compose</H2>
      <Code lang="bash" lines={[
        `<span class="com"># clone the repo</span>`,
        `<span class="pr">$</span> <span class="cmd">git clone</span> https://github.com/zerocode-rs/zerocode`,
        `<span class="pr">$</span> <span class="cmd">cd</span> zerocode`,
        null,
        `<span class="com"># generate a runtime config (writes .env)</span>`,
        `<span class="pr">$</span> <span class="cmd">cp</span> .env.example .env`,
        `<span class="pr">$</span> <span class="cmd">make</span> generate-keys`,
        null,
        `<span class="com"># start service + worker + postgres</span>`,
        `<span class="pr">$</span> <span class="cmd">docker compose</span> up <span class="flag">-d</span>`,
        null,
        `<span class="com"># verify ready</span>`,
        `<span class="pr">$</span> <span class="cmd">curl</span> localhost:8080/v1/health`,
        `<span class="out">{"status":"ok","worker":"zc-worker-1","ready":true}</span>`,
      ]} />
      <P>That's it. The runner image (<code className="ic">zerocode-runner:0.1.4</code>) is mounted read-only into the worker — toolchains live there, the worker only holds the controller binary.</P>

      <H2 id="first-call">2. Your first submission</H2>
      <P>Submit Python code with <code className="ic">language_id: 71</code>. Use <code className="ic">?wait=true</code> to block until the verdict is available — fine for short jobs, prefer streaming or polling for longer ones.</P>
      <Code lang="curl" lines={[
        `<span class="pr">$</span> <span class="cmd">curl</span> <span class="flag">-X POST</span> 'http://localhost:8080/v1/submissions?wait=true' \\`,
        `    <span class="flag">-H</span> <span class="str">'authorization: bearer $ZC_KEY'</span> \\`,
        `    <span class="flag">-H</span> <span class="str">'content-type: application/json'</span> \\`,
        `    <span class="flag">-d</span> <span class="str">'{"language_id":71,"source_code":"print(sum(range(100)))"}'</span>`,
        null,
        `<span class="punct">{</span>`,
        `  <span class="key">"token"</span><span class="punct">:</span> <span class="str">"7c8e..a31"</span><span class="punct">,</span>`,
        `  <span class="key">"status"</span><span class="punct">:</span> <span class="punct">{</span><span class="key">"id"</span><span class="punct">:</span><span class="num">3</span><span class="punct">,</span> <span class="key">"description"</span><span class="punct">:</span> <span class="str">"Accepted"</span><span class="punct">},</span>`,
        `  <span class="key">"stdout"</span><span class="punct">:</span> <span class="out">"4950\\n"</span><span class="punct">,</span>`,
        `  <span class="key">"stderr"</span><span class="punct">:</span> <span class="str">""</span><span class="punct">,</span>`,
        `  <span class="key">"time"</span><span class="punct">:</span> <span class="str">"0.018"</span><span class="punct">,</span>`,
        `  <span class="key">"memory"</span><span class="punct">:</span> <span class="num">3712</span>`,
        `<span class="punct">}</span>`,
      ]} />

      <H2 id="stream">3. Stream output in real time</H2>
      <P>For longer-running jobs, open an SSE stream against the token. The connection stays open until the runtime exits or the sandbox kills it.</P>
      <Code lang="curl" lines={[
        `<span class="pr">$</span> <span class="cmd">curl</span> <span class="flag">-N</span> http://localhost:8080/v1/submissions/7c8e..a31/stream`,
        null,
        `<span class="out">event: stdout</span>`,
        `<span class="out">data: 0</span>`,
        `<span class="out">event: stdout</span>`,
        `<span class="out">data: 1</span>`,
        `<span class="out">event: stdout</span>`,
        `<span class="out">data: 1</span>`,
        `<span class="key">...</span>`,
        `<span class="out">event: status</span>`,
        `<span class="out">data: {"description":"Accepted","time":"0.014","memory":3712}</span>`,
        `<span class="out">[DONE]</span>`,
      ]} />
      <Callout kind="success" title="tip">
        Most SSE clients reconnect on a dropped connection with the <code>Last-Event-ID</code> header — ZeroCode resumes from the last sequence number, you won't miss bytes.
      </Callout>

      <H2 id="auth">4. Authentication</H2>
      <P>All API calls require a bearer token. Generate one with the bundled CLI; keys are HMAC-signed and rotated independently from your worker keys.</P>
      <Code lang="bash" lines={[
        `<span class="pr">$</span> <span class="cmd">docker compose exec</span> service zerocode-admin keys create \\`,
        `    <span class="flag">--name</span> <span class="str">"jupyter-grader"</span> <span class="flag">--quota</span> 50rps`,
        null,
        `<span class="out">zc_live_4kj3..d92a</span>  <span class="com"># save this once, can't be retrieved</span>`,
      ]} />

      <H2 id="whats-next">What's next</H2>
      <P>You're past the hello-world. Three good next reads, depending on what you're building:</P>
      <Table cols={[
        { h: 'topic', w: '180px' },
        { h: 'what you\'ll learn' },
      ]} rows={[
        ['<a href="#" style="color:var(--accent)">Batch test cases</a>', 'Submit 1–100 stdin/stdout pairs against the same source. Ideal for graders.'],
        ['<a href="#" style="color:var(--accent)">gRPC transport</a>', 'Same state, lower overhead. Streaming verdicts as proto messages.'],
        ['<a href="#" style="color:var(--accent)">Sandbox tuning</a>', 'Custom cgroup limits, landlock policies, syscall allowlists.'],
        ['<a href="#" style="color:var(--accent)">Webhook callbacks</a>', 'Fire-and-forget submissions with HMAC-SHA256 signed delivery.'],
      ]} />
    </>
  )
};

/* ─── Security / Threat Model ────────────────────────────────────── */
Articles.security = {
  toc: [
    { id: 'model',     name: 'Threat model' },
    { id: 'layers',    name: '8 isolation layers' },
    { id: 'stride',    name: 'STRIDE breakdown' },
    { id: 'cves',      name: 'Judge0 CVE comparison' },
    { id: 'reporting', name: 'Reporting a vuln' },
  ],
  body: () => (
    <>
      <H1 kicker="Security · threat model" id="top">Assume the code is hostile. <span className="it">Design accordingly.</span></H1>
      <P>
        Every submission to ZeroCode runs as if it were written by an attacker. The threat model is
        not "the user might write a buggy program" — it's "the user is actively trying to escape
        the sandbox, exfiltrate data, or pivot to another tenant." Eight independent kernel
        mechanisms guard against this, and any one of them failing closed is enough to contain a breach.
      </P>

      <div style={{ margin: '32px 0 16px', padding: '24px', border: '1px solid var(--line)', borderRadius: '12px', background: 'linear-gradient(180deg, var(--bg-1), var(--bg))' }}>
        <LayerDiagram variant="detailed" />
        <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em', textAlign: 'center' }}>
          hover any layer to inspect its kernel call · the packet animates the path a submission takes
        </div>
      </div>

      <H2 id="model">What we defend against</H2>
      <Table cols={[
        { h: 'class',           w: '180px' },
        { h: 'example' },
        { h: 'defense',         w: '180px', kind: 'mono' },
      ]} rows={[
        ['Sandbox escape',          '<code class="ic">unshare(CLONE_NEWUSER)</code> + namespace-aware exploits', 'userns + seccomp'],
        ['Resource exhaustion',     'fork bomb, memory bomb, CPU peg',                                            'cgroup v2'],
        ['Filesystem access',       'reading <code class="ic">/etc/zerocode/keys</code> from a sandbox',          'pivot_root + landlock'],
        ['Privilege escalation',    'suid binary, capability inheritance',                                        'cap drop + NNP'],
        ['Side channels (cross-tenant)', 'Spectre v2, L1TF, MDS',                                                  'kpti + per-tenant cores'],
        ['Container escape',        '<code class="ic">runc</code> CVE-style descriptor leak',                     'runner read-only · creds-free'],
        ['Network exfiltration',    'callback to attacker C2',                                                    'NET namespace empty by default'],
      ]} />

      <H2 id="layers">The eight isolation layers</H2>
      <P>Each layer below is enforced by the Linux kernel — not by ZeroCode in userspace. We rely on well-audited kernel primitives, configured conservatively.</P>
      <Table cols={[
        { h: '#',          w: '40px',  kind: 'mono' },
        { h: 'mechanism',  w: '200px', kind: 'mono' },
        { h: 'what it stops' },
      ]} rows={[
        ['01', 'user namespace',  'uid 0 inside the box is an unprivileged uid outside. setuid binaries cannot grant real privilege.'],
        ['02', 'pid/net/ipc/uts/mnt', 'pid 1 is the runtime; no other processes, sockets, or message queues are visible.'],
        ['03', 'pivot_root',      'rootfs is the runner image, mounted read-only. The host filesystem does not exist in the box\'s view.'],
        ['04', 'landlock LSM',    'fs access is whitelisted at the kernel level. Even if seccomp lets a syscall through, landlock rejects the path.'],
        ['05', 'seccomp BPF',     '~310 syscalls denied. Only ~70 are reachable, including read/write/exit/futex.'],
        ['06', 'cgroup v2',       'memory, cpu, pids, io quotas. The kernel kills the box on overrun — not a userspace watchdog.'],
        ['07', 'capability drop', 'CAP_SYS_*, CAP_NET_ADMIN, CAP_SETUID, all gone. Bounding set is empty.'],
        ['08', 'NO_NEW_PRIVS',    'no execve() can ever raise privilege from this point. setuid is permanently neutered.'],
      ]} />

      <Callout kind="warn" title="defense in depth, not defense in width">
        Eight layers is not a marketing number — it's the minimum we believe is responsible. We assume each can be bypassed by a 0-day; the others have to still hold.
      </Callout>

      <H2 id="stride">STRIDE breakdown</H2>
      <P>Microsoft's STRIDE model maps cleanly onto our threats. We re-run this analysis every release.</P>
      <Table cols={[
        { h: 'category',  w: '180px', kind: 'mono' },
        { h: 'in scope' },
        { h: 'controls',  w: '180px', kind: 'mono' },
      ]} rows={[
        ['S — Spoofing',           'tenants impersonating each other',                       'HMAC-signed keys'],
        ['T — Tampering',          'mutating in-flight submissions',                          'TLS · sealed tokens'],
        ['R — Repudiation',        '"that wasn\'t my submission"',                            'audit log · token chain'],
        ['I — Info disclosure',    'reading neighbour tenant data',                          'userns · landlock'],
        ['D — Denial of service',  'fork bomb · pid exhaustion',                              'cgroup v2 · pids cap'],
        ['E — Elevation',          'escaping the sandbox',                                   '8 kernel layers'],
      ]} />

      <H2 id="cves">Judge0 CVE comparison</H2>
      <P>
        We monitor every published Judge0 CVE because the API surfaces overlap. ZeroCode does not currently share
        these primitives, but tracking them is part of our hygiene.
      </P>
      <Table cols={[
        { h: 'CVE',         w: '180px', kind: 'mono' },
        { h: 'class' },
        { h: 'zerocode',    w: '120px', kind: 'mono' },
      ]} rows={[
        ['CVE-2023-28599',  'Sandbox escape via isolate setup race',     '— not vulnerable'],
        ['CVE-2024-28185',  'Permission bypass via callback URLs',       '— not vulnerable'],
        ['CVE-2024-28189',  'Symlink traversal in submission path',      '— not vulnerable'],
      ]} />
      <Callout kind="success" title="0 known CVEs">
        ZeroCode has no published CVEs against the current 0.1 line. <a href="#">See the security advisories page</a> for the full audit trail.
      </Callout>

      <H2 id="reporting">Reporting a vulnerability</H2>
      <P>
        Email <code className="ic">security@zerocode.run</code> with a description and PoC. Our PGP key fingerprint is
        <code className="ic"> 4F2C 8B19 7D3E A52F 0B6E  9C81 5D04 7A33 1E8B 2F90</code>.
        We respond within 48 hours and credit reporters in the <a href="#">advisories</a> log unless asked otherwise.
      </P>
    </>
  )
};

/* ─── API reference ──────────────────────────────────────────────── */
Articles.api = {
  toc: [
    { id: 'rest',       name: 'REST endpoints' },
    { id: 'grpc',       name: 'gRPC service' },
    { id: 'auth',       name: 'Authentication' },
    { id: 'errors',     name: 'Error model' },
    { id: 'webhooks',   name: 'Webhook callbacks' },
  ],
  body: () => (
    <>
      <H1 kicker="API reference · OpenAPI 3.1" id="top">REST and gRPC, <span className="it">same state.</span></H1>
      <P>ZeroCode exposes both HTTP and gRPC interfaces against the same backing state machine. Every REST verb has a gRPC equivalent and vice versa. The OpenAPI 3.1 spec lives at <code className="ic">/v1/openapi.json</code> and the protobuf at <a href="#">zerocode.v2.proto</a>.</P>

      <H2 id="rest">REST endpoints</H2>

      <H3>Submissions</H3>
      <Endpoint method="POST" path="/v1/submissions" name="Create a submission"
        body="JSON body: language_id, source_code (or base64), stdin, expected_output, cpu_time_limit, memory_limit. Returns a token immediately, or the full result if ?wait=true." />
      <Endpoint method="POST" path="/v1/submissions/batch" name="Batch — up to 100 cases"
        body="Submit one source against many test cases. Returns a batch_id." />
      <Endpoint method="GET" path="/v1/submissions/{token}" name="Fetch result"
        body="Poll for verdict. Add &amp;fields= to project, &amp;base64_encoded=true for binary stdin/stdout." />
      <Endpoint method="GET" path="/v1/submissions/{token}/stream" name="SSE stream"
        body="Server-Sent Events stream of stdout, stderr, and status events. Closes on [DONE]." />

      <H3>Batches</H3>
      <Endpoint method="GET" path="/v1/batches/{batch_id}" name="Aggregated batch result"
        body="Returns per-case verdicts plus an aggregate (e.g. 'accepted: 7/10')." />

      <H3>Catalog</H3>
      <Endpoint method="GET" path="/v1/languages" name="List 41 languages"
        body="Returns [{id, name, version, is_compiled, default_limits}, ...]. Same IDs as Judge0." />

      <H3>Meta</H3>
      <Endpoint method="GET" path="/v1/openapi.json" name="OpenAPI 3.1 spec" />
      <Endpoint method="GET" path="/v1/health" name="Liveness probe" />
      <Endpoint method="GET" path="/v1/ready" name="Readiness probe" />
      <Endpoint method="GET" path="/v1/about" name="Build info, commit hash, kernel" />

      <H2 id="grpc">gRPC service</H2>
      <P>The protobuf service <code className="ic">zerocode.v2.ZeroCode</code> mirrors the REST surface with strong types. Streaming RPCs cover the SSE case.</P>
      <Code lang="proto" lines={[
        `<span class="kw">service</span> <span class="fn">ZeroCode</span> {`,
        `  <span class="kw">rpc</span> <span class="fn">Create</span>(<span class="key">SubmissionRequest</span>) <span class="kw">returns</span> (<span class="key">Submission</span>);`,
        `  <span class="kw">rpc</span> <span class="fn">CreateBatch</span>(<span class="key">BatchRequest</span>) <span class="kw">returns</span> (<span class="key">Batch</span>);`,
        `  <span class="kw">rpc</span> <span class="fn">Get</span>(<span class="key">GetSubmissionRequest</span>) <span class="kw">returns</span> (<span class="key">Submission</span>);`,
        `  <span class="kw">rpc</span> <span class="fn">Stream</span>(<span class="key">GetSubmissionRequest</span>) <span class="kw">returns</span> (<span class="kw">stream</span> <span class="key">StreamEvent</span>);`,
        `  <span class="kw">rpc</span> <span class="fn">ListLanguages</span>(<span class="key">Empty</span>) <span class="kw">returns</span> (<span class="key">LanguageList</span>);`,
        `  <span class="kw">rpc</span> <span class="fn">GetHealth</span>(<span class="key">Empty</span>) <span class="kw">returns</span> (<span class="key">Health</span>);`,
        `}`,
      ]} />

      <H2 id="auth">Authentication</H2>
      <P>Bearer token in <code className="ic">Authorization</code>. Keys are scoped to a workspace and can have per-key rate quotas. Anonymous calls are rejected at the edge.</P>
      <Code lang="http" lines={[
        `<span class="pr">POST</span> <span class="cmd">/v1/submissions</span> HTTP/2`,
        `<span class="key">authorization:</span> <span class="str">bearer zc_live_4kj3..d92a</span>`,
        `<span class="key">content-type:</span> <span class="str">application/json</span>`,
      ]} />

      <H2 id="errors">Error model</H2>
      <P>All errors are JSON with a stable <code className="ic">code</code> field. HTTP status mirrors the class.</P>
      <Code lang="json" lines={[
        `<span class="punct">{</span>`,
        `  <span class="key">"code"</span><span class="punct">:</span> <span class="str">"language_not_found"</span><span class="punct">,</span>`,
        `  <span class="key">"http_status"</span><span class="punct">:</span> <span class="num">404</span><span class="punct">,</span>`,
        `  <span class="key">"message"</span><span class="punct">:</span> <span class="str">"language_id=9999 is not in the catalog"</span><span class="punct">,</span>`,
        `  <span class="key">"trace_id"</span><span class="punct">:</span> <span class="str">"01J7..XQF"</span>`,
        `<span class="punct">}</span>`,
      ]} />

      <H2 id="webhooks">Webhook callbacks</H2>
      <P>Pass <code className="ic">callback_url</code> on creation. We POST the verdict with an HMAC-SHA256 signature in <code className="ic">X-ZeroCode-Signature</code> using your workspace's signing secret.</P>
    </>
  )
};

/* ─── Catalog (languages table) ──────────────────────────────────── */
Articles.languages = {
  toc: [{ id: 'core',  name: 'Core 7' }, { id: 'extended', name: 'Extended catalog' }],
  body: () => (
    <>
      <H1 kicker="Language catalog · 41 runtimes" id="top">Forty-one runtimes, <span className="it">on a renovate cadence.</span></H1>
      <P>Toolchain versions are pinned in <code className="ic">zerocode-runner</code> and rebuilt nightly. Language IDs match Judge0's catalog where possible to ease migration.</P>

      <H2 id="core">Core 7 — first-class</H2>
      <P>Benchmarked, hot-path tested, and supported with priority. If you're starting fresh, pick one of these.</P>
      <Table cols={[
        { h: 'id',          w: '60px',  kind: 'mono' },
        { h: 'language' },
        { h: 'version',     w: '140px', kind: 'mono' },
        { h: 'type',        w: '120px' },
        { h: 'limit defaults', w: '160px', kind: 'mono' },
      ]} rows={[
        ['71', 'Python',     '3.12.4',   'interpreted', '256MB · 5s · 64pid'],
        ['93', 'JavaScript', 'node 22',  'interpreted', '256MB · 5s · 64pid'],
        ['73', 'Rust',       '1.85.0',   'compiled',    '256MB · 5s · 64pid'],
        ['95', 'Go',         '1.23.4',   'compiled',    '256MB · 5s · 64pid'],
        ['50', 'C',          'gcc 14',   'compiled',    '128MB · 5s · 64pid'],
        ['54', 'C++',        'gcc 14',   'compiled',    '256MB · 5s · 64pid'],
        ['91', 'Java',       'jdk 21',   'jvm',         '512MB · 8s · 64pid'],
      ]} />

      <H2 id="extended">Extended catalog</H2>
      <P>Available, tested at build time, no SLA on patch latency. Open a GitHub issue if a language you need isn't listed.</P>
      <Table cols={[
        { h: 'id',       w: '60px',  kind: 'mono' },
        { h: 'language' },
        { h: 'version',  w: '160px', kind: 'mono' },
      ]} rows={[
        ['101', 'TypeScript',  '5.6.3'],
        ['46',  'Bash',        '5.2'],
        ['72',  'Ruby',        '3.3.4'],
        ['68',  'PHP',         '8.3.10'],
        ['78',  'Kotlin',      '2.0.20'],
        ['83',  'Swift',       '5.10'],
        ['81',  'Scala',       '3.5.0'],
        ['57',  'Elixir',      '1.17.2'],
        ['58',  'Erlang/OTP',  '27.0'],
        ['61',  'Haskell',     'ghc 9.10'],
        ['65',  'OCaml',       '5.2.0'],
        ['86',  'Clojure',     '1.12'],
        ['85',  'Perl',        '5.40'],
        ['64',  'Lua',         '5.4.7'],
        ['80',  'R',           '4.4.1'],
        ['87',  'Julia',       '1.10.4'],
        ['51',  'C#',          '.NET 8'],
        ['82',  'F#',          '8.0'],
        ['90',  'Dart',        '3.5.0'],
        ['88',  'Crystal',     '1.14'],
        ['96',  'Nim',         '2.2.0'],
        ['97',  'Zig',         '0.13.0'],
        ['56',  'D',           'dmd 2.110'],
        ['67',  'Pascal',      'fpc 3.2'],
        ['59',  'Fortran',     'gfortran 14'],
        ['77',  'COBOL',       'gnucobol 3.2'],
        ['69',  'Prolog',      'swi 9.2'],
        ['55',  'Common Lisp', 'sbcl 2.4'],
        ['89',  'Scheme',      'chez 10'],
        ['92',  'Racket',      '8.14'],
        ['70',  'Groovy',      '4.0.23'],
        ['99',  'V',           '0.4.8'],
        ['48',  'AWK',         'gawk 5.3'],
        ['49',  'NASM',        '2.16'],
      ]} />
    </>
  )
};

/* ─── Stub pages ──────────────────────────────────────────────────── */
function renderInlineHtml(s) {
  if (typeof s !== 'string') return s;
  const parts = s.split(/<span class="it">(.*?)<\/span>/g);
  return parts.map((p, i) => i % 2 === 0 ? p : <span className="it" key={i}>{p}</span>);
}

function StubArticle({ kicker, title, sub, sections }) {
  return (
    <>
      <H1 kicker={kicker} id="top">{renderInlineHtml(title)}</H1>
      <P>{sub}</P>
      {sections.map((s, i) => (
        <React.Fragment key={i}>
          <H2 id={s.id}>{renderInlineHtml(s.h)}</H2>
          <P>{s.p}</P>
        </React.Fragment>
      ))}
    </>
  );
}

/* ─── Architecture ───────────────────────────────────────────────── */
Articles.architecture = {
  toc: [
    { id: 'overview',    name: 'System overview' },
    { id: 'crates',      name: 'Crate map' },
    { id: 'lifecycle',   name: 'Submission lifecycle' },
    { id: 'sandbox',     name: 'Sandbox execution model' },
    { id: 'performance', name: 'Performance' },
    { id: 'images',      name: 'Two container images' },
  ],
  body: () => (
    <>
      <H1 id="top" kicker="Architecture">Two binaries. <span className="it">One Postgres.</span></H1>
      <P>
        ZeroCode is intentionally simple. A service binary speaks REST + gRPC; a worker binary
        drives the sandbox; Postgres is both the metadata store <em>and</em> the queue. No Redis,
        no broker, no orchestrator. Workers wake on <code className="ic">LISTEN/NOTIFY</code> within
        ~5 ms of an insert.
      </P>

      <H2 id="overview">System overview</H2>
      <P>Two named Postgres channels carry every signal between the API and the worker pool.</P>
      <Table cols={[{ h: 'channel', w: '260px' }, { h: 'direction', w: '140px' }, { h: 'purpose' }]} rows={[
        ['<code>zerocode.jobs</code>',              'API → workers',  'fires on every submission INSERT; payload is the token; workers LISTEN here for sub-5 ms wake.'],
        ['<code>zerocode.events.&lt;token&gt;</code>', 'worker → API', 'per-submission lifecycle: <code>Processing</code>, <code>StdoutChunk</code>, <code>StderrChunk</code>, <code>Finished</code>. The API subscribes for SSE streams and <code>?wait=true</code> long-polls.'],
      ]} />
      <Callout kind="info" title="resilience">
        Both sides keep a <b>2-second poll fallback</b> if the LISTEN connection drops. Correctness wins
        over latency under network partitions.
      </Callout>

      <H2 id="crates">Crate map</H2>
      <P>The workspace (root <code className="ic">Cargo.toml</code>, resolver v2) contains seven crates.</P>
      <Table cols={[{ h: 'crate', w: '180px' }, { h: 'purpose' }]} rows={[
        ['<code>zerocode-core</code>',    'Shared domain types and validation. No I/O, no async. Leaf crate; everything else depends on it.'],
        ['<code>zerocode-sandbox</code>', 'Isolation backends behind the <code>Sandbox</code> trait. <code>NativeSandbox</code> (production) uses fork + namespaces + cgroup v2 + landlock + seccomp.'],
        ['<code>zerocode-cache</code>',   'Two-tier cache. moka LRU (10k entries, 5 min TTL) for results; Postgres-backed compile-artifact cache.'],
        ['<code>zerocode-stream</code>',  'Postgres LISTEN/NOTIFY abstraction. <code>JobNotifier</code> (API → workers) and per-token <code>EventStream</code> (worker → API).'],
        ['<code>zerocode-migrate</code>', 'One-shot sqlx migration runner. Ships in the service image.'],
        ['<code>zerocode-api</code>',     'axum + tonic HTTP/gRPC server. Bearer auth, rate limiting, submissions CRUD, SSE streaming, health/readiness, OpenAPI 3.1.'],
        ['<code>zerocode-worker</code>',  'Long-running runner loop. LISTEN → claim (SKIP LOCKED) → sandbox::execute → write_result → publish_event → webhook delivery.'],
      ]} />

      <H2 id="lifecycle">Submission lifecycle</H2>
      <P>An end-to-end happy path, in order:</P>
      <Code lang="lifecycle" lines={[
        `<span class="key">1.</span>  <span class="cmd">POST</span> /v1/submissions  → validate · resolve language · merge limits`,
        `<span class="key">2.</span>  <span class="cmd">CacheKey::result</span>(blake3 of lang + source + stdin + limits)`,
        `<span class="key">3.</span>  <span class="cm">moka hit?</span>                → return cached row · <b>no queue touch</b>`,
        `<span class="key">4.</span>  <span class="cm">miss:</span> INSERT row · pg_notify('zerocode.jobs', token)`,
        `<span class="key">5.</span>  worker LISTENs · claim_next() <span class="cm">[SELECT FOR UPDATE SKIP LOCKED]</span>`,
        `<span class="key">6.</span>  Sandbox::execute  → cgroup · scratch · fork · 8-layer setup · execvpe`,
        `<span class="key">7.</span>  write_result · publish_event('zerocode.events.&lt;token&gt;', Finished)`,
        `<span class="key">8.</span>  SSE subscriber / ?wait=true long-poll receives the verdict`,
        `<span class="key">9.</span>  if callback_url: POST with HMAC-SHA256 signature, retry 1/5/30 s`,
      ]} />
      <Callout kind="info" title="?wait=true">
        Synchronous-style API. The handler opens a <code>LISTEN</code> on the token's channel and
        blocks up to <code>WAIT_TIMEOUT</code> (30 s). 200 ms DB poll fallback if LISTEN can't connect.
      </Callout>

      <H2 id="sandbox">Sandbox execution model</H2>
      <P>
        The native sandbox uses raw Linux syscalls via <code className="ic">nix</code> — not an OCI
        runtime. A two-pipe handshake synchronises parent and child so the child cannot proceed past
        <code className="ic"> unshare</code> until the parent has written the UID/GID map and attached
        it to the cgroup.
      </P>
      <Code lang="parent ↔ child handshake" lines={[
        `<span class="key">PARENT</span>                              <span class="key">CHILD</span>`,
        `  close write ends of pipes              close read ends of pipes`,
        `  read(ready_pipe) <span class="cm">&lt;-- block --</span>      unshare(PID|NS|IPC|UTS|NET|USER)`,
        `                                          write(ready_pipe, "1")`,
        `  userns::write_maps(child_pid)           read(start_pipe) <span class="cm">&lt;-- block --</span>`,
        `  cgroup.attach(child_pid)`,
        `  write(start_pipe, "1") <span class="cm">--&gt;</span>           mounts::pivot_into_runner()`,
        `                                          drop ALL capabilities (5 capsets)`,
        `                                          prctl(PR_SET_NO_NEW_PRIVS)`,
        `                                          landlock::apply(/box RW, /usr RO, ...)`,
        `                                          seccomp::apply_default()`,
        `                                          execvpe(run_cmd)`,
      ]} />
      <P>
        Compiled languages (C, C++, Go, Java, Rust) fork a sub-child for the compile step. Sentinel
        exit code <code className="ic">253</code> signals compile failure; the worker's triage maps
        it to <code className="ic">Status::CompileError</code> and routes the compile stderr to
        <code className="ic"> compile_output</code>.
      </P>

      <H2 id="performance">Performance</H2>
      <Table cols={[{ h: 'mechanism', w: '220px' }, { h: 'gain' }]} rows={[
        ['Result cache (moka LRU)',     '10k entries / 5 min TTL · identical submissions return instantly without entering the queue.'],
        ['Compile-artifact cache',      'Postgres-backed, keyed on (language_id, source_code) · skips the compile sub-fork.'],
        ['LISTEN/NOTIFY dispatch',      'Sub-5 ms worker wake on insert · 2-second poll fallback only on dropped LISTEN.'],
        ['HTTP/2 + h2c',                'Auto-negotiated end-to-end · gRPC shares the same axum state.'],
        ['SSE streaming endpoint',      'Per-token <code>PgListener</code> · publishes <code>StdoutChunk</code>/<code>StderrChunk</code>/<code>Finished</code> as they happen.'],
      ]} />

      <H2 id="images">Two container images, plus a runner rootfs</H2>
      <P>The image split is a security boundary, not just packaging. An escape lands in a credential-less, code-less environment.</P>
      <Table cols={[{ h: 'image', w: '200px' }, { h: 'base', w: '160px' }, { h: 'contents' }]} rows={[
        ['<code>zerocode-service</code>', '<code>distroless/static</code>', 'Statically linked (musl) <code>zerocode-api</code> + <code>zerocode-migrate</code>. No shell, libc, toolchains. Runs as <code>nonroot</code>.'],
        ['<code>zerocode-worker</code>',  '<code>debian:trixie-slim</code>', 'Dynamically linked <code>zerocode-worker</code> + <code>iproute2</code> (loopback bring-up). Runs as <code>zerocode</code> (UID 10001).'],
        ['<code>zerocode-runner</code>',  '<code>debian:trixie-slim</code>', '41 language toolchains. <b>Not run as a container.</b> Worker bind-mounts an extracted copy as read-only rootfs and <code>pivot_root</code>s every submission into it.'],
      ]} />
    </>
  ),
};

/* ─── Deployment ─────────────────────────────────────────────────── */
Articles.deployment = {
  toc: [
    { id: 'host',     name: 'Host requirements' },
    { id: 'envs',     name: 'Environment variables' },
    { id: 'compose',  name: 'Docker compose quickstart' },
    { id: 'rootfs',   name: 'Runner rootfs setup' },
    { id: 'tls',      name: 'TLS termination' },
    { id: 'cgroup',   name: 'Cgroup delegation' },
    { id: 'troubleshoot', name: 'Troubleshooting' },
  ],
  body: () => (
    <>
      <H1 id="top" kicker="Deployment">Two distroless images, <span className="it">and a Postgres.</span></H1>
      <P>Single host with docker compose, multi-node with Helm (beta). Production checklists below; every variable, every kernel feature, every failure mode you're likely to hit.</P>

      <H2 id="host">Host requirements</H2>
      <P>Workers create Linux user-namespace sandboxes with cgroup-based resource limits. The kernel must satisfy <b>all</b> of the following.</P>
      <Table cols={[{ h: 'requirement', w: '240px' }, { h: 'check' }]} rows={[
        ['kernel ≥ 5.14',           '<code>uname -r</code> · needs <code>cgroup.kill</code> (5.14) + Landlock LSM (5.13+).'],
        ['cgroup v2 unified',       '<code>mount | grep cgroup2</code> · <code>stat /sys/fs/cgroup/cgroup.controllers</code>.'],
        ['unprivileged userns',     '<code>sysctl kernel.unprivileged_userns_clone</code> must be <code>1</code>.'],
        ['delegated cgroup subtree', 'Worker user must own a subtree with <code>cpu memory pids</code> delegated.'],
      ]} />
      <Callout kind="warn" title="boot-time preflight">
        The worker runs <code>kernel_check::preflight</code> at startup and exits immediately if any
        feature is missing — with a precise error message naming the missing capability.
      </Callout>

      <H2 id="envs">Environment variables</H2>
      <H3 id="env-api">API server</H3>
      <Table cols={[{ h: 'variable', w: '260px', kind: 'mono' }, { h: 'required', w: '90px' }, { h: 'default', w: '180px', kind: 'mono' }, { h: 'description' }]} rows={[
        ['DATABASE_URL',              'yes', '—',                          'Postgres connection string.'],
        ['ZEROCODE_API_BIND',         'no',  '0.0.0.0:8080',               'Socket the API listens on.'],
        ['ZEROCODE_API_KEY',          'yes', '—',                          'Static Bearer token. Clients send <code>Authorization: Bearer &lt;key&gt;</code>.'],
        ['ZEROCODE_GRPC_BIND',        'no',  '0.0.0.0:9091',               'gRPC listen address. Set to <code>off</code> to disable.'],
        ['ZEROCODE_LANGUAGES_FILE',   'no',  'runners/languages.toml',     'Path to the language registry TOML file.'],
        ['OTEL_EXPORTER_OTLP_ENDPOINT', 'no', '—',                         'Optional. When set, traces are exported via OTLP/gRPC.'],
        ['RUST_LOG',                  'no',  'info,zerocode=debug',        'tracing / env_filter directive.'],
      ]} />
      <H3 id="env-worker">Worker</H3>
      <Table cols={[{ h: 'variable', w: '260px', kind: 'mono' }, { h: 'required', w: '90px' }, { h: 'default', w: '180px', kind: 'mono' }, { h: 'description' }]} rows={[
        ['DATABASE_URL',                'yes', '—',                          'Same string as the API.'],
        ['ZEROCODE_WORKER_ID',          'no',  '<code>worker-&lt;ulid&gt;</code>', 'Stable identifier for sweeper attribution. Set explicitly for multi-worker setups.'],
        ['ZEROCODE_MAX_PARALLEL',       'no',  'num_cpus',                   'Max concurrent sandboxed executions.'],
        ['ZEROCODE_WEBHOOK_SECRET',     'no',  '<em>empty</em>',             'HMAC-SHA256 secret for outbound webhooks. Leave empty only in dev.'],
        ['ZEROCODE_RUNNER_ROOTFS',      'yes (in practice)', '—',            'Path to the extracted runner filesystem. Typically <code>/var/lib/zerocode/runner-rootfs</code>.'],
      ]} />

      <H2 id="compose">Docker compose quickstart</H2>
      <P>The repository ships <code className="ic">deploy/docker-compose.yml</code> with five services: <code className="ic">postgres</code>, <code className="ic">migrate</code>, <code className="ic">runner-rootfs-init</code>, <code className="ic">api</code>, <code className="ic">worker</code>.</P>
      <Code lang="bash" lines={[
        `<span class="com"># build the three images</span>`,
        `<span class="pr">$</span> <span class="cmd">docker build</span> <span class="flag">-f</span> runners/Dockerfile <span class="flag">-t</span> zerocode-runner:dev runners/`,
        `<span class="pr">$</span> <span class="cmd">docker build</span> <span class="flag">-f</span> deploy/Dockerfile.service <span class="flag">-t</span> zerocode-service:dev .`,
        `<span class="pr">$</span> <span class="cmd">docker build</span> <span class="flag">-f</span> deploy/Dockerfile.worker <span class="flag">-t</span> zerocode-worker:dev .`,
        null,
        `<span class="com"># start the stack</span>`,
        `<span class="pr">$</span> <span class="cmd">cd</span> deploy/`,
        `<span class="pr">$</span> <span class="cmd">docker compose</span> up <span class="flag">-d</span>`,
        null,
        `<span class="com"># smoke-test</span>`,
        `<span class="pr">$</span> <span class="cmd">curl</span> <span class="flag">-H</span> <span class="str">"authorization: bearer dev-only-replace-me"</span> \\`,
        `       localhost:8080/v1/languages | head`,
      ]} />

      <H2 id="rootfs">Runner rootfs setup</H2>
      <P>
        The worker uses <code className="ic">pivot_root</code> to place each submission inside a
        read-only copy of the runner filesystem. The <code className="ic">runner-rootfs-init</code>
        service handles this in Compose; for bare-metal you extract it manually.
      </P>
      <Code lang="bash" lines={[
        `<span class="com"># manual extraction (no compose)</span>`,
        `<span class="pr">$</span> <span class="cmd">cid</span>=$(docker create zerocode-runner:dev /bin/true)`,
        `<span class="pr">$</span> <span class="cmd">sudo mkdir</span> <span class="flag">-p</span> /var/lib/zerocode/runner-rootfs`,
        `<span class="pr">$</span> <span class="cmd">docker export</span> "$cid" | <span class="cmd">sudo tar</span> <span class="flag">-xf</span> <span class="flag">-</span> <span class="flag">-C</span> /var/lib/zerocode/runner-rootfs`,
        `<span class="pr">$</span> <span class="cmd">docker rm</span> "$cid"`,
        `<span class="pr">$</span> <span class="cmd">export</span> ZEROCODE_RUNNER_ROOTFS=/var/lib/zerocode/runner-rootfs`,
      ]} />
      <Callout kind="info" title="rebuilds">
        Re-run <code>docker compose run --rm runner-rootfs-init</code> after every runner-image
        rebuild — the extracted volume isn't auto-refreshed.
      </Callout>

      <H2 id="tls">TLS termination</H2>
      <P>The API server listens on plain HTTP only. Put a reverse proxy in front. Caddy is the lowest-friction option; nginx and Traefik configs in the repo work too.</P>
      <Code lang="Caddyfile" lines={[
        `zerocode.example.com {`,
        `    reverse_proxy localhost:8080`,
        `}`,
      ]} />

      <H2 id="cgroup">Cgroup delegation</H2>
      <P>The worker creates a child cgroup per execution to enforce memory, CPU, and PID limits. It must own a subtree with the required controllers delegated.</P>
      <Code lang="systemd /etc/systemd/system/zerocode-worker.service" lines={[
        `[Service]`,
        `Type=exec`,
        `User=zerocode`,
        `ExecStart=/usr/local/bin/zerocode-worker`,
        `<b>Delegate=cpu memory pids</b>`,
        `EnvironmentFile=/etc/zerocode/worker.env`,
        `NoNewPrivileges=true`,
        `ProtectSystem=strict`,
        `ReadWritePaths=/sys/fs/cgroup`,
        `ReadOnlyPaths=/var/lib/zerocode/runner-rootfs`,
      ]} />
      <Callout kind="info" title="compose">
        The provided <code>deploy/docker-compose.yml</code> sets <code>cgroup: private</code> and
        <code> cap_add: [SYS_ADMIN]</code> on the worker — both required for <code>unshare</code>,
        <code> mount</code>, and <code>pivot_root</code> inside the sandbox's user namespace.
      </Callout>

      <H2 id="troubleshoot">Troubleshooting</H2>
      <Table cols={[{ h: 'symptom', w: '240px' }, { h: 'fix' }]} rows={[
        ['<code>cgroup v2 not detected</code>',                'Boot with <code>systemd.unified_cgroup_hierarchy=1</code> or use Ubuntu 22.04+ / Fedora 31+ / Debian 12+.'],
        ['<code>cgroup.kill not writable</code>',               'Kernel ≥ 5.14 required.'],
        ['<code>landlock not available</code>',                 '<code>CONFIG_SECURITY_LANDLOCK=y</code> in kernel config.'],
        ['<code>user namespaces disabled</code>',               '<code>sudo sysctl -w kernel.unprivileged_userns_clone=1</code>, persist in <code>/etc/sysctl.d/</code>.'],
        ['<code>runner rootfs not found</code>',                'Verify <code>ZEROCODE_RUNNER_ROOTFS</code>. Re-run <code>runner-rootfs-init</code>.'],
        ['<code>cgroup setup failed: permission denied</code>', 'Add <code>Delegate=cpu memory pids</code> in systemd, or <code>chown</code> the subtree to the worker user.'],
        ['rows stuck in <code>processing</code>',               'The sweeper auto-recovers after <code>2× wall_time + 60 s</code>. Inspect with <code>SELECT … FROM submissions WHERE status=\'processing\'</code>.'],
      ]} />
    </>
  ),
};

/* ─── gRPC reference (auto-mirrored from zerocode.proto) ─────────── */
Articles.grpc = {
  toc: [
    { id: 'service',  name: 'Service surface' },
    { id: 'messages', name: 'Message types' },
    { id: 'auth',     name: 'Auth · metadata' },
    { id: 'examples', name: 'Examples · grpcurl' },
  ],
  body: () => (
    <>
      <H1 id="top" kicker="gRPC API · zerocode.v2">Binary protocol, <span className="it">same state machine.</span></H1>
      <P>
        The gRPC surface mirrors REST and shares the same <code className="ic">AppState</code> — idempotency
        cache, result cache, and rate-limit buckets stay consistent across protocols. The proto lives at
        <code className="ic"> crates/zerocode-api/proto/zerocode.proto</code> and is auto-compiled by
        <code className="ic"> tonic-build</code> at server build time. Reflection is wired in, so
        clients can introspect without shipping the <code className="ic">.proto</code>.
      </P>

      <H2 id="service">Service surface</H2>
      <P>Bind: <code className="ic">ZEROCODE_GRPC_BIND</code> (default <code className="ic">0.0.0.0:9091</code>). Set to <code className="ic">off</code> to disable.</P>
      <Endpoint method="POST" path="zerocode.v2.ZeroCode/CreateSubmission" name="submit code"
        body={<>Unary. Returns immediately with a token. No <code>wait=true</code> on gRPC — poll <code>GetSubmission</code> or use the REST SSE stream.</>} />
      <Endpoint method="GET"  path="zerocode.v2.ZeroCode/GetSubmission" name="fetch result"
        body={<>Unary. Returns the full <code>SubmissionView</code>.</>} />
      <Endpoint method="GET"  path="zerocode.v2.ZeroCode/ListLanguages" name="catalog"
        body={<>Unary. Returns all 41 languages with id, version, source_file, is_compiled, is_archived.</>} />
      <Endpoint method="GET"  path="zerocode.v2.ZeroCode/GetHealth" name="liveness · readiness"
        body={<>Unary. <code>status</code>, <code>ready</code>, and current <code>queue_depth</code> — usable as a traffic-gating signal.</>} />
      <Callout kind="info" title="streaming RPCs">
        Deferred — REST SSE already covers live output. The proto stays unary today so the wire shape
        is stable across both transports.
      </Callout>

      <H2 id="messages">Message types</H2>
      <Code lang="proto3 · CreateSubmissionRequest" lines={[
        `<span class="kw">message</span> <span class="fn">CreateSubmissionRequest</span> {`,
        `  <span class="ty">uint32</span> language_id     = 1;`,
        `  <span class="ty">bytes</span>  source_code     = 2;  <span class="cm">// raw bytes; no base64 needed on the wire</span>`,
        `  <span class="ty">bytes</span>  stdin           = 3;`,
        `  <span class="ty">double</span> cpu_time_limit  = 4;`,
        `  <span class="ty">double</span> wall_time_limit = 5;`,
        `  <span class="ty">uint32</span> memory_limit_mb = 6;`,
        `  <span class="ty">string</span> callback_url    = 7;`,
        `  <span class="ty">string</span> idempotency_key = 8;`,
        `}`,
      ]} />
      <Code lang="proto3 · SubmissionView" lines={[
        `<span class="kw">message</span> <span class="fn">SubmissionView</span> {`,
        `  <span class="ty">string</span> token       = 1;`,
        `  <span class="ty">uint32</span> language_id = 2;`,
        `  <span class="ty">string</span> status      = 3;            <span class="cm">// e.g. "accepted", "time_limit_exceeded"</span>`,
        `  <span class="ty">string</span> status_detail_json = 4;     <span class="cm">// free-form detail (wall vs cpu, etc.)</span>`,
        `  <span class="fn">ResourceLimits</span> limits = 5;`,
        `  <span class="ty">bytes</span>  stdout         = 6;`,
        `  <span class="ty">bytes</span>  stderr         = 7;`,
        `  <span class="ty">bytes</span>  compile_output = 8;`,
        `  <span class="ty">int32</span>  exit_code      = 9;          <span class="cm">// negative = absent (proto3 quirk)</span>`,
        `  <span class="ty">string</span> signal_name    = 10;`,
        `  <span class="ty">double</span> cpu_time       = 11;`,
        `  <span class="ty">double</span> wall_time      = 12;`,
        `  <span class="ty">uint32</span> memory         = 13;         <span class="cm">// KB</span>`,
        `  <span class="ty">string</span> created_at     = 14;         <span class="cm">// RFC3339 UTC</span>`,
        `  <span class="ty">string</span> finished_at    = 15;`,
        `}`,
      ]} />

      <H2 id="auth">Auth · metadata</H2>
      <P>Bearer key goes on the gRPC <code className="ic">authorization</code> metadata header — same constant-time comparison as REST.</P>
      <Code lang="grpcurl" lines={[
        `<span class="pr">$</span> <span class="cmd">grpcurl</span> <span class="flag">-H</span> <span class="str">'authorization: bearer $ZC_KEY'</span> \\`,
        `         <span class="flag">-plaintext</span> localhost:9091 \\`,
        `         zerocode.v2.ZeroCode/GetHealth`,
      ]} />

      <H2 id="examples">Examples · <code className="ic">grpcurl</code></H2>
      <P>Reflection lets clients work without the <code className="ic">.proto</code>:</P>
      <Code lang="grpcurl" lines={[
        `<span class="com"># enumerate the surface</span>`,
        `<span class="pr">$</span> <span class="cmd">grpcurl</span> <span class="flag">-plaintext</span> localhost:9091 list`,
        `<span class="out">grpc.reflection.v1.ServerReflection</span>`,
        `<span class="out">zerocode.v2.ZeroCode</span>`,
        null,
        `<span class="com"># describe a message</span>`,
        `<span class="pr">$</span> <span class="cmd">grpcurl</span> <span class="flag">-plaintext</span> localhost:9091 describe zerocode.v2.SubmissionView`,
        null,
        `<span class="com"># submit + fetch</span>`,
        `<span class="pr">$</span> <span class="cmd">grpcurl</span> <span class="flag">-H</span> <span class="str">'authorization: bearer $ZC_KEY'</span> <span class="flag">-plaintext</span> \\`,
        `         <span class="flag">-d</span> <span class="str">'{"language_id":71,"source_code":"cHJpbnQoMisyKQ=="}'</span> \\`,
        `         localhost:9091 zerocode.v2.ZeroCode/CreateSubmission`,
      ]} />
    </>
  ),
};

/* ─── Observability ──────────────────────────────────────────────── */
Articles.observability = {
  toc: [
    { id: 'metrics',     name: 'Prometheus metrics' },
    { id: 'tracing',     name: 'OTLP tracing' },
    { id: 'logging',     name: 'Structured logs' },
    { id: 'dashboards',  name: 'Dashboards' },
  ],
  body: () => (
    <>
      <H1 id="top" kicker="Observability">Three signals, <span className="it">one collector.</span></H1>
      <P>Prometheus on <code className="ic">/metrics</code>, OTLP for traces over gRPC, JSON lines on stdout. Defaults that work; turn knobs only when you need to.</P>

      <H2 id="metrics">Prometheus metrics</H2>
      <P>API exposes <code className="ic">/metrics</code> on its main port. The worker exposes <code className="ic">/metrics</code> on port 9090 (configurable). Both include process collectors (CPU, RSS, FDs) via <code className="ic">metrics-process</code>.</P>
      <Table cols={[{ h: 'series', w: '320px', kind: 'mono' }, { h: 'kind', w: '90px' }, { h: 'meaning' }]} rows={[
        ['zerocode_submissions_total',          'counter',   'Submissions accepted at the API edge.'],
        ['zerocode_verdicts_total{verdict=...}', 'counter',   'Terminal verdicts: <code>accepted</code> / <code>tle</code> / <code>mle</code> / <code>re</code> / <code>ce</code> / <code>se</code>.'],
        ['zerocode_cache_hits_total',           'counter',   'Result-cache hits (moka).'],
        ['zerocode_cache_misses_total',         'counter',   'Result-cache misses.'],
        ['zerocode_webhook_attempts_total',     'counter',   'Webhook delivery attempts (per retry).'],
        ['zerocode_pending_jobs',               'gauge',     'Sampled every 5 s from <code>SELECT count(*) WHERE status=\'queued\'</code> — feed this to HPA/KEDA.'],
        ['zerocode_active_sandboxes',           'gauge',     'In-flight sandbox executions on this worker.'],
        ['zerocode_worker_parallelism',         'gauge',     'Configured <code>Semaphore</code> permits.'],
      ]} />

      <H2 id="tracing">OTLP tracing</H2>
      <P>Enable by setting <code className="ic">OTEL_EXPORTER_OTLP_ENDPOINT</code>. Both binaries install a batch span exporter over tonic/gRPC. W3C TraceContext propagation is registered, so HTTP spans flow through the existing <code className="ic">TraceLayer</code> automatically.</P>
      <Code lang="bash" lines={[
        `<span class="com"># dev: ship traces to the Jaeger all-in-one in compose</span>`,
        `<span class="pr">$</span> <span class="cmd">export</span> OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317`,
        `<span class="pr">$</span> <span class="cmd">docker compose</span> <span class="flag">-f</span> deploy/docker-compose.yml \\`,
        `       <span class="flag">-f</span> deploy/docker-compose.dev.yml up <span class="flag">-d</span>`,
        null,
        `<span class="com"># UI</span>`,
        `<span class="pr">$</span> <span class="cmd">open</span> http://localhost:16686`,
      ]} />
      <P>Interesting spans on the request path: <code className="ic">http.request</code>, <code className="ic">grpc.request</code>, <code className="ic">db.notify</code>, <code className="ic">sandbox.setup</code>, <code className="ic">sandbox.exec</code>, <code className="ic">cache.lookup</code>.</P>

      <H2 id="logging">Structured logs</H2>
      <P>JSON lines on stdout — every log line carries <code className="ic">trace_id</code> and (where applicable) <code className="ic">submission_token</code>. Source/stdin/stdout are <em>not</em> logged at INFO level; lift the filter to DEBUG with care.</P>
      <Code lang="bash" lines={[
        `<span class="pr">$</span> <span class="cmd">export</span> RUST_LOG=info,zerocode=debug,sqlx=warn`,
        `<span class="pr">$</span> <span class="cmd">docker compose</span> logs <span class="flag">-f</span> api worker | jq`,
      ]} />

      <H2 id="dashboards">Dashboards</H2>
      <P>A starter Grafana dashboard ships under <code className="ic">deploy/grafana/dashboards/zerocode.json</code>. Panels: dispatch latency p50/p95/p99, verdict mix, pending-jobs gauge with workers overlay, webhook success rate, cache hit ratio. Import it with <code className="ic">grafana-cli admin import-dashboard</code> or paste into a stock Grafana.</P>
    </>
  ),
};

/* ─── Changelog ──────────────────────────────────────────────────── */
Articles.changelog = {
  toc: [
    { id: 'unreleased', name: 'Unreleased · v0.2' },
    { id: 'v014',       name: 'v0.1.4 · current' },
    { id: 'v013',       name: 'v0.1.3' },
    { id: 'v012',       name: 'v0.1.2' },
    { id: 'v011',       name: 'v0.1.1' },
    { id: 'policy',     name: 'Versioning policy' },
  ],
  body: () => (
    <>
      <H1 id="top" kicker="Changelog">Recent releases, <span className="it">in order.</span></H1>
      <P>Pre-1.0 minor versions may include breaking changes — pin to a patch range until <code className="ic">v1.0.0</code>. The full per-PR history lives in <code className="ic">CHANGELOG.md</code> at the repo root.</P>

      <H2 id="unreleased">Unreleased · v0.2 (in progress)</H2>
      <H3 id="unreleased-ci">CI hardening</H3>
      <P>Closing the two gaps that hid v1 bugs (the PG16 <code className="ic">BINARY</code>-keyword regression and the <code className="ic">tower_governor</code> <code className="ic">ConnectInfo</code> miss). The <code className="ic">integration</code> CI job now applies migrations live, greps for expected columns, and runs with <code className="ic">SQLX_OFFLINE=false</code>. New <code className="ic">smoke-test</code> job exercises authenticated REST routes + gRPC reflection over a real TCP socket.</P>
      <H3 id="unreleased-web">Web UI scaffold</H3>
      <P>Landing + Docs + Playground ported from the Claude Design handoff into <code className="ic">web/</code>. Production theme toggle replaces the dormant Claude Design tweaks panel; <code className="ic">prefers-reduced-motion</code> wired through the 8-layer ring diagram; language search/filter on the 41-chip matrix. Playground talks to the REST API when present and falls back to a simulation when not.</P>

      <H2 id="v014">v0.1.4 · 2026-05-13</H2>
      <P><b>Highlights:</b> gRPC service on <code className="ic">:9091</code>; OpenAPI 3.1 spec at <code className="ic">/v1/openapi.json</code>; OTLP traces + Jaeger dev compose; per-language slim runner images; <code className="ic">/v1/submissions/batch</code> for test-case batching.</P>
      <P><b>Fixes:</b> PG16 <code className="ic">BINARY</code>-keyword regression; <code className="ic">tower_governor</code> <code className="ic">ConnectInfo</code> wiring; all 19 sqlx queries converted to compile-time <code className="ic">query!</code> macros with cached <code className="ic">.sqlx/</code>.</P>

      <H2 id="v013">v0.1.3 · 2026-04-26</H2>
      <P>WASM sandbox tier (wasmtime + WASI preview1). Auto-scaling pending-jobs gauge. gRPC reflection wired so <code className="ic">grpcurl list/describe</code> works without the <code className="ic">.proto</code>.</P>

      <H2 id="v012">v0.1.2 · 2026-04-08</H2>
      <P>Prometheus metrics endpoint on API + worker. Multi-arch Dockerfile (<code className="ic">x86_64-unknown-linux-musl</code> + <code className="ic">aarch64-unknown-linux-musl</code>). End-to-end smoke-test script covering Docker compose lifecycle.</P>

      <H2 id="v011">v0.1.1 · 2026-03-22</H2>
      <P>v1.5 language expansion: Batches A–G added Bash, Lua, Perl, Ruby, R, PHP, TypeScript, Fortran, Pascal, D, Objective-C, Assembly, Ada, Kotlin, Scala 3, Groovy, Clojure, Haskell, OCaml, Erlang, Elixir, Common Lisp, C#, F#, COBOL, Prolog, Swift 6, Octave, SQL, Zig, Nim, Crystal, Dart, Julia. 41 languages total; same Judge0 IDs.</P>

      <H2 id="policy">Versioning policy</H2>
      <P>SemVer once <code className="ic">v1.0.0</code> tags. Pre-1.0: minor versions may break API shape; patches never do. Cargo crates, language IDs, and the gRPC <code className="ic">.proto</code> are all versioned together — same git tag drives all three.</P>
    </>
  ),
};

window.Articles = Articles;

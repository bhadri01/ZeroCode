// landing/layer-diagram.jsx
// Concentric-ring "defense in depth" diagram.
//
// A submission packet drops from above, passes through eight kernel-enforced
// rings, and lands on the execution kernel at the center. Hovering pauses the
// cycle and reveals the kernel-call code (x-ray mode) for that layer.
//
// Two variants: 'hero' (compact, embedded in the hero) and 'detailed'
// (bigger, kernel calls always visible — for docs/security).

const { useState, useEffect, useRef } = React;

const LAYERS = [
  { n: 1, key: 'userns',    name: 'user namespace',    short: 'userns',
    call: 'unshare(CLONE_NEWUSER)',
    note: 'uid 0 in box → unprivileged outside' },
  { n: 2, key: 'ns',        name: 'pid · net · ipc · uts · mnt', short: 'namespaces',
    call: 'unshare(CLONE_NEW{PID,NET,IPC,UTS,NS})',
    note: 'every kernel namespace, no sharing' },
  { n: 3, key: 'pivot',     name: 'pivot_root',        short: 'pivot_root',
    call: 'pivot_root("/runner", "/runner/.old")',
    note: 'read-only runner rootfs, no host paths' },
  { n: 4, key: 'landlock',  name: 'landlock LSM',      short: 'landlock',
    call: 'landlock_create_ruleset(&attr, sizeof(attr), 0)',
    note: 'fs access whitelist enforced by kernel' },
  { n: 5, key: 'seccomp',   name: 'seccomp BPF',       short: 'seccomp',
    call: 'prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)',
    note: '~310 syscalls denied by default' },
  { n: 6, key: 'cgroup',    name: 'cgroup v2',         short: 'cgroup',
    call: 'write("/sys/fs/cgroup/zc/cgroup.procs", ...)',
    note: 'memory · cpu · pids · io quotas' },
  { n: 7, key: 'caps',      name: 'capability drop',   short: 'capdrop',
    call: 'cap_set_proc(cap_init())  /* bounding set: ∅ */',
    note: 'CAP_SYS_* removed, bounding set empty' },
  { n: 8, key: 'nnp',       name: 'NO_NEW_PRIVS',      short: 'nnp',
    call: 'prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)',
    note: 'setuid neutered, suid binaries inert' },
];

// ring outer radii, outermost first (ring 1 = userns = outermost)
const HERO_RINGS = { cx: 195, cy: 230, kernelR: 22, radii: [184, 164, 144, 124, 104, 84, 64, 44] };
const DETAIL_RINGS = { cx: 320, cy: 320, kernelR: 32, radii: [296, 264, 232, 200, 168, 136, 104, 72] };

function LayerDiagram({ variant = 'hero' }) {
  const isDetail = variant === 'detailed';
  const G = isDetail ? DETAIL_RINGS : HERO_RINGS;
  const W = isDetail ? 760 : 560;
  const H = isDetail ? 660 : 480;

  const [t, setT] = useState(0);     // 0..1 cycle position
  const [hoverIdx, setHoverIdx] = useState(null); // 0..7 ring index, or 'kernel', or null
  const [ms, setMs] = useState(0);
  const startRef = useRef(performance.now());
  const pausedRef = useRef(false);

  // Honor prefers-reduced-motion: freeze the packet just past the outer ring
  // so passed/active/upcoming rings still read, skip the RAF loop entirely.
  const reducedMotion = React.useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // RAF time loop. Publishes the live `ms` ticker via a window CustomEvent
  // so FloatingChips (rendered as a row below the diagram) can mirror it
  // without re-running a second RAF.
  useEffect(() => {
    function publish(v) {
      try {
        window.__zcDispatchMs = v;
        window.dispatchEvent(new CustomEvent('zerocode:dispatch-ms', { detail: v }));
      } catch {}
    }
    if (reducedMotion) {
      setT(0.10);
      setMs(2.8);
      publish(2.8);
      return;
    }
    let id;
    function loop(now) {
      if (!pausedRef.current) {
        const elapsed = (now - startRef.current) / 1000;
        const cycleS = 4.2;
        const cycleT = (elapsed % cycleS) / cycleS;
        setT(cycleT);
        // ms counter: only count time within the "traveling" phase (t < 0.65)
        // mapped onto 0..18ms for a nice realistic-looking ticker
        const v = Math.min(18, Math.floor(cycleT * 28 * 100) / 100);
        setMs(v);
        publish(v);
      }
      id = requestAnimationFrame(loop);
    }
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  // pause/resume on hover
  useEffect(() => {
    pausedRef.current = hoverIdx !== null;
  }, [hoverIdx]);

  // phase mapping
  // t in [0, 0.04) → packet falling in (above outer ring)
  // t in [0.04, 0.52) → traveling through rings (8 × 0.06)
  // t in [0.52, 0.65) → arriving at kernel
  // t in [0.65, 1.00) → kernel pulse / dwell
  function activeFromT(t) {
    if (hoverIdx !== null) return hoverIdx;
    if (t < 0.04) return null;
    if (t < 0.52) return Math.min(7, Math.floor((t - 0.04) / 0.06));
    return 'kernel';
  }
  function packetY(t) {
    if (t < 0.04) {
      // pre-entry: above the outermost ring
      const localT = t / 0.04;
      return G.cy - G.radii[0] - 50 + localT * 50;
    }
    if (t < 0.52) {
      // traveling through rings: lerp between ring outer boundaries
      const idx = Math.min(7, Math.floor((t - 0.04) / 0.06));
      const local = ((t - 0.04) / 0.06) - idx;
      const yStart = G.cy - G.radii[idx];
      const yEnd = idx < 7 ? G.cy - G.radii[idx + 1] : G.cy - G.kernelR - 6;
      return yStart + (yEnd - yStart) * local;
    }
    if (t < 0.65) {
      // arrive at kernel
      const local = (t - 0.52) / 0.13;
      const yStart = G.cy - G.kernelR - 6;
      const yEnd = G.cy;
      return yStart + (yEnd - yStart) * local;
    }
    return G.cy; // dwell at center
  }

  const active = activeFromT(t);
  const pY = packetY(t);
  const kernelActive = active === 'kernel';
  const showPacket = t < 0.65 && hoverIdx === null;

  // label positions (right side stack)
  const labelStartX = isDetail ? 480 : 405;
  const labelStartY = isDetail ? 70 : 50;
  const labelStep = isDetail ? 65 : 48;

  return (
    <div className={`ldiag ldiag-${variant}`}>
      <style>{`
        .ldiag {
          position: relative; user-select: none;
          font-family: var(--f-mono);
        }
        .ldiag-hero    { width: ${W}px; height: ${H}px; }
        .ldiag-detailed{ width: 100%; max-width: ${W}px; height: ${H}px; margin: 0 auto; }
        .ldiag svg { display: block; width: 100%; height: 100%; overflow: visible; }

        /* rings */
        .ldiag .ring {
          fill: none;
          stroke: var(--line-2);
          stroke-width: 1;
          transition: stroke .35s cubic-bezier(.4,0,.2,1), stroke-width .35s ease, opacity .25s ease;
        }
        .ldiag .ring.active {
          stroke: var(--accent);
          stroke-width: 2.2;
          filter: drop-shadow(0 0 8px color-mix(in oklab, var(--accent) 80%, transparent))
                  drop-shadow(0 0 16px color-mix(in oklab, var(--accent) 40%, transparent));
        }
        .ldiag .ring.passed { stroke: color-mix(in oklab, var(--accent) 45%, var(--line-2)); stroke-width: 1.2; }
        .ldiag .ring.dim    { stroke: var(--line); opacity: .45; }

        .ldiag .ring-fill {
          fill: url(#zc-ring-active);
          opacity: 0;
          transition: opacity .35s ease;
        }
        .ldiag .ring-fill.on { opacity: 1; }

        /* kernel */
        .ldiag .kernel {
          fill: var(--bg-2);
          stroke: var(--accent);
          stroke-width: 1;
          transition: filter .25s ease, stroke-width .25s ease;
        }
        .ldiag .kernel.hot {
          stroke-width: 2;
          filter: drop-shadow(0 0 14px color-mix(in oklab, var(--accent) 80%, transparent));
        }
        .ldiag .kernel-label {
          font: 500 9.5px/1 var(--f-mono);
          fill: var(--accent);
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        /* packet */
        .ldiag .packet {
          fill: var(--accent);
          stroke: var(--accent);
          stroke-width: 1;
          filter: drop-shadow(0 0 6px color-mix(in oklab, var(--accent) 90%, transparent))
                  drop-shadow(0 0 12px color-mix(in oklab, var(--accent) 50%, transparent));
        }
        .ldiag .packet-core { fill: #fff; opacity: .35; }
        .ldiag .packet-trail {
          stroke: var(--accent); stroke-width: 1.4; opacity: .6;
          stroke-dasharray: 2 4;
          filter: drop-shadow(0 0 3px color-mix(in oklab, var(--accent) 60%, transparent));
        }

        /* leader lines */
        .ldiag .leader {
          stroke: var(--line-2);
          stroke-width: 1;
          fill: none;
          transition: stroke .25s ease;
        }
        .ldiag .leader.active { stroke: var(--accent); }
        .ldiag .leader-dot { fill: var(--line-strong); transition: fill .25s ease; r: 2; }
        .ldiag .leader-dot.active { fill: var(--accent); }

        /* labels */
        .ldiag .lbl-grp {
          cursor: pointer;
          transition: transform .25s ease;
        }
        .ldiag .lbl-idx {
          font: 500 9.5px/1 var(--f-mono);
          fill: var(--fg-4);
          letter-spacing: 0.14em;
        }
        .ldiag .lbl-name {
          font: 500 12px/1 var(--f-mono);
          fill: var(--fg-1);
          transition: fill .25s ease;
        }
        .ldiag .lbl-call {
          font: 400 10.5px/1.3 var(--f-mono);
          fill: var(--fg-3);
          letter-spacing: -0.01em;
          transition: fill .25s ease;
        }
        .ldiag .lbl-grp.active .lbl-idx  { fill: var(--accent); }
        .ldiag .lbl-grp.active .lbl-name { fill: var(--fg); }
        .ldiag .lbl-grp.active .lbl-call { fill: var(--accent); }
        .ldiag .lbl-grp.dim    .lbl-idx  { opacity: .35; }
        .ldiag .lbl-grp.dim    .lbl-name { opacity: .55; }
        .ldiag .lbl-grp.dim    .lbl-call { opacity: .35; }
        .ldiag .lbl-grp:hover  .lbl-name { fill: var(--fg); }

        /* corner badges */
        .ldiag .badge-bg {
          fill: color-mix(in oklab, var(--bg-1) 70%, transparent);
          stroke: var(--line-2);
          stroke-width: 1;
        }
        .ldiag .badge-t { font: 500 9px/1 var(--f-mono); fill: var(--accent); letter-spacing: 0.18em; }
        .ldiag .badge-v { font: 500 18px/1 var(--f-display); fill: var(--fg); }
        .ldiag .badge-u { font: 400 8.5px/1 var(--f-mono); fill: var(--fg-3); letter-spacing: 0.12em; }
        .ldiag .badge-v.mono { font-family: var(--f-mono); font-size: 14px; }

        /* x-ray callout (kernel call on hover) */
        .ldiag .xray-bg {
          fill: color-mix(in oklab, var(--bg) 92%, transparent);
          stroke: var(--accent);
          stroke-width: 1;
        }
        .ldiag .xray-t { font: 500 10px/1 var(--f-mono); fill: var(--accent); letter-spacing: 0.14em; }
        .ldiag .xray-v { font: 400 11.5px/1.4 var(--f-mono); fill: var(--fg); }

        /* hit areas for hover — invisible rings */
        .ldiag .hit { fill: transparent; cursor: pointer; }
      `}</style>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* radial gradient for active ring fill */}
          <radialGradient id="zc-ring-active" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18"/>
            <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.04"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </radialGradient>
          {/* grain filter */}
          <filter id="zc-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0" />
          </filter>
          {/* glow */}
          <filter id="zc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* angle markers */}
          <marker id="zc-ar" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill="var(--accent)" />
          </marker>
        </defs>

        {/* concentric rings (inner-to-outer to control z-order with fills first) */}
        {/* fills */}
        {G.radii.map((r, i) => (
          <circle key={`f${i}`}
            className={`ring-fill ${active === i ? 'on' : ''}`}
            cx={G.cx} cy={G.cy} r={r}
          />
        ))}
        {/* strokes */}
        {G.radii.map((r, i) => {
          const cls = active === i ? 'active'
            : (typeof active === 'number' && i < active) ? 'passed'
            : (active === 'kernel') ? 'passed'
            : (hoverIdx !== null) ? 'dim'
            : '';
          return (
            <circle key={`r${i}`}
              className={`ring ${cls}`}
              cx={G.cx} cy={G.cy} r={r}
            />
          );
        })}

        {/* hover hit areas — render INVISIBLE rings just inside each visible ring,
            roughly the donut shape. We approximate with stroke-width = gap. */}
        {G.radii.map((r, i) => {
          const inner = i < 7 ? G.radii[i + 1] : G.kernelR;
          const mid = (r + inner) / 2;
          const sw = r - inner;
          return (
            <circle key={`h${i}`}
              className="hit"
              cx={G.cx} cy={G.cy} r={mid}
              stroke="transparent"
              strokeWidth={sw}
              fill="none"
              pointerEvents="stroke"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          );
        })}

        {/* execution kernel */}
        <g>
          <circle
            className={`kernel ${kernelActive ? 'hot' : ''}`}
            cx={G.cx} cy={G.cy} r={G.kernelR}
            onMouseEnter={() => setHoverIdx('kernel')}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: 'pointer' }}
          />
          <text className="kernel-label" x={G.cx} y={G.cy + 2} textAnchor="middle" dominantBaseline="middle">
            exec
          </text>
        </g>

        {/* packet — dropping from top */}
        {showPacket && (
          <>
            <line
              className="packet-trail"
              x1={G.cx} y1={Math.max(G.cy - G.radii[0] - 60, pY - 80)}
              x2={G.cx} y2={pY - 6}
            />
            <rect
              className="packet"
              x={G.cx - 5} y={pY - 5}
              width={10} height={10}
              transform={`rotate(45 ${G.cx} ${pY})`}
            />
            <rect
              className="packet-core"
              x={G.cx - 2} y={pY - 2}
              width={4} height={4}
              transform={`rotate(45 ${G.cx} ${pY})`}
            />
          </>
        )}

        {/* labels with leader lines (right side) */}
        {LAYERS.map((L, i) => {
          const yLabel = labelStartY + i * labelStep;
          const ringR = G.radii[i];
          // angle from center toward label position
          const dx = labelStartX - G.cx - 4;
          const dy = yLabel - G.cy;
          const ang = Math.atan2(dy, dx);
          const ex = G.cx + ringR * Math.cos(ang);
          const ey = G.cy + ringR * Math.sin(ang);
          const isActive = active === i;
          const isDim = hoverIdx !== null && hoverIdx !== i;
          return (
            <g key={L.key}
               className={`lbl-grp ${isActive ? 'active' : ''} ${isDim ? 'dim' : ''}`}
               onMouseEnter={() => setHoverIdx(i)}
               onMouseLeave={() => setHoverIdx(null)}>
              <path className={`leader ${isActive ? 'active' : ''}`}
                d={`M ${ex} ${ey} L ${labelStartX - 8} ${yLabel}`}
              />
              <circle className={`leader-dot ${isActive ? 'active' : ''}`} cx={ex} cy={ey} r={2}/>
              <text className="lbl-idx" x={labelStartX} y={yLabel - 14}>
                {String(L.n).padStart(2, '0')}
              </text>
              <text className="lbl-name" x={labelStartX} y={yLabel - 2}>
                {L.short}
              </text>
              <text className="lbl-call" x={labelStartX} y={yLabel + 14}>
                {isDetail ? L.call : (L.call.length > 32 ? L.call.slice(0, 30) + '…' : L.call)}
              </text>
              {isDetail && (
                <text className="lbl-call" x={labelStartX} y={yLabel + 30} style={{ fill: 'var(--fg-3)', fontStyle: 'italic' }}>
                  — {L.note}
                </text>
              )}
            </g>
          );
        })}

        {/* in-SVG corner badges removed — stats are now rendered as a
            unified row below the diagram (see FloatingChips in hero.jsx).
            Live ms ticker still computed here and surfaced via
            window.ZC_DispatchMs so the chip below can read it without
            re-running the RAF loop. */}

        {/* x-ray callout — appears when hovering a ring */}
        {hoverIdx !== null && hoverIdx !== 'kernel' && (() => {
          const L = LAYERS[hoverIdx];
          const callX = isDetail ? 50 : 20;
          const callY = isDetail ? H - 60 : 12 + 50;
          return (
            <g transform={`translate(${callX}, ${callY})`}>
              <rect className="xray-bg" x="0" y="0" width={isDetail ? 360 : 230} height="56" rx="4"/>
              <text className="xray-t" x="12" y="18">
                {String(L.n).padStart(2, '0')} · {L.short.toUpperCase()}
              </text>
              <text className="xray-v" x="12" y="36">
                {L.call.length > (isDetail ? 50 : 30) ? L.call.slice(0, isDetail ? 48 : 28) + '…' : L.call}
              </text>
              <text className="xray-v" x="12" y="50" style={{ fill: 'var(--fg-3)', fontSize: 10 }}>
                — {L.note}
              </text>
            </g>
          );
        })()}
        {hoverIdx === 'kernel' && (
          <g transform={`translate(${isDetail ? 50 : 20}, ${isDetail ? H - 60 : 62})`}>
            <rect className="xray-bg" x="0" y="0" width={isDetail ? 360 : 230} height="56" rx="4"/>
            <text className="xray-t" x="12" y="18">EXECUTION KERNEL</text>
            <text className="xray-v" x="12" y="36">execve(language_runtime, argv, envp)</text>
            <text className="xray-v" x="12" y="50" style={{ fill: 'var(--fg-3)', fontSize: 10 }}>
              — your code runs here, surrounded by 8 walls
            </text>
          </g>
        )}

        {/* grain overlay — full canvas */}
        <rect x="0" y="0" width={W} height={H} filter="url(#zc-grain)" pointerEvents="none" />
      </svg>
    </div>
  );
}

window.LayerDiagram = LayerDiagram;
window.LAYERS = LAYERS;

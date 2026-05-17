import { useEffect, useMemo, useRef, useState } from 'react';

type HoverKind = number | 'kernel' | null;
type Variant = 'hero' | 'detailed';

interface Layer {
  n: number;
  key: string;
  name: string;
  short: string;
  call: string;
  note: string;
}

export const LAYERS: Layer[] = [
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

const HERO_RINGS = { cx: 195, cy: 230, kernelR: 22, radii: [184, 164, 144, 124, 104, 84, 64, 44] };
const DETAIL_RINGS = { cx: 320, cy: 320, kernelR: 32, radii: [296, 264, 232, 200, 168, 136, 104, 72] };

export function LayerDiagram({ variant = 'hero' }: { variant?: Variant }) {
  const isDetail = variant === 'detailed';
  const G = isDetail ? DETAIL_RINGS : HERO_RINGS;
  const W = isDetail ? 760 : 560;
  const H = isDetail ? 660 : 480;

  const [t, setT] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<HoverKind>(null);
  const [, setMs] = useState(0);
  const startRef = useRef<number>(performance.now());
  const pausedRef = useRef<boolean>(false);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    function publish(v: number) {
      try {
        (window as unknown as { __zcDispatchMs?: number }).__zcDispatchMs = v;
        window.dispatchEvent(new CustomEvent('zerocode:dispatch-ms', { detail: v }));
      } catch { /* noop */ }
    }
    if (reducedMotion) {
      setT(0.10);
      setMs(2.8);
      publish(2.8);
      return;
    }
    let id: number;
    function loop(now: number) {
      if (!pausedRef.current) {
        const elapsed = (now - startRef.current) / 1000;
        const cycleS = 5.2;
        const cycleT = (elapsed % cycleS) / cycleS;
        setT(cycleT);
        const v = Math.min(18, Math.floor(cycleT * 28 * 100) / 100);
        setMs(v);
        publish(v);
      }
      id = requestAnimationFrame(loop);
    }
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  useEffect(() => {
    pausedRef.current = hoverIdx !== null;
  }, [hoverIdx]);

  // smoothstep — eases linear progress into a soft S-curve.
  function smooth(x: number) {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  }

  // Phase windows on the [0,1) cycle:
  //   [0.00, 0.06)  intro      — packet fades in above the outer ring
  //   [0.06, 0.54)  rings 0..7 — 6% of the cycle per ring, eased per segment
  //   [0.54, 0.72)  kernel hit — kernel pulses, packet fades into the core
  //   [0.72, 1.00)  rest       — rings ease back to neutral, then loop
  const RING_START = 0.06;
  const RING_STEP  = 0.06;
  const RING_END   = RING_START + RING_STEP * 8;     // 0.54
  const KERNEL_END = 0.72;

  function activeFromT(t: number): HoverKind {
    if (hoverIdx !== null) return hoverIdx;
    if (t < RING_START) return null;
    if (t < RING_END)   return Math.min(7, Math.floor((t - RING_START) / RING_STEP));
    if (t < KERNEL_END) return 'kernel';
    return null;
  }
  function packetY(t: number): number {
    if (t < RING_START) {
      const localT = smooth(t / RING_START);
      return G.cy - G.radii[0] - 50 + localT * 50;
    }
    if (t < RING_END) {
      const idx = Math.min(7, Math.floor((t - RING_START) / RING_STEP));
      const local = smooth(((t - RING_START) / RING_STEP) - idx);
      const yStart = G.cy - G.radii[idx];
      const yEnd = idx < 7 ? G.cy - G.radii[idx + 1] : G.cy - G.kernelR - 6;
      return yStart + (yEnd - yStart) * local;
    }
    if (t < KERNEL_END) {
      const local = smooth((t - RING_END) / (KERNEL_END - RING_END));
      const yStart = G.cy - G.kernelR - 6;
      const yEnd = G.cy;
      return yStart + (yEnd - yStart) * local;
    }
    return G.cy;
  }
  function packetOpacity(t: number): number {
    if (hoverIdx !== null) return 0;
    if (t < RING_START) return smooth(t / RING_START);
    if (t < RING_END + 0.04) return 1;
    if (t < KERNEL_END) return 1 - smooth((t - RING_END - 0.04) / (KERNEL_END - RING_END - 0.04));
    return 0;
  }
  function kernelGlow(t: number): number {
    if (hoverIdx === 'kernel') return 1;
    if (t < RING_END - 0.02) return 0;
    if (t < KERNEL_END) return smooth((t - (RING_END - 0.02)) / (KERNEL_END - (RING_END - 0.02)));
    if (t < KERNEL_END + 0.10) return 1 - smooth((t - KERNEL_END) / 0.10);
    return 0;
  }

  const active = activeFromT(t);
  const pY = packetY(t);
  const pOpacity = packetOpacity(t);
  const kGlow = kernelGlow(t);
  const showPacket = pOpacity > 0.01 && hoverIdx === null;

  const labelStartX = isDetail ? 480 : 405;
  const labelStartY = isDetail ? 70 : 50;
  const labelStep = isDetail ? 65 : 48;

  return (
    <div className={`ldiag ldiag-${variant}`}>
      <style>{`
        .ldiag { position: relative; user-select: none; font-family: var(--f-mono); }
        .ldiag-hero    { width: ${W}px; height: ${H}px; }
        .ldiag-detailed{ width: 100%; max-width: ${W}px; height: ${H}px; margin: 0 auto; }
        .ldiag svg { display: block; width: 100%; height: 100%; overflow: visible; }

        .ldiag .ring {
          fill: none; stroke: var(--line-2); stroke-width: 1;
          transition:
            stroke 480ms cubic-bezier(.22,.61,.36,1),
            stroke-width 480ms cubic-bezier(.22,.61,.36,1),
            opacity 320ms ease;
        }
        .ldiag .ring.active {
          stroke: var(--accent); stroke-width: 2.2;
          filter: drop-shadow(0 0 8px color-mix(in oklab, var(--accent) 80%, transparent))
                  drop-shadow(0 0 16px color-mix(in oklab, var(--accent) 40%, transparent));
        }
        .ldiag .ring.passed { stroke: color-mix(in oklab, var(--accent) 45%, var(--line-2)); stroke-width: 1.2; }
        .ldiag .ring.dim    { stroke: var(--line); opacity: .45; }

        .ldiag .ring-fill { fill: url(#zc-ring-active); opacity: 0; transition: opacity 480ms cubic-bezier(.22,.61,.36,1); }
        .ldiag .ring-fill.on { opacity: 1; }

        .ldiag .kernel {
          fill: var(--bg-2); stroke: var(--accent); stroke-width: 1;
          transition: filter 280ms cubic-bezier(.22,.61,.36,1), stroke-width 280ms ease;
        }
        .ldiag .kernel-label { font: 500 9.5px/1 var(--f-mono); fill: var(--accent); letter-spacing: 0.16em; text-transform: uppercase; }
        .ldiag .kernel-pulse { fill: var(--accent); opacity: 0; pointer-events: none; }

        .ldiag .packet-grp { pointer-events: none; will-change: opacity, transform; }
        .ldiag .packet {
          fill: var(--accent); stroke: var(--accent); stroke-width: 1;
          filter: drop-shadow(0 0 6px color-mix(in oklab, var(--accent) 90%, transparent))
                  drop-shadow(0 0 12px color-mix(in oklab, var(--accent) 50%, transparent));
        }
        .ldiag .packet-core { fill: #fff; opacity: .55; }
        .ldiag .packet-trail {
          stroke: var(--accent); stroke-width: 1.4;
          stroke-dasharray: 2 4;
          filter: drop-shadow(0 0 3px color-mix(in oklab, var(--accent) 60%, transparent));
        }

        .ldiag .leader { stroke: var(--line-2); stroke-width: 1; fill: none; transition: stroke .25s ease; }
        .ldiag .leader.active { stroke: var(--accent); }
        .ldiag .leader-dot { fill: var(--line-strong); transition: fill .25s ease; r: 2; }
        .ldiag .leader-dot.active { fill: var(--accent); }

        .ldiag .lbl-grp { cursor: pointer; transition: transform .25s ease; }
        .ldiag .lbl-idx { font: 500 9.5px/1 var(--f-mono); fill: var(--fg-4); letter-spacing: 0.14em; }
        .ldiag .lbl-name { font: 500 12px/1 var(--f-mono); fill: var(--fg-1); transition: fill .25s ease; }
        .ldiag .lbl-call { font: 400 10.5px/1.3 var(--f-mono); fill: var(--fg-3); letter-spacing: -0.01em; transition: fill .25s ease; }
        .ldiag .lbl-grp.active .lbl-idx  { fill: var(--accent); }
        .ldiag .lbl-grp.active .lbl-name { fill: var(--fg); }
        .ldiag .lbl-grp.active .lbl-call { fill: var(--accent); }
        .ldiag .lbl-grp.dim    .lbl-idx  { opacity: .35; }
        .ldiag .lbl-grp.dim    .lbl-name { opacity: .55; }
        .ldiag .lbl-grp.dim    .lbl-call { opacity: .35; }
        .ldiag .lbl-grp:hover  .lbl-name { fill: var(--fg); }

        .ldiag .xray {
          box-sizing: border-box;
          background: color-mix(in oklab, var(--bg) 94%, transparent);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border: 1px solid color-mix(in oklab, var(--accent) 55%, var(--line-2));
          border-radius: 6px;
          padding: 8px 10px;
          font-family: var(--f-mono);
          color: var(--fg);
          box-shadow: 0 8px 24px -12px rgba(0,0,0,0.6);
          animation: ldiag-xray-in 220ms cubic-bezier(.22,.61,.36,1);
        }
        @keyframes ldiag-xray-in {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ldiag .xray { animation: none; }
        }
        .ldiag .xray .t {
          display: block;
          font: 500 9.5px/1.2 var(--f-mono);
          color: var(--accent); letter-spacing: 0.14em;
          margin-bottom: 4px;
          overflow-wrap: anywhere;
        }
        .ldiag .xray .v {
          display: block;
          font: 400 11px/1.4 var(--f-mono);
          color: var(--fg);
          word-break: break-word; overflow-wrap: anywhere;
        }
        .ldiag .xray .v.note {
          margin-top: 4px;
          font-size: 10px;
          color: var(--fg-3);
          font-style: italic;
        }

        .ldiag .hit { fill: transparent; cursor: pointer; }
      `}</style>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="zc-ring-active" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18"/>
            <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.04"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </radialGradient>
          <filter id="zc-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={3} />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0" />
          </filter>
          <filter id="zc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={3} result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <marker id="zc-ar" viewBox="0 0 6 6" refX="5" refY="3" markerWidth={5} markerHeight={5} orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill="var(--accent)" />
          </marker>
        </defs>

        {G.radii.map((r, i) => (
          <circle key={`f${i}`} className={`ring-fill ${active === i ? 'on' : ''}`} cx={G.cx} cy={G.cy} r={r}/>
        ))}
        {G.radii.map((r, i) => {
          const cls = active === i ? 'active'
            : (typeof active === 'number' && i < active) ? 'passed'
            : (active === 'kernel') ? 'passed'
            : (hoverIdx !== null) ? 'dim'
            : '';
          return <circle key={`r${i}`} className={`ring ${cls}`} cx={G.cx} cy={G.cy} r={r}/>;
        })}

        {G.radii.map((r, i) => {
          const inner = i < 7 ? G.radii[i + 1] : G.kernelR;
          const mid = (r + inner) / 2;
          const sw = r - inner;
          return (
            <circle key={`h${i}`}
              className="hit"
              cx={G.cx} cy={G.cy} r={mid}
              stroke="transparent" strokeWidth={sw} fill="none" pointerEvents="stroke"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          );
        })}

        <g>
          {/* Soft outer pulse — eases in as the packet approaches the core. */}
          <circle
            className="kernel-pulse"
            cx={G.cx} cy={G.cy}
            r={G.kernelR + 6 + kGlow * 18}
            opacity={kGlow * 0.22}
          />
          <circle
            className="kernel"
            cx={G.cx} cy={G.cy} r={G.kernelR}
            strokeWidth={1 + kGlow * 1.4}
            style={{
              filter: kGlow > 0
                ? `drop-shadow(0 0 ${4 + kGlow * 12}px color-mix(in oklab, var(--accent) ${50 + kGlow * 40}%, transparent))`
                : undefined,
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHoverIdx('kernel')}
            onMouseLeave={() => setHoverIdx(null)}
          />
          <text className="kernel-label" x={G.cx} y={G.cy + 2} textAnchor="middle" dominantBaseline="middle">exec</text>
        </g>

        {showPacket && (
          <g className="packet-grp" opacity={pOpacity}>
            <line
              className="packet-trail"
              x1={G.cx} y1={Math.max(G.cy - G.radii[0] - 60, pY - 80)}
              x2={G.cx} y2={pY - 6}
              opacity={0.6 * pOpacity}
            />
            <rect className="packet" x={G.cx - 5} y={pY - 5} width={10} height={10} transform={`rotate(45 ${G.cx} ${pY})`}/>
            <rect className="packet-core" x={G.cx - 2} y={pY - 2} width={4} height={4} transform={`rotate(45 ${G.cx} ${pY})`}/>
          </g>
        )}

        {LAYERS.map((L, i) => {
          const yLabel = labelStartY + i * labelStep;
          const ringR = G.radii[i];
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
              <path className={`leader ${isActive ? 'active' : ''}`} d={`M ${ex} ${ey} L ${labelStartX - 8} ${yLabel}`}/>
              <circle className={`leader-dot ${isActive ? 'active' : ''}`} cx={ex} cy={ey} r={2}/>
              <text className="lbl-idx" x={labelStartX} y={yLabel - 14}>{String(L.n).padStart(2, '0')}</text>
              <text className="lbl-name" x={labelStartX} y={yLabel - 2}>{L.short}</text>
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

        {hoverIdx !== null && (() => {
          const xrayW = isDetail ? 320 : 240;
          const xrayH = isDetail ? 92 : 88;
          const xrayX = isDetail ? 40 : 14;
          const xrayY = isDetail ? H - xrayH - 16 : H - xrayH - 12;
          const isKernel = hoverIdx === 'kernel';
          const L = !isKernel ? LAYERS[hoverIdx as number] : null;
          const heading = isKernel ? 'EXECUTION KERNEL' : `${String(L!.n).padStart(2, '0')} · ${L!.short.toUpperCase()}`;
          const call = isKernel ? 'execve(language_runtime, argv, envp)' : L!.call;
          const note = isKernel ? 'your code runs here, surrounded by 8 walls' : L!.note;
          return (
            <foreignObject x={xrayX} y={xrayY} width={xrayW} height={xrayH}>
              <div className="xray" style={{ maxWidth: xrayW, width: '100%' }}>
                <span className="t">{heading}</span>
                <span className="v">{call}</span>
                <span className="v note">— {note}</span>
              </div>
            </foreignObject>
          );
        })()}

        <rect x={0} y={0} width={W} height={H} filter="url(#zc-grain)" pointerEvents="none" />
      </svg>
    </div>
  );
}

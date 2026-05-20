/*
 * Motion primitives for the landing page (motion.dev / Framer Motion).
 *
 * A small, opinionated toolkit so every section animates with the same
 * physics and timing instead of one-off transitions scattered everywhere.
 * Everything degrades to "no transform, just visible" when the user has
 * `prefers-reduced-motion: reduce` set.
 *
 * Design choices that keep this from looking templated:
 *   - One signature easing curve (EASE_OUT) used across the page.
 *   - Reveals rise a *short* distance (16–28 px), never a dramatic slide.
 *   - Stagger is tight (60–80 ms) so grids feel like one gesture, not a queue.
 *   - Scroll-linked parallax is subtle (≤ 40 px of travel) — texture, not motion-sickness.
 */

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'motion/react';
import {
  Children,
  isValidElement,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';

/** Signature easing — a long, confident decel (≈ easeOutExpo). */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Slightly snappier curve for interactive/hover transitions. */
export const EASE_SOFT = [0.22, 0.61, 0.36, 1] as const;

const VIEWPORT = { once: true, margin: '-12% 0px -12% 0px' } as const;

/* ─── Reveal ──────────────────────────────────────────────────────────────
 * Fade + short rise as the element scrolls into view. The workhorse — wrap
 * any block in it. `as` lets you keep semantic tags (header, section, li…).
 */
interface RevealProps {
  children: ReactNode;
  /** rise distance in px (default 24) */
  y?: number;
  /** seconds (default 0) */
  delay?: number;
  /** seconds (default 0.7) */
  duration?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
}
export function Reveal({
  children, y = 24, delay = 0, duration = 0.7, as = 'div', className, style, id,
}: RevealProps) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as as 'div'] ?? motion.div;
  return (
    <MotionTag
      id={id}
      className={className}
      style={style}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </MotionTag>
  );
}

/* ─── Stagger ─────────────────────────────────────────────────────────────
 * Container that reveals its <StaggerItem> children in a tight sequence.
 * Use for grids and lists. Children that aren't StaggerItem still render.
 */
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE_OUT } },
};
const staggerChildReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};

interface StaggerProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
}
export function Stagger({ children, as = 'div', className, style, id }: StaggerProps) {
  const MotionTag = motion[as as 'div'] ?? motion.div;
  return (
    <MotionTag
      id={id}
      className={className}
      style={style}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
    >
      {children}
    </MotionTag>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** Hover state — applied via motion so it survives the inline transform
   * the entrance animation leaves behind (CSS :hover transforms would be
   * overridden by that inline style). */
  hoverLift?: boolean;
}
export function StaggerItem({ children, as = 'div', className, style, hoverLift }: StaggerItemProps) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as as 'div'] ?? motion.div;
  const hover = hoverLift && !reduce
    ? { y: -4, transition: { duration: 0.25, ease: EASE_SOFT } }
    : undefined;
  return (
    <MotionTag
      className={className}
      style={style}
      variants={reduce ? staggerChildReduced : staggerChild}
      whileHover={hover}
    >
      {children}
    </MotionTag>
  );
}

/** Convenience: wrap an array of nodes as stagger items without manual keys. */
export function StaggerList({ children, ...rest }: StaggerProps) {
  return (
    <Stagger {...rest}>
      {Children.map(children, (child, i) =>
        isValidElement(child) ? <StaggerItem key={i}>{child}</StaggerItem> : child,
      )}
    </Stagger>
  );
}

/* ─── Parallax ────────────────────────────────────────────────────────────
 * Scroll-linked vertical drift. `speed` > 0 moves the element up as you
 * scroll past (foreground feel); negative moves it down. Spring-smoothed so
 * it never feels jittery. Disabled under reduced-motion.
 */
interface ParallaxProps {
  children: ReactNode;
  /** px of total travel across the viewport pass (default 40) */
  distance?: number;
  className?: string;
  style?: CSSProperties;
}
export function Parallax({ children, distance = 40, className, style }: ParallaxProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const raw = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const y = useSpring(raw, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <motion.div ref={ref} className={className} style={reduce ? style : { ...style, y }}>
      {children}
    </motion.div>
  );
}

/* ─── ScrollProgress ──────────────────────────────────────────────────────
 * Thin accent bar pinned to the very top, scaling with page scroll. A small
 * but unmistakably "designed" touch.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 200,
        transformOrigin: '0%', scaleX,
        background: 'linear-gradient(90deg, var(--rust), var(--blue))',
      }}
    />
  );
}

/* ─── re-export motion for ad-hoc use ─────────────────────────────────── */
export { motion, useReducedMotion };

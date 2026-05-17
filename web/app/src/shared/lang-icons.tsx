/*
 * Brand-colored SVG icons for the Core 7 languages.
 *
 * Five icons come straight from the `simple-icons` package (CC0). Two
 * use multi-color official logos with their own 48×48 viewBox:
 *
 *   - Python: official two-path logo (blue snake #0277BD + yellow
 *     snake #FFC107).
 *   - Java: official Duke logo (red steam #F44336 + blue cup #1565C0).
 *     simple-icons doesn't ship Java due to Oracle trademark concerns.
 *
 * Color contracts:
 *   - Single-color icons honor a `--lang-color` CSS variable; the brand
 *     hex is the fallback.
 *   - Python and Java ignore `--lang-color` and the `color` prop — they
 *     always render with their canonical brand colors.
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  siNodedotjs, siRust, siGo, siC, siCplusplus,
} from 'simple-icons';

export type LangKey =
  | 'python' | 'node' | 'rust' | 'go' | 'c' | 'cpp' | 'java';

interface PathIcon {
  kind: 'path';
  title: string;
  hex: string;          // primary brand hex, no leading '#'
  path: string;
  viewBox?: string;
}
interface CustomIcon {
  kind: 'custom';
  title: string;
  hex: string;
  viewBox?: string;
  render: (color: string) => ReactNode;
}
type IconData = PathIcon | CustomIcon;

// Official Java logo (red steam + blue cup), viewBox 0 0 48 48.
function javaRender(): ReactNode {
  return (
    <>
      <path
        fill="#F44336"
        d="M23.65,24.898c-0.998-1.609-1.722-2.943-2.725-5.455C19.229,15.2,31.24,11.366,26.37,3.999c2.111,5.089-7.577,8.235-8.477,12.473C17.07,20.37,23.645,24.898,23.65,24.898z"
      />
      <path
        fill="#F44336"
        d="M23.878,17.27c-0.192,2.516,2.229,3.857,2.299,5.695c0.056,1.496-1.447,2.743-1.447,2.743s2.728-0.536,3.579-2.818c0.945-2.534-1.834-4.269-1.548-6.298c0.267-1.938,6.031-5.543,6.031-5.543S24.311,11.611,23.878,17.27z"
      />
      <path
        fill="#1565C0"
        d="M32.084 25.055c1.754-.394 3.233.723 3.233 2.01 0 2.901-4.021 5.643-4.021 5.643s6.225-.742 6.225-5.505C37.521 24.053 34.464 23.266 32.084 25.055zM29.129 27.395c0 0 1.941-1.383 2.458-1.902-4.763 1.011-15.638 1.147-15.638.269 0-.809 3.507-1.638 3.507-1.638s-7.773-.112-7.773 2.181C11.683 28.695 21.858 28.866 29.129 27.395z"
      />
      <path
        fill="#1565C0"
        d="M27.935,29.571c-4.509,1.499-12.814,1.02-10.354-0.993c-1.198,0-2.974,0.963-2.974,1.889c0,1.857,8.982,3.291,15.63,0.572L27.935,29.571z"
      />
      <path
        fill="#1565C0"
        d="M18.686,32.739c-1.636,0-2.695,1.054-2.695,1.822c0,2.391,9.76,2.632,13.627,0.205l-2.458-1.632C24.271,34.404,17.014,34.579,18.686,32.739z"
      />
      <path
        fill="#1565C0"
        d="M36.281,36.632c0-0.936-1.055-1.377-1.433-1.588c2.228,5.373-22.317,4.956-22.317,1.784c0-0.721,1.807-1.427,3.477-1.093l-1.42-0.839C11.26,34.374,9,35.837,9,37.017C9,42.52,36.281,42.255,36.281,36.632z"
      />
      <path
        fill="#1565C0"
        d="M39,38.604c-4.146,4.095-14.659,5.587-25.231,3.057C24.341,46.164,38.95,43.628,39,38.604z"
      />
    </>
  );
}

// Official Python two-path logo, viewBox 0 0 48 48.
function pythonRender(): ReactNode {
  return (
    <>
      <path
        fill="#0277BD"
        d="M24.047,5c-1.555,0.005-2.633,0.142-3.936,0.367c-3.848,0.67-4.549,2.077-4.549,4.67V14h9v2H15.22h-4.35c-2.636,0-4.943,1.242-5.674,4.219c-0.826,3.417-0.863,5.557,0,9.125C5.851,32.005,7.294,34,9.931,34h3.632v-5.104c0-2.966,2.686-5.896,5.764-5.896h7.236c2.523,0,5-1.862,5-4.377v-8.586c0-2.439-1.759-4.263-4.218-4.672C27.406,5.359,25.589,4.994,24.047,5z M19.063,9c0.821,0,1.5,0.677,1.5,1.502c0,0.833-0.679,1.498-1.5,1.498c-0.837,0-1.5-0.664-1.5-1.498C17.563,9.68,18.226,9,19.063,9z"
      />
      <path
        fill="#FFC107"
        d="M23.078,43c1.555-0.005,2.633-0.142,3.936-0.367c3.848-0.67,4.549-2.077,4.549-4.67V34h-9v-2h9.343h4.35c2.636,0,4.943-1.242,5.674-4.219c0.826-3.417,0.863-5.557,0-9.125C41.274,15.995,39.831,14,37.194,14h-3.632v5.104c0,2.966-2.686,5.896-5.764,5.896h-7.236c-2.523,0-5,1.862-5,4.377v8.586c0,2.439,1.759,4.263,4.218,4.672C19.719,42.641,21.536,43.006,23.078,43z M28.063,39c-0.821,0-1.5-0.677-1.5-1.502c0-0.833,0.679-1.498,1.5-1.498c0.837,0,1.5,0.664,1.5,1.498C29.563,38.32,28.899,39,28.063,39z"
      />
    </>
  );
}

const ICONS: Record<LangKey, IconData> = {
  python: {
    kind: 'custom', title: 'Python',
    hex: '3776AB',
    viewBox: '0 0 48 48',
    render: pythonRender,
  },
  node:   { kind: 'path', title: 'Node.js', hex: siNodedotjs.hex, path: siNodedotjs.path },
  // Rust + Java overrides — simple-icons defaults both to 000000.
  rust:   { kind: 'path', title: 'Rust', hex: 'CE412B', path: siRust.path },
  go:     { kind: 'path', title: 'Go',   hex: siGo.hex, path: siGo.path },
  c:      { kind: 'path', title: 'C',    hex: siC.hex,  path: siC.path },
  cpp:    { kind: 'path', title: 'C++',  hex: siCplusplus.hex, path: siCplusplus.path },
  java:   { kind: 'custom', title: 'Java', hex: 'ED8B00', viewBox: '0 0 48 48', render: javaRender },
};

export interface LangIconProps {
  lang: LangKey;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Override the brand color. Ignored for dual-color (Python). */
  color?: string;
  title?: string;
}

export function LangIcon({
  lang, size = 20, className, style, color, title,
}: LangIconProps) {
  const data = ICONS[lang];
  const baseProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: data.viewBox ?? '0 0 24 24',
    width: size,
    height: size,
    role: 'img' as const,
    'aria-label': title ?? data.title,
    className,
    style: { display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style },
  };

  const fill = color ?? `var(--lang-color, #${data.hex})`;
  return (
    <svg {...baseProps}>
      <title>{title ?? data.title}</title>
      {data.kind === 'path'
        ? <path d={data.path} fill={fill} />
        : data.render(fill)}
    </svg>
  );
}

/* ─── Named exports (used by a few direct callers) ───────────────── */
export const PythonIcon = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="python" {...p} />;
export const NodeIcon   = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="node"   {...p} />;
export const RustIcon   = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="rust"   {...p} />;
export const GoIcon     = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="go"     {...p} />;
export const CIcon      = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="c"      {...p} />;
export const CppIcon    = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="cpp"    {...p} />;
export const JavaIcon   = (p: Omit<LangIconProps, 'lang'>) => <LangIcon lang="java"   {...p} />;

/* ─── Mapping helpers ────────────────────────────────────────────── */
export function langKeyFromId(id: number): LangKey | null {
  switch (id) {
    case 71: return 'python';
    case 63: return 'node';
    case 73: return 'rust';
    case 60: return 'go';
    case 48: return 'c';
    case 52: return 'cpp';
    case 62: return 'java';
    default: return null;
  }
}

export function langBrandHex(lang: LangKey): string {
  return ICONS[lang].hex;
}

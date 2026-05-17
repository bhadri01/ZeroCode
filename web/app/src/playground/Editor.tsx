/*
 * Monaco editor — the same engine that powers VS Code, with our custom
 * Monokai Pro theme (see ./monaco-theme.ts).
 *
 * Why selective imports
 * ─────────────────────
 * `monaco-editor` (umbrella) pulls in every language service worker
 * (TypeScript, JSON, CSS, HTML) plus all 40+ basic-language grammars.
 * For this playground we only need syntax highlighting for the Core 7,
 * and we never use Monaco's TS/CSS IntelliSense (each submission runs
 * inside the sandbox via REST, not in the browser). Importing from
 * `editor.api` + just the basic-languages we want trims megabytes off
 * the bundle.
 *
 * Worker wiring
 * ─────────────
 * Monaco needs ONE worker (`editor.worker.js`) for its background
 * tokenizer + diff/layout work, even without language services. Vite's
 * `?worker` import compiles it as a real same-origin asset under
 * `/assets/`, so we satisfy `worker-src 'self'` without needing
 * `blob:` in CSP.
 *
 * CSP note
 * ────────
 * Monaco uses `new Function(…)` internally to compile Monarch tokenizer
 * regexes. That requires `script-src 'unsafe-eval'` — the API's static
 * fallback headers were updated to include it (see
 * crates/zerocode-api/src/routes/mod.rs).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import { editorTheme, themeName } from './monaco-theme';
import type { CmLang } from './data';

// One-time global setup. Guarded so HMR re-mounts don't double-wire.
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}
if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker(_workerId: string, _label: string) {
      return new EditorWorker();
    },
  };
  monaco.editor.defineTheme(themeName, editorTheme);
}

// Map our internal CmLang IDs (named for the CodeMirror era) to Monaco's
// canonical language IDs. Kept stable so the rest of the app doesn't need
// to change.
function langId(l: CmLang): string {
  switch (l) {
    case 'python':     return 'python';
    // Use Monaco's dedicated JS grammar, not the TS one. Both extend the
    // same Monarch tokenizer, but TS sets `defaultToken: "invalid"` with a
    // `.ts` postfix — so JS-only syntax (BigInt `0n`, certain regexps) gets
    // marked invalid and the Monokai theme renders it red/underlined,
    // making the file look untheme'd.
    case 'javascript': return 'javascript';
    case 'rust':       return 'rust';
    case 'go':         return 'go';
    case 'cpp':        return 'cpp';
    case 'c':          return 'c';
    case 'java':       return 'java';
    default:           return 'plaintext';
  }
}

export interface EditorHandle {
  format: () => boolean;
  focus: () => void;
}

interface EditorProps {
  code: string;
  setCode: (next: string) => void;
  language: CmLang;
  onCursor?: (pos: { line: number; col: number }) => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { code, setCode, language, onCursor },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // setCode + onCursor get fresh closures every render — store latest in
  // refs so the disposables we register inside the mount effect always
  // call the current version (same trick as run() in App.tsx).
  const setCodeRef = useRef(setCode);
  const onCursorRef = useRef(onCursor);
  useEffect(() => { setCodeRef.current = setCode; }, [setCode]);
  useEffect(() => { onCursorRef.current = onCursor; }, [onCursor]);

  useEffect(() => {
    if (!hostRef.current) return;

    const editor = monaco.editor.create(hostRef.current, {
      value: code,
      language: langId(language),
      theme: themeName,
      automaticLayout: true,            // re-layout when parent resizes
      fontFamily: 'IBM Plex Mono, ui-monospace, JetBrains Mono, Menlo, monospace',
      fontSize: 13.5,
      fontLigatures: true,
      lineHeight: 22,
      lineNumbers: 'on',
      glyphMargin: false,
      folding: true,
      foldingStrategy: 'indentation',
      bracketPairColorization: { enabled: true },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      cursorWidth: 2,
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: true,
      renderWhitespace: 'selection',
      renderLineHighlight: 'all',
      occurrencesHighlight: 'singleFile',
      selectionHighlight: true,
      matchBrackets: 'always',
      autoClosingBrackets: 'languageDefined',
      autoClosingQuotes: 'languageDefined',
      autoIndent: 'advanced',
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: true,
      },
      padding: { top: 12, bottom: 12 },
      contextmenu: true,
      fixedOverflowWidgets: true,
      guides: {
        bracketPairs: 'active',
        indentation: true,
        highlightActiveIndentation: true,
      },
      stickyScroll: { enabled: true },
    });
    editorRef.current = editor;

    const changeSub = editor.onDidChangeModelContent(() => {
      setCodeRef.current(editor.getValue());
    });
    const cursorSub = editor.onDidChangeCursorPosition((e) => {
      onCursorRef.current?.({ line: e.position.lineNumber, col: e.position.column });
    });

    return () => {
      changeSub.dispose();
      cursorSub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External code change (reset, language switch resetting to sample,
  // share-hash restore). Skip if the buffer already matches to avoid
  // wiping cursor position on every keystroke round-trip.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== code) {
      const pos = editor.getPosition();
      editor.setValue(code);
      if (pos) editor.setPosition(pos);
    }
  }, [code]);

  // Language switch — reuse the same model, just change its language.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, langId(language));
  }, [language]);

  useImperativeHandle(ref, () => ({
    format: () => {
      const editor = editorRef.current;
      if (!editor) return false;
      editor.focus();
      // Triggers the registered formatter for the language if one exists;
      // for languages without a registered formatter Monaco no-ops and
      // we still return true so the caller doesn't show an error.
      editor.trigger('keyboard', 'editor.action.formatDocument', null);
      return true;
    },
    focus: () => editorRef.current?.focus(),
  }), []);

  return (
    <div className="ed">
      <style>{`
        .ed {
          flex: 1; min-height: 0; position: relative; overflow: hidden;
          background: #221F22;  /* matches monokai-pro editor.background */
        }
        .ed-host { position: absolute; inset: 0; }
        /* Override Monaco's default focus outline — we get visual focus
           from the lighter active-line highlight already. */
        .ed-host .monaco-editor.focused { outline: none; }
        .ed-host .monaco-editor .overflow-guard { border-radius: 0; }
      `}</style>
      <div ref={hostRef} className="ed-host" />
    </div>
  );
});

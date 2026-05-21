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
// v1.5 batch languages — Monaco ships Monarch grammars for these; the
// token-based Monokai theme styles them automatically. Languages without a
// native Monaco grammar (Fortran, Ada, Assembly, Haskell, Erlang, COBOL,
// Prolog, Octave, Nim, …) map to the closest family or 'plaintext' in
// data.ts's `cm` field.
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import 'monaco-editor/esm/vs/basic-languages/perl/perl.contribution';
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution';
import 'monaco-editor/esm/vs/basic-languages/r/r.contribution';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';
import 'monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution';
import 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution';
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution';
import 'monaco-editor/esm/vs/basic-languages/scala/scala.contribution';
import 'monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution';
import 'monaco-editor/esm/vs/basic-languages/elixir/elixir.contribution';
import 'monaco-editor/esm/vs/basic-languages/scheme/scheme.contribution';
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/dart/dart.contribution';
import 'monaco-editor/esm/vs/basic-languages/julia/julia.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import { editorTheme, themeName } from './monaco-theme';
import type { CmLang } from './data';

// One-time global setup. Guarded so HMR re-mounts don't double-wire.
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}
// Monaco ships no grammar for x86 assembly or Ada, so register compact Monarch
// tokenizers. They emit the same standard token types (keyword, string, number,
// comment, type, …) the Monokai theme already styles.
function registerExtraGrammars() {
  if (monaco.languages.getLanguages().some((l) => l.id === 'asm')) return;

  monaco.languages.register({ id: 'asm' });
  monaco.languages.setMonarchTokensProvider('asm', {
    defaultToken: '',
    ignoreCase: true,
    tokenizer: {
      root: [
        [/;.*$/, 'comment'],
        [/^\s*[A-Za-z_.$][\w.$]*:/, 'type'], // labels
        [/\b(section|global|extern|default|bits|org|db|dw|dd|dq|dt|resb|resw|resd|resq|equ|times|align|byte|word|dword|qword|ptr)\b/, 'keyword.directive'],
        [/\b(mov|movzx|movsx|lea|push|pop|add|sub|mul|imul|div|idiv|inc|dec|and|or|xor|not|neg|shl|shr|sar|sal|rol|ror|cmp|test|jmp|je|jne|jz|jnz|jg|jge|jl|jle|ja|jae|jb|jbe|jc|jnc|call|ret|loop|syscall|int|enter|leave|nop|cdq|cqo|cbw|cwde)\b/, 'keyword'],
        [/\b(r[abcd]x|r[sd]i|r[bs]p|r8|r9|r1[0-5]|e[abcd]x|e[sd]i|e[bs]p|[abcd]x|[abcd][lh]|[sd]il|[bs]pl)\b/, 'variable.predefined'],
        [/0[xX][0-9a-fA-F]+|\d+/, 'number'],
        [/"[^"]*"|'[^']*'/, 'string'],
        [/[[\]]/, 'delimiter.square'],
        [/[,:+\-*]/, 'delimiter'],
      ],
    },
  });

  monaco.languages.register({ id: 'ada' });
  monaco.languages.setMonarchTokensProvider('ada', {
    defaultToken: '',
    ignoreCase: true,
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/\b(procedure|function|package|body|is|begin|end|with|use|if|then|else|elsif|case|when|loop|while|for|in|out|access|return|declare|type|subtype|constant|record|array|of|new|null|and|or|not|xor|mod|rem|abs|others|exception|raise|do|exit|goto|pragma|renames|generic|task|protected|entry|select|accept|delay|abort|terminate|requeue|private|limited|aliased|tagged|abstract|overriding)\b/, 'keyword'],
        [/\b(Integer|Natural|Positive|Float|Boolean|Character|String|Wide_String|Long_Integer|Long_Float|Long_Long_Integer|Duration|Short_Integer)\b/, 'type'],
        [/\b(True|False|null)\b/, 'constant.language'],
        [/"[^"]*"/, 'string'],
        [/'.'/, 'string'],
        [/\b\d+(_\d+)*(\.\d+(_\d+)*)?([eE][+-]?\d+)?\b/, 'number'],
        [/:=|=>|\.\.|\/=|[<>]=?|\*\*|[-+*/&]/, 'operator'],
        [/[;:,.()]/, 'delimiter'],
      ],
    },
  });
}

if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker(_workerId: string, _label: string) {
      return new EditorWorker();
    },
  };
  monaco.editor.defineTheme(themeName, editorTheme);
  registerExtraGrammars();
}

// Map our internal CmLang IDs (named for the CodeMirror era) to Monaco's
// canonical language IDs. Kept stable so the rest of the app doesn't need
// to change.
function langId(l: CmLang): string {
  // Every CmLang value is either a Monaco language id registered by the
  // imports above or 'plaintext' (a Monaco built-in), so the mapping is
  // identity. Unknown ids would fall back to plaintext in Monaco anyway.
  //
  // Note: Node.js uses 'javascript' (not 'typescript') on purpose — the TS
  // grammar sets `defaultToken: "invalid"`, so JS-only syntax (BigInt `0n`,
  // some regexps) renders red/underlined. TypeScript (id 106) uses the
  // 'typescript' grammar for its own type annotations.
  return l;
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

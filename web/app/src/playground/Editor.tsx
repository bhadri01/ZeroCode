/*
 * Monaco editor — the same engine that powers VS Code, with our custom
 * Monokai Pro theme (see ./monaco-theme.ts).
 *
 * Why selective imports
 * ─────────────────────
 * `monaco-editor` (umbrella) pulls in every language service worker
 * (TypeScript, JSON, CSS, HTML) plus all 40+ basic-language grammars.
 * For this playground we only need syntax highlighting for the 20
 * supported languages, and we never use Monaco's TS/CSS IntelliSense (each
 * submission runs inside the sandbox via REST, not in the browser).
 * Importing from `editor.api` + just the basic-languages we want trims
 * megabytes off the bundle.
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
// Every Monaco basic-language grammar is imported as a MODULE (its `conf` +
// `language` exports), not as a `.contribution`. The contribution only lazily
// loads the grammar via an async import, which would clobber the function-call
// highlighting we layer on at startup (withCallHighlighting). Importing the
// module lets us self-register each language with the override applied up front
// (see registerExtraGrammars). Monaco's stock grammars tag every identifier the
// same, so function names render as plain text; we paint call sites green.
import { conf as pythonConf, language as pythonLang } from 'monaco-editor/esm/vs/basic-languages/python/python';
import { conf as jsConf, language as jsLang } from 'monaco-editor/esm/vs/basic-languages/javascript/javascript';
import { conf as tsConf, language as tsLang } from 'monaco-editor/esm/vs/basic-languages/typescript/typescript';
import { conf as rustConf, language as rustLang } from 'monaco-editor/esm/vs/basic-languages/rust/rust';
import { conf as cppConf, language as cppLang } from 'monaco-editor/esm/vs/basic-languages/cpp/cpp';
import { conf as goConf, language as goLang } from 'monaco-editor/esm/vs/basic-languages/go/go';
import { conf as javaConf, language as javaLang } from 'monaco-editor/esm/vs/basic-languages/java/java';
import { conf as dartConf, language as dartLang } from 'monaco-editor/esm/vs/basic-languages/dart/dart';
import { conf as luaConf, language as luaLang } from 'monaco-editor/esm/vs/basic-languages/lua/lua';
import { conf as perlConf, language as perlLang } from 'monaco-editor/esm/vs/basic-languages/perl/perl';
import { conf as rubyConf, language as rubyLang } from 'monaco-editor/esm/vs/basic-languages/ruby/ruby';
import { conf as rConf, language as rLang } from 'monaco-editor/esm/vs/basic-languages/r/r';
import { conf as phpConf, language as phpLang } from 'monaco-editor/esm/vs/basic-languages/php/php';
import { conf as kotlinConf, language as kotlinLang } from 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin';
import { conf as scalaConf, language as scalaLang } from 'monaco-editor/esm/vs/basic-languages/scala/scala';
import { conf as csharpConf, language as csharpLang } from 'monaco-editor/esm/vs/basic-languages/csharp/csharp';
import { conf as swiftConf, language as swiftLang } from 'monaco-editor/esm/vs/basic-languages/swift/swift';
import { conf as sqlConf, language as sqlLang } from 'monaco-editor/esm/vs/basic-languages/sql/sql';
// Bash (cm:'shell') has no usable stock grammar — it's a hand-written Monarch
// grammar in registerExtraGrammars() below. (The stock shell grammar tags
// builtins like a type, leaves $vars plain, and swallows double-quoted strings
// whole; ours fixes all three.)
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import { editorTheme, themeName } from './monaco-theme';
import type { CmLang } from './data';

// One-time global setup. Guarded so HMR re-mounts don't double-wire.
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}
type MonarchLang = monaco.languages.IMonarchLanguage;

// Tokenizer states whose name matches this hold string/comment/regex literals —
// never inject call highlighting there (it would paint `name(` inside a literal).
const NON_CODE_STATE = /string|comment|doc|regex|char|heredoc|pod|raw|literal|cdata|whitespace|template/i;

// Per-language switches for the identifier-role colorizer below.
interface CallOpts {
  // `(fn …)` call shape instead of `fn(…)` — Lisp-family.
  lisp?: boolean;
  // A PascalCase identifier that isn't a call site is a type/class → blue.
  // Only safe in languages where that convention holds (C#, Java, Kotlin, …),
  // not dynamic ones where PascalCase may be a constant (Ruby's STDIN, …).
  pascalType?: boolean;
  // `.method` / `Class::member` qualified access → green. Don't enable for
  // languages where `.` is part of identifiers (R's as.integer).
  member?: boolean;
}

// Monaco's basic-language grammars give function names — and most type/class
// names and members — the same token as plain variables, so they render as flat
// white text. This wraps a stock grammar to layer on role coloring:
//   • call sites (`name(`, or `(fn` in Lisp)            → function  (green)
//   • member access (`obj.method`, `std::cin`)          → function  (green)
//   • PascalCase non-call identifiers (opt-in)          → type      (blue)
// Reserved words — collected from every word-list the grammar declares
// (keywords, typeKeywords, builtins, specialForms, …) — are left untouched, so
// `if (`, `int(` casts, `Foo.class`, `(let …)` keep their colors. The rules are
// prepended to every CODE state (NON_CODE_STATE skipped), so they also work for
// grammars whose code lives in sub-states, e.g. PHP under an HTML root.
function withCallHighlighting(lang: MonarchLang, opts: CallOpts = {}): MonarchLang {
  const tokenizer = lang.tokenizer as Record<string, monaco.languages.IMonarchLanguageRule[]>;

  const reserved = new Set<string>();
  for (const key of Object.keys(lang)) {
    const value = (lang as Record<string, unknown>)[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === 'string' && /^[A-Za-z_]\w*$/.test(item)) reserved.add(item);
    }
  }
  const guard = reserved.size ? `(?!(?:${[...reserved].join('|')})\\b)` : '';

  // Order matters: member access first (so `Console.WriteLine` → type + method),
  // then call sites, then the broad PascalCase→type catch-all.
  const prefix: monaco.languages.IMonarchLanguageRule[] = [];
  if (opts.member && !opts.lisp) {
    // `Class::member` (C++ std::cin, PHP Foo::bar) and `obj.method`.
    prefix.push([new RegExp(`(::)(\\s*)(${guard}[A-Za-z_]\\w*)`),
      ['operator', 'white', 'function']]);
    prefix.push([new RegExp(`(\\.)(\\s*)(${guard}[A-Za-z_]\\w*)`),
      ['delimiter', 'white', 'function']]);
  }
  if (opts.lisp) {
    // `(fn …` — color the symbol (must start with a letter, so operators like
    // + - * fall through to the grammar). The `(` keeps its bracket token.
    prefix.push([new RegExp(`(\\()(\\s*)(${guard}[A-Za-z][\\w.\\-?!*>=<+/]*)`),
      ['delimiter.parenthesis', 'white', 'function']]);
  } else {
    // `name(` — an identifier (not a reserved word) immediately before `(`.
    prefix.push([new RegExp(`${guard}[A-Za-z_]\\w*(?=\\s*\\()`), 'function']);
  }
  if (opts.pascalType) {
    prefix.push([new RegExp(`${guard}[A-Z]\\w*`), 'type']);
  }

  const next: Record<string, monaco.languages.IMonarchLanguageRule[]> = {};
  for (const [state, rules] of Object.entries(tokenizer)) {
    next[state] = NON_CODE_STATE.test(state) ? rules : [...prefix, ...rules];
  }
  return { ...lang, tokenizer: next };
}

// Reuse a stock Monaco grammar but self-register it (with role coloring), since
// the lazy `.contribution` loader would otherwise clobber the override.
function registerEnhancedLang(
  id: string,
  conf: monaco.languages.LanguageConfiguration,
  lang: MonarchLang,
  opts: CallOpts = {},
) {
  monaco.languages.register({ id });
  monaco.languages.setLanguageConfiguration(id, conf);
  monaco.languages.setMonarchTokensProvider(id, withCallHighlighting(lang, opts));
}

// Self-register an enhanced Bash/`shell` grammar (Monaco ships none that's
// usable), and re-register every stock Monaco grammar with function-call
// coloring. They emit the same standard token types (keyword, string, number,
// comment, type, …) the Monokai theme already styles.
function registerExtraGrammars() {
  if (monaco.languages.getLanguages().some((l) => l.id === 'shell')) return;

  // ── Stock Monaco grammars, re-registered with role coloring ──────────────
  // (Monaco's cpp grammar backs both C and C++.)
  // M = member access; MT = member access + PascalCase-as-type (statically-typed
  // languages). Dynamic languages get M only (PascalCase may be a constant).
  const M: CallOpts = { member: true };
  const MT: CallOpts = { member: true, pascalType: true };
  const STOCK: Array<[string, monaco.languages.LanguageConfiguration, MonarchLang, CallOpts]> = [
    ['python', pythonConf, pythonLang, M],
    ['javascript', jsConf, jsLang, MT],
    ['typescript', tsConf, tsLang, MT],
    ['rust', rustConf, rustLang, MT],
    ['cpp', cppConf, cppLang, MT],
    ['go', goConf, goLang, MT],
    ['java', javaConf, javaLang, MT],
    ['dart', dartConf, dartLang, MT],
    ['lua', luaConf, luaLang, M],
    ['perl', perlConf, perlLang, M],
    ['ruby', rubyConf, rubyLang, M],
    ['r', rConf, rLang, {}],                 // `.` is part of R identifiers (as.integer)
    ['php', phpConf, phpLang, M],
    ['kotlin', kotlinConf, kotlinLang, MT],
    ['scala', scalaConf, scalaLang, MT],
    ['csharp', csharpConf, csharpLang, MT],
    ['swift', swiftConf, swiftLang, MT],
    ['sql', sqlConf, sqlLang, {}],           // SQL: call coloring only
  ];
  for (const [id, conf, lang, opts] of STOCK) registerEnhancedLang(id, conf, lang, opts);
  registerEnhancedLang('c', cppConf, cppLang, MT);                  // shares the C++ grammar

  // ── Bash / shell ──────────────────────────────────────────────────────
  // Token names line up with the `.shell` rules in monaco-theme.ts:
  //   keyword          → control flow (if/for/while/function/local/return …)
  //   type.identifier  → builtins & common commands (echo/read/printf/ls …)
  //   variable         → $var, ${…}, names inside $(( … ))         (orange)
  //   variable.predefined → $1 $@ $? $$ …                          (purple)
  //   string[.escape]  → '…' "…" `…`, \n \t \$ …
  //   number[.hex|.float], comment, metatag (shebang), operator, delimiter
  monaco.languages.register({
    id: 'shell',
    extensions: ['.sh', '.bash', '.zsh'],
    aliases: ['Shell', 'sh', 'bash'],
  });
  monaco.languages.setLanguageConfiguration('shell', {
    comments: { lineComment: '#' },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('shell', {
    defaultToken: '',
    ignoreCase: false, // bash is case-sensitive (IF ≠ if)
    tokenPostfix: '.shell',

    brackets: [
      { token: 'delimiter.bracket', open: '{', close: '}' },
      { token: 'delimiter.parenthesis', open: '(', close: ')' },
      { token: 'delimiter.square', open: '[', close: ']' },
    ],

    keywords: [
      'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'while', 'until',
      'do', 'done', 'case', 'esac', 'select', 'function', 'time', 'coproc',
      'return', 'break', 'continue', 'exit', 'local', 'declare', 'typeset',
      'readonly', 'export', 'unset', 'set', 'shift',
    ],

    // Bash builtins + ubiquitous commands — styled as commands, not types.
    builtins: [
      'read', 'echo', 'printf', 'print', 'source', 'eval', 'exec', 'test',
      'let', 'trap', 'getopts', 'type', 'command', 'builtin', 'enable',
      'alias', 'unalias', 'pushd', 'popd', 'dirs', 'jobs', 'fg', 'bg', 'wait',
      'disown', 'kill', 'killall', 'umask', 'ulimit', 'history', 'complete',
      'compgen', 'mapfile', 'readarray', 'true', 'false', 'pwd', 'cd', 'hash',
      'help', 'cat', 'cp', 'mv', 'rm', 'rmdir', 'mkdir', 'ln', 'ls', 'find',
      'grep', 'egrep', 'fgrep', 'sed', 'awk', 'gawk', 'cut', 'sort', 'uniq',
      'head', 'tail', 'tr', 'tee', 'wc', 'xargs', 'chmod', 'chown', 'chroot',
      'touch', 'clear', 'diff', 'curl', 'wget', 'git', 'make', 'gcc', 'cc',
      'node', 'npm', 'python', 'python3', 'pip', 'sh', 'bash', 'zsh', 'ssh',
      'scp', 'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'date', 'sleep', 'env',
      'sudo', 'su', 'top', 'ps', 'ping', 'service', 'systemctl',
    ],

    symbols: /[=><!~?&|+\-*/^%]+/,

    tokenizer: {
      root: [
        { include: '@whitespace' },
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'type.identifier',
            '@default': '',
          },
        }],
        { include: '@strings' },
        { include: '@parameters' },
        { include: '@heredoc' },
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, 'operator'],
        { include: '@numbers' },
        [/[;,]/, 'delimiter'],
      ],

      whitespace: [
        [/^#!.*$/, 'metatag'], // shebang
        [/(\s+)(#.*$)/, ['white', 'comment']], // inline comment
        [/^#.*$/, 'comment'], // full-line comment
        [/\s+/, 'white'],
      ],

      numbers: [
        [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],
      ],

      strings: [
        [/'/, 'string', '@sqString'],
        [/"/, 'string', '@dqString'],
        [/`/, 'string.escape', '@backtick'],
      ],
      sqString: [
        [/[^']+/, 'string'],
        [/'/, 'string', '@pop'],
      ],
      dqString: [
        [/[^"\\$`]+/, 'string'],
        [/\\["\\$`nrtae]/, 'string.escape'],
        [/\\./, 'string'],
        { include: '@parameters' },
        [/`/, 'string.escape', '@backtick'],
        [/"/, 'string', '@pop'],
        [/[$`]/, 'string'],
      ],
      backtick: [
        { include: '@parameters' },
        { include: '@strings' },
        [/`/, 'string.escape', '@pop'],
        [/[^`]/, 'string'],
      ],

      heredoc: [
        [/(<<[-~]?)(\s*)(['"`]?)([\w-]+)(['"`]?)/,
          ['operator', 'white', 'string.heredoc.delimiter',
            'string.heredoc.delimiter', 'string.heredoc.delimiter']],
      ],

      parameters: [
        [/\$\(\(/, { token: 'delimiter.bracket', next: '@arithmetic' }],
        [/\$\(/, { token: 'delimiter.bracket', next: '@cmdsubst' }],
        [/\$\{/, { token: 'variable', next: '@paramExpansion' }],
        [/\$\d+/, 'variable.predefined'],
        [/\$[@*#?$!0\-]/, 'variable.predefined'],
        [/\$\w+/, 'variable'],
      ],
      paramExpansion: [
        [/[a-zA-Z_]\w*/, 'variable'],
        [/\d+/, 'number'],
        [/:[-=?+]?|##?|%%?|\^\^?|,,?|\//, 'delimiter'],
        [/\}/, { token: 'variable', next: '@pop' }],
        [/[^}]/, 'variable'],
      ],
      arithmetic: [
        [/\$\w+/, 'variable'],
        [/\$\{/, { token: 'variable', next: '@paramExpansion' }],
        [/\d+/, 'number'],
        [/[a-zA-Z_]\w*/, 'variable'],
        [/[-+*/%<>=!&|^~?:]+/, 'operator'],
        [/\)\)/, { token: 'delimiter.bracket', next: '@pop' }],
        [/[()]/, 'delimiter.bracket'],
        [/\s+/, 'white'],
      ],
      cmdsubst: [
        [/\)/, { token: 'delimiter.bracket', next: '@pop' }],
        { include: '@whitespace' },
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'type.identifier',
            '@default': '',
          },
        }],
        { include: '@strings' },
        { include: '@parameters' },
        [/[{}[\]]/, '@brackets'],
        [/\(/, 'delimiter.bracket'],
        [/@symbols/, 'operator'],
        { include: '@numbers' },
        [/[;,]/, 'delimiter'],
      ],
    },
  });
}

// Format providers. Monaco's `editor.action.formatDocument` is a no-op unless a
// DocumentFormattingEditProvider is registered, and none of the basic-language
// grammars ship one — so the toolbar's Format button did nothing for any
// language. We register one safe, language-agnostic "tidy" pass: trim trailing
// whitespace, expand leading tabs to spaces, and end with a single newline. It
// never re-flows code, so it's safe even for column-significant COBOL/Fortran.
// Structural re-indentation for brace languages is layered on top via Monaco's
// own `editor.action.reindentlines` (see format() in the handle), which keys off
// each language's indentationRules and no-ops for languages that lack them.
function tidyDocument(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const tidied = lines.map((line) => {
    const lead = /^[ \t]*/.exec(line)![0];
    const body = line.slice(lead.length);
    return (lead.replace(/\t/g, '    ') + body).replace(/[ \t]+$/, '');
  });
  while (tidied.length > 1 && tidied[tidied.length - 1] === '') tidied.pop();
  return tidied.join('\n') + '\n';
}

// Every Monaco language id the playground switches the editor into — used to
// register the tidy formatter for all of them in one pass at startup.
const FORMATTER_LANGUAGE_IDS = [
  'python', 'javascript', 'typescript', 'rust', 'go', 'cpp', 'c', 'java',
  'shell', 'lua', 'perl', 'ruby', 'r', 'php',
  'kotlin', 'scala', 'csharp', 'swift', 'sql', 'dart',
];

function registerFormatters(ids: string[]) {
  for (const id of ids) {
    monaco.languages.registerDocumentFormattingEditProvider(id, {
      provideDocumentFormattingEdits(model) {
        const text = model.getValue();
        const next = tidyDocument(text);
        if (next === text) return [];
        return [{ range: model.getFullModelRange(), text: next }];
      },
    });
  }
}

if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker(_workerId: string, _label: string) {
      return new EditorWorker();
    },
  };
  monaco.editor.defineTheme(themeName, editorTheme);
  registerExtraGrammars();
  registerFormatters(FORMATTER_LANGUAGE_IDS);
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
      theme: themeName,                 // Monokai Pro — dark in both app themes
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
      // 1) Our tidy formatter (registerFormatters): trims trailing whitespace,
      //    normalizes leading tabs, single trailing newline — safe for every
      //    language.
      editor.trigger('keyboard', 'editor.action.formatDocument', null);
      // 2) Structural re-indent for languages whose grammar defines
      //    indentationRules (the C-family/JS/etc. via their basic-language
      //    config). No-ops for languages that lack them (e.g. our hand-written
      //    shell grammar, registered without indentationRules).
      editor.trigger('keyboard', 'editor.action.reindentlines', null);
      return true;
    },
    focus: () => editorRef.current?.focus(),
  }), []);

  return (
    <div className="ed">
      <style>{`
        .ed {
          flex: 1; min-height: 0; position: relative; overflow: hidden;
          background: var(--editor-bg);  /* matches monokai-pro editor.background per theme */
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

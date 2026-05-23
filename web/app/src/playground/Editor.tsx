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
import { conf as fsharpConf, language as fsharpLang } from 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp';
import { conf as luaConf, language as luaLang } from 'monaco-editor/esm/vs/basic-languages/lua/lua';
import { conf as perlConf, language as perlLang } from 'monaco-editor/esm/vs/basic-languages/perl/perl';
import { conf as rubyConf, language as rubyLang } from 'monaco-editor/esm/vs/basic-languages/ruby/ruby';
import { conf as rConf, language as rLang } from 'monaco-editor/esm/vs/basic-languages/r/r';
import { conf as phpConf, language as phpLang } from 'monaco-editor/esm/vs/basic-languages/php/php';
import { conf as pascalConf, language as pascalLang } from 'monaco-editor/esm/vs/basic-languages/pascal/pascal';
import { conf as objcConf, language as objcLang } from 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c';
import { conf as kotlinConf, language as kotlinLang } from 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin';
import { conf as scalaConf, language as scalaLang } from 'monaco-editor/esm/vs/basic-languages/scala/scala';
import { conf as clojureConf, language as clojureLang } from 'monaco-editor/esm/vs/basic-languages/clojure/clojure';
import { conf as elixirConf, language as elixirLang } from 'monaco-editor/esm/vs/basic-languages/elixir/elixir';
import { conf as schemeConf, language as schemeLang } from 'monaco-editor/esm/vs/basic-languages/scheme/scheme';
import { conf as csharpConf, language as csharpLang } from 'monaco-editor/esm/vs/basic-languages/csharp/csharp';
import { conf as swiftConf, language as swiftLang } from 'monaco-editor/esm/vs/basic-languages/swift/swift';
import { conf as sqlConf, language as sqlLang } from 'monaco-editor/esm/vs/basic-languages/sql/sql';
import { conf as juliaConf, language as juliaLang } from 'monaco-editor/esm/vs/basic-languages/julia/julia';
import { conf as coffeeConf, language as coffeeLang } from 'monaco-editor/esm/vs/basic-languages/coffee/coffee';
import { conf as vbConf, language as vbLang } from 'monaco-editor/esm/vs/basic-languages/vb/vb';
import { conf as sverilogConf, language as sverilogLang } from 'monaco-editor/esm/vs/basic-languages/systemverilog/systemverilog';
import { conf as powershellConf, language as powershellLang } from 'monaco-editor/esm/vs/basic-languages/powershell/powershell';
// Bash (cm:'shell'), Assembly, Ada, Erlang, Fortran, Haskell, COBOL, Prolog and
// Octave have no usable stock grammar — they're hand-written Monarch grammars in
// registerExtraGrammars() below. (Bash specifically: the stock shell grammar
// tags builtins like a type, leaves $vars plain, and swallows double-quoted
// strings whole; ours fixes all three.)
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

// Monaco ships no grammar for x86 assembly, Ada, Erlang, Fortran, Haskell,
// COBOL, Prolog or Octave, so register compact Monarch tokenizers. They emit the
// same standard token types (keyword, string, number, comment, type, …) the
// Monokai theme already styles. We also self-register an enhanced Bash/`shell`
// grammar, and re-register every stock Monaco grammar with function-call
// coloring.
function registerExtraGrammars() {
  if (monaco.languages.getLanguages().some((l) => l.id === 'asm')) return;

  // ── Stock Monaco grammars, re-registered with role coloring ──────────────
  // (Monaco's cpp grammar backs both C and C++; D→cpp, Groovy→java, OCaml and
  // Common Lisp map to fsharp/scheme in data.ts, so those benefit too.)
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
    ['fsharp', fsharpConf, fsharpLang, MT],
    ['lua', luaConf, luaLang, M],
    ['perl', perlConf, perlLang, M],
    ['ruby', rubyConf, rubyLang, M],         // also backs Crystal (cm:'ruby')
    ['r', rConf, rLang, {}],                 // `.` is part of R identifiers (as.integer)
    ['php', phpConf, phpLang, M],
    ['pascal', pascalConf, pascalLang, M],   // case-insensitive — no PascalCase rule
    ['objective-c', objcConf, objcLang, MT],
    ['kotlin', kotlinConf, kotlinLang, MT],
    ['scala', scalaConf, scalaLang, MT],
    ['elixir', elixirConf, elixirLang, M],
    ['csharp', csharpConf, csharpLang, MT],
    ['swift', swiftConf, swiftLang, MT],
    ['sql', sqlConf, sqlLang, {}],           // SQL: call coloring only
    ['julia', juliaConf, juliaLang, M],
    ['coffeescript', coffeeConf, coffeeLang, M],   // CoffeeScript (cm:'coffeescript')
    ['vb', vbConf, vbLang, {}],                    // backs FreeBASIC (cm:'vb')
    ['systemverilog', sverilogConf, sverilogLang, {}], // backs Verilog (cm:'systemverilog')
    ['powershell', powershellConf, powershellLang, M],
  ];
  for (const [id, conf, lang, opts] of STOCK) registerEnhancedLang(id, conf, lang, opts);
  registerEnhancedLang('c', cppConf, cppLang, MT);                  // shares the C++ grammar
  registerEnhancedLang('clojure', clojureConf, clojureLang, { lisp: true });
  registerEnhancedLang('scheme', schemeConf, schemeLang, { lisp: true });

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

  // Ada is case-insensitive, so the keyword/type lists are lowercase (Monarch
  // lowercases the matched word before the `cases` lookup). Subprogram calls
  // (Put/Get/…) are colored via the `name(` rule, which skips keywords/types.
  monaco.languages.register({ id: 'ada', extensions: ['.adb', '.ads', '.ada'], aliases: ['Ada', 'ada'] });
  monaco.languages.setLanguageConfiguration('ada', {
    comments: { lineComment: '--' },
    brackets: [['(', ')']],
    autoClosingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }],
  });
  monaco.languages.setMonarchTokensProvider('ada', {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.ada',
    keywords: [
      'procedure', 'function', 'package', 'body', 'is', 'begin', 'end', 'with',
      'use', 'if', 'then', 'else', 'elsif', 'case', 'when', 'loop', 'while',
      'for', 'in', 'out', 'access', 'return', 'declare', 'type', 'subtype',
      'constant', 'record', 'array', 'of', 'new', 'null', 'and', 'or', 'not',
      'xor', 'mod', 'rem', 'abs', 'others', 'exception', 'raise', 'do', 'exit',
      'goto', 'pragma', 'renames', 'generic', 'task', 'protected', 'entry',
      'select', 'accept', 'delay', 'abort', 'terminate', 'requeue', 'private',
      'limited', 'aliased', 'tagged', 'abstract', 'overriding',
    ],
    typeKeywords: [
      'integer', 'natural', 'positive', 'float', 'boolean', 'character',
      'string', 'wide_string', 'long_integer', 'long_float',
      'long_long_integer', 'duration', 'short_integer',
    ],
    constants: ['true', 'false'],
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/[a-zA-Z]\w*(?=\s*\()/, {
          cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@default': 'function' },
        }],
        [/[a-zA-Z]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@constants': 'constant.language',
            '@default': 'identifier',
          },
        }],
        [/"[^"]*"/, 'string'],
        [/'.'/, 'string'],
        [/\b\d+(_\d+)*(\.\d+(_\d+)*)?([eE][+-]?\d+)?\b/, 'number'],
        [/:=|=>|\.\.|\/=|[<>]=?|\*\*|[-+*/&]/, 'operator'],
        [/[;:,.()]/, 'delimiter'],
      ],
    },
  });

  // ── Erlang ──────────────────────────────────────────────────────────────
  // Note: Variables are Uppercase, atoms are lowercase (opposite of most langs).
  monaco.languages.register({ id: 'erlang', extensions: ['.erl', '.hrl'], aliases: ['Erlang', 'erlang'] });
  monaco.languages.setLanguageConfiguration('erlang', {
    comments: { lineComment: '%' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' },
      { open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider('erlang', {
    defaultToken: '',
    tokenPostfix: '.erl',
    keywords: [
      'after', 'begin', 'case', 'catch', 'cond', 'end', 'fun', 'if', 'let', 'of',
      'receive', 'try', 'when', 'and', 'andalso', 'or', 'orelse', 'not', 'xor',
      'band', 'bor', 'bxor', 'bnot', 'bsl', 'bsr', 'div', 'rem',
    ],
    symbols: /[=><!~?:&|+\-*/^@]+/,
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/^\s*-[a-z]\w*/, 'keyword'],                 // module attributes: -module, -export
        [/\?[A-Za-z_]\w*/, 'constant'],               // macros: ?FOO
        [/[A-Z_][\w@]*/, 'variable'],                 // Erlang variables (Uppercase)
        [/[a-z][\w@]*(?=\s*\()/, 'function'],         // atom call: foo(
        [/[a-z][\w@]*(?=\s*:)/, 'type'],              // module qualifier: io:
        [/[a-z][\w@]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        { include: '@numbers' },
        [/"/, 'string', '@string'],
        [/'(?:[^'\\]|\\.)*'/, 'string'],              // quoted atoms
        [/\$\\?./, 'number'],                          // char literal: $a
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, 'operator'],
        [/[,;.]/, 'delimiter'],
      ],
      numbers: [
        [/\d+#[0-9a-zA-Z]+/, 'number.hex'],            // base#value (e.g. 16#FF)
        [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],
      ],
      string: [
        [/[^"\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
    },
  });

  // ── Fortran (free-form, case-insensitive) ───────────────────────────────
  monaco.languages.register({ id: 'fortran', extensions: ['.f90', '.f95', '.f03', '.f', '.for'], aliases: ['Fortran', 'fortran'] });
  monaco.languages.setLanguageConfiguration('fortran', {
    comments: { lineComment: '!' },
    brackets: [['(', ')'], ['[', ']']],
    autoClosingPairs: [
      { open: '(', close: ')' }, { open: '[', close: ']' },
      { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider('fortran', {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.f90',
    keywords: [
      'program', 'endprogram', 'module', 'endmodule', 'submodule', 'subroutine',
      'endsubroutine', 'function', 'endfunction', 'end', 'use', 'implicit',
      'none', 'contains', 'interface', 'endinterface', 'procedure', 'call',
      'return', 'stop', 'continue', 'goto', 'if', 'then', 'else', 'elseif',
      'endif', 'do', 'enddo', 'while', 'select', 'case', 'endselect', 'default',
      'where', 'elsewhere', 'endwhere', 'forall', 'associate', 'block', 'data',
      'common', 'equivalence', 'namelist', 'parameter', 'save', 'allocate',
      'deallocate', 'nullify', 'pointer', 'target', 'intent', 'in', 'out',
      'inout', 'optional', 'public', 'private', 'protected', 'external',
      'intrinsic', 'sequence', 'recursive', 'pure', 'elemental', 'result',
      'print', 'write', 'read', 'open', 'close', 'inquire', 'rewind',
      'backspace', 'format', 'only', 'operator', 'assignment',
    ],
    typeKeywords: [
      'integer', 'real', 'double', 'precision', 'complex', 'character',
      'logical', 'type', 'class', 'dimension', 'kind', 'len', 'bind',
    ],
    builtins: [
      'abs', 'sqrt', 'sin', 'cos', 'tan', 'exp', 'log', 'log10', 'mod',
      'modulo', 'max', 'min', 'sum', 'product', 'size', 'shape', 'reshape',
      'trim', 'len_trim', 'adjustl', 'adjustr', 'present', 'allocated',
      'associated', 'huge', 'tiny', 'int', 'nint', 'floor', 'ceiling', 'char',
      'ichar', 'achar', 'index', 'scan', 'verify', 'dot_product', 'matmul',
      'transpose', 'maxval', 'minval', 'maxloc', 'minloc', 'any', 'all',
      'count', 'pack', 'merge', 'cmplx', 'aimag', 'conjg',
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        [/!.*$/, 'comment'],
        [/\.(?:true|false)\./, 'constant.language'],
        [/\.(?:and|or|not|eqv|neqv|eq|ne|lt|le|gt|ge)\./, 'operator'],
        [/[a-z]\w*(?=\s*\()/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@builtins': 'function',
            '@default': 'function',
          },
        }],
        [/[a-z]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@builtins': 'function',
            '@default': 'identifier',
          },
        }],
        { include: '@numbers' },
        [/"/, 'string', '@dstring'],
        [/'/, 'string', '@sstring'],
        [/[(){}[\]]/, '@brackets'],
        [/::|=>|[-+*/=<>]/, 'operator'],
        [/@symbols/, 'operator'],
        [/[,;]/, 'delimiter'],
      ],
      numbers: [
        [/\d+\.\d*([eEdD][-+]?\d+)?(_\w+)?/, 'number.float'],
        [/\.\d+([eEdD][-+]?\d+)?(_\w+)?/, 'number.float'],
        [/\d+[eEdD][-+]?\d+(_\w+)?/, 'number.float'],
        [/\d+(_\w+)?/, 'number'],
      ],
      dstring: [[/[^"]+/, 'string'], [/""/, 'string'], [/"/, 'string', '@pop']],
      sstring: [[/[^']+/, 'string'], [/''/, 'string'], [/'/, 'string', '@pop']],
    },
  });

  // ── Haskell ─────────────────────────────────────────────────────────────
  monaco.languages.register({ id: 'haskell', extensions: ['.hs', '.lhs'], aliases: ['Haskell', 'haskell'] });
  monaco.languages.setLanguageConfiguration('haskell', {
    comments: { lineComment: '--', blockComment: ['{-', '-}'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' },
      { open: '(', close: ')' }, { open: '"', close: '"' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('haskell', {
    defaultToken: '',
    tokenPostfix: '.hs',
    keywords: [
      'module', 'import', 'data', 'type', 'newtype', 'class', 'instance',
      'where', 'let', 'in', 'do', 'case', 'of', 'if', 'then', 'else',
      'deriving', 'infixl', 'infixr', 'infix', 'foreign', 'default', 'as',
      'hiding', 'qualified', 'family',
    ],
    symbols: /[=!<>+\-*/$%&|^~?:.\\]+/,
    tokenizer: {
      root: [
        [/--+.*$/, 'comment'],
        [/\{-/, 'comment', '@blockComment'],
        // A lowercase word at column 0 (and not a keyword) is a top-level
        // definition — paint it like a function. Indented uses stay identifiers.
        [/^[a-z_][\w']*/, { cases: { '@keywords': 'keyword', '@default': 'function' } }],
        [/[A-Z][\w']*/, 'type'],                       // constructors, modules, types
        [/[a-z_][\w']*(?=\s*\()/, 'function'],         // f( … ) call sites
        [/[a-z_][\w']*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        { include: '@numbers' },
        [/"/, 'string', '@string'],
        [/'(?:[^'\\]|\\.)'/, 'string'],
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, 'operator'],
        [/[,;]/, 'delimiter'],
      ],
      blockComment: [
        [/[^{-]+/, 'comment'],
        [/\{-/, 'comment', '@push'],
        [/-\}/, 'comment', '@pop'],
        [/[{-]/, 'comment'],
      ],
      numbers: [
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/0[oO][0-7]+/, 'number.octal'],
        [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],
      ],
      string: [
        [/[^"\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
    },
  });

  // ── COBOL (fixed-format aware, case-insensitive) ────────────────────────
  // An indicator `*` or `/` in column 7 (right after the 6-char sequence area)
  // starts a comment line; `*>` is the free-format inline comment. No
  // indentationRules — COBOL's column layout is significant, so the Format
  // button must never re-indent it (tidyDocument only trims trailing space).
  monaco.languages.register({ id: 'cobol', extensions: ['.cob', '.cbl', '.cpy'], aliases: ['COBOL', 'cobol'] });
  monaco.languages.setLanguageConfiguration('cobol', {
    comments: { lineComment: '*>' },
    brackets: [['(', ')']],
    autoClosingPairs: [
      { open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider('cobol', {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.cob',
    keywords: [
      'identification', 'environment', 'data', 'procedure', 'division',
      'section', 'program-id', 'author', 'configuration', 'input-output',
      'file-control', 'working-storage', 'local-storage', 'linkage', 'file',
      'fd', 'sd', 'select', 'assign', 'organization', 'access', 'accept',
      'add', 'call', 'cancel', 'close', 'compute', 'continue', 'delete',
      'display', 'divide', 'evaluate', 'exit', 'go', 'goback', 'if', 'else',
      'end-if', 'end-perform', 'end-evaluate', 'end-read', 'end-call',
      'initialize', 'inspect', 'move', 'multiply', 'open', 'perform', 'read',
      'release', 'return', 'rewrite', 'search', 'set', 'sort', 'start',
      'stop', 'string', 'subtract', 'unstring', 'write', 'when', 'to',
      'from', 'into', 'giving', 'by', 'using', 'varying', 'until', 'through',
      'thru', 'and', 'or', 'not', 'greater', 'less', 'equal', 'than', 'then',
      'of', 'in', 'is', 'are', 'value', 'values', 'run', 'with', 'test',
      'before', 'after', 'times', 'end', 'all', 'function', 'returning',
    ],
    typeKeywords: [
      'pic', 'picture', 'usage', 'comp', 'comp-1', 'comp-2', 'comp-3',
      'comp-4', 'comp-5', 'binary', 'packed-decimal', 'occurs', 'redefines',
      'renames', 'blank', 'justified', 'sign', 'synchronized', 'sync',
      'filler', 'pointer',
    ],
    constants: [
      'zero', 'zeros', 'zeroes', 'space', 'spaces', 'high-value',
      'high-values', 'low-value', 'low-values', 'quote', 'quotes', 'null',
    ],
    symbols: /[-+*/=<>&]+/,
    tokenizer: {
      root: [
        [/^.{6}[*/].*$/, 'comment'],          // fixed-format: indicator in col 7
        [/\*>.*$/, 'comment'],                 // free-format inline comment
        [/"/, 'string', '@dstring'],
        [/'/, 'string', '@sstring'],
        { include: '@numbers' },
        [/[a-zA-Z][\w-]*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@constants': 'constant.language',
            '@default': 'identifier',
          },
        }],
        [/[()]/, '@brackets'],
        [/@symbols/, 'operator'],
        [/[.,;:]/, 'delimiter'],
      ],
      numbers: [
        [/\b\d+\.\d+\b/, 'number.float'],
        [/\b\d+\b/, 'number'],
      ],
      dstring: [[/[^"]+/, 'string'], [/""/, 'string'], [/"/, 'string', '@pop']],
      sstring: [[/[^']+/, 'string'], [/''/, 'string'], [/'/, 'string', '@pop']],
    },
  });

  // ── Prolog ──────────────────────────────────────────────────────────────
  // Variables start with an uppercase letter or `_`; atoms are lowercase.
  monaco.languages.register({ id: 'prolog', extensions: ['.pl', '.pro', '.prolog'], aliases: ['Prolog', 'prolog'] });
  monaco.languages.setLanguageConfiguration('prolog', {
    comments: { lineComment: '%', blockComment: ['/*', '*/'] },
    brackets: [['(', ')'], ['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '(', close: ')' }, { open: '[', close: ']' },
      { open: '{', close: '}' }, { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider('prolog', {
    defaultToken: '',
    tokenPostfix: '.prolog',
    keywords: [
      'is', 'mod', 'rem', 'div', 'rdiv', 'xor', 'true', 'fail', 'false',
      'not', 'dynamic', 'discontiguous', 'multifile', 'module', 'use_module',
      'ensure_loaded', 'initialization', 'halt', 'assert', 'asserta',
      'assertz', 'retract', 'findall', 'bagof', 'setof', 'forall', 'between',
      'member', 'append', 'length', 'reverse', 'msort', 'sort', 'nth0', 'nth1',
    ],
    symbols: /[=\\+\-*/<>:?@^&]+/,
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/[A-Z_][A-Za-z0-9_]*/, 'variable'],               // Prolog variables
        [/[a-z][A-Za-z0-9_]*(?=\s*\()/, 'function'],       // predicate call: foo(
        [/[a-z][A-Za-z0-9_]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/0'\\?./, 'number'],                              // character code: 0'a
        { include: '@numbers' },
        [/"/, 'string', '@dstring'],
        [/'/, 'string', '@qatom'],
        [/[()[\]{}]/, '@brackets'],
        [/@symbols/, 'operator'],
        [/[,.|!;]/, 'delimiter'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      numbers: [
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],
      ],
      dstring: [[/[^"\\]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
      qatom: [[/[^'\\]+/, 'string'], [/\\./, 'string.escape'], [/'/, 'string', '@pop']],
    },
  });

  // ── Octave / MATLAB ─────────────────────────────────────────────────────
  // `'…'` reads as a char string; the transpose operator (`a'`) is the rarer
  // case in playground snippets, so we favour the string reading.
  monaco.languages.register({ id: 'octave', extensions: ['.m'], aliases: ['Octave', 'octave', 'MATLAB', 'matlab'] });
  monaco.languages.setLanguageConfiguration('octave', {
    comments: { lineComment: '%' },
    brackets: [['(', ')'], ['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '(', close: ')' }, { open: '[', close: ']' },
      { open: '{', close: '}' }, { open: '"', close: '"' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('octave', {
    defaultToken: '',
    tokenPostfix: '.octave',
    keywords: [
      'function', 'endfunction', 'return', 'if', 'elseif', 'else', 'endif',
      'end', 'for', 'endfor', 'parfor', 'endparfor', 'while', 'endwhile',
      'do', 'until', 'switch', 'case', 'otherwise', 'endswitch', 'break',
      'continue', 'global', 'persistent', 'unwind_protect',
      'unwind_protect_cleanup', 'end_unwind_protect', 'try', 'catch',
      'end_try_catch',
    ],
    builtins: [
      'disp', 'printf', 'fprintf', 'sprintf', 'error', 'warning', 'size',
      'length', 'numel', 'zeros', 'ones', 'eye', 'rand', 'randn', 'linspace',
      'reshape', 'sum', 'prod', 'mean', 'median', 'max', 'min', 'sort',
      'find', 'abs', 'sqrt', 'floor', 'ceil', 'round', 'mod', 'rem',
      'isempty', 'isnan', 'num2str', 'str2num', 'strcat', 'strsplit',
    ],
    symbols: /[=<>~!&|+\-*/\\^:@]+/,
    tokenizer: {
      root: [
        [/[%#].*$/, 'comment'],
        [/[a-zA-Z_]\w*(?=\s*\()/, {
          cases: { '@keywords': 'keyword', '@builtins': 'function', '@default': 'function' },
        }],
        [/[a-zA-Z_]\w*/, {
          cases: { '@keywords': 'keyword', '@builtins': 'function', '@default': 'identifier' },
        }],
        { include: '@numbers' },
        [/"/, 'string', '@dstring'],
        [/'/, 'string', '@sstring'],
        [/[()[\]{}]/, '@brackets'],
        [/@symbols/, 'operator'],
        [/[.,;]/, 'delimiter'],
      ],
      numbers: [
        [/\d+\.\d*([eE][-+]?\d+)?[ij]?/, 'number.float'],
        [/\.\d+([eE][-+]?\d+)?[ij]?/, 'number.float'],
        [/\d+([eE][-+]?\d+)?[ij]?/, 'number'],
      ],
      dstring: [[/[^"\\]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
      sstring: [[/[^']+/, 'string'], [/''/, 'string'], [/'/, 'string', '@pop']],
    },
  });

  // ── Forth ───────────────────────────────────────────────────────────────
  // Stack language: `\ …` line comments, `( … )` inline comments, `." … "`
  // print-strings, `: name … ;` definitions (name colored as a type), and a
  // core word-list. Forth is case-insensitive.
  monaco.languages.register({ id: 'forth', extensions: ['.fth', '.fs', '.4th', '.forth'], aliases: ['Forth', 'forth'] });
  monaco.languages.setLanguageConfiguration('forth', {
    comments: { lineComment: '\\', blockComment: ['(', ')'] },
    brackets: [['(', ')']],
  });
  monaco.languages.setMonarchTokensProvider('forth', {
    ignoreCase: true,
    keywords: [
      'if', 'then', 'else', 'begin', 'until', 'while', 'repeat', 'again', 'do',
      'loop', '+loop', 'leave', 'case', 'of', 'endof', 'endcase', 'exit', 'recurse',
      'immediate', 'variable', 'constant', 'create', 'allot', 'value', 'to',
      'postpone', 'does>', 'cells', 'here', 'dup', 'drop', 'swap', 'over', 'rot',
      '-rot', 'nip', 'tuck', 'pick', 'roll', 'depth', '2dup', '2drop', '2swap',
      '2over', 'cr', 'emit', 'space', 'spaces', 'bye', 'abort',
    ],
    tokenizer: {
      root: [
        [/\\(\s.*)?$/, 'comment'],                       // \ line comment
        [/\(\s[^)]*\)/, 'comment'],                      // ( inline comment )
        [/(:)(\s+)(\S+)/, ['keyword', 'white', 'type']], // : name → definition
        [/;/, 'keyword'],
        [/(\.\"|s\\?\"|c\"|abort\")/, { token: 'string.quote', next: '@fstring' }],
        [/[-+]?\$[0-9a-fA-F]+/, 'number.hex'],
        [/[-+]?\d+(\.\d+)?/, 'number'],
        [/[a-zA-Z_][\w!?+\-*/=<>.@]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/\S+/, 'operator'],
      ],
      fstring: [
        [/[^"]+/, 'string'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],
    },
  });

  // ── Pony ────────────────────────────────────────────────────────────────
  // `//` + `/* */` comments, `"…"` / `"""…"""` strings, Capitalized identifiers
  // are types, reference-capability + control keywords, `name(` call coloring.
  monaco.languages.register({ id: 'pony', extensions: ['.pony'], aliases: ['Pony', 'pony'] });
  monaco.languages.setLanguageConfiguration('pony', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '(', close: ')' }, { open: '[', close: ']' },
      { open: '{', close: '}' }, { open: '"', close: '"' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('pony', {
    keywords: [
      'actor', 'class', 'primitive', 'interface', 'trait', 'struct', 'type', 'use',
      'var', 'let', 'embed', 'fun', 'be', 'new', 'if', 'then', 'else', 'elseif',
      'end', 'while', 'do', 'repeat', 'until', 'for', 'in', 'match', 'where', 'try',
      'with', 'recover', 'consume', 'as', 'is', 'isnt', 'not', 'and', 'or', 'xor',
      'return', 'error', 'break', 'continue', 'object', 'this', 'iso', 'trn', 'ref',
      'val', 'box', 'tag',
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, { token: 'comment', next: '@comment' }],
        [/"""/, { token: 'string.quote', next: '@tripstring' }],
        [/"/, { token: 'string.quote', next: '@pstring' }],
        [/0x[0-9a-fA-F_]+/, 'number.hex'],
        [/\d[\d_]*(\.\d+)?/, 'number'],
        [/[A-Z]\w*/, 'type'],                              // Pony types are Capitalized
        [/[a-z_]\w*(?=\s*\()/, 'function'],                // call site
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[{}()[\]]/, '@brackets'],
        [/[.,;:]/, 'delimiter'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, { token: 'comment', next: '@pop' }],
        [/[/*]/, 'comment'],
      ],
      pstring: [
        [/[^"]+/, 'string'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],
      tripstring: [
        [/[^"]+/, 'string'],
        [/"""/, { token: 'string.quote', next: '@pop' }],
        [/"/, 'string'],
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
  'shell', 'lua', 'perl', 'ruby', 'r', 'php', 'pascal', 'objective-c',
  'kotlin', 'scala', 'clojure', 'elixir', 'scheme', 'csharp', 'fsharp',
  'swift', 'sql', 'dart', 'julia', 'asm', 'ada', 'erlang', 'fortran',
  'haskell', 'cobol', 'prolog', 'octave',
  'coffeescript', 'vb', 'systemverilog', 'powershell', 'forth', 'pony',
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
      // 1) Our tidy formatter (registerFormatters): trims trailing whitespace,
      //    normalizes leading tabs, single trailing newline — safe for every
      //    language including column-significant COBOL.
      editor.trigger('keyboard', 'editor.action.formatDocument', null);
      // 2) Structural re-indent for languages whose grammar defines
      //    indentationRules (the C-family/JS/etc. via their basic-language
      //    config). No-ops for COBOL/Fortran/Haskell/Prolog/Octave, which we
      //    deliberately register without indentationRules.
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

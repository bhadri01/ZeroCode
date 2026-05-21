/*
 * Ambient types for Monaco's basic-language *grammar* modules.
 *
 * Monaco ships type declarations for the umbrella API and the
 * `*.contribution` side-effect entry points, but NOT for the bare grammar
 * modules (e.g. `.../basic-languages/cpp/cpp`). Editor.tsx imports those
 * directly for their named `conf` / `language` exports so it can self-register
 * each grammar with call-site highlighting (see withCallHighlighting), and
 * under `strict` / noImplicitAny that import would otherwise fail with TS7016.
 *
 * Each grammar module exports exactly two values, matching the shapes
 * registerEnhancedLang() expects. Add a line here when wiring up a new
 * grammar-module import in Editor.tsx.
 */
declare module 'monaco-editor/esm/vs/basic-languages/cpp/cpp' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/go/go' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/java/java' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/dart/dart' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/python/python' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/javascript/javascript' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/typescript/typescript' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/rust/rust' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/lua/lua' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/perl/perl' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/ruby/ruby' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/r/r' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/php/php' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/pascal/pascal' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/scala/scala' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/clojure/clojure' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/elixir/elixir' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/scheme/scheme' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/csharp/csharp' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/swift/swift' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/sql/sql' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
declare module 'monaco-editor/esm/vs/basic-languages/julia/julia' {
  import type { languages } from 'monaco-editor/esm/vs/editor/editor.api';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}

/*
 * Monokai Pro theme for Monaco editor.
 *
 * Built against the actual Monarch tokens emitted by each Core 7 language's
 * basic-language module (extracted from monaco-editor 0.52):
 *
 *   Python       — comment, keyword, string[.escape], number[.hex],
 *                  identifier, type, tag, delimiter[.{bracket,curly,parenthesis}]
 *   Rust         — comment, keyword[.type], string[.{quote,escape,byteliteral}],
 *                  number, identifier, type, typeof, operator, invalid
 *   Go           — comment[.doc], keyword[.<word>], string[.escape[.invalid]],
 *                  number[.{binary,float,hex,octal}], type, annotation
 *   C / C++      — comment[.doc], keyword[.<word>], keyword.directive[.*],
 *                  string[.{escape,raw.begin,raw.end}], number[.*], namespace,
 *                  annotation, operator, delimiter[.{angle,curly,...}]
 *   Java         — comment[.doc[.invalid]], keyword[.<word>], keyword.non-sealed,
 *                  string[.escape[.invalid]], number[.*], annotation
 *   TypeScript   — comment[.doc], keyword[.other], string[.escape[.invalid]],
 *                  number[.*], regexp[.{escape,escape.control,invalid}],
 *                  type[.identifier], typeof, namespace, invalid
 *
 * Monaco uses hierarchical token matching: a rule for `keyword` covers
 * `keyword.directive`, `keyword.flow`, `keyword.public`, etc. — so we
 * declare the general family color first, then narrow with overrides for
 * tokens that should look different (e.g. preprocessor directives in
 * orange instead of pink).
 *
 * Palette: Monokai Pro "default" filter (the original from Subtl).
 *   bg         #221F22
 *   fg         #FCFCFA
 *   pink       #FF6188  keywords, operators, tags
 *   yellow     #FFD866  strings, attributes
 *   green      #A9DC76  function names, method calls (where the grammar
 *                       distinguishes them — mostly TS/JS)
 *   orange     #FC9867  escapes, annotations, regexp, preprocessor
 *   purple     #AB9DF2  numbers, constants, predefined identifiers
 *   blue       #78DCE8  types, classes, namespaces  (italic)
 *   gray       #727072  comments  (italic)
 *
 * Italics convention (matches the Sublime / VS Code Monokai Pro plugin):
 *   - comments
 *   - type names, class names, namespaces
 *   - function parameters (where exposed; Monarch rarely emits this token)
 *   - storage modifiers (let/var/const/static/…) — implicit via keyword.
 */

import type * as monaco from 'monaco-editor';

export const themeName = 'monokai-pro';

const C = {
  bg:              '#221F22',
  bgPanel:         '#2D2A2E',
  bgLine:          '#383539',
  bgSelection:     '#4A474B',
  bgSelectionDim:  '#3D3A3F',
  cursor:          'FFD866',
  gutterDim:       '#5B595C',
  gutterActive:    '#C1C0C0',
  fg:              'FCFCFA',
  fgDim:           '939293',
  pink:            'FF6188',
  green:           'A9DC76',
  yellow:          'FFD866',
  orange:          'FC9867',
  purple:          'AB9DF2',
  blue:            '78DCE8',
  comment:         '727072',
  error:           'FF6188',
};

export const editorTheme: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    /* ───── Default text ─────────────────────────────────────────── */
    { token: '',                              foreground: C.fg },
    { token: 'identifier',                    foreground: C.fg },
    { token: 'source',                        foreground: C.fg },

    /* ───── Comments ─────────────────────────────────────────────── */
    { token: 'comment',                       foreground: C.comment, fontStyle: 'italic' },
    { token: 'comment.line',                  foreground: C.comment, fontStyle: 'italic' },
    { token: 'comment.block',                 foreground: C.comment, fontStyle: 'italic' },
    { token: 'comment.doc',                   foreground: C.comment, fontStyle: 'italic' },
    { token: 'comment.doc.invalid',           foreground: C.error,   fontStyle: 'italic underline' },
    { token: 'comment.invalid',               foreground: C.error,   fontStyle: 'italic underline' },

    /* ───── Keywords + storage + control flow ────────────────────── */
    { token: 'keyword',                       foreground: C.pink },
    { token: 'keyword.control',               foreground: C.pink },
    { token: 'keyword.flow',                  foreground: C.pink },
    { token: 'keyword.return',                foreground: C.pink, fontStyle: 'italic' },
    { token: 'keyword.operator',              foreground: C.pink },
    { token: 'keyword.other',                 foreground: C.pink },
    { token: 'keyword.json',                  foreground: C.pink },
    { token: 'keyword.async',                 foreground: C.pink, fontStyle: 'italic' },
    { token: 'keyword.non-sealed',            foreground: C.pink, fontStyle: 'italic' },  // Java
    // Rust's `keyword.type` (i32, bool, str, …) — typed as type, not pink
    { token: 'keyword.type',                  foreground: C.blue, fontStyle: 'italic' },
    // C / C++ preprocessor — distinct orange so #include / #define stand out
    { token: 'keyword.directive',             foreground: C.orange },
    { token: 'keyword.directive.include',     foreground: C.orange },
    { token: 'keyword.directive.include.begin', foreground: C.yellow },
    { token: 'keyword.directive.include.end',   foreground: C.yellow },

    /* ───── Storage / modifiers (Monarch sometimes emits these) ──── */
    { token: 'storage',                       foreground: C.pink, fontStyle: 'italic' },
    { token: 'storage.type',                  foreground: C.pink, fontStyle: 'italic' },
    { token: 'storage.modifier',              foreground: C.pink, fontStyle: 'italic' },

    /* ───── Operators ─────────────────────────────────────────────── */
    { token: 'operator',                      foreground: C.pink },
    { token: 'operator.assignment',           foreground: C.pink },
    { token: 'operator.comparison',           foreground: C.pink },
    { token: 'operator.bitwise',              foreground: C.pink },
    { token: 'operator.logical',              foreground: C.pink },
    { token: 'operator.arithmetic',           foreground: C.pink },

    /* ───── Strings + escapes ─────────────────────────────────────── */
    { token: 'string',                        foreground: C.yellow },
    { token: 'string.quote',                  foreground: C.yellow },
    { token: 'string.escape',                 foreground: C.orange },
    { token: 'string.escape.invalid',         foreground: C.error,  fontStyle: 'underline' },
    { token: 'string.invalid',                foreground: C.error,  fontStyle: 'underline' },
    { token: 'string.template',               foreground: C.yellow },
    { token: 'string.heredoc',                foreground: C.yellow },
    { token: 'string.byteliteral',            foreground: C.yellow },  // Rust b"…"
    { token: 'string.raw.begin',              foreground: C.orange },  // C++ R"(…)"
    { token: 'string.raw.end',                foreground: C.orange },

    /* ───── Regular expressions ───────────────────────────────────── */
    { token: 'regexp',                        foreground: C.orange },
    { token: 'regexp.escape',                 foreground: C.purple },
    { token: 'regexp.escape.control',         foreground: C.purple },
    { token: 'regexp.invalid',                foreground: C.error,  fontStyle: 'underline' },

    /* ───── Numbers (every base + format) ─────────────────────────── */
    { token: 'number',                        foreground: C.purple },
    { token: 'number.hex',                    foreground: C.purple },
    { token: 'number.float',                  foreground: C.purple },
    { token: 'number.binary',                 foreground: C.purple },
    { token: 'number.octal',                  foreground: C.purple },

    /* ───── Constants ─────────────────────────────────────────────── */
    { token: 'constant',                      foreground: C.purple },
    { token: 'constant.language',             foreground: C.purple, fontStyle: 'italic' },
    { token: 'constant.numeric',              foreground: C.purple },
    { token: 'constant.character',            foreground: C.yellow },
    { token: 'constant.character.escape',     foreground: C.orange },

    /* ───── Types / classes / namespaces (blue italic) ───────────── */
    { token: 'type',                          foreground: C.blue, fontStyle: 'italic' },
    { token: 'type.identifier',               foreground: C.blue, fontStyle: 'italic' },
    { token: 'typeof',                        foreground: C.pink, fontStyle: 'italic' },
    { token: 'class',                         foreground: C.blue, fontStyle: 'italic' },
    { token: 'class.identifier',              foreground: C.blue, fontStyle: 'italic' },
    { token: 'interface',                     foreground: C.blue, fontStyle: 'italic' },
    { token: 'enum',                          foreground: C.blue, fontStyle: 'italic' },
    { token: 'struct',                        foreground: C.blue, fontStyle: 'italic' },
    { token: 'namespace',                     foreground: C.blue, fontStyle: 'italic' },
    { token: 'namespace.identifier',          foreground: C.blue, fontStyle: 'italic' },

    /* ───── Functions / methods (green where grammar marks them) ──── */
    { token: 'function',                      foreground: C.green },
    { token: 'function.call',                 foreground: C.green },
    { token: 'function.declaration',          foreground: C.green },
    { token: 'identifier.function',           foreground: C.green },
    { token: 'method',                        foreground: C.green },
    { token: 'macro',                         foreground: C.green },
    { token: 'support.function',              foreground: C.green },
    { token: 'entity.name.function',          foreground: C.green },

    /* ───── Variables / parameters ───────────────────────────────── */
    { token: 'variable',                      foreground: C.fg },
    { token: 'variable.parameter',            foreground: C.orange, fontStyle: 'italic' },
    { token: 'variable.predefined',           foreground: C.purple, fontStyle: 'italic' },
    { token: 'variable.language',             foreground: C.purple, fontStyle: 'italic' },
    { token: 'variable.other',                foreground: C.fg },
    { token: 'parameter',                     foreground: C.orange, fontStyle: 'italic' },

    /* ───── Delimiters / punctuation ─────────────────────────────── */
    { token: 'delimiter',                     foreground: C.fgDim },
    { token: 'delimiter.bracket',             foreground: C.fg },
    { token: 'delimiter.parenthesis',         foreground: C.fg },
    { token: 'delimiter.curly',               foreground: C.fg },
    { token: 'delimiter.square',              foreground: C.fg },
    { token: 'delimiter.angle',               foreground: C.pink },     // generics / templates
    { token: 'delimiter.comma',               foreground: C.fgDim },
    { token: 'delimiter.colon',               foreground: C.fgDim },
    { token: 'delimiter.semicolon',           foreground: C.fgDim },
    { token: 'punctuation',                   foreground: C.fgDim },

    /* ───── Annotations / decorators / meta ───────────────────────── */
    { token: 'annotation',                    foreground: C.orange, fontStyle: 'italic' },
    { token: 'meta',                          foreground: C.orange },
    { token: 'meta.decorator',                foreground: C.orange, fontStyle: 'italic' },
    { token: 'metatag',                       foreground: C.orange },
    { token: 'attribute',                     foreground: C.orange, fontStyle: 'italic' },

    /* ───── Markup / HTML / JSX ───────────────────────────────────── */
    { token: 'tag',                           foreground: C.pink },
    { token: 'tag.attribute',                 foreground: C.blue, fontStyle: 'italic' },
    { token: 'attribute.name',                foreground: C.blue, fontStyle: 'italic' },
    { token: 'attribute.value',               foreground: C.yellow },
    { token: 'attribute.value.unit',          foreground: C.purple },

    /* ───── Markdown ──────────────────────────────────────────────── */
    { token: 'markup.heading',                foreground: C.pink, fontStyle: 'bold' },
    { token: 'markup.bold',                   foreground: C.fg,   fontStyle: 'bold' },
    { token: 'markup.italic',                 foreground: C.fg,   fontStyle: 'italic' },
    { token: 'markup.strikethrough',          foreground: C.fgDim, fontStyle: 'strikethrough' },
    { token: 'markup.underline.link',         foreground: C.blue, fontStyle: 'underline' },
    { token: 'markup.inline.raw',             foreground: C.yellow },
    { token: 'markup.fenced_code',            foreground: C.yellow },

    /* ───── Errors / invalid ──────────────────────────────────────── */
    { token: 'invalid',                       foreground: C.error, fontStyle: 'underline' },
    { token: 'invalid.illegal',               foreground: C.error, fontStyle: 'underline' },
    { token: 'invalid.deprecated',            foreground: C.error, fontStyle: 'strikethrough' },
  ],
  colors: {
    /* ───── Editor surface ───────────────────────────────────────── */
    'editor.background':                                C.bg,
    'editor.foreground':                                '#' + C.fg,
    'editorCursor.foreground':                          '#' + C.cursor,
    'editor.lineHighlightBackground':                   C.bgLine,
    'editor.lineHighlightBorder':                       C.bgLine,
    'editorLineNumber.foreground':                      C.gutterDim,
    'editorLineNumber.activeForeground':                C.gutterActive,

    /* ───── Selection / find / occurrences ───────────────────────── */
    'editor.selectionBackground':                       C.bgSelection,
    'editor.inactiveSelectionBackground':               C.bgSelectionDim,
    'editor.selectionHighlightBackground':              C.bgSelectionDim,
    'editor.wordHighlightBackground':                   C.bgSelectionDim,
    'editor.wordHighlightStrongBackground':             C.bgSelection,
    'editor.findMatchBackground':                       '#FFD86640',
    'editor.findMatchHighlightBackground':              '#FFD86620',
    'editor.findRangeHighlightBackground':              '#3D3A3F44',
    'editor.rangeHighlightBackground':                  '#3D3A3F44',

    /* ───── Brackets (Monokai Pro rainbow palette) ───────────────── */
    'editorBracketMatch.background':                    C.bgSelectionDim,
    'editorBracketMatch.border':                        '#' + C.yellow,
    'editorBracketHighlight.foreground1':               '#' + C.pink,
    'editorBracketHighlight.foreground2':               '#' + C.yellow,
    'editorBracketHighlight.foreground3':               '#' + C.blue,
    'editorBracketHighlight.foreground4':               '#' + C.green,
    'editorBracketHighlight.foreground5':               '#' + C.orange,
    'editorBracketHighlight.foreground6':               '#' + C.purple,
    'editorBracketHighlight.unexpectedBracket.foreground': '#' + C.error,

    /* ───── Indent guides / whitespace ───────────────────────────── */
    'editorIndentGuide.background':                     C.bgLine,
    'editorIndentGuide.background1':                    C.bgLine,
    'editorIndentGuide.activeBackground':               C.gutterDim,
    'editorIndentGuide.activeBackground1':              C.gutterDim,
    'editorWhitespace.foreground':                      C.bgSelectionDim,
    'editorRuler.foreground':                           C.bgLine,

    /* ───── Gutter / minimap / scrollbars ────────────────────────── */
    'editorGutter.background':                          C.bg,
    'editorGutter.modifiedBackground':                  '#' + C.blue,
    'editorGutter.addedBackground':                     '#' + C.green,
    'editorGutter.deletedBackground':                   '#' + C.error,
    'minimap.background':                               C.bg,
    'minimap.selectionHighlight':                       C.bgSelection,
    'minimap.findMatchHighlight':                       '#FFD86680',
    'scrollbar.shadow':                                 '#1c1a1c',
    'scrollbarSlider.background':                       '#3D3A3F88',
    'scrollbarSlider.hoverBackground':                  '#4A474BAA',
    'scrollbarSlider.activeBackground':                 '#5B595CCC',

    /* ───── Sticky scroll ────────────────────────────────────────── */
    'editorStickyScroll.background':                    '#26232688',
    'editorStickyScrollHover.background':               C.bgLine,

    /* ───── Widgets (find, suggest, hover, signature) ────────────── */
    'editorWidget.background':                          C.bgPanel,
    'editorWidget.border':                              C.bgLine,
    'editorWidget.foreground':                          '#' + C.fg,
    'editorSuggestWidget.background':                   C.bgPanel,
    'editorSuggestWidget.border':                       C.bgLine,
    'editorSuggestWidget.selectedBackground':           C.bgSelection,
    'editorSuggestWidget.selectedForeground':           '#' + C.fg,
    'editorSuggestWidget.foreground':                   '#' + C.fg,
    'editorSuggestWidget.highlightForeground':          '#' + C.yellow,
    'editorHoverWidget.background':                     C.bgPanel,
    'editorHoverWidget.border':                         C.bgLine,
    'editorHoverWidget.foreground':                     '#' + C.fg,

    /* ───── Lists / inputs (suggest dropdown, search panel) ──────── */
    'list.hoverBackground':                             C.bgLine,
    'list.activeSelectionBackground':                   C.bgSelection,
    'list.activeSelectionForeground':                   '#' + C.fg,
    'list.inactiveSelectionBackground':                 C.bgSelectionDim,
    'input.background':                                 C.bgPanel,
    'input.foreground':                                 '#' + C.fg,
    'input.border':                                     C.bgLine,
    'focusBorder':                                      '#FFD86655',
    'inputOption.activeBorder':                         '#' + C.yellow,
  },
};

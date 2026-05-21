/*
 * cob_xml_quiet.c — silence GnuCOBOL's spurious libxml2 version-skew warning.
 *
 * Every compiled COBOL program links libcob, which links libxml2 (for `XML
 * GENERATE` / `XML PARSE`). At startup libcob calls libxml2's
 * `xmlCheckVersion(LIBXML_VERSION)`. On Debian trixie the runtime shared
 * library is *really* libxml2 2.9.14 (it reports version 20914 → "209"), but
 * the gnucobol package was built against the 2.12 dev headers (21207 → "212").
 * libxml2's check therefore prints, to stderr, on *every* COBOL run:
 *
 *     Warning: program compiled against libxml 212 using older 209
 *
 * It's harmless but it pollutes the program's stderr. We can't change the
 * prebuilt libcob/libxml2 versions, so we override the symbol: this definition
 * neutralises the version check.
 *
 * How it's wired (see runners/Dockerfile + runners/languages.toml): compiled to
 * an object and linked into every COBOL binary via the `cobc` compile command.
 * Because libcob (a shared lib) references `xmlCheckVersion`, the linker exports
 * this executable-local definition into `.dynsym`, so it interposes libcob's
 * call at runtime — on EVERY execution path (direct `./prog`, the naive and the
 * native sandbox), with no LD_PRELOAD needed. The check is the only caller; its
 * sole side effect was `xmlInitParser()`, which libxml2's parser/writer entry
 * points (used by XML GENERATE/PARSE) call lazily themselves, so dropping it is
 * safe — XML programs keep working.
 */
void xmlCheckVersion(int version) {
    (void)version;
}

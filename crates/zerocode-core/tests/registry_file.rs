//! Integration check: the actual `runners/languages.toml` shipped in the
//! repo parses with the current types and lists the languages we expect.
//!
//! Lives in the integration-tests directory so it has its own crate scope
//! and reads the repo file via a relative path from `CARGO_MANIFEST_DIR`.

use std::path::PathBuf;

use zerocode_core::LanguageRegistry;

fn languages_toml() -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("runners/languages.toml")
        .canonicalize()
        .expect("locate runners/languages.toml");
    std::fs::read_to_string(&path).expect("read runners/languages.toml")
}

#[test]
fn registry_file_parses_and_contains_core_6() {
    let reg = LanguageRegistry::from_toml(&languages_toml())
        .expect("runners/languages.toml is valid");

    let by_id: std::collections::HashMap<u32, &str> = reg
        .list()
        .into_iter()
        .map(|s| (s.id, s.name.as_str()))
        .collect();

    // Core 6 v1 IDs are stable; if these ever change, callers break too.
    assert_eq!(by_id.get(&48).copied(), Some("C"));
    assert_eq!(by_id.get(&52).copied(), Some("C++"));
    assert_eq!(by_id.get(&60).copied(), Some("Go"));
    assert_eq!(by_id.get(&63).copied(), Some("Node.js"));
    assert_eq!(by_id.get(&71).copied(), Some("Python"));
    assert_eq!(by_id.get(&73).copied(), Some("Rust"));
}

#[test]
fn node_spec_carries_node_options_with_memory_placeholder() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let node = reg.require(63).expect("Node.js id 63 must be registered");
    let node_options = node
        .env
        .iter()
        .find(|(k, _)| k == "NODE_OPTIONS")
        .map(|(_, v)| v.as_str())
        .expect("Node.js spec must set NODE_OPTIONS");
    assert!(
        node_options.contains("${memory_mb}"),
        "NODE_OPTIONS should reference ${{memory_mb}} so V8 heap matches cgroup cap: {node_options}"
    );
    assert!(
        node_options.contains("unhandled-rejections=strict"),
        "NODE_OPTIONS should turn unhandled promise rejections into non-zero exits: {node_options}"
    );
}

#[test]
fn compiled_languages_have_both_compile_and_run_cmd() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    for id in [48, 52, 60, 73] {
        let spec = reg.require(id).unwrap_or_else(|_| panic!("id {id} should exist"));
        assert!(
            spec.is_compiled(),
            "{} (id {id}) should be a compiled language",
            spec.name
        );
        assert!(
            !spec.run_cmd.is_empty(),
            "{} (id {id}) needs a run_cmd",
            spec.name
        );
    }
}

#[test]
fn interpreted_languages_have_no_compile_cmd() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    for id in [63, 71] {
        let spec = reg.require(id).unwrap_or_else(|_| panic!("id {id} should exist"));
        assert!(
            !spec.is_compiled(),
            "{} (id {id}) should be interpreted (no compile step)",
            spec.name
        );
    }
}

#[test]
fn go_spec_carries_memlimit_with_memory_placeholder() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let go = reg.require(60).expect("Go id 60 must be registered");
    let memlimit = go
        .env
        .iter()
        .find(|(k, _)| k == "GOMEMLIMIT")
        .map(|(_, v)| v.as_str())
        .expect("Go spec must set GOMEMLIMIT so the runtime knows the cgroup cap");
    assert!(
        memlimit.contains("${memory_mb}"),
        "GOMEMLIMIT should reference ${{memory_mb}}: {memlimit}"
    );
}

#[test]
fn rust_spec_uses_panic_abort() {
    // panic=abort makes allocator OOMs and panics show up as SIGABRT, which
    // our triage maps to RuntimeError(Sigabrt). With the default (unwind),
    // OOMs trigger longer-running unwind paths that can race the wall-clock
    // budget.
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let rust = reg.require(73).expect("Rust id 73 must be registered");
    let compile_cmd = rust
        .compile_cmd
        .as_ref()
        .expect("Rust must have a compile_cmd");
    let joined = compile_cmd.join(" ");
    assert!(
        joined.contains("panic=abort"),
        "Rust compile_cmd should pass -C panic=abort: {joined}"
    );
}

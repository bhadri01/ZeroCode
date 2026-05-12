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
fn registry_file_parses_and_contains_core_langs() {
    let reg = LanguageRegistry::from_toml(&languages_toml())
        .expect("runners/languages.toml is valid");

    let by_id: std::collections::HashMap<u32, &str> = reg
        .list()
        .into_iter()
        .map(|s| (s.id, s.name.as_str()))
        .collect();

    assert_eq!(by_id.get(&71).copied(), Some("Python"));
    assert_eq!(by_id.get(&63).copied(), Some("Node.js"));
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

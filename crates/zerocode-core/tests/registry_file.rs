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
fn registry_file_parses_and_contains_core_7() {
    let reg =
        LanguageRegistry::from_toml(&languages_toml()).expect("runners/languages.toml is valid");

    let by_id: std::collections::HashMap<u32, &str> = reg
        .list()
        .into_iter()
        .map(|s| (s.id, s.name.as_str()))
        .collect();

    // Core 7 v1 IDs are stable; if these ever change, callers break too.
    assert_eq!(by_id.get(&48).copied(), Some("C"));
    assert_eq!(by_id.get(&52).copied(), Some("C++"));
    assert_eq!(by_id.get(&60).copied(), Some("Go"));
    assert_eq!(by_id.get(&62).copied(), Some("Java"));
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
    // Core 7 compiled + Batch B + Batch C compiled (Kotlin, Scala) + Batch D compiled (Haskell, OCaml, Erlang)
    // + Batch E compiled (C#) + Batch F compiled (COBOL, Swift) + Batch G compiled (Nim, Crystal, Dart)
    for id in [
        48, 52, 60, 62, 73, 110, 111, 112, 113, 114, 115, 120, 121, 130, 131, 132, 140, 150, 152,
        161, 162, 163,
    ] {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("id {id} should exist"));
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
    for id in [63, 71, 100, 101, 102, 103, 104, 105, 106] {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("id {id} should exist"));
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

#[test]
fn java_spec_caps_heap_and_stack_on_run_cmd() {
    // The Java (id 62) run phase passes JVM limits as command-line flags rather
    // than via JAVA_TOOL_OPTIONS: the JVM prints "Picked up JAVA_TOOL_OPTIONS:
    // ..." to stderr whenever that var is set, which would leak into the
    // user-visible output. (Wrapper-launched JVM batch languages — Kotlin,
    // Scala, Groovy, Clojure — still use JAVA_TOOL_OPTIONS because their
    // launchers can't take JVM flags directly; see batch_c_jvm_languages_present.)
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let java = reg.require(62).expect("Java id 62 must be registered");
    let run = java.run_cmd.join(" ");
    assert!(
        run.contains("-Xmx${jvm_heap_mb}m"),
        "Java run_cmd should cap heap via -Xmx${{jvm_heap_mb}}m: {run}"
    );
    assert!(
        run.contains("-XX:+ExitOnOutOfMemoryError"),
        "Java run_cmd should enable ExitOnOutOfMemoryError: {run}"
    );
    assert!(
        run.contains("-Xss512k"),
        "Java run_cmd should cap thread stack size: {run}"
    );
    assert!(
        !java.env.iter().any(|(k, _)| k == "JAVA_TOOL_OPTIONS"),
        "Java should NOT set JAVA_TOOL_OPTIONS (it leaks a 'Picked up...' line to stderr)"
    );
}

#[test]
fn java_spec_has_elevated_default_limits() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let java = reg.require(62).expect("Java id 62 must be registered");
    let defaults = java
        .default_limits
        .as_ref()
        .expect("Java must declare default_limits for JVM overhead");
    assert!(
        defaults.max_pids >= 96,
        "Java default_limits.max_pids should be ≥96 for JVM thread floor: {}",
        defaults.max_pids
    );
    assert!(
        defaults.memory_mb >= 384,
        "Java default_limits.memory_mb should be ≥384 for JVM overhead: {}",
        defaults.memory_mb
    );
}

#[test]
fn java_spec_has_compile_limits() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let java = reg.require(62).expect("Java id 62 must be registered");
    let compile_limits = java
        .compile_limits
        .as_ref()
        .expect("Java must declare compile_limits for javac");
    assert!(
        compile_limits.max_pids >= 96,
        "Java compile_limits.max_pids should be >=96: {}",
        compile_limits.max_pids
    );
    assert!(
        compile_limits.cpu_time >= 10.0,
        "Java compile_limits.cpu_time should be >=10s for javac: {}",
        compile_limits.cpu_time
    );
}

// ---- v1.5 Batch A ----

#[test]
fn batch_a_languages_present_and_interpreted() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();

    let batch_a = [
        (100, "Bash"),
        (101, "Lua"),
        (102, "Perl"),
        (103, "Ruby"),
        (104, "R"),
        (105, "PHP"),
        (106, "TypeScript"),
    ];

    for (id, name) in batch_a {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("{name} (id {id}) should exist"));
        assert_eq!(spec.name, name, "id {id} name mismatch");
        assert!(
            !spec.is_compiled(),
            "{name} (id {id}) should be interpreted (no compile step)"
        );
    }
}

#[test]
fn total_language_count() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    // 7 core + 7 Batch A + 6 Batch B + 4 Batch C + 5 Batch D + 2 Batch E
    // + 5 Batch F + 4 Batch G (Zig/160 removed) + 1 v2 raw-wasm = 41
    assert_eq!(reg.list().len(), 41, "expected 41 languages total");
}

#[test]
fn raw_wasm_is_registered_with_wasm_tier() {
    use zerocode_core::SandboxTier;
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let wasm = reg.require(200).expect("raw-wasm (id 200) missing");
    assert_eq!(wasm.name, "raw-wasm");
    assert_eq!(wasm.tier, SandboxTier::Wasm);
}

#[test]
fn typescript_spec_uses_tsx_runner() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let ts = reg
        .require(106)
        .expect("TypeScript id 106 must be registered");
    let run_joined = ts.run_cmd.join(" ");
    assert!(
        run_joined.contains("tsx"),
        "TypeScript run_cmd should use tsx: {run_joined}"
    );
    assert_eq!(ts.source_file, "main.ts");
}

#[test]
fn batch_b_compiled_languages_present() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let batch_b = [
        (110, "Fortran"),
        (111, "Pascal"),
        (112, "D"),
        (113, "Objective-C"),
        (114, "Assembly"),
        (115, "Ada"),
    ];
    for (id, name) in batch_b {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("{name} (id {id}) should exist"));
        assert_eq!(spec.name, name);
        assert!(spec.is_compiled(), "{name} should be compiled");
    }
}

#[test]
fn batch_c_jvm_languages_cap_heap_without_tool_options() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let batch_c = [
        (120, "Kotlin"),
        (121, "Scala"),
        (122, "Groovy"),
        (123, "Clojure"),
    ];
    for (id, name) in batch_c {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("{name} (id {id}) should exist"));
        assert_eq!(spec.name, name);
        // JAVA_TOOL_OPTIONS leaks a "Picked up JAVA_TOOL_OPTIONS: ..." banner to
        // stderr — batch-C JVM langs must avoid it.
        assert!(
            !spec.env.iter().any(|(k, _)| k == "JAVA_TOOL_OPTIONS"),
            "{name} should NOT use JAVA_TOOL_OPTIONS (it leaks a stderr banner)"
        );
        // Heap is still capped: via JAVA_OPTS (wrapper launchers read it) or via
        // -Xmx on the run command (Kotlin runs `java` directly).
        let java_opts = spec
            .env
            .iter()
            .any(|(k, v)| k == "JAVA_OPTS" && v.contains("${jvm_heap_mb}"));
        let xmx_in_run = spec.run_cmd.iter().any(|a| a.contains("-Xmx${jvm_heap_mb}m"));
        assert!(
            java_opts || xmx_in_run,
            "{name} should cap heap via JAVA_OPTS env or -Xmx on run_cmd"
        );
    }
}

#[test]
fn batch_d_functional_languages_present() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let batch_d = [
        (130, "Haskell"),
        (131, "OCaml"),
        (132, "Erlang"),
        (133, "Elixir"),
        (134, "Common Lisp"),
    ];
    for (id, name) in batch_d {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("{name} (id {id}) should exist"));
        assert_eq!(spec.name, name);
    }
}

#[test]
fn batch_efg_languages_present() {
    let reg = LanguageRegistry::from_toml(&languages_toml()).unwrap();
    let langs = [
        (140, "C#"),
        (141, "F#"),
        (150, "COBOL"),
        (151, "Prolog"),
        (152, "Swift"),
        (153, "Octave"),
        (154, "SQL"),
        (161, "Nim"),
        (162, "Crystal"),
        (163, "Dart"),
        (164, "Julia"),
    ];
    for (id, name) in langs {
        let spec = reg
            .require(id)
            .unwrap_or_else(|_| panic!("{name} (id {id}) should exist"));
        assert_eq!(spec.name, name);
    }
}

//! v1.5 Batch D edge cases: Haskell, OCaml, Erlang, Elixir, Common Lisp.
//! Functional and academic languages — each tests hello world.

use zerocode_core::Status;

use super::harness::*;

// ═══════════════════════════════════════════════════════════════════════
// Haskell (130)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn haskell_hello() {
    let source = r#"main :: IO ()
main = putStrLn "hello"
"#;
    let result = run(job(HASKELL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// OCaml (131)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn ocaml_hello() {
    let source = r#"print_endline "hello"
"#;
    let result = run(job(OCAML, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Erlang (132)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn erlang_hello() {
    let source = r#"-module(main).
-export([main/0]).

main() ->
    io:format("hello~n").
"#;
    let result = run(job(ERLANG, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Elixir (133)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn elixir_hello() {
    let source = r#"IO.puts("hello")"#;
    let result = run(job(ELIXIR, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Common Lisp (134)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn common_lisp_hello() {
    let source = r#"(format t "hello~%")"#;
    let result = run(job(COMMON_LISP, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

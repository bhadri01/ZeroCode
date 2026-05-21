//! v1.5 Batches E/F/G edge cases:
//!   E — C# (140), F# (141)
//!   F — COBOL (150), Prolog (151), Swift (152), Octave (153), SQL (154)
//!   G — Nim (161), Crystal (162), Dart (163), Julia (164)  [Zig/160 removed]
//!
//! Each language tests hello world.

use zerocode_core::{ResourceLimits, Status};

use super::harness::*;

/// .NET languages need generous limits for runtime startup.
fn dotnet_limits() -> ResourceLimits {
    ResourceLimits {
        cpu_time: 10.0,
        wall_time: 20.0,
        memory_mb: 512,
        max_pids: 96,
        max_stdout: 64 * 1024,
        max_stderr: 64 * 1024,
        enable_network: false,
    }
}

// ═══════════════════════════════════════════════════════════════════════
// C# (140)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn csharp_hello() {
    let source = r#"using System;
class Program {
    static void Main() {
        Console.WriteLine("hello");
    }
}
"#;
    let result = run(job_with_limits(CSHARP, source, "", dotnet_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// F# (141)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn fsharp_hello() {
    let source = r#"printfn "hello"
"#;
    let result = run(job_with_limits(FSHARP, source, "", dotnet_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// COBOL (150)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn cobol_hello() {
    let source = r#"       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       PROCEDURE DIVISION.
           DISPLAY "hello".
           STOP RUN.
"#;
    let result = run(job(COBOL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Prolog (151)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn prolog_hello() {
    let source = r#":- initialization(main).
main :- write('hello'), nl, halt.
"#;
    let result = run(job(PROLOG, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Swift (152)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn swift_hello() {
    let source = r#"print("hello")"#;
    let result = run(job(SWIFT, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Octave (153)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn octave_hello() {
    let source = r#"disp("hello")"#;
    let result = run(job(OCTAVE, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// SQL (154) — SQLite
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn sql_hello() {
    let source = r#"SELECT 'hello' AS greeting;"#;
    let result = run(job(SQL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// Zig (160) removed — its compiler can't run in the sandbox (cross-directory
// rename returns EXDEV in the per-submission tmpfs).

// ═══════════════════════════════════════════════════════════════════════
// Nim (161)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn nim_hello() {
    let source = r#"echo "hello""#;
    let result = run(job(NIM, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Crystal (162)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn crystal_hello() {
    let source = r#"puts "hello""#;
    let result = run(job(CRYSTAL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Dart (163)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn dart_hello() {
    let source = r#"void main() {
  print('hello');
}
"#;
    let result = run(job(DART, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Julia (164)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn julia_hello() {
    let source = r#"println("hello")"#;
    let result = run(job(JULIA, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

//! Rust edge cases. Compiled with `rustc -O -C panic=abort`.

use zerocode_core::{Signal, Status};

use super::harness::*;

#[tokio::test]
async fn rust_hello_world() {
    let source = r#"fn main() { println!("hello"); }"#;
    let result = run(job(RUST, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn rust_compile_error() {
    let source = "fn main() { let x: i32 = \"not a number\"; }";
    let result = run(job(RUST, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "expected CompileError, got {:?}",
        result.status,
    );
    let compile_out = String::from_utf8_lossy(result.compile_output.as_ref().unwrap());
    assert!(compile_out.contains("mismatched types") || compile_out.contains("error"));
}

#[tokio::test]
async fn rust_panic_abort_sigabrt() {
    // With -C panic=abort, panic!() calls abort() → SIGABRT.
    let source = r#"fn main() { panic!("boom"); }"#;
    let result = run(job(RUST, source)).await;
    assert!(
        matches!(result.status, Status::RuntimeError(Signal::Sigabrt)),
        "panic=abort should SIGABRT, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn rust_non_zero_exit() {
    let source = r#"
fn main() {
    std::process::exit(3);
}
"#;
    let result = run(job(RUST, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(3)),
        "exit(3) should be NonZeroExit(3), got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn rust_stdin_read() {
    let source = r#"
use std::io::{self, BufRead};
fn main() {
    let stdin = io::stdin();
    if let Some(Ok(line)) = stdin.lock().lines().next() {
        println!("got: {line}");
    }
}
"#;
    let result = run(job_with_stdin(RUST, source, "test\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: test"));
}

#[tokio::test]
async fn rust_index_out_of_bounds_abort() {
    let source = r#"
fn main() {
    let v = vec![1, 2, 3];
    println!("{}", v[10]);
}
"#;
    let result = run(job(RUST, source)).await;
    // With panic=abort, index OOB → abort → SIGABRT.
    assert!(
        matches!(result.status, Status::RuntimeError(Signal::Sigabrt)),
        "index OOB with panic=abort should SIGABRT, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn rust_integer_overflow_release_wraps() {
    // In release mode (-O), integer overflow wraps instead of panicking.
    let source = r#"
fn main() {
    let x: u8 = 255;
    let y: u8 = x.wrapping_add(1);
    println!("{y}");
}
"#;
    let result = run(job(RUST, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert_eq!(stdout.trim(), "0");
}

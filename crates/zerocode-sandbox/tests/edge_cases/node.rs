//! Node.js 22 edge cases.

use zerocode_core::Status;
use zerocode_core::status::TimeLimitKind;

use super::harness::*;

// ── Hello world ─────────────────────────────────────────────────────────

#[tokio::test]
async fn hello_world() {
    let result = run(job(NODE, "console.log('hello')")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ── process.exit(1) → NonZeroExit ───────────────────────────────────────

#[tokio::test]
async fn process_exit_nze() {
    let result = run(job(NODE, "process.exit(1)")).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(1)),
        "expected NonZeroExit(1), got {:?}",
        result.status,
    );
}

// ── Unhandled promise rejection → NonZeroExit (--unhandled-rejections=strict)

#[tokio::test]
async fn unhandled_rejection_strict() {
    let source = "Promise.reject(new Error('boom'));";
    let result = run(job(NODE, source)).await;
    // With --unhandled-rejections=strict, this should cause a non-zero exit.
    assert!(
        matches!(result.status, Status::NonZeroExit(_)),
        "unhandled rejection should exit non-zero with strict mode, got {:?}",
        result.status,
    );
}

// ── Infinite event loop → wall TLE ──────────────────────────────────────

#[tokio::test]
async fn event_loop_hang_wall_tle() {
    let source = "setInterval(() => {}, 100);";
    let result = run(job_tight(NODE, source)).await;
    assert!(
        matches!(
            result.status,
            Status::TimeLimitExceeded(TimeLimitKind::Wall)
        ),
        "infinite setInterval should wall-TLE, got {:?}",
        result.status,
    );
}

// ── CPU-bound loop → TLE ────────────────────────────────────────────────

#[tokio::test]
async fn cpu_bound_loop_tle() {
    let source = "while(true) {}";
    let result = run(job_tight(NODE, source)).await;
    assert!(
        matches!(result.status, Status::TimeLimitExceeded(_)),
        "expected TLE, got {:?}",
        result.status,
    );
}

// ── Thrown error → NonZeroExit ──────────────────────────────────────────

#[tokio::test]
async fn thrown_error_nze() {
    let result = run(job(NODE, "throw new Error('oops');")).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(1)),
        "uncaught throw should exit 1, got {:?}",
        result.status,
    );
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("oops"));
}

// ── Stdin read ──────────────────────────────────────────────────────────

#[tokio::test]
async fn stdin_read() {
    let source = r#"
const fs = require('fs');
const input = fs.readFileSync('/dev/stdin', 'utf8');
console.log('got: ' + input.trim());
"#;
    let result = run(job_with_stdin(NODE, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

// ── Memory bomb → MemoryLimitExceeded or NonZeroExit ────────────────────

#[tokio::test]
async fn memory_bomb() {
    let source = r#"
const arrays = [];
while (true) {
    arrays.push(new Array(1024 * 1024).fill(0));
}
"#;
    let result = run(job_tight(NODE, source)).await;
    assert!(
        matches!(
            result.status,
            Status::MemoryLimitExceeded | Status::NonZeroExit(_) | Status::RuntimeError(_)
        ),
        "memory bomb should fail, got {:?}",
        result.status,
    );
}

// ── JSON output ─────────────────────────────────────────────────────────

#[tokio::test]
async fn json_output() {
    let source = "console.log(JSON.stringify({a: 1, b: [2, 3]}))";
    let result = run(job(NODE, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains(r#""a":1"#));
}

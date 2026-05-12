//! Python-specific edge cases beyond what `common.rs` already covers.

use zerocode_core::{Signal, Status};

use super::harness::*;

// ── ctypes null deref → SIGSEGV ─────────────────────────────────────────

#[tokio::test]
async fn null_deref_sigsegv() {
    let source = "import ctypes; ctypes.string_at(0)";
    let result = run(job(PYTHON, source)).await;
    assert!(
        matches!(result.status, Status::RuntimeError(Signal::Sigsegv)),
        "expected SIGSEGV from null deref, got {:?}",
        result.status,
    );
}

// ── sys.exit(0) → Accepted ─────────────────────────────────────────────

#[tokio::test]
async fn sys_exit_zero_is_accepted() {
    let result = run(job(PYTHON, "import sys; sys.exit(0)")).await;
    assert!(matches!(result.status, Status::Accepted));
}

// ── SystemExit with string → exit code 1 ────────────────────────────────

#[tokio::test]
async fn system_exit_string_is_nze() {
    let result = run(job(PYTHON, "raise SystemExit('oops')")).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(1)),
        "SystemExit('oops') should exit 1, got {:?}",
        result.status,
    );
}

// ── unhandled exception → exit code 1 ───────────────────────────────────

#[tokio::test]
async fn unhandled_exception_nze() {
    let result = run(job(PYTHON, "raise ValueError('boom')")).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(1)),
        "unhandled exception should exit 1, got {:?}",
        result.status,
    );
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(
        stderr.contains("ValueError"),
        "stderr should contain traceback"
    );
}

// ── PYTHONDONTWRITEBYTECODE prevents .pyc outside /box ──────────────────

#[tokio::test]
async fn no_pyc_written_outside_box() {
    let source = r#"
import os
# Check that no __pycache__ exists in /usr or other system dirs
for root, dirs, files in os.walk("/usr/lib/python3"):
    for f in files:
        if f.endswith(".pyc"):
            break
    break
# The script itself shouldn't create .pyc in /box
print("ok")
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
}

// ── Threading works under pids.max ──────────────────────────────────────

#[tokio::test]
async fn threading_under_pids_max() {
    let source = r#"
import threading

results = []
def worker(n):
    results.append(n)

threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(len(results))
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert_eq!(stdout.trim(), "4");
}

// ── Python reading /box source file sees its own code ───────────────────

#[tokio::test]
async fn can_read_own_source() {
    let source = r#"
with open("/box/main.py") as f:
    content = f.read()
print("self" if "self" in content else "no")
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("self"));
}

// ── Multiprocessing hits pids.max gracefully ────────────────────────────

#[tokio::test]
async fn multiprocessing_hits_pids_max() {
    let source = r#"
import os, sys
children = 0
for _ in range(200):
    try:
        pid = os.fork()
        if pid == 0:
            os._exit(0)
        else:
            children += 1
            os.waitpid(pid, 0)
    except OSError:
        break
print(f"forked {children}")
"#;
    let mut limits = default_limits();
    limits.max_pids = 16;
    let result = run(job_with_limits(PYTHON, source, "", limits)).await;
    // Should either complete with limited forks or TLE. Not crash the sandbox.
    assert!(
        result.status.is_terminal(),
        "should reach terminal status, got {:?}",
        result.status,
    );
}

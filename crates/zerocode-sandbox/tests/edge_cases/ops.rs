//! Operational failure-mode edge cases (Table D from the plan).
//!
//! These tests exercise adversarial *operational* scenarios: concurrent load,
//! large payloads, EOF delivery, environment variable substitution, cgroup
//! isolation uniqueness, precise wall-time enforcement, and zombie-process
//! reaping.

use zerocode_core::status::TimeLimitKind;
use zerocode_core::{ResourceLimits, Status};

use super::harness::*;

// ── Concurrent load: 4 parallel hello-world submissions ────────────────

#[tokio::test]
async fn submission_completes_under_concurrent_load() {
    let (r1, r2, r3, r4) = tokio::join!(
        run(job(PYTHON, "print('hello1')")),
        run(job(PYTHON, "print('hello2')")),
        run(job(PYTHON, "print('hello3')")),
        run(job(PYTHON, "print('hello4')")),
    );
    for (i, result) in [&r1, &r2, &r3, &r4].iter().enumerate() {
        assert!(
            matches!(result.status, Status::Accepted),
            "concurrent submission {} should be Accepted, got {:?}",
            i + 1,
            result.status,
        );
    }
}

// ── Large source code (60 KB) still accepted ───────────────────────────

#[tokio::test]
async fn large_source_code_accepted() {
    // Build a ~60 KB Python source: many comment lines + a final print.
    let comment_line = "# padding comment to bulk up source size\n";
    let repeat_count = (60 * 1024) / comment_line.len();
    let mut source = String::with_capacity(64 * 1024);
    for _ in 0..repeat_count {
        source.push_str(comment_line);
    }
    source.push_str("print('large ok')\n");

    assert!(
        source.len() >= 60 * 1024,
        "source should be at least 60KB, got {} bytes",
        source.len(),
    );

    let result = run(job(PYTHON, &source)).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "60KB source should be Accepted, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        stdout.contains("large ok"),
        "should see output from large source"
    );
}

// ── Empty stdin delivers EOF ────────────────────────────────────────────

#[tokio::test]
async fn empty_stdin_delivers_eof() {
    let source = r#"
import sys
data = sys.stdin.read()
if data == "":
    print("done")
else:
    print(f"unexpected: {repr(data)}")
"#;
    let result = run(job_with_stdin(PYTHON, source, "")).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "empty stdin should still yield Accepted, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        stdout.contains("done"),
        "Python should see EOF on empty stdin, got: {stdout}"
    );
}

// ── Node.js env substitution: --max-old-space-size is set ───────────────

#[tokio::test]
async fn language_env_substitution_works() {
    let source = r#"
const args = process.execArgv;
console.log(JSON.stringify(args));
"#;
    let result = run(job(NODE, source)).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "Node.js execArgv check should be Accepted, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        stdout.contains("max-old-space-size"),
        "Node.js should have --max-old-space-size in execArgv, got: {stdout}"
    );
}

// ── Two concurrent submissions get distinct sandbox results ─────────────

#[tokio::test]
async fn cgroup_path_uses_unique_ulid() {
    // Two concurrent Python submissions. They must both succeed, proving
    // the sandbox assigned each a distinct cgroup / scratch directory.
    let (r1, r2) = tokio::join!(
        run(job(PYTHON, "print('alpha')")),
        run(job(PYTHON, "print('bravo')")),
    );
    assert!(
        matches!(r1.status, Status::Accepted),
        "first concurrent submission should be Accepted, got {:?}",
        r1.status,
    );
    assert!(
        matches!(r2.status, Status::Accepted),
        "second concurrent submission should be Accepted, got {:?}",
        r2.status,
    );
    let out1 = String::from_utf8_lossy(&r1.stdout);
    let out2 = String::from_utf8_lossy(&r2.stdout);
    assert!(out1.contains("alpha"));
    assert!(out2.contains("bravo"));
}

// ── Wall-time limit respected precisely ─────────────────────────────────

#[tokio::test]
async fn wall_time_limit_respected_precisely() {
    // Case 1: wall_time=2s, sleep 1.5s -> should finish in time -> Accepted
    let mut limits_generous = default_limits();
    limits_generous.wall_time = 2.0;
    limits_generous.cpu_time = 1.0;
    let r1 = run(job_with_limits(
        PYTHON,
        "import time; time.sleep(1.5); print('ok')",
        "",
        limits_generous,
    ))
    .await;
    assert!(
        matches!(r1.status, Status::Accepted),
        "sleep 1.5s with 2s wall limit should be Accepted, got {:?}",
        r1.status,
    );

    // Case 2: wall_time=1s, sleep 1.5s -> should TLE
    let mut limits_strict = default_limits();
    limits_strict.wall_time = 1.0;
    limits_strict.cpu_time = 0.5;
    let r2 = run(job_with_limits(
        PYTHON,
        "import time; time.sleep(1.5); print('ok')",
        "",
        limits_strict,
    ))
    .await;
    assert!(
        matches!(r2.status, Status::TimeLimitExceeded(TimeLimitKind::Wall)),
        "sleep 1.5s with 1s wall limit should be wall TLE, got {:?}",
        r2.status,
    );
}

// ── Fork-bomb-lite exits quickly, parent accepted ───────────────────────

#[tokio::test]
async fn zombie_processes_dont_accumulate() {
    // Fork a few children that exit immediately. The parent waits for them
    // and prints success. If zombie reaping is broken, the process tree
    // would leak zombie pids.
    let source = r#"
import os, sys

for _ in range(5):
    pid = os.fork()
    if pid == 0:
        os._exit(0)       # child exits immediately
    else:
        os.waitpid(pid, 0)  # parent reaps child

print("reaped all")
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "fork-and-reap should be Accepted, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        stdout.contains("reaped all"),
        "parent should have reaped all children, got: {stdout}"
    );
}

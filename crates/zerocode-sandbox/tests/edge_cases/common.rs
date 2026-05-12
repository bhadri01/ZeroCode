//! Language-agnostic sandbox edge cases. Uses Python as the vehicle since it's
//! the simplest to express adversarial patterns in, but these tests exercise
//! cgroup / namespace / seccomp / landlock enforcement, not Python semantics.

use zerocode_core::status::TimeLimitKind;
use zerocode_core::Status;

use super::harness::*;

// ── Infinite loop → TimeLimitExceeded(Wall) ─────────────────────────────

#[tokio::test]
async fn infinite_loop_hits_wall_tle() {
    let result = run(job_tight(PYTHON, "while True: pass")).await;
    assert!(
        matches!(result.status, Status::TimeLimitExceeded(TimeLimitKind::Wall)),
        "expected wall TLE, got {:?}",
        result.status,
    );
}

// ── Sleep eats wall time but not CPU → TimeLimitExceeded(Wall) ──────────

#[tokio::test]
async fn sleep_hits_wall_tle() {
    let result = run(job_tight(PYTHON, "import time; time.sleep(999)")).await;
    assert!(
        matches!(result.status, Status::TimeLimitExceeded(TimeLimitKind::Wall)),
        "expected wall TLE from sleep, got {:?}",
        result.status,
    );
}

// ── Memory bomb → MemoryLimitExceeded ───────────────────────────────────

#[tokio::test]
async fn memory_bomb_hits_oom() {
    let result = run(job_tight(PYTHON, "x = [0] * (10**9)")).await;
    assert!(
        matches!(result.status, Status::MemoryLimitExceeded),
        "expected MemoryLimitExceeded, got {:?}",
        result.status,
    );
}

// ── Fork bomb → pids.max → NonZeroExit or RuntimeError ─────────────────

#[tokio::test]
async fn fork_bomb_blocked_by_pids_max() {
    let source = r#"
import os
while True:
    try:
        os.fork()
    except OSError:
        pass
"#;
    let mut limits = tight_limits();
    limits.max_pids = 8;
    let result = run(job_with_limits(PYTHON, source, "", limits)).await;
    // Once pids.max is hit, fork() raises OSError. The bare loop will
    // eventually wall-TLE or the process tree gets killed by cgroup.kill.
    // Either TLE or NonZeroExit or MemoryLimitExceeded is acceptable — the
    // key assertion is that we don't hang forever or panic.
    assert!(
        result.status.is_terminal(),
        "fork bomb should reach a terminal status, got {:?}",
        result.status,
    );
    // Should NOT be Accepted (the code has no clean exit path).
    assert!(
        !matches!(result.status, Status::Accepted),
        "fork bomb should not be Accepted",
    );
}

// ── Output bomb → stdout capped at max_stdout ──────────────────────────

#[tokio::test]
async fn output_bomb_stdout_capped() {
    let source = r#"print("x" * (1024 * 1024))"#;
    let mut limits = default_limits();
    limits.max_stdout = 4096;
    let result = run(job_with_limits(PYTHON, source, "", limits)).await;
    assert!(
        result.stdout.len() <= limits.max_stdout as usize,
        "stdout should be capped at {} bytes, got {}",
        limits.max_stdout,
        result.stdout.len(),
    );
}

// ── Block on stdin → reads EOF, exits cleanly ───────────────────────────

#[tokio::test]
async fn stdin_eof_no_hang() {
    // input() with no stdin provided → reads /box/stdin which is empty → EOFError
    let result = run(job(PYTHON, r#"
try:
    x = input()
    print(x)
except EOFError:
    print("got eof")
"#)).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "expected Accepted after stdin EOF, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got eof"), "should have caught EOFError");
}

// ── Empty program → exit 0 → Accepted ──────────────────────────────────

#[tokio::test]
async fn empty_program_accepted() {
    let result = run(job(PYTHON, "")).await;
    // Empty Python file exits 0.
    assert!(
        matches!(result.status, Status::Accepted),
        "empty Python script should be Accepted, got {:?}",
        result.status,
    );
}

// ── Hello world → Accepted ──────────────────────────────────────────────

#[tokio::test]
async fn hello_world_accepted() {
    let result = run(job(PYTHON, "print('hello')")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
    assert_eq!(result.exit_code, Some(0));
}

// ── Non-zero exit → NonZeroExit ─────────────────────────────────────────

#[tokio::test]
async fn non_zero_exit() {
    let result = run(job(PYTHON, "import sys; sys.exit(42)")).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(42)),
        "expected NonZeroExit(42), got {:?}",
        result.status,
    );
    assert_eq!(result.exit_code, Some(42));
}

// ── Exit 0 with stderr → Accepted, stderr surfaced ─────────────────────

#[tokio::test]
async fn exit_zero_with_stderr_is_accepted() {
    let result = run(job(PYTHON, r#"
import sys
print("out", flush=True)
print("err", file=sys.stderr, flush=True)
"#)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stdout.contains("out"));
    assert!(stderr.contains("err"));
}

// ── Stdin data is delivered correctly ────────────────────────────────────

#[tokio::test]
async fn stdin_data_delivered() {
    let source = r#"
line = input()
print(f"got: {line}")
"#;
    let result = run(job_with_stdin(PYTHON, source, "hello world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: hello world"));
}

// ── Multiline stdin ─────────────────────────────────────────────────────

#[tokio::test]
async fn multiline_stdin() {
    let source = r#"
import sys
lines = sys.stdin.readlines()
print(len(lines))
"#;
    let result = run(job_with_stdin(PYTHON, source, "a\nb\nc\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.trim() == "3");
}

// ── Large stdout within limits ──────────────────────────────────────────

#[tokio::test]
async fn large_stdout_within_limits() {
    let source = r#"print("x" * 30000)"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    assert!(result.stdout.len() >= 30000);
}

// ── Code that produces output then crashes → partial output + crash ─────

#[tokio::test]
async fn output_then_crash() {
    let source = r#"
import sys, ctypes
print("before", flush=True)
ctypes.string_at(0)
"#;
    let result = run(job(PYTHON, source)).await;
    // Should be a signal death (SIGSEGV from null deref)
    assert!(
        matches!(result.status, Status::RuntimeError(_) | Status::NonZeroExit(_)),
        "expected crash after output, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("before"), "partial output should be captured");
}

// ── mmap huge anonymous region → cgroup OOM ─────────────────────────────

#[tokio::test]
async fn mmap_anon_bomb_oom() {
    let source = r#"
import mmap
# Try to mmap a 2GB anonymous region — will hit cgroup memory.max
m = mmap.mmap(-1, 2 * 1024 * 1024 * 1024)
m.write(b"x" * (1024 * 1024))
"#;
    let result = run(job_tight(PYTHON, source)).await;
    // Either MemoryLimitExceeded (cgroup OOM) or NonZeroExit (mmap returns error)
    assert!(
        matches!(
            result.status,
            Status::MemoryLimitExceeded | Status::NonZeroExit(_) | Status::RuntimeError(_)
        ),
        "mmap bomb should fail, got {:?}",
        result.status,
    );
    assert!(!matches!(result.status, Status::Accepted));
}

// ── Network access blocked ──────────────────────────────────────────────

#[tokio::test]
async fn network_blocked() {
    let source = r#"
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    s.connect(("8.8.8.8", 53))
    print("connected")
except (OSError, socket.error) as e:
    print(f"blocked: {e}")
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        stdout.contains("blocked"),
        "network should be blocked inside sandbox, got stdout: {stdout}"
    );
}

// ── /proc isolation: can't see host processes ───────────────────────────

#[tokio::test]
async fn proc_isolated() {
    let source = r#"
import os
pids = os.listdir("/proc")
numeric = [p for p in pids if p.isdigit()]
print(len(numeric))
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    let count: usize = stdout.trim().parse().unwrap_or(999);
    // Inside a PID namespace with a fresh procfs mount, only 1 or 2 pids
    // should be visible (the sandbox child + maybe the Python interpreter's
    // thread). Host typically has hundreds.
    assert!(
        count <= 10,
        "PID namespace should isolate /proc; saw {count} numeric pids"
    );
}

// ── Filesystem isolation: can't read host files ─────────────────────────

#[tokio::test]
async fn cannot_read_host_etc_shadow() {
    let source = r#"
try:
    with open("/etc/shadow") as f:
        print(f"LEAK: {f.readline()}")
except (PermissionError, FileNotFoundError, IOError) as e:
    print(f"blocked: {e}")
"#;
    let result = run(job(PYTHON, source)).await;
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        !stdout.contains("LEAK"),
        "/etc/shadow should not be readable inside sandbox"
    );
}

// ── Can't write to read-only rootfs ─────────────────────────────────────

#[tokio::test]
async fn rootfs_is_readonly() {
    let source = r#"
try:
    with open("/usr/EVIL", "w") as f:
        f.write("pwned")
    print("WRITABLE")
except (PermissionError, OSError, IOError) as e:
    print(f"readonly: {e}")
"#;
    let result = run(job(PYTHON, source)).await;
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(
        stdout.contains("readonly"),
        "rootfs should be read-only, got: {stdout}"
    );
}

// ── /box is writable ────────────────────────────────────────────────────

#[tokio::test]
async fn box_is_writable() {
    let source = r#"
with open("/box/test.txt", "w") as f:
    f.write("hello")
with open("/box/test.txt") as f:
    print(f.read())
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ── /tmp is writable ────────────────────────────────────────────────────

#[tokio::test]
async fn tmp_is_writable() {
    let source = r#"
import tempfile, os
fd, path = tempfile.mkstemp(dir="/tmp")
os.write(fd, b"test")
os.close(fd)
with open(path) as f:
    print(f.read())
"#;
    let result = run(job(PYTHON, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("test"));
}

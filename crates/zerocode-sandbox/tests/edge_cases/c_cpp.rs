//! C and C++ edge cases — signals, compile errors, undefined behavior.

use zerocode_core::{Signal, Status};

use super::harness::*;

// ═══════════════════════════════════════════════════════════════════════
// C
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn c_hello_world() {
    let source = r#"
#include <stdio.h>
int main() { printf("hello\n"); return 0; }
"#;
    let result = run(job(C, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn c_null_deref_sigsegv() {
    let source = r#"
int main() { int *p = 0; return *p; }
"#;
    let result = run(job(C, source)).await;
    assert!(
        matches!(result.status, Status::RuntimeError(Signal::Sigsegv)),
        "null deref should SIGSEGV, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn c_division_by_zero_sigfpe() {
    let source = r#"
#include <stdio.h>
#include <stdlib.h>
int main() {
    volatile int a = 1;
    volatile int b = 0;
    printf("%d\n", a / b);
    return 0;
}
"#;
    let result = run(job(C, source)).await;
    assert!(
        matches!(result.status, Status::RuntimeError(Signal::Sigfpe)),
        "division by zero should SIGFPE, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn c_stack_overflow_sigsegv() {
    let source = r#"
int recurse(int n) { return recurse(n + 1) + n; }
int main() { return recurse(0); }
"#;
    let result = run(job(C, source)).await;
    assert!(
        matches!(result.status, Status::RuntimeError(Signal::Sigsegv)),
        "stack overflow should SIGSEGV, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn c_compile_error() {
    let source = "int main() { undefined_function(); }";
    let result = run(job(C, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "undefined function should be CompileError, got {:?}",
        result.status,
    );
    assert!(result.compile_output.is_some());
    let compile_out = String::from_utf8_lossy(result.compile_output.as_ref().unwrap());
    assert!(
        compile_out.contains("undefined") || compile_out.contains("undeclared"),
        "compile output should mention undefined: {compile_out}"
    );
}

#[tokio::test]
async fn c_stdin_read() {
    let source = r#"
#include <stdio.h>
int main() {
    char buf[256];
    if (fgets(buf, sizeof(buf), stdin)) printf("got: %s", buf);
    return 0;
}
"#;
    let result = run(job_with_stdin(C, source, "test input\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: test input"));
}

#[tokio::test]
async fn c_non_zero_exit() {
    let source = "int main() { return 7; }";
    let result = run(job(C, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(7)),
        "exit(7) should be NonZeroExit(7), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// C++
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn cpp_hello_world() {
    let source = r#"
#include <iostream>
int main() { std::cout << "hello" << std::endl; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn cpp_compile_error() {
    let source = r#"
#include <iostream>
int main() { std::cout << undefined_var; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "expected CompileError, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn cpp_exception_nze() {
    let source = r#"
#include <stdexcept>
int main() { throw std::runtime_error("boom"); }
"#;
    let result = run(job(CPP, source)).await;
    // Uncaught exception → std::terminate → SIGABRT
    assert!(
        matches!(
            result.status,
            Status::RuntimeError(Signal::Sigabrt) | Status::NonZeroExit(_)
        ),
        "uncaught exception should abort or NZE, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn cpp_stack_protector_abort() {
    // Deliberately overflow a stack buffer. With -fstack-protector-strong
    // this should trigger __stack_chk_fail → SIGABRT.
    let source = r#"
#include <cstring>
void smash() {
    char buf[8];
    memset(buf, 'A', 256);
}
int main() { smash(); return 0; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(
        matches!(
            result.status,
            Status::RuntimeError(Signal::Sigabrt) | Status::RuntimeError(Signal::Sigsegv)
        ),
        "stack smash should SIGABRT or SIGSEGV, got {:?}",
        result.status,
    );
}

// ── <bits/stdc++.h> ────────────────────────────────────────────────────
//
// The near-universal opening line of competitive and campus-placement C++.
// It pulls in the entire standard library, and a cold parse costs ~3.4 s /
// ~294 MB — which used to blow past the compile-phase cgroup ceiling. Because
// most of that footprint is reclaimable page cache the cgroup ground away in
// reclaim rather than OOMing, so the submission burned its whole wall budget
// and came back `time_limit_exceeded` with memory pinned at exactly the
// ceiling. Two things keep it fast now: a precompiled header baked into the
// runner image (runners/Dockerfile), and a compile ceiling sized for the
// fallback path when the PCH can't apply.

#[tokio::test]
async fn cpp_bits_stdcpp_compiles_and_runs() {
    let source = r#"
#include <bits/stdc++.h>
int main(){ std::cout << "OK"; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "<bits/stdc++.h> must compile and run, got {:?} (compile_output: {})",
        result.status,
        String::from_utf8_lossy(result.compile_output.as_deref().unwrap_or_default()),
    );
    assert_eq!(String::from_utf8_lossy(&result.stdout), "OK");
}

#[tokio::test]
async fn cpp_bits_stdcpp_uses_the_precompiled_header() {
    // Guards the PCH itself. Without it this compile takes ~3.4 s; with it,
    // under a second. A generous 2.5 s bound still fails loudly if the PCH
    // stops being picked up (a flag drift between runners/Dockerfile and the
    // id=52 compile_cmd silently falls back to parsing the real header).
    let source = r#"
#include <bits/stdc++.h>
using namespace std;
int main(){ vector<int> v{3,1,2}; sort(v.begin(), v.end()); for (int x : v) cout << x; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    assert_eq!(String::from_utf8_lossy(&result.stdout), "123");
    assert!(
        result.compile_time.as_secs_f64() < 2.5,
        "<bits/stdc++.h> compile took {:?} — the precompiled header is not being used",
        result.compile_time,
    );
}

#[tokio::test]
async fn cpp_bits_stdcpp_survives_without_the_precompiled_header() {
    // GCC only consults a PCH when the include is the first thing in the
    // translation unit. A student who puts any other include above it lands on
    // the ~294 MB cold-parse path — which is exactly the case the old 192 MB
    // compile ceiling could not fit. This must still succeed, just slower.
    let source = r#"
#include <iostream>
#include <bits/stdc++.h>
int main(){ std::cout << "OK"; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "<bits/stdc++.h> behind another include must still compile, got {:?}",
        result.status,
    );
    assert_eq!(String::from_utf8_lossy(&result.stdout), "OK");
}

#[tokio::test]
async fn cpp_compile_time_is_billed_separately_from_run_time() {
    // `time` must measure the submitted program, not our compiler. A C++ hello
    // world runs in single-digit milliseconds; if the compile phase leaked into
    // cpu_time it would be hundreds of times that.
    let source = r#"
#include <bits/stdc++.h>
int main(){ std::cout << "OK"; }
"#;
    let result = run(job(CPP, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    assert!(
        result.compile_time > std::time::Duration::ZERO,
        "a compiled language must report a non-zero compile_time",
    );
    assert!(
        result.cpu_time < result.compile_time,
        "run-phase cpu_time ({:?}) should be far below compile_time ({:?}) for a hello world — \
         the compiler's CPU is leaking into the reported execution time",
        result.cpu_time,
        result.compile_time,
    );
}

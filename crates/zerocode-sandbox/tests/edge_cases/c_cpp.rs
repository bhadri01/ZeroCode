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

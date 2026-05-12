//! v1.5 Batch B edge cases: Fortran, Pascal, D, Objective-C, Assembly, Ada.
//! All compiled languages — each tests hello world and compile error.

use zerocode_core::Status;

use super::harness::*;

// ═══════════════════════════════════════════════════════════════════════
// Fortran (110)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn fortran_hello() {
    let source = r#"program hello
  print *, "hello"
end program hello
"#;
    let result = run(job(FORTRAN, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn fortran_compile_error() {
    let source = r#"program bad
  call undefined_subroutine()
end program bad
"#;
    let result = run(job(FORTRAN, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "undefined subroutine should be CompileError, got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Pascal (111)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn pascal_hello() {
    let source = r#"program Hello;
begin
  writeln('hello');
end.
"#;
    let result = run(job(PASCAL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn pascal_compile_error() {
    let source = r#"program Bad;
begin
  writeln('missing closing
end.
"#;
    let result = run(job(PASCAL, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "unterminated string should be CompileError, got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// D (112)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn d_hello() {
    let source = r#"import std.stdio;
void main() {
    writeln("hello");
}
"#;
    let result = run(job(D_LANG, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn d_compile_error() {
    let source = r#"void main() {
    undefinedFunction();
}
"#;
    let result = run(job(D_LANG, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "undefined function should be CompileError, got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Objective-C (113)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn objective_c_hello() {
    let source = r#"#include <stdio.h>
int main() {
    printf("hello\n");
    return 0;
}
"#;
    let result = run(job(OBJECTIVE_C, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn objective_c_compile_error() {
    let source = r#"int main() {
    undefinedFunction();
    return 0;
}
"#;
    let result = run(job(OBJECTIVE_C, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "undefined function should be CompileError, got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Assembly (114)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn assembly_hello() {
    let source = r#"section .data
    msg db "hello", 10
    len equ $ - msg

section .text
    global _start

_start:
    mov rax, 1
    mov rdi, 1
    mov rsi, msg
    mov rdx, len
    syscall

    mov rax, 60
    xor rdi, rdi
    syscall
"#;
    let result = run(job(ASSEMBLY, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn assembly_compile_error() {
    let source = r#"section .text
    global _start
_start:
    mov rax, UNDEFINED_SYMBOL
    syscall
"#;
    let result = run(job(ASSEMBLY, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "undefined symbol should be CompileError, got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Ada (115)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn ada_hello() {
    let source = r#"with Ada.Text_IO; use Ada.Text_IO;
procedure Main is
begin
   Put_Line("hello");
end Main;
"#;
    let result = run(job(ADA, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn ada_compile_error() {
    let source = r#"procedure Main is
begin
   Undefined_Procedure;
end Main;
"#;
    let result = run(job(ADA, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "undefined procedure should be CompileError, got {:?}",
        result.status,
    );
}

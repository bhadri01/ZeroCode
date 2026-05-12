//! v1.5 Batch A edge cases: Bash, Lua, Perl, Ruby, R, PHP, TypeScript.
//! Each language tests hello world, stdin read, and non-zero exit.

use zerocode_core::Status;

use super::harness::*;

// ═══════════════════════════════════════════════════════════════════════
// Bash (100)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn bash_hello() {
    let source = r#"echo "hello""#;
    let result = run(job(BASH, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn bash_stdin() {
    let source = r#"read line; echo "got: $line""#;
    let result = run(job_with_stdin(BASH, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn bash_non_zero_exit() {
    let source = "exit 7";
    let result = run(job(BASH, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(7)),
        "exit 7 should be NonZeroExit(7), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Lua (101)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn lua_hello() {
    let source = r#"print("hello")"#;
    let result = run(job(LUA, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn lua_stdin() {
    let source = r#"local line = io.read("*l"); print("got: " .. line)"#;
    let result = run(job_with_stdin(LUA, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn lua_non_zero_exit() {
    let source = "os.exit(3, true)";
    let result = run(job(LUA, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(3)),
        "os.exit(3) should be NonZeroExit(3), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Perl (102)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn perl_hello() {
    let source = r#"print "hello\n";"#;
    let result = run(job(PERL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn perl_stdin() {
    let source = r#"my $line = <STDIN>; chomp $line; print "got: $line\n";"#;
    let result = run(job_with_stdin(PERL, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn perl_non_zero_exit() {
    let source = "exit 5;";
    let result = run(job(PERL, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(5)),
        "exit 5 should be NonZeroExit(5), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Ruby (103)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn ruby_hello() {
    let source = r#"puts "hello""#;
    let result = run(job(RUBY, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn ruby_stdin() {
    let source = r#"line = gets.chomp; puts "got: #{line}""#;
    let result = run(job_with_stdin(RUBY, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn ruby_non_zero_exit() {
    let source = "exit 4";
    let result = run(job(RUBY, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(4)),
        "exit 4 should be NonZeroExit(4), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// R (104)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn r_hello() {
    let source = r#"cat("hello\n")"#;
    let result = run(job(R, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn r_stdin() {
    let source = r#"line <- readLines("stdin", n=1); cat(paste0("got: ", line, "\n"))"#;
    let result = run(job_with_stdin(R, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn r_non_zero_exit() {
    let source = "quit(status=2)";
    let result = run(job(R, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(2)),
        "quit(status=2) should be NonZeroExit(2), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// PHP (105)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn php_hello() {
    let source = r#"<?php echo "hello\n"; ?>"#;
    let result = run(job(PHP, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn php_stdin() {
    let source = r#"<?php $line = trim(fgets(STDIN)); echo "got: $line\n"; ?>"#;
    let result = run(job_with_stdin(PHP, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn php_non_zero_exit() {
    let source = "<?php exit(6); ?>";
    let result = run(job(PHP, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(6)),
        "exit(6) should be NonZeroExit(6), got {:?}",
        result.status,
    );
}

// ═══════════════════════════════════════════════════════════════════════
// TypeScript (106)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn typescript_hello() {
    let source = r#"console.log("hello");"#;
    let result = run(job(TYPESCRIPT, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn typescript_stdin() {
    let source = r#"
const fs = require("fs");
const input = fs.readFileSync("/dev/stdin", "utf8");
console.log("got: " + input.trim());
"#;
    let result = run(job_with_stdin(TYPESCRIPT, source, "world\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: world"));
}

#[tokio::test]
async fn typescript_non_zero_exit() {
    let source = "process.exit(8);";
    let result = run(job(TYPESCRIPT, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(8)),
        "process.exit(8) should be NonZeroExit(8), got {:?}",
        result.status,
    );
}
